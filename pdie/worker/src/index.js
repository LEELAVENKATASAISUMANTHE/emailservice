import { connectMongo } from './db/mongo.js';
import { config } from './config/index.js';
import { pgPool } from './db/postgres.js';
import { ensureBucket } from './db/minio.js';
import { startWorker } from './services/worker.service.js';
import { logger } from './utils/logger.js';
import { retryStartupStep } from './utils/retry.js';

const bootstrap = async () => {
  const retryOptions = {
    attempts: config.app.startupRetryAttempts,
    delayMs: config.app.startupRetryDelayMs
  };

  await retryStartupStep('MongoDB', () => connectMongo(), retryOptions);
  await retryStartupStep('PostgreSQL', () => pgPool.query('SELECT 1'), retryOptions);
  await retryStartupStep('MinIO', () => ensureBucket(config.minio.bucket), retryOptions);
  await retryStartupStep('Redpanda consumer', () => startWorker(), retryOptions);
};

bootstrap().catch((err) => {
  logger.error({ err }, 'Failed to start PDIE worker');
  process.exit(1);
});
