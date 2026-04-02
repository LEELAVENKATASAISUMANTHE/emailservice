import crypto from 'crypto';
import multer from 'multer';
import { TemplateModel } from '../models/Template.js';
import { JobModel } from '../models/Job.js';
import { uploadBuffer } from '../db/minio.js';
import { HttpError } from '../middlewares/errorHandler.js';
import { getJob, getReport, createJob } from '../services/job.service.js';
import { readExcelMeta, streamRows } from '../utils/excel.js';
import { processJob } from '../services/process-job.service.js';
import { publishJob } from '../queue/redpanda.js';
import { logger } from '../utils/logger.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!file.originalname?.toLowerCase().endsWith('.xlsx')) {
      callback(new HttpError(400, 'Only .xlsx files are supported'));
      return;
    }
    callback(null, true);
  }
});

export const uploadMiddleware = (req, res, next) => {
  upload.single('file')(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        next(new HttpError(400, 'File exceeds the 50 MB limit'));
        return;
      }

      next(new HttpError(400, error.message));
      return;
    }

    next(error);
  });
};

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

export const uploadExcel = async (req, res) => {
  if (!req.file?.buffer) {
    throw new HttpError(400, 'Excel file is required');
  }

  const buffer = req.file.buffer;
  const fileHash = sha256(buffer);

  let metadata;
  try {
    metadata = await readExcelMeta(buffer);
  } catch (_error) {
    return res.status(400).json({ error: 'Invalid template - _meta sheet missing or corrupt' });
  }

  const template = await TemplateModel.findOne({ templateId: metadata.templateId }).lean();
  if (!template) {
    return res.status(400).json({ error: 'Template not found for uploaded workbook' });
  }

  const { totalRows } = await streamRows(buffer, async () => {}, 500);

  const duplicate = await JobModel.findOne({ fileHash, status: 'done' }).lean();
  if (duplicate) {
    return res.status(409).json({ error: 'Duplicate file', existingJobId: duplicate.jobId });
  }

  const job = await createJob({
    templateId: template.templateId,
    originalFilename: req.file.originalname,
    fileHash,
    status: 'queued',
    totalRows,
    processedRows: 0,
    committedRows: 0,
    rejectedRows: 0,
    errorSummary: ''
  });

  await uploadBuffer(`uploads/${job.jobId}.xlsx`, buffer, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  if (totalRows <= 5000) {
    Promise.resolve(processJob(job.jobId)).catch((error) => {
      logger.error({ err: error, jobId: job.jobId }, 'Fire-and-forget job failed');
    });
  } else {
    await publishJob(job.jobId);
  }

  res.status(202).json({ jobId: job.jobId });
};

export const getJobStatus = async (req, res) => {
  const job = await getJob(req.params.job_id);
  if (!job) {
    throw new HttpError(404, 'Job not found');
  }
  delete job._id;
  res.json(job);
};

export const getJobReport = async (req, res) => {
  const job = await getJob(req.params.job_id);
  if (!job) {
    throw new HttpError(404, 'Job not found');
  }
  const report = await getReport(req.params.job_id);
  delete report._id;
  res.json(report);
};
