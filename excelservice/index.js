import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import multer from 'multer';
import cors from 'cors';
import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

import {
  connectToDB,
  fetchtables,
  fetchJoinedTables,
  fetchTableColumns,
  pool,
} from './db.js';

import {
  ensureBuckets,
  uploadTemplate,
  getPresignedTemplateUrl,
  uploadLog,
} from './minio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── App + Socket.IO ──────────────────────────────────────────────────────────
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage() });

// ─── Session Store ────────────────────────────────────────────────────────────
const sessions = new Map();

function makeSession(sessionId, socketId) {
  return {
    sessionId,
    socketId,
    status: 'idle',            // idle | generating | template-ready | verified | inserting | complete | error | disconnected
    tables: [],
    templateObjectName: null,
    targetTable: null,
    parsedRows: [],
    colMeta: {},
    matchedCols: [],
    progress: { total: 0, inserted: 0, skipped: 0 },
    logs: [],                  // NDJSON strings collected during session
    connectedAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    logTimestamp: new Date().toISOString().replace(/[:.]/g, '-'),
  };
}

function sessionSnapshot(sess) {
  return {
    sessionId:    sess.sessionId,
    status:       sess.status,
    tables:       sess.tables,
    targetTable:  sess.targetTable,
    progress:     sess.progress,
    connectedAt:  sess.connectedAt,
    lastActivity: sess.lastActivity,
  };
}

// ─── Logging helpers ──────────────────────────────────────────────────────────
function makeLogEntry(sessionId, event, extra = {}) {
  return JSON.stringify({ ts: new Date().toISOString(), session: sessionId, event, ...extra });
}

function emitLog(socket, sessionId, event, extra = {}) {
  const raw = makeLogEntry(sessionId, event, extra);
  const parsed = JSON.parse(raw);

  socket.emit('log-entry', parsed);            // to this user
  io.to('admin').emit('log-entry', parsed);    // to all admins

  const sess = sessions.get(sessionId);
  if (sess) {
    sess.logs.push(raw);
    sess.lastActivity = new Date().toISOString();
  }
}

function emitSessionUpdate(sessionId) {
  const sess = sessions.get(sessionId);
  if (sess) io.to('admin').emit('session-update', sessionSnapshot(sess));
}

// ─── Socket.IO connection handler ─────────────────────────────────────────────
io.on('connection', (socket) => {
  const sessionId = uuidv4();
  const sess = makeSession(sessionId, socket.id);
  sessions.set(sessionId, sess);

  socket.emit('session-init', { sessionId });
  emitSessionUpdate(sessionId);
  console.log(`[ws] +session ${sessionId.slice(0, 8)}`);

  // ── Step 1a: fetch available tables ───────────────────────────────────────
  socket.on('get-tables', async () => {
    try {
      const tables = await fetchtables();
      socket.emit('tables-list', { tables: tables || [] });
    } catch (err) {
      socket.emit('error-msg', { message: 'Failed to fetch tables: ' + err.message });
    }
  });

  // ── Step 1b: generate protected template → MinIO ──────────────────────────
  socket.on('select-tables', async ({ tables }) => {
    if (!tables || !Array.isArray(tables) || tables.length === 0) {
      return socket.emit('error-msg', { message: 'Select at least one table' });
    }
    try {
      sess.tables = tables;
      sess.status = 'generating';
      emitSessionUpdate(sessionId);

      socket.emit('template-status', { message: '⚙️ Generating template…' });
      emitLog(socket, sessionId, 'template-start', { tables });

      const { buffer, filename } = await generateExcelTemplate(tables);
      const objectName = await uploadTemplate(sessionId, buffer, filename);
      const url = await getPresignedTemplateUrl(objectName);

      sess.templateObjectName = objectName;
      sess.status = 'template-ready';
      emitSessionUpdate(sessionId);

      socket.emit('template-ready', { url, filename });
      emitLog(socket, sessionId, 'template-generated', { filename, objectName });
    } catch (err) {
      console.error('[select-tables]', err.message);
      sess.status = 'error';
      emitSessionUpdate(sessionId);
      socket.emit('error-msg', { message: 'Template generation failed: ' + err.message });
    }
  });

  // ── Step 3: confirm → live row-by-row insert ──────────────────────────────
  socket.on('confirm-insert', async () => {
    const { parsedRows, targetTable, colMeta, matchedCols } = sess;
    if (!parsedRows || parsedRows.length === 0) {
      return socket.emit('error-msg', { message: 'No data to insert. Upload a file first.' });
    }

    sess.status = 'inserting';
    emitSessionUpdate(sessionId);
    emitLog(socket, sessionId, 'insert-start', { table: targetTable, totalRows: parsedRows.length });

    const txClient = await pool.connect();
    const errors = [];
    let inserted = 0;
    let skipped = 0;

    try {
      await txClient.query('BEGIN');

      for (const { rowNum, data } of parsedRows) {
        // Validate
        const rowErrs = validateRow(data, colMeta, matchedCols);
        if (rowErrs.length > 0) {
          skipped++;
          sess.progress.skipped = skipped;
          socket.emit('row-error', { rowNum, errors: rowErrs });
          emitLog(socket, sessionId, 'row-error', { rowNum, errors: rowErrs });
          errors.push({ rowNum, errors: rowErrs });
          continue;
        }

        try {
          // Build INSERT for non-null columns only
          const cols = matchedCols.filter(c => data[c] !== null && data[c] !== undefined && data[c] !== '');
          const vals = cols.map(c => coerceValue(data[c], colMeta[c]));
          const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
          const colList = cols.map(c => `"${c}"`).join(', ');

          await txClient.query(
            `INSERT INTO ${targetTable} (${colList}) VALUES (${placeholders})`,
            vals
          );

          inserted++;
          sess.progress.inserted = inserted;
          socket.emit('row-inserted', { rowNum, data });
          emitLog(socket, sessionId, 'row-inserted', { rowNum });
          emitSessionUpdate(sessionId);

        } catch (rowErr) {
          skipped++;
          sess.progress.skipped = skipped;
          const errMsg = rowErr.message;
          socket.emit('row-error', { rowNum, errors: [errMsg] });
          emitLog(socket, sessionId, 'row-error', { rowNum, errors: [errMsg] });
          errors.push({ rowNum, errors: [errMsg] });
        }
      }

      await txClient.query('COMMIT');
      sess.status = 'complete';
      emitSessionUpdate(sessionId);

      socket.emit('import-complete', {
        inserted,
        skipped,
        total: parsedRows.length,
        errors,
      });
      emitLog(socket, sessionId, 'import-complete', {
        inserted, skipped, total: parsedRows.length,
      });

      // Upload full NDJSON log to MinIO
      try {
        const logObjectName = await uploadLog(sessionId, sess.logTimestamp, sess.logs);
        socket.emit('log-saved', { objectName: logObjectName });
        io.to('admin').emit('log-saved', { sessionId, objectName: logObjectName });
      } catch (logErr) {
        console.error('[log-upload]', logErr.message);
      }

    } catch (txErr) {
      await txClient.query('ROLLBACK');
      console.error('[confirm-insert]', txErr.message);
      sess.status = 'error';
      emitSessionUpdate(sessionId);
      socket.emit('error-msg', { message: 'Transaction rolled back: ' + txErr.message });
      emitLog(socket, sessionId, 'insert-error', { error: txErr.message });
    } finally {
      txClient.release();
    }
  });

  // ── Admin: join monitoring room ────────────────────────────────────────────
  socket.on('join-admin', () => {
    socket.join('admin');
    const state = [...sessions.values()].map(sessionSnapshot);
    socket.emit('admin-state', { sessions: state });
    console.log(`[ws] Admin joined: ${socket.id.slice(0, 6)}`);
  });

  // ── Disconnect ─────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    if (sess.status !== 'complete') sess.status = 'disconnected';
    sess.lastActivity = new Date().toISOString();
    emitSessionUpdate(sessionId);
    console.log(`[ws] -session ${sessionId.slice(0, 8)}`);
    setTimeout(() => sessions.delete(sessionId), 30_000);
  });
});

// ─── HTTP: Upload file tied to a session ─────────────────────────────────────
// Uses sessionId from URL so the result can be pushed back via that session's socket
app.post('/upload/:sessionId', upload.single('file'), async (req, res) => {
  const { sessionId } = req.params;
  const sess = sessions.get(sessionId);
  if (!sess)    return res.status(404).json({ error: 'Session not found or expired' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const targetTable = req.body.table;
    if (!targetTable) return res.status(400).json({ error: "'table' field is required" });

    // Validate table exists
    const allTables = await fetchtables();
    if (!allTables.includes(targetTable)) {
      return res.status(400).json({ error: `Unknown table: ${targetTable}` });
    }

    // Fetch column schema
    const columns  = await fetchTableColumns(targetTable);
    const validCols = new Set(columns.map(c => c.column_name));
    const colMeta  = Object.fromEntries(columns.map(c => [c.column_name, c]));

    // Parse workbook
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return res.status(400).json({ error: 'No worksheet found in file' });

    // Extract headers from row 1
    const headers = [];
    sheet.getRow(1).eachCell(cell => headers.push(cell.value?.toString().trim() ?? ''));

    const matchedCols   = headers.filter(h => validCols.has(h));
    const unmatchedCols = headers.filter(h => h && !validCols.has(h));

    // Parse data rows (skip blank)
    const dataRows = [];
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const obj = {};
      let hasValue = false;
      matchedCols.forEach(h => {
        const val = row.getCell(headers.indexOf(h) + 1).value;
        if (val !== null && val !== undefined && val !== '') hasValue = true;
        obj[h] = val ?? null;
      });
      if (hasValue) dataRows.push({ rowNum, data: obj });
    });

    // Save to session
    sess.targetTable  = targetTable;
    sess.parsedRows   = dataRows;
    sess.colMeta      = colMeta;
    sess.matchedCols  = matchedCols;
    sess.status       = 'verified';
    sess.progress     = { total: dataRows.length, inserted: 0, skipped: 0 };
    sess.lastActivity = new Date().toISOString();
    emitSessionUpdate(sessionId);

    // Push verification result to the user's socket
    const socket = io.sockets.sockets.get(sess.socketId);
    if (socket) {
      socket.emit('verify-result', {
        matched:     matchedCols,
        unmatched:   unmatchedCols,
        totalRows:   dataRows.length,
        preview:     dataRows.slice(0, 5).map(r => r.data),
        targetTable,
      });
      emitLog(socket, sessionId, 'file-verified', {
        targetTable,
        matched:   matchedCols.length,
        unmatched: unmatchedCols.length,
        totalRows: dataRows.length,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[/upload]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── HTTP: List tables (for REST clients / debugging) ─────────────────────────
app.get('/api/excel/tables', async (req, res) => {
  try {
    const tables = await fetchtables();
    res.json({ tables: tables || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Validation helpers ───────────────────────────────────────────────────────
function validateRow(data, colMeta, matchedCols) {
  const errs = [];
  for (const col of matchedCols) {
    const meta = colMeta[col];
    const val  = data[col];
    if ((val === null || val === '' || val === undefined)
        && meta.is_nullable === 'NO'
        && meta.column_default === null) {
      errs.push(`'${col}' is required`);
    }
  }
  return errs;
}

function coerceValue(val, meta) {
  if (val === null || val === undefined || val === '') return null;
  const dt = meta.data_type;
  if (['integer', 'bigint', 'smallint'].includes(dt))       return Number(val);
  if (['numeric', 'real', 'double precision'].includes(dt)) return Number(val);
  if (dt === 'boolean') {
    if (['true',  '1', 'yes'].includes(String(val).toLowerCase())) return true;
    if (['false', '0', 'no' ].includes(String(val).toLowerCase())) return false;
    return val;
  }
  if (dt === 'date') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? val : d.toISOString().split('T')[0];
  }
  return String(val);
}

// ─── Excel template generator (returns Buffer, not disk file) ─────────────────
export async function generateExcelTemplate(tables) {
  const result = await fetchJoinedTables(tables);
  let headers = result?.headers || [];

  // Fallback: introspect columns individually if no rows in DB
  if (!headers.length) {
    for (const t of tables) {
      const cols = await fetchTableColumns(t);
      cols.forEach(c => { if (!headers.includes(c.column_name)) headers.push(c.column_name); });
    }
  }
  if (!headers.length) throw new Error('No columns found for selected tables');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Excel Service';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Template');

  // Header row — locked, gold background
  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true, color: { argb: 'FF1A1A2E' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD700' } };
  headerRow.eachCell(cell => {
    cell.protection = { locked: true };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF1A1A2E' } } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // 50 unlocked data rows
  for (let i = 0; i < 50; i++) {
    const row = sheet.addRow(new Array(headers.length).fill(''));
    row.eachCell({ includeEmpty: true }, cell => { cell.protection = { locked: false }; });
  }

  headers.forEach((h, i) => { sheet.getColumn(i + 1).width = Math.max((h?.length || 10) + 6, 16); });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  await sheet.protect('password123', { selectLockedCells: false, selectUnlockedCells: true });

  const filename = `template_${tables.join('_')}.xlsx`;
  const raw = await workbook.xlsx.writeBuffer();
  return { buffer: Buffer.from(raw), filename };
}

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = 3000;
httpServer.listen(PORT, async () => {
  console.log(`✅ Excel Service (WebSocket) → http://localhost:${PORT}`);
  console.log(`   User portal  → http://localhost:${PORT}/`);
  console.log(`   Admin portal → http://localhost:${PORT}/admin.html`);
  await connectToDB();
  await ensureBuckets();
});