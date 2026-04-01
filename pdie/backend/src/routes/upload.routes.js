import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import {
  uploadExcel,
  listAllUploads,
  getUpload,
  getUploadLogsHandler,
  getUploadErrorsHandler
} from '../controllers/upload.controller.js';

const router = Router();
const tmpDir = path.join(process.cwd(), 'tmp');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

const ALLOWED_MIMES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel'
];

const upload = multer({
  dest: tmpDir,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file'));
    }
    cb(null, true);
  }
});

// Wrap multer to catch its errors and forward them properly
const multerUpload = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const messages = {
        LIMIT_FILE_SIZE: 'File exceeds the 50 MB limit',
        LIMIT_UNEXPECTED_FILE: 'Only .xlsx Excel files are accepted',
        LIMIT_FILE_COUNT: 'Only one file can be uploaded at a time'
      };
      return res.status(400).json({
        message: messages[err.code] || `Upload error: ${err.message}`,
        code: err.code
      });
    }
    if (err) {
      return res.status(500).json({ message: 'Unexpected upload error' });
    }
    next();
  });
};

router.get('/', listAllUploads);
router.post('/', multerUpload, uploadExcel);
router.get('/:uploadId', getUpload);
router.get('/:uploadId/logs', getUploadLogsHandler);
router.get('/:uploadId/errors', getUploadErrorsHandler);

export default router;
