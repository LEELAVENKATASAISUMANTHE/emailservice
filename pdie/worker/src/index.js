import { connectMongo } from './db/mongo.js';
import { pgPool } from './db/postgres.js';
import { startWorker } from './services/worker.service.js';
import { logger } from './utils/logger.js';

const bootstrap = async () => {
  await connectMongo();
  await pgPool.query('SELECT 1');
  await startWorker();
};

bootstrap().catch((err) => {
  logger.error({ err }, 'Failed to start PDIE worker');
  process.exit(1);
});
