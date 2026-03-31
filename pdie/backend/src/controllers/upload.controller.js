import { processUpload } from '../services/upload.service.js';
import { HttpError } from '../middlewares/errorHandler.js';

export const uploadExcel = async (req, res) => {
  if (!req.file) {
    throw new HttpError(400, 'Excel file is required');
  }
  const result = await processUpload({
    filePath: req.file.path,
    originalName: req.file.originalname,
    mimetype: req.file.mimetype
  });
  res.status(result.processingMode === 'sync' ? 200 : 202).json(result);
};
