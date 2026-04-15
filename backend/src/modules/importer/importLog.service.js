/**
 * Import log service — MongoDB-backed.
 * Tracks per-import results and stores temporary student passwords (TTL: 24 h).
 */
import { getImporterDb } from '../../db/mongo.js';

const TEMP_PASSWORD_TTL_MS = 24 * 60 * 60 * 1000;

function importLogs() {
  return getImporterDb().collection('import_logs');
}

function tempPasswords() {
  return getImporterDb().collection('student_temp_passwords');
}

export async function createImportLog({ importId, table, filename, storageKey, totalRows }) {
  try {
    await importLogs().insertOne({
      importId,
      table,
      filename,
      storageKey: storageKey || null,
      status: 'in_progress',
      startedAt: new Date(),
      completedAt: null,
      summary: { total: totalRows, inserted: 0, failed: 0 },
      rows: [],
    });
  } catch (err) {
    console.warn('[importLog] createImportLog failed:', err.message);
  }
}

export async function finalizeImportLog(importId, { inserted, failed, rows }) {
  try {
    await importLogs().updateOne(
      { importId },
      {
        $set: {
          status: 'completed',
          completedAt: new Date(),
          'summary.inserted': inserted,
          'summary.failed': failed,
          rows,
        },
      }
    );
  } catch (err) {
    console.warn('[importLog] finalizeImportLog failed:', err.message);
  }
}

export async function getImportLog(importId) {
  try {
    return importLogs().findOne({ importId }, { projection: { _id: 0 } });
  } catch {
    return null;
  }
}

export async function storeTempPassword({ importId, studentId, email, username, password }) {
  const now = new Date();
  await tempPasswords().insertOne({
    importId,
    studentId,
    email,
    username,
    password,
    createdAt: now,
    expiresAt: new Date(now.getTime() + TEMP_PASSWORD_TTL_MS),
  });
}

export async function getTempPasswords(importId) {
  try {
    return tempPasswords()
      .find(
        { importId, expiresAt: { $gt: new Date() } },
        { projection: { _id: 0, password: 1, studentId: 1, email: 1, username: 1, createdAt: 1, expiresAt: 1 } }
      )
      .sort({ createdAt: 1 })
      .toArray();
  } catch {
    return [];
  }
}

export async function getAllTempPasswords() {
  try {
    return tempPasswords()
      .find(
        { expiresAt: { $gt: new Date() } },
        { projection: { _id: 0, password: 1, studentId: 1, email: 1, username: 1, importId: 1, createdAt: 1, expiresAt: 1 } }
      )
      .sort({ createdAt: -1 })
      .toArray();
  } catch {
    return [];
  }
}
