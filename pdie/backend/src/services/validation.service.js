import { pgPool } from '../db/postgres.js';
import { config } from '../config/index.js';
import { HttpError } from '../middlewares/errorHandler.js';

const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

const emptyValue = (value) => value === undefined || value === null || String(value).trim() === '';

const stringifyValue = (value) => (value == null ? '' : String(value));

const getColumnMeta = (templateDoc, table, column) =>
  (templateDoc.schemaMeta?.[table] || []).find((entry) => entry.column_name === column);

const coerceValue = (rawValue, dataType) => {
  if (emptyValue(rawValue)) {
    return { ok: true, value: null };
  }

  const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  const normalizedType = String(dataType || '').toLowerCase();

  if (['integer', 'bigint', 'smallint'].includes(normalizedType)) {
    if (!Number.isInteger(Number(value))) {
      return { ok: false, message: `Expected ${dataType}` };
    }
    return { ok: true, value: Number(value) };
  }

  if (['numeric', 'real', 'double precision'].includes(normalizedType)) {
    if (Number.isNaN(Number(value))) {
      return { ok: false, message: `Expected ${dataType}` };
    }
    return { ok: true, value: Number(value) };
  }

  if (normalizedType === 'boolean') {
    const booleanValue = String(value).toLowerCase();
    if (!['true', 'false', '1', '0', 'yes', 'no'].includes(booleanValue)) {
      return { ok: false, message: 'Expected boolean' };
    }
    return { ok: true, value: ['true', '1', 'yes'].includes(booleanValue) };
  }

  if (['date', 'timestamp', 'timestamp with time zone', 'timestamp without time zone', 'timestamptz'].includes(normalizedType)) {
    if (Number.isNaN(Date.parse(String(value)))) {
      return { ok: false, message: `Expected ${dataType}` };
    }
    return { ok: true, value: new Date(value).toISOString() };
  }

  if (['text', 'character varying', 'varchar', 'char', 'character'].includes(normalizedType)) {
    return { ok: true, value: String(value) };
  }

  if (normalizedType === 'uuid') {
    if (!/^[0-9a-f-]{36}$/i.test(String(value))) {
      return { ok: false, message: 'Expected uuid' };
    }
    return { ok: true, value: String(value) };
  }

  return { ok: true, value };
};

const resolveHeader = (templateDoc, table, column) => {
  const exact = templateDoc.headerMap.find((entry) => entry.table === table && entry.column === column);
  if (exact) {
    return exact.header;
  }

  if (templateDoc.joinKeys?.includes(column)) {
    const shared = templateDoc.headerMap.find((entry) => entry.header === column && entry.column === column);
    if (shared) {
      return shared.header;
    }
  }

  return null;
};

const getPrimaryCandidateColumn = (columns, excludedColumns) =>
  columns.find((column) =>
    !excludedColumns.includes(column.column_name) &&
    (column.column_name === 'id' || column.column_name.endsWith('_id'))
  )?.column_name || null;

export const validateRows = async (rows, templateDoc) => {
  if (!templateDoc?.schemaMeta || !templateDoc?.headerMap) {
    throw new HttpError(500, 'Template metadata is incomplete');
  }

  const allowedHeaders = new Set(templateDoc.headerMap.map((entry) => entry.header));
  const rowStates = rows.map((row) => ({
    rowIndex: row.__rowIndex || 0,
    input: row,
    data: {},
    errors: []
  }));

  rowStates.forEach((state) => {
    Object.keys(state.input).forEach((header) => {
      if (!allowedHeaders.has(header)) {
        state.errors.push({
          field: header,
          value: stringifyValue(state.input[header]),
          message: 'Unexpected column in uploaded workbook'
        });
      }
    });

    templateDoc.headerMap.forEach((entry) => {
      const value = state.input[entry.header];
      const meta = getColumnMeta(templateDoc, entry.table, entry.column);
      if (!meta) {
        return;
      }

      if ((templateDoc.excludedColumns?.[entry.table] || []).includes(entry.column)) {
        return;
      }

      if (
        meta.is_nullable === 'NO' &&
        !meta.column_default &&
        emptyValue(value)
      ) {
        state.errors.push({
          field: entry.header,
          value: stringifyValue(value),
          message: 'Field is required'
        });
      }

      const coerced = coerceValue(value, meta.data_type);
      if (!coerced.ok) {
        state.errors.push({
          field: entry.header,
          value: stringifyValue(value),
          message: coerced.message
        });
        return;
      }

      state.data[entry.header] = coerced.value;
    });
  });

  const fkRequests = new Map();

  templateDoc.foreignKeys.forEach((foreignKey) => {
    const header = resolveHeader(templateDoc, foreignKey.from_table, foreignKey.from_column);
    if (!header) {
      return;
    }

    const key = `${foreignKey.from_table}.${foreignKey.from_column}->${foreignKey.to_table}.${foreignKey.to_column}`;
    if (!fkRequests.has(key)) {
      fkRequests.set(key, { foreignKey, values: new Set(), header });
    }

    rowStates.forEach((state) => {
      const value = state.data[header];
      if (!emptyValue(value)) {
        fkRequests.get(key).values.add(value);
      }
    });
  });

  const fkResults = new Map();
  await Promise.all(
    [...fkRequests.entries()].map(async ([key, request]) => {
      if (!request.values.size) {
        fkResults.set(key, new Set());
        return;
      }

      const query = `
        SELECT ${quoteIdentifier(request.foreignKey.to_column)} AS value
        FROM ${quoteIdentifier(config.postgres.schema)}.${quoteIdentifier(request.foreignKey.to_table)}
        WHERE ${quoteIdentifier(request.foreignKey.to_column)} = ANY($1)
      `;

      const result = await pgPool.query(query, [[...request.values]]);
      fkResults.set(key, new Set(result.rows.map((row) => String(row.value))));
    })
  );

  fkRequests.forEach((request, key) => {
    const existingValues = fkResults.get(key) || new Set();

    rowStates.forEach((state) => {
      const value = state.data[request.header];
      if (emptyValue(value)) {
        return;
      }

      if (!existingValues.has(String(value))) {
        state.errors.push({
          field: request.header,
          value: stringifyValue(value),
          message: `Foreign key value does not exist in ${request.foreignKey.to_table}.${request.foreignKey.to_column}`
        });
      }
    });
  });

  const runtimeState = templateDoc.__validationState || (templateDoc.__validationState = { duplicateTracker: {} });

  Object.entries(templateDoc.schemaMeta).forEach(([table, columns]) => {
    const excluded = templateDoc.excludedColumns?.[table] || [];
    const pkColumn = getPrimaryCandidateColumn(columns, excluded);
    if (!pkColumn) {
      return;
    }

    const header = resolveHeader(templateDoc, table, pkColumn);
    if (!header) {
      return;
    }

    if (!runtimeState.duplicateTracker[table]) {
      runtimeState.duplicateTracker[table] = new Map();
    }

    const tracker = runtimeState.duplicateTracker[table];

    rowStates.forEach((state) => {
      const value = state.data[header];
      if (emptyValue(value)) {
        return;
      }

      const duplicateKey = String(value);
      if (tracker.has(duplicateKey)) {
        state.errors.push({
          field: header,
          value: stringifyValue(value),
          message: `Duplicate ${pkColumn} within uploaded file`
        });
        return;
      }

      tracker.set(duplicateKey, state.rowIndex);
    });
  });

  const validRows = [];
  const errorRows = [];

  rowStates.forEach((state) => {
    if (state.errors.length) {
      errorRows.push({
        rowIndex: state.rowIndex,
        errors: state.errors
      });
      return;
    }

    validRows.push({
      rowIndex: state.rowIndex,
      data: state.data
    });
  });

  return { validRows, errorRows };
};
