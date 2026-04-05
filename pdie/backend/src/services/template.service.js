import crypto from 'crypto';
import ExcelJS from 'exceljs';
import { getForeignKeys, getTablesMeta } from '../db/postgres.js';
import { uploadBuffer } from '../db/minio.js';
import { TemplateModel } from '../models/Template.js';
import { HttpError } from '../middlewares/errorHandler.js';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const normalizeTableNames = (tableNames) => [...new Set(
  (Array.isArray(tableNames) ? tableNames : [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
)];

const normalizeSelectedFields = (fieldRefs) => {
  const seen = new Set();
  const normalized = [];

  (Array.isArray(fieldRefs) ? fieldRefs : []).forEach((value) => {
    const rawValue = String(value || '').trim().toLowerCase();
    const separatorIndex = rawValue.indexOf('.');

    if (separatorIndex <= 0 || separatorIndex === rawValue.length - 1) {
      return;
    }

    const table = rawValue.slice(0, separatorIndex).trim();
    const column = rawValue.slice(separatorIndex + 1).trim();
    const key = `${table}.${column}`;

    if (!table || !column || seen.has(key)) {
      return;
    }

    seen.add(key);
    normalized.push({ table, column, key });
  });

  return normalized;
};

const buildExcludedColumns = (tablesMeta) => {
  const auditNames = new Set([
    'id', 'created_at', 'updated_at', 'deleted_at',
    'inserted_at', 'created_by', 'updated_by'
  ]);
  const autoDefaultPatterns = [
    /^nextval\(/i,
    /^gen_random_uuid\(\)/i,
    /^uuid_generate/i,
    /^now\(\)/i,
    /^current_timestamp/i
  ];

  const result = {};

  for (const [table, columns] of Object.entries(tablesMeta)) {
    result[table] = columns
      .filter((column) => {
        if (column.is_identity === 'YES') return true;
        if (auditNames.has(column.column_name)) return true;
        if (
          column.column_default &&
          autoDefaultPatterns.some((pattern) => pattern.test(column.column_default))
        ) {
          return true;
        }
        return false;
      })
      .map((column) => column.column_name);
  }

  return result;
};

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

const buildTemplateId = ({ tables, joinKeys, selectedFields }) => {
  if (selectedFields?.length) {
    return sha256(`fields|${selectedFields.join(',')}`);
  }

  return sha256(`${[...tables].sort().join(',')}|${[...joinKeys].sort().join(',')}`);
};

const resolveJoinKeyAssignments = (joinKeys, foreignKeys, excludedColumns) => {
  const seen = new Set();
  const assignments = [];

  foreignKeys.forEach((foreignKey) => {
    if (!joinKeys.includes(foreignKey.from_column) || seen.has(foreignKey.from_column)) {
      return;
    }

    if ((excludedColumns[foreignKey.from_table] || []).includes(foreignKey.from_column)) {
      return;
    }

    assignments.push({
      header: foreignKey.from_column,
      table: foreignKey.from_table,
      column: foreignKey.from_column
    });
    seen.add(foreignKey.from_column);
  });

  return assignments;
};

export const ensureTemplate = async (input) => {
  const fieldsInput = Array.isArray(input) ? [] : input?.fields;
  const tablesInput = Array.isArray(input) ? input : input?.tables;

  const normalizedFields = normalizeSelectedFields(fieldsInput);
  const normalizedTables = normalizedFields.length
    ? [...new Set(normalizedFields.map((field) => field.table))]
    : normalizeTableNames(tablesInput);

  if (!normalizedTables.length) {
    throw new HttpError(400, normalizedFields.length
      ? 'fields must contain valid table.column values'
      : 'tables must be a non-empty array');
  }

  const foreignKeys = await getForeignKeys(normalizedTables);
  const tablesMeta = await getTablesMeta(normalizedTables);
  const missingTables = normalizedTables.filter((table) => !tablesMeta[table]?.length);
  if (missingTables.length) {
    throw new HttpError(400, `Unknown tables: ${missingTables.join(', ')}`);
  }

  const excludedColumns = buildExcludedColumns(tablesMeta);
  const joinKeys = normalizedFields.length
    ? []
    : [...new Set(
      foreignKeys
        .filter((foreignKey) =>
          normalizedTables.includes(foreignKey.from_table) &&
          normalizedTables.includes(foreignKey.to_table)
        )
        .map((foreignKey) => foreignKey.from_column)
        .sort()
    )];
  const selectedFields = normalizedFields.length
    ? normalizedFields.map((field) => field.key)
    : [];
  const templateId = buildTemplateId({ tables: normalizedTables, joinKeys, selectedFields });
  const existing = await TemplateModel.findOne({ templateId });
  if (existing) {
    return existing;
  }

  if (normalizedFields.length) {
    const missingFields = normalizedFields.filter(
      ({ table, column }) => !(tablesMeta[table] || []).some((entry) => entry.column_name === column)
    );

    if (missingFields.length) {
      throw new HttpError(400, `Unknown fields: ${missingFields.map((field) => field.key).join(', ')}`);
    }
  }

  const tableOrder = topologicalSortTables(normalizedTables, foreignKeys);
  const headerMap = normalizedFields.length
    ? normalizedFields.map(({ table, column, key }) => ({
      header: key,
      table,
      column
    }))
    : resolveJoinKeyAssignments(joinKeys, foreignKeys, excludedColumns);

  if (!normalizedFields.length) {
    tableOrder.forEach((table) => {
      (tablesMeta[table] || []).forEach((column) => {
        if ((excludedColumns[table] || []).includes(column.column_name)) {
          return;
        }
        if (joinKeys.includes(column.column_name)) {
          return;
        }

        headerMap.push({
          header: `${table}__${column.column_name}`,
          table,
          column: column.column_name
        });
      });
    });
  }

  const workbook = new ExcelJS.Workbook();
  const dataSheet = workbook.addWorksheet('data');
  dataSheet.addRow(headerMap.map((entry) => entry.header));
  dataSheet.views = [{ state: 'frozen', ySplit: 1 }];

  dataSheet.columns.forEach((column, index) => {
    const header = headerMap[index]?.header || '';
    column.width = Math.max(15, Math.min(40, header.length + 6));
  });

  const headerRow = dataSheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE5E7EB' }
  };

  const metaSheet = workbook.addWorksheet('_meta');
  metaSheet.state = 'veryHidden';
  metaSheet.getCell('A1').value = JSON.stringify({
    templateId,
    tables: normalizedTables,
    selectedFields,
    joinKeys,
    excludedColumns
  });

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const minioKey = `templates/${templateId}.xlsx`;
  await uploadBuffer(minioKey, buffer, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  return TemplateModel.create({
    templateId,
    tables: normalizedTables,
    selectedFields,
    joinKeys,
    headerMap,
    excludedColumns,
    schemaMeta: tablesMeta,
    foreignKeys,
    minioKey,
    createdAt: new Date()
  });
};
