import { Kafka } from 'kafkajs';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { TemplateModel } from '../models/mongo/Template.js';
import { validateRows } from './validation.service.js';
import { insertRowsForTable } from './ingest.service.js';
import { logProcessing, logValidationErrors, persistFailedChunk, decrementPendingChunk } from './logging.service.js';

const kafka = new Kafka({
  clientId: config.redpanda.clientId,
  brokers: config.redpanda.brokers
});

const templateCache = new Map();
const cacheTtlMs = 5 * 60 * 1000;

const getTemplate = async (templateId) => {
  const cached = templateCache.get(templateId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  const template = await TemplateModel.findOne({ templateId });
  if (!template) {
    return null;
  }
  templateCache.set(templateId, { value: template, expiresAt: Date.now() + cacheTtlMs });
  return template;
};

export const startWorker = async () => {
  const consumer = kafka.consumer({ groupId: config.redpanda.groupId });
  await consumer.connect();
  await consumer.subscribe({ topic: config.redpanda.uploadTopic, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      if (!message.value) return;
      const payload = JSON.parse(message.value.toString());
      const { uploadId, templateId, chunkId, rows } = payload;
      await logProcessing({ uploadId, stage: 'worker', message: 'Chunk received', metadata: { chunkId, topic, partition } });
      const template = await getTemplate(templateId);
      if (!template) {
        await logProcessing({ uploadId, stage: 'worker', level: 'error', message: 'Template missing for chunk', metadata: { chunkId } });
        await persistFailedChunk({ uploadId, chunkId, rows, reason: 'TEMPLATE_NOT_FOUND', metadata: { templateId } });
        await decrementPendingChunk({ uploadId, status: 'failed' });
        return;
      }
      try {
        const { validRows, invalidRows } = await validateRows({ template, rows, uploadId, chunkId });
        if (invalidRows.length) {
          await logValidationErrors({ uploadId, templateId, rows: invalidRows });
        }
        if (!validRows.length) {
          await logProcessing({ uploadId, stage: 'worker', level: 'warning', message: 'No valid rows in async chunk', metadata: { chunkId } });
          await decrementPendingChunk({ uploadId });
          return;
        }
        const primaryTable = template.tables[0];
        const columns = template.metadata.columnsByTable[primaryTable] || [];
        const { inserted } = await insertRowsForTable({ table: primaryTable, columns, rows: validRows });
        await logProcessing({ uploadId, stage: 'worker', message: 'Chunk ingested', metadata: { chunkId, inserted } });
        await decrementPendingChunk({ uploadId });
      } catch (err) {
        logger.error({ err, uploadId, chunkId }, 'Worker failed to process chunk');
        await logProcessing({ uploadId, stage: 'worker', level: 'error', message: 'Chunk processing failed', metadata: { chunkId, error: err.message } });
        await persistFailedChunk({ uploadId, chunkId, rows, reason: err.message, metadata: { stack: err.stack } });
        await decrementPendingChunk({ uploadId, status: 'failed' });
      }
    }
  });

  logger.info('Worker listening for PDIE upload chunks');
};
