import fs from "node:fs/promises";
import ExcelJob from "../../db/models/ExcelJob.js";
import { processExcelJob } from "../processor/excel.processor.js";
import {
  PROCESS_TOPIC,
  RESULT_TOPIC,
  sendMessage,
  consumer,
} from "../../utils/kafka.js";
import { getExcelMaxAttempts } from "../services/excel.service.js";

async function deleteUploadFile(filePath) {
  if (!filePath) {
    return;
  }

  await fs.unlink(filePath).catch(() => {});
}

async function publishResult(payload) {
  await sendMessage(RESULT_TOPIC, payload);
}

async function retryJob(payload, reason) {
  await sendMessage(PROCESS_TOPIC, {
    ...payload,
    retryReason: reason || null,
  });
}

export async function startExcelConsumer() {
  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message?.value) {
        return;
      }

      let payload;

      try {
        payload = JSON.parse(message.value.toString());
      } catch (error) {
        console.error("Invalid Excel job payload:", error);
        return;
      }

      const jobId = String(payload.jobId || "");
      if (!jobId) {
        console.error("Excel job payload missing jobId");
        return;
      }

      const job = await ExcelJob.findOne({ jobId }).lean();
      if (!job) {
        console.warn(`[excel-consumer] Job ${jobId} not found`);
        return;
      }

      if (job.status === "completed") {
        return;
      }

      const maxAttempts = job.maxAttempts || getExcelMaxAttempts();
      const nextAttempt = (job.attemptsMade || 0) + 1;

      if (nextAttempt > maxAttempts) {
        await ExcelJob.findOneAndUpdate(
          { jobId },
          {
            status: "failed",
            progress: 100,
            failureReason: job.failureReason || "Max attempts reached",
          }
        );
        await deleteUploadFile(payload.filePath);
        await publishResult({
          jobId,
          status: "failed",
          error: "Max attempts reached",
        });
        return;
      }

      await ExcelJob.findOneAndUpdate(
        { jobId },
        {
          attemptsMade: nextAttempt,
          status: "processing",
        }
      );

      try {
        const result = await processExcelJob({
          jobId,
          filePath: payload.filePath,
          originalName: payload.originalName,
          uploadType: payload.uploadType,
        });

        await publishResult({
          jobId,
          status: result.status,
          uploadType: result.uploadType,
          totalRows: result.totalRows,
          successCount: result.successCount,
          failedCount: result.failedCount,
          errorFileUrl: result.errorFileUrl,
        });

        await deleteUploadFile(payload.filePath);
      } catch (error) {
        const errorMessage = error?.message || "Failed to process Excel job";
        const remainingAttempts = Math.max(maxAttempts - nextAttempt, 0);

        await ExcelJob.findOneAndUpdate(
          { jobId },
          {
            failureReason: errorMessage,
            progress: 0,
            status: remainingAttempts > 0 ? "processing" : "failed",
          }
        );

        if (remainingAttempts > 0) {
          console.warn(
            `[excel-consumer] Job ${jobId} failed (attempt ${nextAttempt}/${maxAttempts}), retrying: ${errorMessage}`
          );
          await retryJob(payload, errorMessage);
          return;
        }

        console.error(
          `[excel-consumer] Job ${jobId} failed permanently: ${errorMessage}`
        );

        await deleteUploadFile(payload.filePath);
        await publishResult({
          jobId,
          status: "failed",
          error: errorMessage,
        });
      }
    },
  });
}
