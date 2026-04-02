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

export const getTablesMeta = async (tableNames) => {
  if (!tableNames.length) {
    return {};
  }

  const result = await pool.query(
    `
      SELECT
        table_name,
        column_name,
        data_type,
        is_nullable,
        column_default,
        is_identity
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = ANY($2::text[])
      ORDER BY table_name, ordinal_position
    `,
    [config.postgres.schema, tableNames]
  );

  return result.rows.reduce((accumulator, row) => {
    if (!accumulator[row.table_name]) {
      accumulator[row.table_name] = [];
    }

    accumulator[row.table_name].push({
      column_name: row.column_name,
      data_type: row.data_type,
      is_nullable: row.is_nullable,
      column_default: row.column_default,
      is_identity: row.is_identity
    });

    return accumulator;
  }, {});
};

export const getForeignKeys = async (tableNames) => {
  if (!tableNames.length) {
    return [];
  }

  const result = await pool.query(
    `
      SELECT
        kcu.table_name AS from_table,
        kcu.column_name AS from_column,
        ccu.table_name AS to_table,
        ccu.column_name AS to_column
      FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu
        ON rc.constraint_name = kcu.constraint_name
       AND rc.constraint_schema = kcu.constraint_schema
      JOIN information_schema.constraint_column_usage ccu
        ON rc.unique_constraint_name = ccu.constraint_name
       AND rc.unique_constraint_schema = ccu.constraint_schema
      WHERE kcu.table_schema = $1
        AND ccu.table_schema = $1
        AND kcu.table_name = ANY($2::text[])
        AND ccu.table_name = ANY($2::text[])
      ORDER BY from_table, from_column, to_table, to_column
    `,
    [config.postgres.schema, tableNames]
  );

  return result.rows.map((row) => ({
    from_table: row.from_table,
    from_column: row.from_column,
    to_table: row.to_table,
    to_column: row.to_column
  }));
};

export const listPublicTables = async () => {
  const result = await pool.query(
    `
      SELECT
        t.table_name,
        (
          SELECT COUNT(*)
          FROM information_schema.columns c
          WHERE c.table_schema = t.table_schema
            AND c.table_name = t.table_name
        )::int AS column_count
      FROM information_schema.tables t
      WHERE t.table_schema = $1
        AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name
    `,
    [config.postgres.schema]
  );

  return result.rows.map((row) => ({
    table_name: row.table_name,
    column_count: row.column_count
  }));
};
