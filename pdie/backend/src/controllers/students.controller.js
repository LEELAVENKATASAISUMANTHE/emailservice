import crypto from 'crypto';
import { TemplateModel } from '../models/Template.js';
import { JobModel } from '../models/Job.js';
import { uploadBuffer } from '../db/minio.js';
import { ensureStudentLinksTable, pgPool } from '../db/postgres.js';
import { config } from '../config/index.js';
import { HttpError } from '../middlewares/errorHandler.js';
import { createJob } from '../services/job.service.js';
import { getFullStudentWorkbookStats, processFullStudentUploadJob } from '../services/student-ingest.service.js';
import { ensureFullStudentTemplate } from '../services/student-template.service.js';
import { ensureTemplate } from '../services/template.service.js';
import { readExcelMeta } from '../utils/excel.js';
import { logger } from '../utils/logger.js';
import { uploadExcel } from './upload.controller.js';

const STUDENT_TABLES = ['students'];
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

const toTemplateResponse = (template) => {
  const payload = template.toObject ? template.toObject() : { ...template };
  delete payload._id;
  delete payload.schemaMeta;
  delete payload.foreignKeys;
  return payload;
};

const isStudentsOnlyTemplate = (template) =>
  Array.isArray(template?.tables) &&
  template.tables.length === 1 &&
  template.tables[0] === 'students';

export const getStudentByToken = async (req, res) => {
  const token = String(req.params.token || '').trim();
  if (!token) {
    throw new HttpError(400, 'Token is required');
  }

  await ensureStudentLinksTable();

  const linkResult = await pgPool.query(
    `
      SELECT id, student_id, email, token, status, created_at, expires_at
      FROM ${quoteIdentifier(config.postgres.schema)}.${quoteIdentifier('student_links')}
      WHERE token = $1
      LIMIT 1
    `,
    [token]
  );

  const link = linkResult.rows[0];
  if (!link) {
    throw new HttpError(404, 'Invalid or expired link');
  }

  if (link.expires_at && new Date() > new Date(link.expires_at)) {
    throw new HttpError(400, 'Link expired');
  }

  let status = link.status;
  if (link.status === 'pending') {
    const updateResult = await pgPool.query(
      `
        UPDATE ${quoteIdentifier(config.postgres.schema)}.${quoteIdentifier('student_links')}
        SET status = 'opened'
        WHERE token = $1
          AND status = 'pending'
        RETURNING status
      `,
      [token]
    );

    if (updateResult.rows[0]?.status) {
      status = updateResult.rows[0].status;
    }
  }

  const studentResult = await pgPool.query(
    `
      SELECT *
      FROM ${quoteIdentifier(config.postgres.schema)}.${quoteIdentifier('students')}
      WHERE student_id = $1
      LIMIT 1
    `,
    [link.student_id]
  );

  const student = studentResult.rows[0];
  if (!student) {
    throw new HttpError(404, 'Student not found for this link');
  }

  res.json({
    student,
    status
  });
};

export const getStudentTemplate = async (_req, res) => {
  const template = await ensureTemplate(STUDENT_TABLES);
  const payload = toTemplateResponse(template);

  res.json({
    ...payload,
    resource: 'students',
    downloadUrl: `/api/templates/${payload.templateId}/download`
  });
};

export const getFullStudentTemplate = async (_req, res) => {
  const { template, sheetNames } = await ensureFullStudentTemplate();
  const payload = toTemplateResponse(template);

  res.json({
    ...payload,
    resource: 'students-full',
    workbookMode: 'multi-sheet',
    referenceColumn: 'student_ref',
    sheetNames,
    downloadUrl: `/api/templates/${payload.templateId}/download`
  });
};

export const uploadStudents = async (req, res) => {
  if (!req.file?.buffer) {
    throw new HttpError(400, 'Excel file is required');
  }

  const buffer = req.file.buffer;
  let metadata;
  try {
    metadata = await readExcelMeta(buffer);
  } catch (_error) {
    throw new HttpError(400, 'Invalid template - _meta sheet missing or corrupt');
  }

  const template = await TemplateModel.findOne({ templateId: metadata.templateId }).lean();
  if (!template) {
    throw new HttpError(400, 'Template not found for uploaded workbook');
  }

  if (metadata.templateType === 'students-full') {
    const fileHash = sha256(buffer);
    const duplicate = await JobModel.findOne({ fileHash, status: 'done' }).lean();
    if (duplicate) {
      throw new HttpError(409, 'Duplicate file', { existingJobId: duplicate.jobId });
    }

    const { totalRows } = await getFullStudentWorkbookStats(buffer, {
      sheets: template.workbookMeta?.sheets || metadata.sheets || {}
    });

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

    Promise.resolve(processFullStudentUploadJob(job.jobId)).catch((error) => {
      logger.error({ err: error, jobId: job.jobId }, 'Multi-table student upload failed');
    });

    res.status(202).json({ jobId: job.jobId, mode: 'students-full' });
    return;
  }

  if (!isStudentsOnlyTemplate(template)) {
    throw new HttpError(400, 'Only PDIE student templates can be uploaded to this endpoint');
  }

  return uploadExcel(req, res);
};
