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
  'timestamp with time zone': (value) => !Number.isNaN(Date.parse(value)),
  'timestamp without time zone': (value) => !Number.isNaN(Date.parse(value)),
  'character varying': () => true,
  text: () => true,
  uuid: (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(`${value}`),
  jsonb: (value) => { try { JSON.parse(typeof value === 'string' ? value : JSON.stringify(value)); return true; } catch { return false; } },
  json: (value) => { try { JSON.parse(typeof value === 'string' ? value : JSON.stringify(value)); return true; } catch { return false; } }
};

const normalizeValue = (value) => (value === undefined ? null : value);

const isEmpty = (value) => value === null || value === '' || (typeof value === 'number' && Number.isNaN(value));

const runForeignKeyCheck = async ({ relationship, values }) => {
  if (!values.size) return new Set();
  const query = `SELECT ${relationship.target_column} as value
    FROM ${config.postgres.schema}.${relationship.target_table}
    WHERE ${relationship.target_column} = ANY($1)`;
  const result = await pgPool.query(query, [[...values]]);
  return new Set(result.rows.map((row) => `${row.value}`));
};

/**
 * Find the column metadata for a given header.
 *
 * Handles both formats:
 *   - Prefixed: `table__column` → look up in columnsByTable[table]
 *   - Unprefixed join key: `student_id` → look up across all tables
 */
const resolveColumnMeta = ({ header, columnsByTable, joinKeys }) => {
  // Check if it's a table__column header
  if (header.includes('__')) {
    const [table, column] = header.split('__');
    if (!columnsByTable[table]) return null;
    const meta = columnsByTable[table].find((col) => col.column === column);
    return meta ? { table, column, meta } : null;
  }

  // Must be an unprefixed join key
  if (joinKeys.includes(header)) {
    // Find it in any table's columns
    for (const [table, columns] of Object.entries(columnsByTable)) {
      const meta = columns.find((col) => col.column === header);
      if (meta) return { table, column: header, meta, isJoinKey: true };
    }
  }

  return null;
};

export const validateRows = async ({ template, rows, uploadId, chunkId }) => {
  if (!template?.metadata?.columnsByTable) {
    throw new HttpError(500, 'Template metadata missing column definition');
  }
  const columnsByTable = template.metadata.columnsByTable;
  const joinKeys = template.joinKeys || [];
  const relationships = template.joinGraph || [];
  const invalid = [];
  const sanitizedRows = [];
  const fkLookups = new Map();

  rows.forEach((row, idx) => {
    const errors = [];
    const payload = {};

    Object.entries(row).forEach(([header, value]) => {
      if (header === 'rowNumber') return;

      const resolved = resolveColumnMeta({ header, columnsByTable, joinKeys });
      if (!resolved) {
        errors.push(`Unknown header: ${header}`);
        return;
      }

      const normalized = normalizeValue(value);
      payload[header] = normalized;

      // Required check — for join keys, check against the first table's metadata
      if (!resolved.meta.nullable && isEmpty(normalized)) {
        errors.push(`Column ${header} is required`);
      }

      // Type validation
      if (!isEmpty(normalized)) {
        const validator = sqlTypeValidators[resolved.meta.dataType];
        if (validator && !validator(normalized)) {
          errors.push(`Column ${header} expected type ${resolved.meta.dataType}, got "${normalized}"`);
        }
      }
    });

    // Collect FK values for batch lookup
    relationships.forEach((relationship) => {
      // Check prefixed header first, then unprefixed join key
      const prefixedHeader = `${relationship.source_table}__${relationship.source_column}`;
      const value = payload[prefixedHeader] ?? payload[relationship.source_column];
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

  // ── Batch FK checks ──────────────────────────────────────────────────
  const fkErrors = [];
  await Promise.all(
    [...fkLookups.entries()].map(async ([key, values]) => {
      const relationship = relationships.find(
        (rel) => `${rel.source_table}.${rel.source_column}->${rel.target_table}.${rel.target_column}` === key
      );
      if (!relationship) return;
      const existing = await runForeignKeyCheck({ relationship, values });
      rows.forEach((row, idx) => {
        const prefixedHeader = `${relationship.source_table}__${relationship.source_column}`;
        const val = row[prefixedHeader] ?? row[relationship.source_column];
        if (!isEmpty(val) && !existing.has(`${val}`)) {
          fkErrors.push({
            uploadId,
            templateId: template.templateId,
            rowNumber: row.rowNumber ?? idx + 2,
            chunkId,
            errors: [
              `FK violation: ${relationship.target_table}.${relationship.target_column} has no value "${val}" (referenced by ${prefixedHeader})`
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
