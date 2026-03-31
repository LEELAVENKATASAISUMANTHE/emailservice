import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { uploadExcel } from '../controllers/upload.controller.js';

const router = Router();
const tmpDir = path.join(process.cwd(), 'tmp');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}
const upload = multer({ dest: tmpDir, limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/', upload.single('file'), uploadExcel);

export default router;
