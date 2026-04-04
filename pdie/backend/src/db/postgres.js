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

export const ensureStudentLinksTable = async () => {
  await pool.query(
    `
      CREATE TABLE IF NOT EXISTS ${config.postgres.schema}.student_links (
        id SERIAL PRIMARY KEY,
        student_id INT REFERENCES ${config.postgres.schema}.students(student_id) ON DELETE CASCADE,
        email TEXT,
        token TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMP
      )
    `
  );
};

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

export const getTablesRelatedToBaseTable = async (baseTableName, maxDepth = 2) => {
  const baseTable = String(baseTableName || '').trim().toLowerCase();
  if (!baseTable) {
    return {
      baseTable: '',
      directRelationships: [],
      indirectRelationships: [],
      relatedTables: [],
      dependencyTables: [],
      childTables: []
    };
  }

  const safeDepth = Math.max(1, Math.min(Number(maxDepth) || 2, 3));

  const directResult = await pool.query(
    `
      SELECT
        tc.table_name AS source_table,
        kcu.column_name AS source_column,
        ccu.table_name AS target_table,
        ccu.column_name AS target_column
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.constraint_schema = kcu.constraint_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON tc.constraint_name = ccu.constraint_name
       AND tc.constraint_schema = ccu.constraint_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = $1
        AND ccu.table_schema = $1
        AND (
          ccu.table_name = $2
          OR tc.table_name = $2
        )
      ORDER BY source_table, source_column, target_table, target_column
    `,
    [config.postgres.schema, baseTable]
  );

  const directRelationships = directResult.rows.map((row) => ({
    source_table: row.source_table,
    source_column: row.source_column,
    target_table: row.target_table,
    target_column: row.target_column
  }));

  if (safeDepth === 1) {
    const relatedTables = [...new Set(
      [baseTable, ...directRelationships.flatMap((row) => [row.source_table, row.target_table])]
    )].sort();

    const dependencyTables = [...new Set(
      directRelationships
        .filter((row) => row.source_table === baseTable && row.target_table !== baseTable)
        .map((row) => row.target_table)
    )].sort();

    const childTables = [...new Set(
      directRelationships
        .filter((row) => row.target_table === baseTable && row.source_table !== baseTable)
        .map((row) => row.source_table)
    )].sort();

    return {
      baseTable,
      directRelationships,
      indirectRelationships: [],
      relatedTables,
      dependencyTables,
      childTables
    };
  }

  const connectedTables = [...new Set(
    directRelationships.flatMap((row) => [row.source_table, row.target_table])
  )].filter((table) => table !== baseTable);

  const indirectResult = connectedTables.length
    ? await pool.query(
      `
        SELECT
          tc.table_name AS source_table,
          kcu.column_name AS source_column,
          ccu.table_name AS target_table,
          ccu.column_name AS target_column
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.constraint_schema = kcu.constraint_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON tc.constraint_name = ccu.constraint_name
         AND tc.constraint_schema = ccu.constraint_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = $1
          AND ccu.table_schema = $1
          AND (
            tc.table_name = ANY($2::text[])
            OR ccu.table_name = ANY($2::text[])
          )
          AND tc.table_name <> $3
          AND ccu.table_name <> $3
        ORDER BY source_table, source_column, target_table, target_column
      `,
      [config.postgres.schema, connectedTables, baseTable]
    )
    : { rows: [] };

  const indirectRelationships = indirectResult.rows.map((row) => ({
    source_table: row.source_table,
    source_column: row.source_column,
    target_table: row.target_table,
    target_column: row.target_column
  }));

  const relatedTables = [...new Set(
    [
      baseTable,
      ...directRelationships.flatMap((row) => [row.source_table, row.target_table]),
      ...indirectRelationships.flatMap((row) => [row.source_table, row.target_table])
    ]
  )].sort();

  const dependencyTables = [...new Set(
    directRelationships
      .filter((row) => row.source_table === baseTable && row.target_table !== baseTable)
      .map((row) => row.target_table)
  )].sort();

  const childTables = [...new Set(
    directRelationships
      .filter((row) => row.target_table === baseTable && row.source_table !== baseTable)
      .map((row) => row.source_table)
  )].sort();

  return {
    baseTable,
    directRelationships,
    indirectRelationships,
    relatedTables,
    dependencyTables,
    childTables
  };
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

export const listPublicTableDetails = async () => {
  const result = await pool.query(
    `
      WITH table_stats AS (
        SELECT
          t.table_name,
          t.table_schema,
          t.table_type,
          obj_description(cls.oid, 'pg_class') AS table_comment,
          pg_total_relation_size(cls.oid)::bigint AS total_size_bytes,
          pg_relation_size(cls.oid)::bigint AS table_size_bytes,
          (
            pg_total_relation_size(cls.oid) - pg_relation_size(cls.oid)
          )::bigint AS indexes_size_bytes,
          COALESCE(stat.n_live_tup, 0)::bigint AS estimated_row_count
        FROM information_schema.tables t
        JOIN pg_class cls
          ON cls.relname = t.table_name
        JOIN pg_namespace ns
          ON ns.oid = cls.relnamespace
         AND ns.nspname = t.table_schema
        LEFT JOIN pg_stat_user_tables stat
          ON stat.relid = cls.oid
        WHERE t.table_schema = $1
          AND t.table_type = 'BASE TABLE'
      )
      SELECT
        ts.table_name,
        ts.table_schema,
        ts.table_type,
        ts.table_comment,
        ts.total_size_bytes,
        ts.table_size_bytes,
        ts.indexes_size_bytes,
        ts.estimated_row_count,
        c.ordinal_position,
        c.column_name,
        c.data_type,
        c.udt_name,
        c.is_nullable,
        c.column_default,
        c.is_identity,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        c.datetime_precision
      FROM table_stats ts
      LEFT JOIN information_schema.columns c
        ON c.table_schema = ts.table_schema
       AND c.table_name = ts.table_name
      ORDER BY ts.table_name, c.ordinal_position
    `,
    [config.postgres.schema]
  );

  return result.rows.reduce((accumulator, row) => {
    if (!accumulator[row.table_name]) {
      accumulator[row.table_name] = {
        table_name: row.table_name,
        table_schema: row.table_schema,
        table_type: row.table_type,
        table_comment: row.table_comment,
        estimated_row_count: Number(row.estimated_row_count ?? 0),
        total_size_bytes: Number(row.total_size_bytes ?? 0),
        table_size_bytes: Number(row.table_size_bytes ?? 0),
        indexes_size_bytes: Number(row.indexes_size_bytes ?? 0),
        column_count: 0,
        columns: []
      };
    }

    if (row.column_name) {
      accumulator[row.table_name].columns.push({
        ordinal_position: row.ordinal_position,
        column_name: row.column_name,
        data_type: row.data_type,
        udt_name: row.udt_name,
        is_nullable: row.is_nullable,
        column_default: row.column_default,
        is_identity: row.is_identity,
        character_maximum_length: row.character_maximum_length,
        numeric_precision: row.numeric_precision,
        numeric_scale: row.numeric_scale,
        datetime_precision: row.datetime_precision
      });
      accumulator[row.table_name].column_count += 1;
    }

    return accumulator;
  }, {});
};
