/**
 * PostgreSQL connection pool.
 * Used by the DB-importer module.
 */
import pg from 'pg';
import { postgres as config } from '../config/index.js';

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!pool) {
    if (!config.connectionString) {
      throw new Error('DATABASE_URL is not set — PostgreSQL features are disabled');
    }
    pool = new Pool({
      connectionString: config.connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    pool.on('error', (err) => {
      console.error('[postgres] Unexpected pool error:', err.message);
    });
  }
  return pool;
}

export async function connectPostgres() {
  const p = getPool();
  await p.query('SELECT 1');
  console.log('[postgres] connection OK');
}

export async function disconnectPostgres() {
  if (!pool) return;
  await pool.end();
  pool = null;
  console.log('[postgres] pool closed');
}
