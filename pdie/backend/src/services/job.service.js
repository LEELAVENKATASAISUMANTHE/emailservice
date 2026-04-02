import crypto from 'crypto';
import { JobModel } from '../models/Job.js';
import { UploadLogModel } from '../models/UploadLog.js';

export const createJob = async (fields) => {
  const job = await JobModel.create({
    jobId: fields.jobId || crypto.randomUUID(),
    templateId: fields.templateId,
    originalFilename: fields.originalFilename,
    fileHash: fields.fileHash,
    status: fields.status || 'queued',
    totalRows: fields.totalRows || 0,
    processedRows: fields.processedRows || 0,
    committedRows: fields.committedRows || 0,
    rejectedRows: fields.rejectedRows || 0,
    errorSummary: fields.errorSummary || ''
  });

  await UploadLogModel.updateOne(
    { jobId: job.jobId },
    { $setOnInsert: { jobId: job.jobId, rows: [] } },
    { upsert: true }
  );

  return job;
};

export const updateJob = async (jobId, fields) =>
  JobModel.findOneAndUpdate({ jobId }, fields, { new: true });

export const getJob = async (jobId) => JobModel.findOne({ jobId }).lean();

export const getReport = async (jobId) => {
  const report = await UploadLogModel.findOne({ jobId }).lean();
  return report || { jobId, rows: [] };
};

export const appendLogRows = async (jobId, rows) => {
  if (!rows.length) {
    return;
  }

  await UploadLogModel.updateOne(
    { jobId },
    {
      $setOnInsert: { jobId },
      $push: { rows: { $each: rows } }
    },
    { upsert: true }
  );
};
