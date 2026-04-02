import { JobModel } from '../models/Job.js';
import { UploadLogModel } from '../models/UploadLog.js';

export const getJob = async (jobId) => JobModel.findOne({ jobId }).lean();

export const updateJob = async (jobId, fields) =>
  JobModel.findOneAndUpdate({ jobId }, fields, { new: true });

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
