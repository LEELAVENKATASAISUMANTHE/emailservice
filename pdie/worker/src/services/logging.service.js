import { ProcessingLogModel } from '../models/mongo/ProcessingLog.js';
import { ValidationLogModel } from '../models/mongo/ValidationLog.js';
import { FailedChunkModel } from '../models/mongo/FailedChunk.js';
import { UploadModel } from '../models/mongo/Upload.js';

export const logProcessing = ({ uploadId, stage, level = 'info', message, metadata }) =>
  ProcessingLogModel.create({ uploadId, stage, level, message, metadata });

export const logValidationErrors = ({ uploadId, templateId, rows }) => {
  if (!rows.length) return Promise.resolve();
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

export const persistFailedChunk = ({ uploadId, chunkId, rows, reason, metadata }) =>
  FailedChunkModel.create({ uploadId, chunkId, rows, reason, metadata });

export const decrementPendingChunk = async ({ uploadId, status }) => {
  const result = await UploadModel.findOneAndUpdate(
    { uploadId },
    {
      $inc: { pendingChunks: -1 },
      ...(status ? { status } : {})
    },
    { new: true }
  );
  if (result && result.pendingChunks <= 0 && result.status !== 'failed') {
    result.status = 'completed';
    result.completedAt = new Date();
    await result.save();
  }
  return result;
};
