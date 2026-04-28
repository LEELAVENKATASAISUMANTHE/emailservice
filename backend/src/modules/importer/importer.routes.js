/**
 * Importer routes.
 * All /api/tables, /api/schema, /api/import, /api/template, /api/mongo,
 * and /api/import-history endpoints are defined here.
 */
import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';

import { getPool } from '../../db/postgres.js';
import { getMongoStatus } from '../../db/mongo.js';
import { getTableList, buildRsiFields, buildCsvTemplate } from './schema.service.js';
import { bulkImport } from './import.service.js';
import { studentBulkImport } from './studentImport.service.js';
import {
  createImportLog,
  finalizeImportLog,
  getImportLog,
  getTempPasswords,
  getAllTempPasswords,
} from './importLog.service.js';
import { uploadImportFile, uploadTemplate } from '../../shared/objectStorage.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const importLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many import requests — please wait a minute.' },
});

// ── Tables ────────────────────────────────────────────────────────────────────

// GET /api/tables
router.get('/tables', async (req, res, next) => {
  try {
    const tables = await getTableList(getPool());
    res.json(tables);
  } catch (err) {
    next(err);
  }
});

// ── Schema ────────────────────────────────────────────────────────────────────

// GET /api/schema/:table
router.get('/schema/:table', async (req, res, next) => {
  try {
    const { table } = req.params;
    const allowed = await getTableList(getPool());
    if (!allowed.includes(table)) {
      return res.status(400).json({ error: `Unknown table: ${table}` });
    }
    const fields = await buildRsiFields(getPool(), table);
    res.json(fields);
  } catch (err) {
    next(err);
  }
});

// ── CSV template ──────────────────────────────────────────────────────────────

// GET /api/template/:table
router.get('/template/:table', async (req, res, next) => {
  try {
    const { table } = req.params;
    const allowed = await getTableList(getPool());
    if (!allowed.includes(table)) {
      return res.status(400).json({ error: `Unknown table: ${table}` });
    }
    const csv    = await buildCsvTemplate(getPool(), table);
    const buffer = Buffer.from(csv, 'utf-8');
    uploadTemplate(buffer, table).catch(() => {}); // non-fatal background upload
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${table}_template.csv"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// ── Import ────────────────────────────────────────────────────────────────────

// GET /api/import-history
router.get('/import-history', async (req, res, next) => {
  try {
    const { rows } = await getPool().query(
      `SELECT * FROM import_logs ORDER BY imported_at DESC LIMIT 50`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/import/passwords  (all non-expired credentials)
router.get('/import/passwords', async (req, res, next) => {
  try {
    res.json(await getAllTempPasswords());
  } catch (err) {
    next(err);
  }
});

// GET /api/import/:importId/passwords
router.get('/import/:importId/passwords', async (req, res, next) => {
  try {
    res.json(await getTempPasswords(req.params.importId));
  } catch (err) {
    next(err);
  }
});

// GET /api/import/:importId/log
router.get('/import/:importId/log', async (req, res, next) => {
  try {
    const log = await getImportLog(req.params.importId);
    if (!log) return res.status(404).json({ error: 'Log not found' });
    res.json(log);
  } catch (err) {
    next(err);
  }
});

// POST /api/import/:table
router.post('/import/:table', importLimiter, upload.single('file'), async (req, res, next) => {
  try {
    const { table } = req.params;

    let rows, filename;
    if (req.is('multipart/form-data') || req.file) {
      rows     = JSON.parse(req.body.rows || '[]');
      filename = req.body.filename || req.file?.originalname || '';
    } else {
      rows     = req.body.rows;
      filename = req.body.filename || '';
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows must be a non-empty array' });
    }

    const allowed = await getTableList(getPool());
    if (!allowed.includes(table)) {
      return res.status(400).json({ error: `Unknown table: ${table}` });
    }

    const importId = uuidv4();

    // Upload source file to object storage (non-fatal)
    let storageKey = null;
    if (req.file?.buffer) {
      storageKey = await uploadImportFile(
        req.file.buffer,
        `${importId}_${filename}`,
        req.file.mimetype
      ).catch(() => null);
    }

    await createImportLog({ importId, table, filename, storageKey, totalRows: rows.length });

    const result =
      table === 'students'
        ? await studentBulkImport(getPool(), rows, filename || null, importId)
        : await bulkImport(getPool(), table, rows, filename || null);

    // Build row-level log for MongoDB — only store row data for failures
    const errorMap = new Map(result.errors.map((e) => [e.rowIndex - 1, e.error]));
    const rowLogs  = rows.map((row, i) =>
      errorMap.has(i)
        ? { rowIndex: i + 1, data: row, status: 'failed', reason: errorMap.get(i) }
        : { rowIndex: i + 1, status: 'inserted' }
    );

    await finalizeImportLog(importId, {
      inserted: result.inserted,
      failed: result.failed,
      duplicates: result.duplicates || 0,
      rows: rowLogs,
    });

    res.json({ ...result, importId });
  } catch (err) {
    next(err);
  }
});

// ── MongoDB status ────────────────────────────────────────────────────────────

// GET /api/mongo/status
router.get('/mongo/status', async (req, res, next) => {
  try {
    const status = await getMongoStatus();
    res.status(status.connected ? 200 : 503).json(status);
  } catch (err) {
    next(err);
  }
});

export default router;
