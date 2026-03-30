// changes by nakul: controller for isolated Excel import/export endpoints
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildDynamicTemplateWorkbook,
  buildTemplateWorkbookFromPreset,
  computeExcelFileHash,
  findDuplicateExcelJob,
  enqueueExcelProcessing,
  getExcelJobStatus,
  getExcelJobErrorFile,
  getExcelRequesterId,
  getTemplateFieldRegistry,
  getTemplatePresets,
} from "../services/excel.service.js";
import { getObjectStream } from "../../utils/minio.js";

export async function uploadExcel(req, res) {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "Excel file is required" });
    }

    if (!file.size) {
      return res.status(400).json({ error: "Uploaded Excel file is empty" });
    }

    const uploadType = req.body?.uploadType || "student";
    const createdBy = getExcelRequesterId(req);
    const fileHash = await computeExcelFileHash(file.path);
    const existingJob = await findDuplicateExcelJob({
      createdBy,
      uploadType,
      fileHash,
    });

    if (existingJob) {
      await fs.unlink(file.path).catch(() => {});
      return res.status(200).json({
        message: "Duplicate file already uploaded. Returning existing job.",
        duplicate: true,
        existingJobId: existingJob.jobId,
        jobId: existingJob.jobId,
        fileName: existingJob.fileName,
        uploadType: existingJob.uploadType,
        statusUrl: `/api/excel/jobs/${existingJob.jobId}`,
        createdBy: existingJob.createdBy,
      });
    }

    const job = await enqueueExcelProcessing(
      file.path,
      file.originalname,
      uploadType,
      createdBy,
      fileHash
    );

    return res.json({
      message: "File uploaded. Processing started.",
      duplicate: false,
      jobId: job.id,
      fileName: file.originalname,
      uploadType,
      statusUrl: `/api/excel/jobs/${job.id}`,
      createdBy,
    });
  } catch (error) {
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    console.error("Error queueing Excel upload:", error);
    const statusCode = error.message?.startsWith("Invalid uploadType") ? 400 : 500;
    return res.status(statusCode).json({ error: error.message || "Failed to queue Excel upload" });
  }
}

export async function downloadTemplate(_req, res) {
  try {
    const templateType = _req.query?.type || "student";
    const workbook = await buildTemplateWorkbookFromPreset(templateType);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${templateType}-template.xlsx"`
    );

    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    console.error("Error generating Excel template:", error);
    return res.status(500).json({ error: "Failed to generate Excel template" });
  }
}

export async function downloadDynamicTemplate(req, res) {
  try {
    const { templateName, uploadType = "student", fields } = req.body || {};
    const workbook = await buildDynamicTemplateWorkbook({
      templateName: templateName || "Custom Upload Template",
      uploadType,
      fields,
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${sanitizeFileName(templateName || `${uploadType}-custom-template`)}.xlsx"`
    );

    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    console.error("Error generating dynamic Excel template:", error);
    const statusCode = error.message?.includes("template") || error.message?.includes("field")
      ? 400
      : 500;
    return res.status(statusCode).json({ error: error.message || "Failed to generate dynamic template" });
  }
}

export async function getTemplateRegistry(req, res) {
  return res.json({
    presets: getTemplatePresets(),
    fields: getTemplateFieldRegistry(),
  });
}

export async function getExcelUploadJobStatus(req, res) {
  try {
    const { jobId } = req.params;
    const job = await getExcelJobStatus(jobId);

    if (!job) {
      return res.status(404).json({ error: "Excel job not found" });
    }

    return res.json(job);
  } catch (error) {
    console.error("Error fetching Excel job status:", error);
    return res.status(500).json({ error: "Failed to fetch Excel job status" });
  }
}

function sanitizeFileName(value) {
  return String(value || "template").replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function downloadExcelErrorFile(req, res) {
  try {
    const { jobId } = req.params;
    const job = req.excelJob || (await getExcelJobErrorFile(jobId));

    if (!job?.errorStoragePath) {
      return res.status(404).json({ error: "Error file not found for this job" });
    }

    const fileName = path.posix.basename(job.errorStoragePath) || `excel-errors-${jobId}.xlsx`;
    const stream = await getObjectStream(job.errorStoragePath);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    stream.on("error", (error) => {
      console.error("Error streaming Excel error file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to stream Excel error file" });
      } else {
        res.end();
      }
    });

    stream.pipe(res);
    return undefined;
  } catch (error) {
    console.error("Error downloading Excel error file:", error);
    return res.status(500).json({ error: "Failed to download Excel error file" });
  }
}
