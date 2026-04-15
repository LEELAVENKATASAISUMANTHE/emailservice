import express from 'express';
import cors from 'cors';

import { server as serverConfig } from './config/index.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import notificationRoutes from './modules/notifications/notification.routes.js';
import studentRoutes from './modules/students/student.routes.js';
import importerRoutes from './modules/importer/importer.routes.js';

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
const isDev = serverConfig.nodeEnv !== 'production';

const allowedOrigins = isDev
  ? ['http://localhost:3000', 'http://localhost:3300', 'http://localhost:5173']
  : serverConfig.allowedOrigins;

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
  })
);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/notifications', notificationRoutes);
app.use('/api/student',       studentRoutes);
app.use('/api',               importerRoutes); // handles /api/tables, /api/schema, /api/import, etc.

// ── Error handling ────────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
