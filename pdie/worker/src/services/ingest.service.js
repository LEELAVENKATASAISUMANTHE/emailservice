import { pgPool } from '../db/postgres.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { JobModel } from '../models/Job.js';
import { appendLogRows } from './job.service.js';

const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

const shouldOmitValue = (value) => value === undefined || value === null || String(value).trim() === '';

const topologicalSortTables = (tables, foreignKeys) => {
  const children = new Map();
  const inDegree = new Map();

  tables.forEach((table) => {
    children.set(table, new Set());
    inDegree.set(table, 0);
  });

  foreignKeys.forEach((foreignKey) => {
    if (!children.has(foreignKey.to_table) || !children.has(foreignKey.from_table)) {
      return;
    }

    if (!children.get(foreignKey.to_table).has(foreignKey.from_table)) {
      children.get(foreignKey.to_table).add(foreignKey.from_table);
      inDegree.set(foreignKey.from_table, inDegree.get(foreignKey.from_table) + 1);
    }
  });

  const queue = tables.filter((table) => inDegree.get(table) === 0).sort();
  const order = [];

  while (queue.length) {
    const table = queue.shift();
    order.push(table);

    [...children.get(table)].sort().forEach((child) => {
      inDegree.set(child, inDegree.get(child) - 1);
      if (inDegree.get(child) === 0) {
        queue.push(child);
        queue.sort();
      }
    });
  }

  tables.forEach((table) => {
    if (!order.includes(table)) {
      order.push(table);
    }
  });

  return order;
};

const resolveConflictColumn = (templateDoc, table) => {
  const excluded = templateDoc.excludedColumns?.[table] || [];
  const columns = templateDoc.schemaMeta?.[table] || [];

  return columns.find((column) =>
    !excluded.includes(column.column_name) &&
    (column.column_name === 'id' || column.column_name.endsWith('_id'))
  )?.column_name || null;
};

const splitRowByTable = (validRow, templateDoc) => {
  const perTable = Object.fromEntries(templateDoc.tables.map((table) => [table, {}]));

  templateDoc.headerMap.forEach((entry) => {
    const value = validRow.data[entry.header];
    if (shouldOmitValue(value)) {
      return;
    }

    if (templateDoc.joinKeys?.includes(entry.column) && entry.header === entry.column) {
      templateDoc.tables.forEach((table) => {
        const excluded = templateDoc.excludedColumns?.[table] || [];
        const hasColumn = (templateDoc.schemaMeta?.[table] || []).some((column) => column.column_name === entry.column);
        if (hasColumn && !excluded.includes(entry.column)) {
          perTable[table][entry.column] = value;
        }
      });
      return;
    }

    if (!(templateDoc.excludedColumns?.[entry.table] || []).includes(entry.column)) {
      perTable[entry.table][entry.column] = value;
    }
  });

  return perTable;
};

const buildInsertStatement = (table, payload, conflictColumn) => {
  const columns = Object.keys(payload).filter((column) => !shouldOmitValue(payload[column]));
  if (!columns.length) {
    return null;
  }

  const values = columns.map((column) => payload[column]);
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  const columnSql = columns.map(quoteIdentifier).join(', ');
  const tableSql = `${quoteIdentifier(config.postgres.schema)}.${quoteIdentifier(table)}`;

  if (!conflictColumn || !columns.includes(conflictColumn)) {
    return {
      text: `INSERT INTO ${tableSql} (${columnSql}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
      values
    };
  }

  const updateColumns = columns.filter((column) => column !== conflictColumn);
  const updateSql = updateColumns.length
    ? updateColumns.map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`).join(', ')
    : `${quoteIdentifier(conflictColumn)} = EXCLUDED.${quoteIdentifier(conflictColumn)}`;

  return {
    text: `INSERT INTO ${tableSql} (${columnSql}) VALUES (${placeholders}) ON CONFLICT (${quoteIdentifier(conflictColumn)}) DO UPDATE SET ${updateSql}`,
    values
  };
};

export const ingestRows = async (validRows, templateDoc, jobId) => {
  if (!validRows.length) {
    return { committed: 0, rejected: 0, rowResults: [] };
  }

  const order = topologicalSortTables(templateDoc.tables, templateDoc.foreignKeys || []);
  const client = await pgPool.connect();
  const currentJob = await JobModel.findOne({ jobId }).lean();
  const baseRejected = currentJob?.rejectedRows || 0;

  let committed = 0;
  let rejected = 0;
  const rowResults = [];
  let flushBuffer = [];

  const flushProgress = async () => {
    if (flushBuffer.length) {
      await appendLogRows(jobId, flushBuffer);
      flushBuffer = [];
    }

    await JobModel.updateOne(
      { jobId },
      {
        $set: {
          processedRows: baseRejected + committed + rejected,
          committedRows: committed,
          rejectedRows: baseRejected + rejected,
          updatedAt: new Date()
        }
      }
    );
  };

  try {
    await client.query('BEGIN');

    for (let index = 0; index < validRows.length; index += 1) {
      const row = validRows[index];
      const savepoint = `row_${index + 1}`;
      await client.query(`SAVEPOINT ${savepoint}`);

      try {
        const payloads = splitRowByTable(row, templateDoc);

        for (const table of order) {
          const statement = buildInsertStatement(
            table,
            payloads[table],
            resolveConflictColumn(templateDoc, table)
          );

          if (!statement) {
            continue;
          }

          await client.query(statement.text, statement.values);
        }

        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        committed += 1;

        const result = {
          rowIndex: row.rowIndex,
          status: 'ok',
          errors: []
        };

        rowResults.push(result);
        flushBuffer.push(result);
      } catch (error) {
        logger.error({ err: error, rowIndex: row.rowIndex, jobId }, 'Failed to ingest row');
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        rejected += 1;

        const result = {
          rowIndex: row.rowIndex,
          status: 'error',
          errors: [
            {
              field: '',
              value: '',
              message: error.message
            }
          ]
        };

        rowResults.push(result);
        flushBuffer.push(result);
      }

      if ((index + 1) % 100 === 0) {
        await flushProgress();
      }
    }

    await client.query('COMMIT');
    await flushProgress();
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return { committed, rejected, rowResults };
};
