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
    SELECT table_name, column_name, data_type, is_nullable,
           column_default, character_maximum_length, udt_name
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
      nullable: row.is_nullable === 'YES',
      defaultValue: row.column_default,
      maxLength: row.character_maximum_length,
      udtName: row.udt_name
    });
    return acc;
  }, {});
};

export const fetchTables = async () => {
  const result = await pool.query(
    `
    SELECT t.table_name,
           COUNT(c.column_name)::int AS column_count
    FROM information_schema.tables t
    LEFT JOIN information_schema.columns c
      ON c.table_schema = t.table_schema AND c.table_name = t.table_name
    WHERE t.table_schema = $1
      AND t.table_type = 'BASE TABLE'
    GROUP BY t.table_name
    ORDER BY t.table_name
    `,
    [config.postgres.schema]
  );

  return result.rows;
};

export const fetchTableColumnsDetailed = async (tableName) => {
  const result = await pool.query(
    `
    SELECT
      c.column_name,
      c.data_type,
      c.is_nullable,
      c.column_default,
      c.character_maximum_length,
      c.udt_name,
      c.ordinal_position,
      (
        SELECT COUNT(*)::int
        FROM information_schema.key_column_usage kcu
        JOIN information_schema.table_constraints tc
          ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND kcu.table_schema = $1
          AND kcu.table_name = $2
          AND kcu.column_name = c.column_name
      ) > 0 AS is_primary_key
    FROM information_schema.columns c
    WHERE c.table_schema = $1 AND c.table_name = $2
    ORDER BY c.ordinal_position
    `,
    [config.postgres.schema, tableName]
  );

  return result.rows.map((row) => ({
    column: row.column_name,
    dataType: row.data_type,
    nullable: row.is_nullable === 'YES',
    defaultValue: row.column_default,
    maxLength: row.character_maximum_length,
    udtName: row.udt_name,
    position: row.ordinal_position,
    isPrimaryKey: row.is_primary_key
  }));
};

export const fetchRelationships = async (tables) => {
  const result = await pool.query(
    `
    SELECT
      tc.table_name AS source_table,
      kcu.column_name AS source_column,
      ccu.table_name AS target_table,
      ccu.column_name AS target_column,
      tc.constraint_name
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

export const fetchTableRelationships = async (tableName) => {
  const result = await pool.query(
    `
    SELECT
      tc.table_name AS source_table,
      kcu.column_name AS source_column,
      ccu.table_name AS target_table,
      ccu.column_name AS target_column,
      tc.constraint_name,
      CASE
        WHEN tc.table_name = $2 THEN 'outgoing'
        ELSE 'incoming'
      END AS direction
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = $1
      AND (tc.table_name = $2 OR ccu.table_name = $2)
    `,
    [config.postgres.schema, tableName]
  );

  return result.rows;
};

export const fetchTablePreview = async (tableName, limit = 50) => {
  // Validate table exists first
  const check = await pool.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = $1 AND table_name = $2 AND table_type = 'BASE TABLE'`,
    [config.postgres.schema, tableName]
  );
  if (!check.rows.length) return null;

  const result = await pool.query(
    `SELECT * FROM ${config.postgres.schema}.${tableName} LIMIT $1`,
    [limit]
  );

  // Get row count estimate
  const countResult = await pool.query(
    `SELECT reltuples::bigint AS estimate
     FROM pg_class
     WHERE relname = $1`,
    [tableName]
  );

  return {
    columns: result.fields.map((f) => f.name),
    rows: result.rows,
    rowCount: result.rows.length,
    totalEstimate: countResult.rows[0]?.estimate ?? -1
  };
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
