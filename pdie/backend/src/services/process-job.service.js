import { TemplateModel } from '../models/Template.js';
import { appendLogRows, getJob, updateJob } from './job.service.js';
import { getObjectBuffer } from '../db/minio.js';
import { streamRows } from '../utils/excel.js';
import { validateRows } from './validation.service.js';
import { ingestRows } from './ingest.service.js';

const toLogRow = (row) => ({
  rowIndex: row.rowIndex,
  status: 'error',
  errors: row.errors.map((error) => ({
    field: error.field || '',
    value: error.value == null ? '' : String(error.value),
    message: error.message
  }))
});

const appendRowsInBatches = async (jobId, rows, batchSize = 100) => {
  for (let index = 0; index < rows.length; index += batchSize) {
    await appendLogRows(jobId, rows.slice(index, index + batchSize));
  }
};

export const processJob = async (jobId) => {
  try {
    const job = await getJob(jobId);
    if (!job) {
      throw new Error(`Job "${jobId}" not found`);
    }

    await updateJob(jobId, {
      status: 'validating',
      errorSummary: '',
      updatedAt: new Date()
    });

    const buffer = await getObjectBuffer(`uploads/${jobId}.xlsx`);
    const templateRecord = await TemplateModel.findOne({ templateId: job.templateId }).lean();
    if (!templateRecord) {
      throw new Error(`Template "${job.templateId}" not found`);
    }

    const templateDoc = {
      ...templateRecord,
      __validationState: {
        duplicateTracker: {}
      }
    };

    const validRows = [];
    let validationRejected = 0;
    let rowsSinceUpdate = 0;

    await streamRows(buffer, async (chunk) => {
      const { validRows: chunkValidRows, errorRows } = await validateRows(chunk, templateDoc);

      validRows.push(...chunkValidRows);
      validationRejected += errorRows.length;
      rowsSinceUpdate += chunk.length;

      if (errorRows.length) {
        await appendRowsInBatches(jobId, errorRows.map(toLogRow));
      }

      if (rowsSinceUpdate >= 100) {
        await updateJob(jobId, {
          rejectedRows: validationRejected,
          processedRows: validationRejected,
          updatedAt: new Date()
        });
        rowsSinceUpdate = 0;
      }
    }, 500);

    await updateJob(jobId, {
      rejectedRows: validationRejected,
      processedRows: validationRejected,
      updatedAt: new Date()
    });

    if (!validRows.length) {
      await updateJob(jobId, {
        status: 'done',
        processedRows: validationRejected,
        committedRows: 0,
        rejectedRows: validationRejected,
        errorSummary: '',
        updatedAt: new Date()
      });
      return;
    }

    await updateJob(jobId, {
      status: 'ingesting',
      updatedAt: new Date()
    });

    const { committed, rejected: ingestionRejected } = await ingestRows(validRows, templateDoc, jobId);
    const totalRejected = validationRejected + ingestionRejected;

    await updateJob(jobId, {
      status: 'done',
      processedRows: committed + totalRejected,
      committedRows: committed,
      rejectedRows: totalRejected,
      errorSummary: '',
      updatedAt: new Date()
    });
  } catch (error) {
    await updateJob(jobId, {
      status: 'failed',
      errorSummary: error.message,
      updatedAt: new Date()
    }).catch(() => {});

    throw error;
  }
};
