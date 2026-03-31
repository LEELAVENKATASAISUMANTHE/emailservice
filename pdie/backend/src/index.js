import cors from 'cors';
import express from 'express';
import 'express-async-errors';
import morgan from 'morgan';
import routes from './routes/index.js';
import { config } from './config/index.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { connectMongo } from './db/mongo.js';
import { pgPool } from './db/postgres.js';
import { ensureBuckets } from './storage/minio.js';
import { logger } from './utils/logger.js';
import { retryStartupStep } from './utils/retry.js';

const app = express();
const corsOptions = {
  origin: config.cors.origins
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('combined'));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

const start = async () => {
  const retryOptions = {
    attempts: config.app.startupRetryAttempts,
    delayMs: config.app.startupRetryDelayMs
  };

  await retryStartupStep('MongoDB', () => connectMongo(), retryOptions);
  await retryStartupStep('PostgreSQL', () => pgPool.query('SELECT 1'), retryOptions);
  await retryStartupStep('MinIO', () => ensureBuckets(), retryOptions);

  app.listen(config.app.port, () => {
    logger.info(`PDIE backend listening on port ${config.app.port}`);
  });
};

start().catch((err) => {
  logger.error({ err }, 'Failed to start PDIE backend');
  process.exit(1);
});
