/**
 * Generic bulk-import service.
 * Inserts validated rows into any whitelisted PostgreSQL table.
 * Per-row errors are collected — one bad row never aborts the entire batch.
 */

/** Create the import_logs audit table if it doesn't exist. */
export async function ensureImportLogsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS import_logs (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      table_name   VARCHAR(100),
      total_rows   INTEGER,
      success_rows INTEGER,
      failed_rows  INTEGER,
      filename     VARCHAR(255),
      imported_at  TIMESTAMPTZ DEFAULT now()
    )
  `);
}

/** Remove the legacy PG trigger that created users (replaced by Node/bcrypt). */
export async function ensureStudentUserTrigger(pool) {
  await pool.query(`DROP TRIGGER IF EXISTS trg_create_user_for_student ON students`);
  await pool.query(`DROP FUNCTION IF EXISTS create_user_for_student()`);
}

/**
 * Bulk-insert rows into tableName.
 * Column names come from the RSI schema output (whitelist-validated by the caller).
 *
 * @returns {{ inserted: number, failed: number, errors: Array }}
 */
export async function bulkImport(pool, tableName, rows, filename = null) {
  if (!rows || rows.length === 0) return { inserted: 0, failed: 0, duplicates: 0, errors: [] };

  const columns = Object.keys(rows[0]);
  if (columns.length === 0) return { inserted: 0, failed: 0, duplicates: 0, errors: [] };

  const errors = [];
  let inserted = 0;
  let duplicates = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const values = columns.map((c) => {
        const v = row[c];
        if (v === '' || v === undefined || v === null || v === 'null') return null;
        return v;
      });

      const colList      = columns.map((c) => `"${c}"`).join(', ');
      const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
      const sql = `INSERT INTO "${tableName}" (${colList})
                   VALUES (${placeholders})
                   ON CONFLICT DO NOTHING
                   RETURNING *`;

      try {
        await client.query('SAVEPOINT sp');
        const insertRes = await client.query(sql, values);
        await client.query('RELEASE SAVEPOINT sp');
        if (insertRes.rowCount > 0) {
          inserted++;
        } else {
          duplicates++;
        }
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT sp');
        errors.push({ rowIndex: i + 1, rowData: row, error: err.message });
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const failed      = errors.length;
  const successRows = inserted;

  try {
    await pool.query(
      `INSERT INTO import_logs (table_name, total_rows, success_rows, failed_rows, filename)
       VALUES ($1, $2, $3, $4, $5)`,
      [tableName, rows.length, successRows, failed, filename]
    );
  } catch (logErr) {
    console.error('[importer] failed to write import_log:', logErr.message);
  }

  return { inserted, failed, duplicates, errors };
}
