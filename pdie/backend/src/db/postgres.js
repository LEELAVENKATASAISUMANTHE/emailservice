import { Pool } from 'pg';
import { config } from '../config/index.js';

const pool = new Pool({
  connectionString: config.postgres.connectionString
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Unexpected PostgreSQL error', err);
  process.exit(1);
});

export const pgPool = pool;

export const fetchTableColumns = async (tables) => {
  const result = await pool.query(
    `
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = ANY($2::text[])
    ORDER BY table_name, ordinal_position
    `,
    [config.postgres.schema, tables]
  );

  return result.rows.reduce((acc, row) => {
    if (!acc[row.table_name]) {
      acc[row.table_name] = [];
    }
    acc[row.table_name].push({
      column: row.column_name,
      dataType: row.data_type,
      nullable: row.is_nullable === 'YES'
    });
    return acc;
  }, {});
};

export const fetchRelationships = async (tables) => {
  const result = await pool.query(
    `
    SELECT
      tc.table_name AS source_table,
      kcu.column_name AS source_column,
      ccu.table_name AS target_table,
      ccu.column_name AS target_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = $1
      AND (tc.table_name = ANY($2::text[]) OR ccu.table_name = ANY($2::text[]))
    `,
    [config.postgres.schema, tables]
  );

  return result.rows;
};

export const fetchNaturalJoinKeys = (columnsByTable) => {
  const columnMaps = Object.entries(columnsByTable).map(([table, columns]) => ({
    table,
    names: columns.map((col) => col.column)
  }));

  const intersection = columnMaps.reduce((acc, current) => {
    if (!acc) return new Set(current.names);
    const next = new Set();
    current.names.forEach((name) => {
      if (acc.has(name)) {
        next.add(name);
      }
    });
    return next;
  }, null);

  return intersection ? Array.from(intersection).sort() : [];
};

export const runInTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
