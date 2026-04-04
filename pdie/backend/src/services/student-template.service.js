import crypto from 'crypto';
import ExcelJS from 'exceljs';
import { getTablesMeta, getTablesRelatedToBaseTable } from '../db/postgres.js';
import { uploadBuffer } from '../db/minio.js';
import { TemplateModel } from '../models/Template.js';

const STUDENT_BASE_TABLE = 'students';
const STUDENT_REF_HEADER = 'student_ref';
const TEMPLATE_VERSION = 'v3';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const buildExcludedColumns = (tablesMeta) => {
  const excludedColumnNames = new Set(['id', 'created_at', 'updated_at']);

  const result = {};

  for (const [table, columns] of Object.entries(tablesMeta)) {
    result[table] = columns
      .filter((column) => {
        if (column.is_identity === 'YES') return true;
        if (String(column.column_default || '').includes('nextval(')) return true;
        if (excludedColumnNames.has(column.column_name)) return true;
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
  sha256(`students-full|${TEMPLATE_VERSION}|${tables.join(',')}`);

export const ensureFullStudentTemplate = async () => {
  const graph = await getTablesRelatedToBaseTable(STUDENT_BASE_TABLE);
  const childTables = [...new Set(graph.childTables)]
    .filter((table) => table !== STUDENT_BASE_TABLE)
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
    templateVersion: TEMPLATE_VERSION,
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
      templateVersion: TEMPLATE_VERSION,
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
