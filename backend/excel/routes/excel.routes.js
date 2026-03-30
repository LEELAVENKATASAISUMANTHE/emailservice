// changes by nakul: isolated Excel routes mounted separately from existing APIs
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { excelUploadRateLimit } from "../middleware/excel-rate-limit.middleware.js";
import {
  uploadExcel,
  downloadTemplate,
  downloadDynamicTemplate,
  getExcelUploadJobStatus,
  downloadExcelErrorFile,
  getTemplateRegistry,
} from "../controller/excel.controller.js";
import {
  attachExcelRequester,
  requireExcelAdmin,
  requireExcelJobAccess,
} from "../middleware/excel-auth.middleware.js";
import {
  ensureExcelUploadDir,
  getExcelUploadDir,
} from "../services/excel.service.js";

const router = Router();
const maxUploadSizeBytes = Number(process.env.EXCEL_MAX_UPLOAD_BYTES || 5 * 1024 * 1024);
const allowedMimeTypes = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
]);

// changes by nakul: Excel uploads are stored in a dedicated folder shared with the worker
const storage = multer.diskStorage({
  destination: async (_req, _file, callback) => {
    try {
      const uploadDir = await ensureExcelUploadDir();
      callback(null, uploadDir);
    } catch (error) {
      callback(error);
    }
  },
  filename: (_req, file, callback) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    callback(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname || "").toLowerCase();
    const allowed = new Set([".xlsx"]);

    if (!allowed.has(extension)) {
      callback(new Error("Only .xlsx files are supported"));
      return;
    }

    if (file.mimetype && !allowedMimeTypes.has(file.mimetype)) {
      callback(new Error("Unsupported Excel file type"));
      return;
    }

    callback(null, true);
  },
  limits: {
    fileSize: maxUploadSizeBytes,
  },
});

router.use(attachExcelRequester);

router.get("/template/registry", requireExcelAdmin, getTemplateRegistry);
router.get("/template", requireExcelAdmin, downloadTemplate);
router.post("/template/custom", requireExcelAdmin, downloadDynamicTemplate);
router.get("/jobs/:jobId", requireExcelJobAccess, getExcelUploadJobStatus);
router.get("/jobs/:jobId/error-file", requireExcelJobAccess, downloadExcelErrorFile);
router.post("/upload", requireExcelAdmin, excelUploadRateLimit, upload.single("file"), uploadExcel);

export default router;
