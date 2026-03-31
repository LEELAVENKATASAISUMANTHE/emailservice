import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { v4 as uuid } from 'uuid';
import { TemplateModel } from '../models/mongo/Template.js';
import { UploadModel } from '../models/mongo/Upload.js';
import { readTemplateMetadata, streamExcelRows } from '../utils/excel.js';
import { checksumFileStream } from '../utils/hash.js';
import { uploadStream } from '../storage/minio.js';
import { config } from '../config/index.js';
import { HttpError } from '../middlewares/errorHandler.js';
import { logProcessing, logValidationErrors, updateUploadStatus } from './logging.service.js';
import { validateRows } from './validation.service.js';
import { insertRowsForTable } from './ingest.service.js';
import { getProducer } from '../queue/redpanda.js';

export const processUpload = async ({ filePath, originalName, mimetype }) => {
  const uploadId = uuid();
  try {
    await logProcessing({ uploadId, stage: 'upload', message: 'Upload received' });

    const { templateId } = await readTemplateMetadata(filePath);
    if (!templateId) {
      throw new HttpError(400, 'Template metadata missing templateId');
    }
    const template = await TemplateModel.findOne({ templateId });
    if (!template) {
      throw new HttpError(400, 'Template does not exist or has expired');
    }

    const fileHash = await checksumFileStream(fs.createReadStream(filePath));
    const duplicate = await UploadModel.findOne({ templateId, fileHash });

    const uploadKey = `uploads/${uploadId}/${Date.now()}-${originalName}`;
    await uploadStream({
      bucket: config.minio.buckets.uploads,
      objectName: uploadKey,
      stream: fs.createReadStream(filePath),
      metadata: { contentType: mimetype }
    });

    await UploadModel.create({
      uploadId,
      templateId,
      fileKey: uploadKey,
      fileHash,
      rowCount: 0,
      status: 'pending',
      processingMode: 'sync'
    });

    if (duplicate) {
      await updateUploadStatus({ uploadId, status: 'completed', duplicateOf: duplicate.uploadId, processingMode: 'sync' });
      await logProcessing({ uploadId, stage: 'upload', level: 'warning', message: 'Duplicate upload detected', metadata: { duplicateOf: duplicate.uploadId } });
      return { uploadId, templateId, duplicateOf: duplicate.uploadId, processingMode: 'sync', rowCount: 0 };
    }

    let rowCount = 0;
    await streamExcelRows({
      filePath,
      onRowsChunk: async (rows) => {
        rowCount += rows.length;
      }
    });

    const processingMode = rowCount < 5000 ? 'sync' : 'async';
    await updateUploadStatus({ uploadId, status: 'validating', rowCount, processingMode });

    const primaryTable = template.tables[0];
    const targetColumns = template.metadata.columnsByTable[primaryTable] || [];
    let chunkCursor = 0;
    const producer = processingMode === 'async' ? await getProducer() : null;

    await streamExcelRows({
      filePath,
      chunkSize: 1000,
      onHeader: async (headers) => {
        if (headers.length !== template.headers.length || headers.some((header, idx) => header !== template.headers[idx])) {
          throw new HttpError(400, 'Uploaded columns do not match template definition');
        }
      },
      onRowsChunk: async (rows) => {
        chunkCursor += 1;
        const chunkId = `${uploadId}-${chunkCursor}`;
        const { validRows, invalidRows } = await validateRows({ template, rows, uploadId, chunkId });
        if (invalidRows.length) {
          await logValidationErrors({ uploadId, templateId, rows: invalidRows });
        }
        if (!validRows.length) {
          await logProcessing({ uploadId, stage: 'validation', level: 'warning', message: 'Chunk skipped, no valid rows', metadata: { chunkId } });
          return;
        }

        if (processingMode === 'sync') {
          const { inserted } = await insertRowsForTable({ table: primaryTable, columns: targetColumns, rows: validRows });
          await logProcessing({ uploadId, stage: 'ingest', message: 'Rows inserted synchronously', metadata: { chunkId, inserted } });
        } else {
          await UploadModel.updateOne({ uploadId }, { $inc: { pendingChunks: 1 }, status: 'processing' });
          try {
            await producer.send({
              topic: config.redpanda.uploadTopic,
              messages: [
                {
                  key: uploadId,
                  value: JSON.stringify({
                    uploadId,
                    templateId,
                    chunkId,
                    rows: validRows
                  })
                }
              ]
            });
          } catch (err) {
            await UploadModel.updateOne({ uploadId }, { $inc: { pendingChunks: -1 }, status: 'failed' });
            throw err;
          }
          await logProcessing({ uploadId, stage: 'queue', message: 'Chunk enqueued for async processing', metadata: { chunkId, size: validRows.length } });
        }
      }
    });

    await updateUploadStatus({
      uploadId,
      status: processingMode === 'sync' ? 'completed' : 'processing',
      completedAt: processingMode === 'sync' ? new Date() : undefined
    });

    return { uploadId, templateId, processingMode, rowCount };
  } finally {
    await fsPromises.unlink(filePath).catch(() => {});
  }
};
