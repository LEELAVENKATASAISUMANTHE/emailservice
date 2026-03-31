import ExcelJS from 'exceljs';
import stringify from 'fast-json-stable-stringify';
import { TemplateModel } from '../models/mongo/Template.js';
import { fetchRelationships, fetchTableColumns, fetchNaturalJoinKeys } from '../db/postgres.js';
import { sha256 } from '../utils/hash.js';
import { config } from '../config/index.js';
import { uploadBuffer } from '../storage/minio.js';
import { HttpError } from '../middlewares/errorHandler.js';

const buildHeaders = ({ columnsByTable, joinKeys, relationships }) => {
  const seen = new Set();
  const headers = [];

  joinKeys.forEach((key) => {
    Object.keys(columnsByTable).forEach((table) => {
      if (columnsByTable[table].some((col) => col.column === key) && !seen.has(`${table}__${key}`)) {
        headers.push(`${table}__${key}`);
        seen.add(`${table}__${key}`);
      }
    });
  });

  relationships.forEach((rel) => {
    const sourceHeader = `${rel.source_table}__${rel.source_column}`;
    if (!seen.has(sourceHeader)) {
      headers.push(sourceHeader);
      seen.add(sourceHeader);
    }
    const targetHeader = `${rel.target_table}__${rel.target_column}`;
    if (!seen.has(targetHeader)) {
      headers.push(targetHeader);
      seen.add(targetHeader);
    }
  });

  Object.entries(columnsByTable).forEach(([table, columns]) => {
    columns.forEach((col) => {
      const header = `${table}__${col.column}`;
      if (!seen.has(header)) {
        headers.push(header);
        seen.add(header);
      }
    });
  });

  return headers;
};

const buildTemplateId = (tables, joinKeys) => sha256(stringify({ tables: [...tables].sort(), joinKeys: [...joinKeys].sort() }));

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
  const joinKeys = naturalJoinKeys.length ? naturalJoinKeys : relationships.map((rel) => `${rel.source_table}.${rel.source_column}`);
  const templateId = buildTemplateId(normalizedTables, joinKeys);

  const existing = await TemplateModel.findOne({ templateId });
  if (existing) {
    return existing;
  }

  const headers = buildHeaders({ columnsByTable, joinKeys, relationships });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('data');
  sheet.columns = headers.map((header) => ({ header, key: header }));

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
    metadata: { columnsByTable }
  });

  return template;
};
