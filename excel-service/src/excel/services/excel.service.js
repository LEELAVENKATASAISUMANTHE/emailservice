// changes by nakul: service layer for Excel upload, template export, and job lookup
import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import ExcelJob from "../../db/models/ExcelJob.js";
import ImportedStudent from "../../db/models/ImportedStudent.js";
import ImportedClass from "../../db/models/ImportedClass.js";
import ImportedPlacement from "../../db/models/ImportedPlacement.js";
import ImportedOtherRecord from "../../db/models/ImportedOtherRecord.js";
import {
  uploadExcelErrorWorkbook,
  removeObjectIfExists,
} from "../../utils/minio.js";
import { sendMessage, PROCESS_TOPIC } from "../../utils/kafka.js";
import { fieldRegistry, templatePresets } from "../registry/field.registry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const excelRootDir = path.resolve(__dirname, "..");
const uploadDir = process.env.EXCEL_UPLOAD_DIR || path.join(excelRootDir, "uploads");
const allowedUploadTypes = new Set(["student", "placement", "other"]);
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const maxRowsPerUpload = Number(process.env.EXCEL_MAX_ROWS || 5000);
const maxAttempts = Number(process.env.EXCEL_MAX_ATTEMPTS || 3);
const retentionDays = Number(process.env.EXCEL_JOB_RETENTION_DAYS || 7);
const cleanupIntervalMs = Number(
  process.env.EXCEL_CLEANUP_INTERVAL_MS || 60 * 60 * 1000
);
const failedPreviewLimit = Number(process.env.EXCEL_FAILED_PREVIEW_LIMIT || 5);
const shouldDeleteImportedData =
  String(process.env.EXCEL_DELETE_IMPORTED_DATA_ON_CLEANUP || "false").toLowerCase() ===
  "true";
const templateMetadataSheetName = "__template_meta";

let cleanupTimer = null;

export async function ensureExcelUploadDir() {
  // changes by nakul: create upload directory on demand for local and container runs
  await fs.mkdir(uploadDir, { recursive: true });
  return uploadDir;
}

export function getExcelUploadDir() {
  return uploadDir;
}

export function normalizeUploadType(uploadType) {
  const normalized = String(uploadType || "student").trim().toLowerCase();

  if (!allowedUploadTypes.has(normalized)) {
    throw new Error(
      `Invalid uploadType "${uploadType}". Allowed values: ${Array.from(allowedUploadTypes).join(", ")}`
    );
  }

  return normalized;
}

export function getExcelRequesterId(req) {
  return req.excelAuth?.requesterId || "system";
}

export function buildExcelRetentionExpiry(createdAt = new Date()) {
  return new Date(createdAt.getTime() + retentionDays * 24 * 60 * 60 * 1000);
}

export function assertExcelRowLimit(rows) {
  if (rows.length > maxRowsPerUpload) {
    throw new Error(
      `Excel upload exceeds the maximum allowed row count of ${maxRowsPerUpload}`
    );
  }
}

export async function enqueueExcelProcessing(
  filePath,
  originalName,
  uploadType = "student",
  createdBy,
  fileHash
) {
  const normalizedUploadType = normalizeUploadType(uploadType);
  const jobId = crypto.randomUUID();

  await ExcelJob.create({
    jobId,
    uploadType: normalizedUploadType,
    createdBy,
    fileHash,
    status: "processing",
    progress: 0,
    attemptsMade: 0,
    maxAttempts: getExcelMaxAttempts(),
    fileName: originalName,
    failedRowPreview: [],
    retentionExpiresAt: buildExcelRetentionExpiry(),
  });

  await sendMessage(PROCESS_TOPIC, {
    jobId,
    filePath,
    originalName,
    uploadType: normalizedUploadType,
    createdBy,
    fileHash,
  });

  return { id: jobId };
}

export async function getExcelJobStatus(jobId) {
  const persistedJob = await ExcelJob.findOne({ jobId: String(jobId) }).lean();

  if (!persistedJob) {
    return null;
  }

  return {
    id: persistedJob._id,
    jobId: persistedJob.jobId,
    uploadType: persistedJob.uploadType,
    status: persistedJob.status,
    progress: persistedJob.progress,
    fileName: persistedJob.fileName,
    createdBy: persistedJob.createdBy,
    createdAt: persistedJob.createdAt,
    updatedAt: persistedJob.updatedAt,
    retentionExpiresAt: persistedJob.retentionExpiresAt,
    errorFileUrl: persistedJob.errorFileUrl,
    fileHash: persistedJob.fileHash,
    failureReason: persistedJob.failureReason,
    state: persistedJob.status,
    retry: {
      attemptsMade: persistedJob.attemptsMade,
      maxAttempts: persistedJob.maxAttempts,
      remainingAttempts: Math.max(
        persistedJob.maxAttempts - persistedJob.attemptsMade,
        0
      ),
    },
    summary: {
      total: persistedJob.totalRows,
      success: persistedJob.successCount,
      failed: persistedJob.failedCount,
      processed: persistedJob.successCount + persistedJob.failedCount,
      remaining: Math.max(
        persistedJob.totalRows - (persistedJob.successCount + persistedJob.failedCount),
        0
      ),
    },
    failedPreview: persistedJob.failedRowPreview || [],
    links: {
      status: `/api/excel/jobs/${persistedJob.jobId}`,
      errorFile: persistedJob.errorFileUrl,
    },
  };
}

export async function buildTemplateWorkbook() {
  return buildTemplateWorkbookFromPreset("student");
}

export function getTemplatePresets() {
  return Object.entries(templatePresets).map(([type, preset]) => ({
    type,
    templateName: preset.templateName,
    uploadType: preset.uploadType,
    fields: buildTemplateFields(preset.fields, preset.uploadType),
  }));
}

export function getTemplateFieldRegistry() {
  return fieldRegistry;
}

export async function buildTemplateWorkbookFromPreset(type = "student") {
  const preset = templatePresets[normalizeUploadType(type)];

  if (!preset) {
    throw new Error(`Unknown template preset "${type}"`);
  }

  return buildDynamicTemplateWorkbook({
    templateName: preset.templateName,
    uploadType: preset.uploadType,
    fields: preset.fields,
  });
}

export async function buildDynamicTemplateWorkbook({
  templateName,
  uploadType,
  fields,
}) {
  const normalizedUploadType = normalizeUploadType(uploadType);
  const normalizedFields = buildTemplateFields(fields, normalizedUploadType);
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(templateName || "Upload Template");

  worksheet.columns = normalizedFields.map((field) => ({
    header: field.label,
    key: field.key,
    width: field.width,
  }));

  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEAF2FF" },
  };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];

  const metadataSheet = workbook.addWorksheet(templateMetadataSheetName, {
    state: "veryHidden",
  });
  metadataSheet.getCell("A1").value = JSON.stringify({
    version: 1,
    templateName: templateName || "Upload Template",
    uploadType: normalizedUploadType,
    fields: normalizedFields.map((field) => ({
      key: field.key,
      table: field.table,
      field: field.field,
      label: field.label,
      width: field.width,
      required: field.required,
      isEmail: field.isEmail,
      legacyKey: field.legacyKey || null,
    })),
  });

  return workbook;
}

export function validateExcelRows(rows) {
  return validateExcelRowsByType(rows, "student");
}

export function validateExcelRowsByType(rows, uploadType, templateFields = null) {
  const seenEmails = new Map();
  const validRows = [];
  const invalidRows = [];
  const normalizedUploadType = normalizeUploadType(uploadType);
  const normalizedTemplateFields =
    templateFields?.length > 0
      ? buildTemplateFields(templateFields, normalizedUploadType)
      : buildTemplateFields(templatePresets[normalizedUploadType].fields, normalizedUploadType);
  const emailField = normalizedTemplateFields.find((field) => field.isEmail);

  for (const row of rows) {
    const normalizedEmail = String(row[emailField?.key] || row.email || "")
      .trim()
      .toLowerCase();
    const errors = getValidationErrorsForUploadType(
      normalizedUploadType,
      row,
      normalizedTemplateFields
    );

    if (normalizedEmail && !emailRegex.test(normalizedEmail)) {
      errors.push("Email format is invalid");
    }

    if (normalizedEmail) {
      const firstSeenAt = seenEmails.get(normalizedEmail);

      if (firstSeenAt) {
        errors.push(`Duplicate email in file (first seen at row ${firstSeenAt})`);
      } else {
        seenEmails.set(normalizedEmail, row.rowNumber);
      }
    }

    const normalizedRow = {
      ...row,
      ...(emailField ? { [emailField.key]: normalizedEmail } : {}),
      email: normalizedEmail,
    };

    if (errors.length > 0) {
      invalidRows.push({
        ...normalizedRow,
        error: errors.join("; "),
      });
      continue;
    }

    validRows.push(normalizedRow);
  }

  return { validRows, invalidRows };
}

export async function createErrorWorkbook(jobId, invalidRows) {
  if (!invalidRows.length) {
    return null;
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Import Errors");

  worksheet.columns = [
    { header: "Row Number", key: "rowNumber", width: 14 },
    { header: "Name", key: "name", width: 28 },
    { header: "Email", key: "email", width: 32 },
    { header: "Class", key: "class", width: 18 },
    { header: "Department", key: "department", width: 22 },
    { header: "Error", key: "error", width: 48 },
  ];

  worksheet.getRow(1).font = { bold: true };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];

  invalidRows.forEach((row) => {
    worksheet.addRow({
      rowNumber: row.rowNumber || "",
      name: row.name,
      email: row.email,
      class: row.class,
      department: row.department,
      error: row.error,
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const uploadedFile = await uploadExcelErrorWorkbook(String(jobId), Buffer.from(buffer));

  return {
    storagePath: uploadedFile.path,
    url: uploadedFile.url,
  };
}

export async function getExcelJobErrorFile(jobId) {
  const job = await ExcelJob.findOne({ jobId: String(jobId) }).lean();

  if (!job?.errorStoragePath) {
    return null;
  }

  return job;
}

export async function computeExcelFileHash(filePath) {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function findDuplicateExcelJob({ createdBy, uploadType, fileHash }) {
  return ExcelJob.findOne({
    createdBy,
    uploadType: normalizeUploadType(uploadType),
    fileHash,
    status: { $in: ["processing", "completed"] },
    retentionExpiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .lean();
}

export function buildFailedRowPreview(rows) {
  return rows.slice(0, failedPreviewLimit).map((row) => ({
    rowNumber: row.rowNumber || 0,
    name: row.name || "",
    email: row.email || "",
    error: row.error,
  }));
}

export function getExcelMaxAttempts() {
  return Number.isFinite(maxAttempts) && maxAttempts > 0 ? maxAttempts : 1;
}

export async function runExcelRetentionCleanup() {
  const now = new Date();
  const expiredJobs = await ExcelJob.find({
    retentionExpiresAt: { $lte: now },
  }).lean();

  if (!expiredJobs.length) {
    return { removedJobs: 0, removedImportedRows: 0 };
  }

  let removedImportedRows = 0;

  for (const job of expiredJobs) {
    await removeObjectIfExists(job.errorStoragePath).catch((error) => {
      console.error(`[excel-cleanup] Failed to remove error file for job ${job.jobId}:`, error);
    });
  }

  if (shouldDeleteImportedData) {
    const sourceJobIds = expiredJobs.map((job) => job.jobId);
    const [studentResult, classResult, placementResult, otherResult] = await Promise.all([
      ImportedStudent.deleteMany({
        sourceJobId: { $in: sourceJobIds },
      }),
      ImportedClass.deleteMany({
        sourceJobId: { $in: sourceJobIds },
      }),
      ImportedPlacement.deleteMany({
        sourceJobId: { $in: sourceJobIds },
      }),
      ImportedOtherRecord.deleteMany({
        sourceJobId: { $in: sourceJobIds },
      }),
    ]);
    removedImportedRows =
      (studentResult.deletedCount || 0) +
      (classResult.deletedCount || 0) +
      (placementResult.deletedCount || 0) +
      (otherResult.deletedCount || 0);
  }

  const deletedJobs = await ExcelJob.deleteMany({
    _id: { $in: expiredJobs.map((job) => job._id) },
  });

  return {
    removedJobs: deletedJobs.deletedCount || 0,
    removedImportedRows,
  };
}

export function startExcelRetentionCleanupLoop() {
  if (cleanupTimer) {
    return cleanupTimer;
  }

  cleanupTimer = setInterval(async () => {
    try {
      const result = await runExcelRetentionCleanup();

      if (result.removedJobs > 0 || result.removedImportedRows > 0) {
        console.log(
          `[excel-cleanup] Removed ${result.removedJobs} expired job(s) and ${result.removedImportedRows} imported row(s)`
        );
      }
    } catch (error) {
      console.error("[excel-cleanup] Cleanup loop failed:", error);
    }
  }, cleanupIntervalMs);

  if (typeof cleanupTimer.unref === "function") {
    cleanupTimer.unref();
  }

  return cleanupTimer;
}

function getValidationErrorsForUploadType(uploadType, row) {
  const fields = arguments[2];
  const errors = fields.flatMap((field) =>
    field.required && !String(row[field.key] || "").trim()
      ? [`${field.label} is required`]
      : []
  );

  if (uploadType === "student") {
    errors.push(...getStudentSpecificValidationErrors(row, fields));
  }

  return errors;
}

function getStudentSpecificValidationErrors(row, fields) {
  const errors = [];
  const classField = fields.find((field) => field.legacyKey === "class");
  const departmentField = fields.find((field) => field.legacyKey === "department");
  const classValue = classField ? String(row[classField.key] || "").trim() : String(row.class || "").trim();
  const departmentValue = departmentField
    ? String(row[departmentField.key] || "").trim()
    : String(row.department || "").trim();

  if (classValue && classValue.length < 2) {
    errors.push("Class must be at least 2 characters");
  }

  if (departmentValue && departmentValue.length < 2) {
    errors.push("Department must be at least 2 characters");
  }

  return errors;
}

export function buildTemplateFields(fields, uploadType) {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error("Template fields are required");
  }

  const normalizedUploadType = normalizeUploadType(uploadType);
  const dedupe = new Set();

  const builtFields = fields.map(({ table, field }) => {
    const tableConfig = fieldRegistry[table];
    const fieldConfig = tableConfig?.[field];

    if (!fieldConfig) {
      throw new Error(`Invalid template field "${table}.${field}"`);
    }

    const key = `${table}.${field}`;

    if (dedupe.has(key)) {
      throw new Error(`Duplicate template field "${key}"`);
    }

    dedupe.add(key);

    return {
      key,
      table,
      field,
      label: fieldConfig.label,
      width: fieldConfig.width || 20,
      required: fieldConfig.requiredFor?.includes(normalizedUploadType) || false,
      isEmail: Boolean(fieldConfig.isEmail),
      legacyKey: fieldConfig.legacyKey || null,
    };
  });

  const missingRequiredFields = Object.entries(fieldRegistry).flatMap(([table, tableConfig]) =>
    Object.entries(tableConfig)
      .filter(([, fieldConfig]) => fieldConfig.requiredFor?.includes(normalizedUploadType))
      .map(([field]) => `${table}.${field}`)
      .filter((requiredKey) => !builtFields.some((builtField) => builtField.key === requiredKey))
  );

  if (missingRequiredFields.length > 0) {
    throw new Error(
      `Template is missing required field(s): ${missingRequiredFields.join(", ")}`
    );
  }

  return builtFields;
}

export function getTemplateMetadataSheetName() {
  return templateMetadataSheetName;
}
