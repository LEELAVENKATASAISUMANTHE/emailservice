import crypto from 'crypto';
import ExcelJS from 'exceljs';
import { getTablesMeta, getTablesRelatedToBaseTable, listPublicTableDetails } from '../db/postgres.js';
import { uploadBuffer } from '../db/minio.js';
import { TemplateModel } from '../models/Template.js';

const STUDENT_BASE_TABLE = 'students';
const STUDENT_REF_HEADER = 'student_ref';
const TEMPLATE_VERSION = 'v4';

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

const styleSchemaInfoSheet = (worksheet) => {
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.columns = [
    { header: 'sheet_name', key: 'sheet_name', width: 24 },
    { header: 'column_name', key: 'column_name', width: 26 },
    { header: 'included_in_upload', key: 'included_in_upload', width: 18 },
    { header: 'data_type', key: 'data_type', width: 24 },
    { header: 'nullable', key: 'nullable', width: 12 },
    { header: 'default_value', key: 'default_value', width: 36 },
    { header: 'notes', key: 'notes', width: 44 }
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFDDEAFE' }
  };
};

const styleWorkbookGuideSheet = (worksheet) => {
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.columns = [
    { header: 'sheet_name', key: 'sheet_name', width: 28 },
    { header: 'row_reference', key: 'row_reference', width: 18 },
    { header: 'column_count', key: 'column_count', width: 14 },
    { header: 'columns', key: 'columns', width: 120 }
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFDE68A' }
  };
};

const buildSchemaInfoRows = (tables, tablesMeta, tableDetails, excludedColumns) =>
  tables.flatMap((table) => {
    const hiddenColumns = new Set(excludedColumns[table] || []);
    if (table !== STUDENT_BASE_TABLE) {
      hiddenColumns.add('student_id');
    }

    return (tableDetails[table]?.columns || tablesMeta[table] || []).map((column) => {
      const notes = [];

      if (column.column_name === 'student_id' && table !== STUDENT_BASE_TABLE) {
        notes.push('Linked automatically from student_ref');
      }

      if ((excludedColumns[table] || []).includes(column.column_name)) {
        notes.push('Auto-generated or system-managed');
      }

      if (column.column_default) {
        notes.push('Has database default');
      }

      return {
        sheet_name: table,
        column_name: column.column_name,
        included_in_upload: hiddenColumns.has(column.column_name) ? 'no' : 'yes',
        data_type: column.data_type,
        nullable: column.is_nullable,
        default_value: column.column_default || '',
        notes: notes.join('; ')
      };
    });
  });

const buildSchemaSignature = (tables, tablesMeta, excludedColumns) =>
  tables
    .map((table) => {
      const visibleColumns = sanitizeHeadersForTable(
        table,
        tablesMeta[table] || [],
        excludedColumns
      ).map((entry) => entry.header);

      return `${table}:${visibleColumns.join(',')}`;
    })
    .join('|');

export const ensureFullStudentTemplate = async () => {
  const graph = await getTablesRelatedToBaseTable(STUDENT_BASE_TABLE);
  const childTables = [...new Set(graph.childTables)]
    .filter((table) => table !== STUDENT_BASE_TABLE)
    .sort();
  const tables = [STUDENT_BASE_TABLE, ...childTables];
  const tablesMeta = await getTablesMeta(tables);
  const excludedColumns = buildExcludedColumns(tablesMeta);
  const templateId = sha256(
    `students-full|${TEMPLATE_VERSION}|${buildSchemaSignature(tables, tablesMeta, excludedColumns)}`
  );

  const existing = await TemplateModel.findOne({ templateId });
  if (existing) {
    return {
      template: existing,
      sheetNames: tables
    };
  }

  const tableDetails = await listPublicTableDetails();
  const workbook = new ExcelJS.Workbook();
  const headerMap = [];
  const sheets = {};

  const guideSheet = workbook.addWorksheet('README');
  styleWorkbookGuideSheet(guideSheet);

  tables.forEach((table) => {
    const headers = sanitizeHeadersForTable(table, tablesMeta[table] || [], excludedColumns);
    const sheet = workbook.addWorksheet(table);
    styleSheet(sheet, headers);

    sheets[table] = headers.map((entry) => entry.header);
    headerMap.push(...headers);
    guideSheet.addRow({
      sheet_name: table,
      row_reference: STUDENT_REF_HEADER,
      column_count: headers.length,
      columns: headers.join(', ')
    });
  });

  const schemaInfoSheet = workbook.addWorksheet('schema_info');
  styleSchemaInfoSheet(schemaInfoSheet);
  buildSchemaInfoRows(tables, tablesMeta, tableDetails, excludedColumns)
    .forEach((row) => schemaInfoSheet.addRow(row));

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
    excludedColumns,
    schemaInfoSheet: 'schema_info'
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
      sheets,
      schemaInfoSheet: 'schema_info'
    },
    minioKey,
    createdAt: new Date()
  });

  return {
    template,
    sheetNames: tables
  };
};
