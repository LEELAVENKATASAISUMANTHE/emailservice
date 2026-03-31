import { pgPool } from '../db/postgres.js';
import { config } from '../config/index.js';
import { HttpError } from '../middlewares/errorHandler.js';

const sqlTypeValidators = {
  integer: (value) => Number.isInteger(Number(value)),
  'double precision': (value) => !Number.isNaN(Number(value)),
  numeric: (value) => !Number.isNaN(Number(value)),
  bigint: (value) => Number.isSafeInteger(Number(value)),
  smallint: (value) => Number.isInteger(Number(value)),
  boolean: (value) => typeof value === 'boolean' || value === 'true' || value === 'false',
  date: (value) => !Number.isNaN(Date.parse(value)),
  timestamp: (value) => !Number.isNaN(Date.parse(value)),
  timestamptz: (value) => !Number.isNaN(Date.parse(value))
};

const normalizeValue = (value) => (value === undefined ? null : value);

const isEmpty = (value) => value === null || value === '' || Number.isNaN(value);

const runForeignKeyCheck = async ({ relationship, values }) => {
  if (!values.size) return new Set();
  const query = `SELECT ${relationship.target_column} as value
    FROM ${config.postgres.schema}.${relationship.target_table}
    WHERE ${relationship.target_column} = ANY($1)`;
  const result = await pgPool.query(query, [[...values]]);
  return new Set(result.rows.map((row) => `${row.value}`));
};

export const validateRows = async ({ template, rows, uploadId, chunkId }) => {
  if (!template?.metadata?.columnsByTable) {
    throw new HttpError(500, 'Template metadata missing column definition');
  }
  const columnsByTable = template.metadata.columnsByTable;
  const relationships = template.joinGraph || [];
  const invalid = [];
  const sanitizedRows = [];
  const fkLookups = new Map();

  rows.forEach((row, idx) => {
    const errors = [];
    const payload = {};

    Object.entries(row).forEach(([header, value]) => {
      if (header === 'rowNumber') return;
      const [table, column] = header.split('__');
      if (!columnsByTable[table]) {
        errors.push(`Unknown table for header ${header}`);
        return;
      }
      const columnMeta = columnsByTable[table].find((col) => col.column === column);
      if (!columnMeta) {
        errors.push(`Unknown column ${column} on table ${table}`);
        return;
      }

      const normalized = normalizeValue(value);
      payload[header] = normalized;

      if (!columnMeta.nullable && isEmpty(normalized)) {
        errors.push(`Column ${header} is required`);
      }

      if (!isEmpty(normalized)) {
        const validator = sqlTypeValidators[columnMeta.dataType];
        if (validator && !validator(normalized)) {
          errors.push(`Column ${header} expected type ${columnMeta.dataType}`);
        }
      }
    });

    relationships.forEach((relationship) => {
      const header = `${relationship.source_table}__${relationship.source_column}`;
      const value = payload[header];
      if (!isEmpty(value)) {
        const key = `${relationship.source_table}.${relationship.source_column}->${relationship.target_table}.${relationship.target_column}`;
        if (!fkLookups.has(key)) {
          fkLookups.set(key, new Set());
        }
        fkLookups.get(key).add(`${value}`);
      }
    });

    payload.rowNumber = row.rowNumber ?? idx + 2;

    if (errors.length) {
      invalid.push({
        uploadId,
        templateId: template.templateId,
        rowNumber: row.rowNumber ?? idx + 2,
        chunkId,
        errors,
        payload
      });
    } else {
      sanitizedRows.push(payload);
    }
  });

  const fkErrors = [];
  await Promise.all(
    [...fkLookups.entries()].map(async ([key, values]) => {
      const [source] = key.split('->');
      const relationship = relationships.find(
        (rel) => `${rel.source_table}.${rel.source_column}->${rel.target_table}.${rel.target_column}` === key
      );
      if (!relationship) return;
      const existing = await runForeignKeyCheck({ relationship, values });
      rows.forEach((row, idx) => {
        const header = `${relationship.source_table}__${relationship.source_column}`;
        const val = row[header];
        if (!isEmpty(val) && !existing.has(`${val}`)) {
          fkErrors.push({
            uploadId,
            templateId: template.templateId,
            rowNumber: row.rowNumber ?? idx + 2,
            chunkId,
            errors: [
              `Missing ${relationship.target_table}.${relationship.target_column} for value ${val} referenced by ${header}`
            ],
            payload: row
          });
        }
      });
    })
  );

  if (fkErrors.length) {
    invalid.push(...fkErrors);
  }


  return { validRows: sanitizedRows, invalidRows: invalid };
};
