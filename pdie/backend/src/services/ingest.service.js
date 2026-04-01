import format from 'pg-format';
import { pgPool } from '../db/postgres.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * Extract per-table column values from a single validated row.
 *
 * Uses the template `headerMap` to know which header maps to which
 * table + column. Join key columns are replicated into every target table.
 */
const splitRowByTable = ({ row, tables, headerMap, joinKeys }) => {
  const tableRows = {};
  tables.forEach((table) => {
    tableRows[table] = {};
  });

  Object.entries(row).forEach(([header, value]) => {
    if (header === 'rowNumber') return;

    const mapping = headerMap[header];
    if (!mapping) return;

    if (mapping.isJoinKey) {
      // Join key → write into every table that has this column
      mapping.tables.forEach((table) => {
        if (tableRows[table]) {
          tableRows[table][mapping.column] = value;
        }
      });
    } else {
      // Regular column → write into its single table
      mapping.tables.forEach((table) => {
        if (tableRows[table]) {
          tableRows[table][mapping.column] = value;
        }
      });
    }
  });

  // Also propagate join keys explicitly (in case the row has the plain key)
  joinKeys.forEach((key) => {
    const value = row[key];
    if (value !== undefined && value !== null) {
      tables.forEach((table) => {
        if (tableRows[table] && tableRows[table][key] === undefined) {
          tableRows[table][key] = value;
        }
      });
    }
  });

  return tableRows;
};

/**
 * Determine insert order based on FK relationships.
 * Tables that are referenced (targets) should be inserted before
 * tables that reference them (sources).
 */
const computeInsertOrder = ({ tables, relationships }) => {
  // Build a dependency graph: source depends on target
  const deps = new Map();
  tables.forEach((t) => deps.set(t, new Set()));

  relationships.forEach((rel) => {
    if (deps.has(rel.source_table) && deps.has(rel.target_table)) {
      deps.get(rel.source_table).add(rel.target_table);
    }
  });

  // Topological sort (Kahn's algorithm)
  const inDegree = new Map();
  tables.forEach((t) => inDegree.set(t, 0));
  deps.forEach((targets) => {
    targets.forEach((target) => {
      // source depends on target, so target has lower priority (comes first)
    });
  });

  // Count how many tables depend on each table
  deps.forEach((targets, source) => {
    targets.forEach((target) => {
      // source depends on target — target should come first, so source has higher in-degree
      inDegree.set(source, (inDegree.get(source) || 0) + 1);
    });
  });

  // Reset and rebuild properly
  tables.forEach((t) => inDegree.set(t, 0));
  deps.forEach((targets, source) => {
    targets.forEach(() => {
      inDegree.set(source, inDegree.get(source) + 1);
    });
  });

  const queue = tables.filter((t) => inDegree.get(t) === 0);
  const sorted = [];

  while (queue.length) {
    const node = queue.shift();
    sorted.push(node);
    // For every table that depends on `node`, decrement its in-degree
    deps.forEach((targets, source) => {
      if (targets.has(node)) {
        const newDeg = inDegree.get(source) - 1;
        inDegree.set(source, newDeg);
        if (newDeg === 0) {
          queue.push(source);
        }
      }
    });
  }

  // If some tables weren't sorted (cycle), append them at the end
  tables.forEach((t) => {
    if (!sorted.includes(t)) sorted.push(t);
  });

  return sorted;
};

/**
 * Build a batch INSERT query for a single table.
 */
const buildInsertQuery = ({ table, columnNames, rows }) => {
  if (!rows.length || !columnNames.length) return null;

  const mappedRows = rows.map((row) =>
    columnNames.map((col) => row[col] ?? null)
  );

  // Filter out rows that are entirely null (no data for this table)
  const nonEmptyRows = mappedRows.filter((row) => row.some((v) => v !== null));
  if (!nonEmptyRows.length) return null;

  const identifiers = columnNames.map((col) => format.ident(col)).join(', ');
  return format(
    `INSERT INTO %I.%I (%s) VALUES %L ON CONFLICT DO NOTHING`,
    config.postgres.schema,
    table,
    identifiers,
    nonEmptyRows
  );
};

/**
 * Insert validated rows into ALL tables defined in the template.
 * Inserts are done in FK dependency order within a transaction.
 */
export const insertRowsMultiTable = async ({ template, rows }) => {
  if (!rows.length) return { results: {}, totalInserted: 0 };

  const tables = template.tables;
  const joinKeys = template.joinKeys || [];
  const headerMap = template.metadata?.headerMap || {};
  const columnsByTable = template.metadata?.columnsByTable || {};
  const relationships = template.joinGraph || [];

  const insertOrder = computeInsertOrder({ tables, relationships });

  // Split each row into per-table payloads
  const tablePayloads = {};
  insertOrder.forEach((table) => {
    tablePayloads[table] = [];
  });

  rows.forEach((row) => {
    const perTable = splitRowByTable({ row, tables, headerMap, joinKeys });
    insertOrder.forEach((table) => {
      if (perTable[table]) {
        tablePayloads[table].push(perTable[table]);
      }
    });
  });

  const client = await pgPool.connect();
  const results = {};
  let totalInserted = 0;

  try {
    await client.query('BEGIN');

    for (const table of insertOrder) {
      const tableRows = tablePayloads[table];
      if (!tableRows.length) {
        results[table] = { inserted: 0, skipped: true };
        continue;
      }

      const columns = columnsByTable[table] || [];
      const columnNames = columns.map((col) => col.column);

      // Only include columns that have at least one non-null value across all rows
      const activeColumns = columnNames.filter((col) =>
        tableRows.some((row) => row[col] !== undefined && row[col] !== null)
      );

      if (!activeColumns.length) {
        results[table] = { inserted: 0, skipped: true };
        continue;
      }

      const query = buildInsertQuery({ table, columnNames: activeColumns, rows: tableRows });
      if (!query) {
        results[table] = { inserted: 0, skipped: true };
        continue;
      }

      const result = await client.query(query).catch((err) => {
        logger.error({ table, err: err.message }, 'Insert failed for table');
        err.meta = { table };
        throw err;
      });

      const inserted = result.rowCount ?? 0;
      results[table] = { inserted };
      totalInserted += inserted;
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { results, totalInserted };
};

/**
 * Legacy single-table insert (kept for backward compatibility).
 */
export const materializeTableRows = ({ table, columns, rows }) => {
  const columnNames = columns.map((col) => col.column);
  const mapped = rows.map((row) => {
    const values = columnNames.map((column) => row[`${table}__${column}`] ?? row[column] ?? null);
    return values;
  });
  return { columnNames, mappedRows: mapped };
};

export const insertRowsForTable = async ({ table, columns, rows }) => {
  if (!rows.length || !columns.length) return { inserted: 0 };
  const { columnNames, mappedRows } = materializeTableRows({ table, columns, rows });
  const columnIdentifierList = columnNames.map((column) => format.ident(column)).join(', ');
  const query = format(
    `INSERT INTO %I.%I (%s) VALUES %L ON CONFLICT DO NOTHING`,
    config.postgres.schema,
    table,
    columnIdentifierList,
    mappedRows
  );
  const result = await pgPool.query(query).catch((err) => {
    err.meta = { table };
    throw err;
  });
  return { inserted: result.rowCount ?? rows.length };
};
