import format from 'pg-format';
import { pgPool } from '../db/postgres.js';
import { config } from '../config/index.js';

export const materializeTableRows = ({ table, columns, rows }) => {
  const columnNames = columns.map((col) => col.column);
  const mapped = rows.map((row) => {
    const values = columnNames.map((column) => row[`${table}__${column}`] ?? null);
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
