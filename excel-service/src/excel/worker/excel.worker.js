// changes by nakul: dedicated worker process for background Excel parsing
import fs from "node:fs/promises";
import { Worker } from "bullmq";
import { connectMongo, disconnectMongo } from "../../db/mongo.js";
import ExcelJob from "../../db/models/ExcelJob.js";
import { connection, queueName } from "../queue/excel.queue.js";
import { mapUploadRows } from "../mappers/index.js";
import { persistMappedRows } from "../persistence/index.js";
import { parseExcel } from "../utils/excel.parser.js";
import {
  assertExcelRowLimit,
  buildFailedRowPreview,
  createErrorWorkbook,
  getExcelQueueAttemptLimit,
  validateExcelRowsByType,
} from "../services/excel.service.js";

await connectMongo();

function getCurrentAttemptCount(job) {
  return Math.max((job.attemptsMade || 0) + 1, 1);
}

async function updateJobProgress(job, progress, extraFields = {}) {
  await Promise.all([
    job.updateProgress(progress),
    ExcelJob.findOneAndUpdate(
      { jobId: String(job.id) },
      {
        progress,
        attemptsMade: getCurrentAttemptCount(job),
        ...extraFields,
      }
    ),
  ]);
}

const worker = new Worker(
  queueName,
  async (job) => {
    const { filePath, originalName, uploadType = "student" } = job.data;

    console.log(`[excel-worker] Processing job ${job.id} for ${originalName}`);

    try {
      await updateJobProgress(job, 10, { status: "processing", failureReason: null });
      const { rows: parsedRows, template } = await parseExcel(filePath);

      if (template?.uploadType && template.uploadType !== uploadType) {
        throw new Error(
          `Uploaded template type "${template.uploadType}" does not match request uploadType "${uploadType}"`
        );
      }

      assertExcelRowLimit(parsedRows);
      await updateJobProgress(job, 30, { totalRows: parsedRows.length });

      const {
        validRows,
        invalidRows: validationFailures,
      } = validateExcelRowsByType(parsedRows, uploadType, template?.fields);
      await updateJobProgress(job, 55, {
        failedCount: validationFailures.length,
      });

      const mappedRows = mapUploadRows(uploadType, validRows, String(job.id));
      const { insertedCount, dbFailures } = await persistMappedRows(uploadType, mappedRows);

      await updateJobProgress(job, 80, {
        successCount: insertedCount,
      });

      const invalidRows = [...validationFailures, ...dbFailures];
      const failedRowPreview = buildFailedRowPreview(invalidRows);
      const errorFile = await createErrorWorkbook(String(job.id), invalidRows);
      const finalStatus =
        insertedCount > 0 || parsedRows.length === 0 ? "completed" : "failed";

      const persistedJob = await ExcelJob.findOneAndUpdate(
        { jobId: String(job.id) },
        {
          status: finalStatus,
          progress: 100,
          attemptsMade: getCurrentAttemptCount(job),
          maxAttempts: getExcelQueueAttemptLimit(),
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

      console.log(
        `[excel-worker] Parsed ${parsedRows.length} row(s) from ${originalName}; inserted ${insertedCount}, failed ${invalidRows.length}`
      );

      return {
        success: finalStatus === "completed",
        fileName: originalName,
        uploadType,
        totalRows: parsedRows.length,
        successCount: insertedCount,
        failedCount: invalidRows.length,
        progress: 100,
        attemptsMade: getCurrentAttemptCount(job),
        maxAttempts: getExcelQueueAttemptLimit(),
        failedPreview: failedRowPreview,
        errorFileUrl: persistedJob?.errorFileUrl || null,
      };
    } catch (error) {
      await ExcelJob.findOneAndUpdate(
        { jobId: String(job.id) },
        {
          status: "failed",
          progress: 100,
          attemptsMade: getCurrentAttemptCount(job),
          maxAttempts: getExcelQueueAttemptLimit(),
          failureReason: error.message,
        }
      );
      throw error;
    } finally {
      // changes by nakul: uploaded files are cleaned up after processing to avoid disk buildup
      await fs.unlink(filePath).catch(() => {});
    }
  },
  {
    connection,
    concurrency: 5,
  }
);

worker.on("completed", (job) => {
  console.log(`[excel-worker] Job ${job?.id} completed`);
});

worker.on("failed", (job, error) => {
  console.error(`[excel-worker] Job ${job?.id} failed:`, error.message);
});

const shutdown = async () => {
  await worker.close();
  await disconnectMongo().catch(() => {});
  await connection.quit();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
