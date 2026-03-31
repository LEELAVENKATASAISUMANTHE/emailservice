import { ProcessingLogModel } from '../models/mongo/ProcessingLog.js';
import { ValidationLogModel } from '../models/mongo/ValidationLog.js';
import { UploadModel } from '../models/mongo/Upload.js';

export const logProcessing = async ({ uploadId, stage, level = 'info', message, metadata }) => {
  return ProcessingLogModel.create({ uploadId, stage, level, message, metadata });
};

export const logValidationErrors = async ({ uploadId, templateId, rows }) => {
  if (!rows.length) return null;
  const docs = rows.map((row) => ({
    uploadId,
    templateId,
    rowNumber: row.rowNumber,
    chunkId: row.chunkId,
    errors: row.errors,
    payload: row.payload
  }));
  return ValidationLogModel.insertMany(docs, { ordered: false });
};

export const updateUploadStatus = async ({ uploadId, status, rowCount, processingMode, duplicateOf, completedAt }) => {
  const update = {};
  if (status) update.status = status;
  if (rowCount !== undefined) update.rowCount = rowCount;
  if (processingMode) update.processingMode = processingMode;
  if (duplicateOf) update.duplicateOf = duplicateOf;
  if (completedAt) update.completedAt = completedAt;
  if (!Object.keys(update).length) {
    return UploadModel.findOne({ uploadId });
  }
  return UploadModel.findOneAndUpdate(
    { uploadId },
    { $set: update },
    { new: true, upsert: true }
  );
};
