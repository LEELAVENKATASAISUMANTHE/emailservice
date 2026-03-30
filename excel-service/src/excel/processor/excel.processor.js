import ExcelJob from "../../db/models/ExcelJob.js";
import { mapUploadRows } from "../mappers/index.js";
import { persistMappedRows } from "../persistence/index.js";
import { parseExcel } from "../utils/excel.parser.js";
import {
  assertExcelRowLimit,
  buildFailedRowPreview,
  createErrorWorkbook,
  validateExcelRowsByType,
} from "../services/excel.service.js";

async function updateJobProgress(jobId, progress, extraFields = {}) {
  await ExcelJob.findOneAndUpdate(
    { jobId: String(jobId) },
    {
      progress,
      ...extraFields,
    }
  );
}

export async function processExcelJob({
  jobId,
  filePath,
  originalName,
  uploadType = "student",
}) {
  await updateJobProgress(jobId, 10, { status: "processing", failureReason: null });

  const { rows: parsedRows, template } = await parseExcel(filePath);

  if (template?.uploadType && template.uploadType !== uploadType) {
    throw new Error(
      `Uploaded template type "${template.uploadType}" does not match request uploadType "${uploadType}"`
    );
  }

  assertExcelRowLimit(parsedRows);
  await updateJobProgress(jobId, 30, { totalRows: parsedRows.length });

  const { validRows, invalidRows: validationFailures } = validateExcelRowsByType(
    parsedRows,
    uploadType,
    template?.fields
  );
  await updateJobProgress(jobId, 55, {
    failedCount: validationFailures.length,
  });

  const mappedRows = mapUploadRows(uploadType, validRows, String(jobId));
  const { insertedCount, dbFailures } = await persistMappedRows(uploadType, mappedRows);

  await updateJobProgress(jobId, 80, {
    successCount: insertedCount,
  });

  const invalidRows = [...validationFailures, ...dbFailures];
  const failedRowPreview = buildFailedRowPreview(invalidRows);
  const errorFile = await createErrorWorkbook(String(jobId), invalidRows);
  const finalStatus = insertedCount > 0 || parsedRows.length === 0 ? "completed" : "failed";

  const persistedJob = await ExcelJob.findOneAndUpdate(
    { jobId: String(jobId) },
    {
      status: finalStatus,
      progress: 100,
      totalRows: parsedRows.length,
      successCount: insertedCount,
      failedCount: invalidRows.length,
      failedRowPreview,
      errorFileUrl: errorFile?.url || null,
      errorStoragePath: errorFile?.storagePath || null,
      failureReason:
        finalStatus === "failed" && invalidRows.length === parsedRows.length
          ? "All rows failed validation or database insertion"
          : null,
    },
    { new: true }
  ).lean();

  return {
    status: finalStatus,
    jobId: String(jobId),
    fileName: originalName,
    uploadType,
    totalRows: parsedRows.length,
    successCount: insertedCount,
    failedCount: invalidRows.length,
    progress: 100,
    failedPreview: failedRowPreview,
    errorFileUrl: persistedJob?.errorFileUrl || null,
  };
}
