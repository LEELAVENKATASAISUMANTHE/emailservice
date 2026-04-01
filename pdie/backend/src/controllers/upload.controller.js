import { processUpload, listUploads, getUploadById, getUploadLogs, getUploadErrors } from '../services/upload.service.js';
import { HttpError } from '../middlewares/errorHandler.js';
import { logger } from '../utils/logger.js';

export const uploadExcel = async (req, res) => {
  if (!req.file) {
    throw new HttpError(400, 'Excel file is required. Send a multipart/form-data request with a "file" field.');
  }
  logger.info({ originalName: req.file.originalname, size: req.file.size, mimetype: req.file.mimetype }, 'Upload received');
  const result = await processUpload({
    filePath: req.file.path,
    originalName: req.file.originalname,
    mimetype: req.file.mimetype,
    fileSize: req.file.size
  });
  logger.info({ uploadId: result.uploadId, processingMode: result.processingMode }, 'Upload processed');
  res.status(result.processingMode === 'sync' ? 200 : 202).json(result);
};

export const listAllUploads = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const { status, templateId } = req.query;
  const result = await listUploads({ page, limit, status, templateId });
  res.json(result);
};

export const getUpload = async (req, res) => {
  const upload = await getUploadById(req.params.uploadId);
  res.json(upload);
};

export const getUploadLogsHandler = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const result = await getUploadLogs({ uploadId: req.params.uploadId, page, limit });
  res.json(result);
};

export const getUploadErrorsHandler = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const result = await getUploadErrors({ uploadId: req.params.uploadId, page, limit });
  res.json(result);
};
