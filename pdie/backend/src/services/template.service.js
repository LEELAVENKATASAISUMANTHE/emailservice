import ExcelJS from 'exceljs';
import stringify from 'fast-json-stable-stringify';
import { TemplateModel } from '../models/mongo/Template.js';
import { fetchRelationships, fetchTableColumns, fetchNaturalJoinKeys } from '../db/postgres.js';
import { sha256 } from '../utils/hash.js';
import { config } from '../config/index.js';
import { uploadBuffer } from '../storage/minio.js';
import { HttpError } from '../middlewares/errorHandler.js';

/**
 * Build deduplicated headers.
 *
 * Join keys (columns shared across requested tables, e.g. `student_id`)
 * are emitted **once** at the very start without any table prefix.
 *
 * Remaining columns are emitted as `table__column`, skipping any column
 * that has already been emitted as a join key.
 *
 * Returns { headers, headerMap } where headerMap records the canonical
 * mapping from each header string back to { table, column } (or for join
 * keys, to all tables that share that column).
 */
const buildHeaders = ({ columnsByTable, joinKeys, relationships }) => {
  const headers = [];
  const headerMap = {};
  const seen = new Set();

  // ── 1. Emit join keys once (unprefixed) ──────────────────────────────
  joinKeys.forEach((key) => {
    if (seen.has(key)) return;
    headers.push(key);
    seen.add(key);

    // Record which tables share this join key
    const tables = Object.keys(columnsByTable).filter((table) =>
      columnsByTable[table].some((col) => col.column === key)
    );
    headerMap[key] = { column: key, tables, isJoinKey: true };
  });

  // ── 2. Emit FK relationship columns (prefixed) if not a join key ─────
  relationships.forEach((rel) => {
    [
      { table: rel.source_table, column: rel.source_column },
      { table: rel.target_table, column: rel.target_column }
    ].forEach(({ table, column }) => {
      if (joinKeys.includes(column)) return; // already emitted unprefixed
      const header = `${table}__${column}`;
      if (!seen.has(header)) {
        headers.push(header);
        seen.add(header);
        headerMap[header] = { column, tables: [table], isJoinKey: false };
      }
    });
  });

  // ── 3. Emit remaining columns from the requested tables ──────────────
  Object.entries(columnsByTable).forEach(([table, columns]) => {
    columns.forEach((col) => {
      if (joinKeys.includes(col.column)) return; // already emitted unprefixed
      const header = `${table}__${col.column}`;
      if (!seen.has(header)) {
        headers.push(header);
        seen.add(header);
        headerMap[header] = { column: col.column, tables: [table], isJoinKey: false };
      }
    });
  });

  return { headers, headerMap };
};

const buildTemplateId = (tables, joinKeys) =>
  sha256(stringify({ tables: [...tables].sort(), joinKeys: [...joinKeys].sort() }));

export const ensureTemplate = async ({ tables }) => {
  if (!Array.isArray(tables) || !tables.length) {
    throw new HttpError(400, 'tables must be a non-empty array');
  }

  const normalizedTables = [...new Set(tables.map((name) => name.toLowerCase()))];
  const columnsByTable = await fetchTableColumns(normalizedTables);
  const missing = normalizedTables.filter((table) => !columnsByTable[table]);
  if (missing.length) {
    throw new HttpError(400, `Unknown tables: ${missing.join(', ')}`);
  }

  const relationships = await fetchRelationships(normalizedTables);
  const naturalJoinKeys = fetchNaturalJoinKeys(columnsByTable);
  const joinKeys = naturalJoinKeys.length
    ? naturalJoinKeys
    : relationships.map((rel) => rel.source_column).filter((v, i, a) => a.indexOf(v) === i);
  const templateId = buildTemplateId(normalizedTables, joinKeys);

  const existing = await TemplateModel.findOne({ templateId });
  if (existing) {
    return existing;
  }

  const { headers, headerMap } = buildHeaders({ columnsByTable, joinKeys, relationships });

  // ── Build Excel workbook ──────────────────────────────────────────────
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('data');
  sheet.columns = headers.map((header) => ({ header, key: header }));

  // Style the header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE2EFDA' }
  };

  // Auto-width columns
  sheet.columns.forEach((col) => {
    col.width = Math.max((col.header || '').length + 4, 14);
  });

  // Hidden _meta sheet with template metadata
  const metadataSheet = workbook.addWorksheet('_meta');
  metadataSheet.state = 'veryHidden';
  metadataSheet.addTable({
    name: 'metadata',
    ref: 'A1',
    headerRow: true,
    columns: [{ name: 'key' }, { name: 'value' }],
    rows: [
      ['templateId', templateId],
      ['tables', normalizedTables.join(',')],
      ['joinKeys', joinKeys.join(',')]
    ]
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const checksum = sha256(buffer);
  const objectName = `templates/${templateId}.xlsx`;

  await uploadBuffer({
    bucket: config.minio.buckets.templates,
    objectName,
    buffer,
    metadata: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
  });

  const template = await TemplateModel.create({
    templateId,
    tables: normalizedTables,
    joinKeys,
    joinGraph: relationships,
    headers,
    minioKey: objectName,
    checksum,
    metadata: { columnsByTable, headerMap }
  });

  return template;
};

export const listTemplates = async ({ page = 1, limit = 20 }) => {
  const skip = (page - 1) * limit;
  const [docs, total] = await Promise.all([
    TemplateModel.find({}, { metadata: 0 })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    TemplateModel.countDocuments()
  ]);
  return { templates: docs, total, page, limit, pages: Math.ceil(total / limit) };
};

export const getTemplateById = async (templateId) => {
  const template = await TemplateModel.findOne({ templateId }).lean();
  if (!template) {
    throw new HttpError(404, 'Template not found');
  }
  return template;
};

export const deleteTemplate = async (templateId) => {
  const template = await TemplateModel.findOneAndDelete({ templateId });
  if (!template) {
    throw new HttpError(404, 'Template not found');
  }
  // Best-effort MinIO cleanup
  try {
    const { minioClient } = await import('../storage/minio.js');
    await minioClient.removeObject(config.minio.buckets.templates, template.minioKey);
  } catch (_err) {
    // ignore — template record is already deleted
  }
  return { deleted: true, templateId };
};
