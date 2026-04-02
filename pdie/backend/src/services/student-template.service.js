import crypto from 'crypto';
import ExcelJS from 'exceljs';
import { getTablesMeta, getTablesRelatedToBaseTable } from '../db/postgres.js';
import { uploadBuffer } from '../db/minio.js';
import { TemplateModel } from '../models/Template.js';

const STUDENT_BASE_TABLE = 'students';
const STUDENT_REF_HEADER = 'student_ref';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

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

const sanitizeHeadersForTable = (table, columns, excludedColumns) => {
  const hiddenColumns = new Set(excludedColumns[table] || []);
  if (table !== STUDENT_BASE_TABLE) {
    hiddenColumns.add('student_id');
  }

  return [
    {
      header: STUDENT_REF_HEADER,
      table,
      column: STUDENT_REF_HEADER
    },
    ...columns
      .filter((column) => !hiddenColumns.has(column.column_name))
      .map((column) => ({
        header: column.column_name,
        table,
        column: column.column_name
      }))
  ];
};

const styleSheet = (worksheet, headers) => {
  worksheet.addRow(headers.map((entry) => entry.header));
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  worksheet.columns.forEach((column, index) => {
    const header = headers[index]?.header || '';
    column.width = Math.max(15, Math.min(40, header.length + 6));
  });

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE5E7EB' }
  };
};

const buildTemplateId = (tables) =>
  sha256(`students-full|${tables.join(',')}`);

export const ensureFullStudentTemplate = async () => {
  const graph = await getTablesRelatedToBaseTable(STUDENT_BASE_TABLE);
  const childTables = graph.childTables
    .filter((table) => table.startsWith('student_'))
    .sort();
  const tables = [STUDENT_BASE_TABLE, ...childTables];
  const templateId = buildTemplateId(tables);

  const existing = await TemplateModel.findOne({ templateId });
  if (existing) {
    return {
      template: existing,
      sheetNames: tables
    };
  }

  const tablesMeta = await getTablesMeta(tables);
  const excludedColumns = buildExcludedColumns(tablesMeta);
  const workbook = new ExcelJS.Workbook();
  const headerMap = [];
  const sheets = {};

  tables.forEach((table) => {
    const headers = sanitizeHeadersForTable(table, tablesMeta[table] || [], excludedColumns);
    const sheet = workbook.addWorksheet(table);
    styleSheet(sheet, headers);

    sheets[table] = headers.map((entry) => entry.header);
    headerMap.push(...headers);
  });

  const metaSheet = workbook.addWorksheet('_meta');
  metaSheet.state = 'veryHidden';
  metaSheet.getCell('A1').value = JSON.stringify({
    templateId,
    templateType: 'students-full',
    tables,
    baseTable: STUDENT_BASE_TABLE,
    childTables,
    referenceColumn: STUDENT_REF_HEADER,
    workbookMode: 'multi-sheet',
    sheets,
    excludedColumns
  });

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const minioKey = `templates/${templateId}.xlsx`;
  await uploadBuffer(minioKey, buffer, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const template = await TemplateModel.create({
    templateId,
    tables,
    joinKeys: [STUDENT_REF_HEADER],
    headerMap,
    excludedColumns,
    schemaMeta: tablesMeta,
    foreignKeys: [],
    workbookMeta: {
      templateType: 'students-full',
      workbookMode: 'multi-sheet',
      referenceColumn: STUDENT_REF_HEADER,
      sheets
    },
    minioKey,
    createdAt: new Date()
  });

  return {
    template,
    sheetNames: tables
  };
};
