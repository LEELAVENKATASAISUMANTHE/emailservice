import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { v4 as uuid } from 'uuid';
import { TemplateModel } from '../models/mongo/Template.js';
import { UploadModel } from '../models/mongo/Upload.js';
import { ProcessingLogModel } from '../models/mongo/ProcessingLog.js';
import { ValidationLogModel } from '../models/mongo/ValidationLog.js';
import { readTemplateMetadata, streamExcelRows } from '../utils/excel.js';
import { checksumFileStream } from '../utils/hash.js';
import { uploadStream } from '../storage/minio.js';
import { config } from '../config/index.js';
import { HttpError } from '../middlewares/errorHandler.js';
import { logProcessing, logValidationErrors, updateUploadStatus } from './logging.service.js';
import { validateRows } from './validation.service.js';
import { insertRowsMultiTable } from './ingest.service.js';
import { getProducer } from '../queue/redpanda.js';
import { logger } from '../utils/logger.js';

export const processUpload = async ({ filePath, originalName, mimetype, fileSize }) => {
  const uploadId = uuid();
  try {
    await logProcessing({ uploadId, stage: 'upload', message: 'Upload received' });

    logger.info({ uploadId }, 'Reading template metadata from uploaded file...');
    const metadata = await readTemplateMetadata(filePath);
    logger.info({ uploadId, metadata }, 'Template metadata extracted');

    const { templateId } = metadata;
    if (!templateId) {
      throw new HttpError(400, 'Template metadata missing templateId. Upload a file generated from a PDIE template.');
    }
    const template = await TemplateModel.findOne({ templateId });
    if (!template) {
      throw new HttpError(400, `Template "${templateId}" does not exist or has expired`);
    }
    logger.info({ uploadId, templateId, tables: template.tables }, 'Template found');

    const fileHash = await checksumFileStream(fs.createReadStream(filePath));
    const duplicate = await UploadModel.findOne({ templateId, fileHash });

    const uploadKey = `uploads/${uploadId}/${Date.now()}-${originalName}`;
    logger.info({ uploadId, uploadKey }, 'Uploading file to MinIO...');
    await uploadStream({
      bucket: config.minio.buckets.uploads,
      objectName: uploadKey,
      stream: fs.createReadStream(filePath),
      metadata: { contentType: mimetype }
    });
    logger.info({ uploadId }, 'File uploaded to MinIO');

    await UploadModel.create({
      uploadId,
      templateId,
      fileKey: uploadKey,
      fileHash,
      originalFileName: originalName,
      fileSize: fileSize || 0,
      rowCount: 0,
      status: 'pending',
      processingMode: 'sync'
    });

    if (duplicate) {
      await updateUploadStatus({ uploadId, status: 'completed', duplicateOf: duplicate.uploadId, processingMode: 'sync' });
      await logProcessing({ uploadId, stage: 'upload', level: 'warning', message: 'Duplicate upload detected', metadata: { duplicateOf: duplicate.uploadId } });
      return { uploadId, templateId, duplicateOf: duplicate.uploadId, processingMode: 'sync', rowCount: 0 };
    }

    logger.info({ uploadId }, 'Counting rows...');
    let rowCount = 0;
    await streamExcelRows({
      filePath,
      onRowsChunk: async (rows) => {
        rowCount += rows.length;
      }
    });
    logger.info({ uploadId, rowCount }, 'Row count complete');

    const processingMode = rowCount < 5000 ? 'sync' : 'async';
    await updateUploadStatus({ uploadId, status: 'validating', rowCount, processingMode });

    let chunkCursor = 0;
    const producer = processingMode === 'async' ? await getProducer() : null;
    let totalInserted = 0;
    const insertResults = {};

    logger.info({ uploadId, processingMode, tables: template.tables }, 'Starting validation and ingestion...');
    await streamExcelRows({
      filePath,
      chunkSize: 1000,
      onHeader: async (headers) => {
        // Verify uploaded headers match template headers (order + names)
        if (headers.length !== template.headers.length || headers.some((header, idx) => header !== template.headers[idx])) {
          logger.warn({ uploadId, expected: template.headers, actual: headers }, 'Column mismatch');
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
          const { results, totalInserted: chunkInserted } = await insertRowsMultiTable({ template, rows: validRows });
          totalInserted += chunkInserted;
          Object.entries(results).forEach(([table, r]) => {
            insertResults[table] = (insertResults[table] || 0) + (r.inserted || 0);
          });
          await logProcessing({ uploadId, stage: 'ingest', message: 'Rows inserted synchronously', metadata: { chunkId, results } });
          logger.info({ uploadId, chunkId, results }, 'Chunk inserted (multi-table)');
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

    logger.info({ uploadId, processingMode, rowCount, totalInserted, insertResults }, 'Upload processing complete');
    return { uploadId, templateId, processingMode, rowCount, totalInserted, insertResults };
  } catch (err) {
    logger.error({ uploadId, err: err.message, stack: err.stack }, 'Upload processing failed');
    await updateUploadStatus({ uploadId, status: 'failed' }).catch(() => {});
    throw err;
  } finally {
    await fsPromises.unlink(filePath).catch(() => {});
  }
};

// ── Query services for uploads ──────────────────────────────────────────

export const listUploads = async ({ page = 1, limit = 20, status, templateId }) => {
  const filter = {};
  if (status) filter.status = status;
  if (templateId) filter.templateId = templateId;

  const skip = (page - 1) * limit;
  const [docs, total] = await Promise.all([
    UploadModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    UploadModel.countDocuments(filter)
  ]);
  return { uploads: docs, total, page, limit, pages: Math.ceil(total / limit) };
};

export const getUploadById = async (uploadId) => {
  const upload = await UploadModel.findOne({ uploadId }).lean();
  if (!upload) {
    throw new HttpError(404, 'Upload not found');
  }
  return upload;
};

export const getUploadLogs = async ({ uploadId, page = 1, limit = 50 }) => {
  const skip = (page - 1) * limit;
  const [docs, total] = await Promise.all([
    ProcessingLogModel.find({ uploadId })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ProcessingLogModel.countDocuments({ uploadId })
  ]);
  return { logs: docs, total, page, limit, pages: Math.ceil(total / limit) };
};

export const getUploadErrors = async ({ uploadId, page = 1, limit = 50 }) => {
  const skip = (page - 1) * limit;
  const [docs, total] = await Promise.all([
    ValidationLogModel.find({ uploadId })
      .sort({ rowNumber: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ValidationLogModel.countDocuments({ uploadId })
  ]);
  return { errors: docs, total, page, limit, pages: Math.ceil(total / limit) };
};
