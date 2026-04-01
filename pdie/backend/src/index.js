import cors from 'cors';
import express from 'express';
import 'express-async-errors';
import morgan from 'morgan';
import routes from './routes/index.js';
import { config } from './config/index.js';
import { errorHandler, notFoundHandler, requestIdMiddleware } from './middlewares/errorHandler.js';
import { connectMongo } from './db/mongo.js';
import { pgPool } from './db/postgres.js';
import { ensureBuckets, minioClient } from './storage/minio.js';
import { logger } from './utils/logger.js';
import { retryStartupStep } from './utils/retry.js';
import mongoose from 'mongoose';

const app = express();
const corsOptions = {
  origin: config.cors.origins
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(requestIdMiddleware);
app.use(express.json({ limit: '5mb' }));
app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));

// ── Health & readiness ────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

app.get('/health/ready', async (_req, res) => {
  const checks = {};
  let healthy = true;

  // MongoDB
  try {
    const state = mongoose.connection.readyState;
    checks.mongodb = state === 1 ? 'connected' : 'disconnected';
    if (state !== 1) healthy = false;
  } catch {
    checks.mongodb = 'error';
    healthy = false;
  }

  // PostgreSQL
  try {
    await pgPool.query('SELECT 1');
    checks.postgres = 'connected';
  } catch {
    checks.postgres = 'error';
    healthy = false;
  }

  // MinIO
  try {
    await minioClient.listBuckets();
    checks.minio = 'connected';
  } catch {
    checks.minio = 'error';
    healthy = false;
  }

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ready' : 'degraded',
    checks,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// ── API routes ────────────────────────────────────────────────────────
app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────
const start = async () => {
  const startTime = Date.now();
  const retryOptions = {
    attempts: config.app.startupRetryAttempts,
    delayMs: config.app.startupRetryDelayMs
  };

  await retryStartupStep('MongoDB', () => connectMongo(), retryOptions);
  await retryStartupStep('PostgreSQL', () => pgPool.query('SELECT 1'), retryOptions);
  await retryStartupStep('MinIO', () => ensureBuckets(), retryOptions);

  app.listen(config.app.port, () => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`PDIE backend listening on port ${config.app.port} (startup: ${elapsed}s)`);
  });
};

start().catch((err) => {
  logger.error({ err }, 'Failed to start PDIE backend');
  process.exit(1);
});
