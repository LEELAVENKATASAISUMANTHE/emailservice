import crypto from 'crypto';
import ExcelJS from 'exceljs';
import { TemplateModel } from '../models/Template.js';
import { getObjectBuffer } from '../db/minio.js';
import { ensureStudentLinksTable, pgPool } from '../db/postgres.js';
import { config } from '../config/index.js';
import { appendLogRows, getJob, updateJob } from './job.service.js';
import { sendStudentLinkEmail } from './email.service.js';

const SUPPORTED_CHILD_SHEETS = new Set(['student_addresses']);
const STUDENT_LINK_EXPIRY_DAYS = 30;

const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;
const generateToken = () => crypto.randomBytes(32).toString('hex');

const normalizeCellValue = (value) => {
  if (value === undefined || value === null) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text || '').join('');
    }

    if (value.text) {
      return value.text;
    }

    if (value.result !== undefined) {
      return normalizeCellValue(value.result);
    }

    if (value.formula && value.result === undefined) {
      return value.formula;
    }
  }

  return value;
};

const isBlank = (value) => String(value ?? '').trim() === '';

const stripControlColumns = (row) => {
  const payload = {};

  Object.entries(row).forEach(([key, value]) => {
    if (key === 'student_ref' || key.startsWith('__') || isBlank(value)) {
      return;
    }
    payload[key] = value;
  });

  return payload;
};

const parseWorksheetRows = (worksheet, expectedHeaders) => {
  if (!worksheet) {
    return [];
  }

  const actualHeaders = worksheet.getRow(1).values
    .slice(1)
    .map((value) => String(normalizeCellValue(value) || '').trim());

  if (expectedHeaders.length !== actualHeaders.length ||
    expectedHeaders.some((header, index) => header !== actualHeaders[index])) {
    throw new Error(`Worksheet "${worksheet.name}" headers do not match the generated template`);
  }

  const rows = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const record = {};
    let hasValue = false;

    expectedHeaders.forEach((header, index) => {
      const value = normalizeCellValue(row.getCell(index + 1).value);
      record[header] = value;
      if (!isBlank(value)) {
        hasValue = true;
      }
    });

    if (!hasValue) {
      continue;
    }

    Object.defineProperties(record, {
      __rowIndex: {
        value: rowNumber,
        enumerable: false
      },
      __sheetName: {
        value: worksheet.name,
        enumerable: false
      }
    });

    rows.push(record);
  }

  return rows;
};

const parseWorkbookByMeta = async (buffer, metadata) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const rowsBySheet = {};
  let totalRows = 0;

  Object.entries(metadata.sheets || {}).forEach(([sheetName, headers]) => {
    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) {
      throw new Error(`Workbook is missing the "${sheetName}" worksheet`);
    }

    const rows = parseWorksheetRows(worksheet, headers);
    rowsBySheet[sheetName] = rows;
    totalRows += rows.length;
  });

  return { rowsBySheet, totalRows };
};

const toLogRow = (row, status = 'ok', errors = []) => ({
  rowIndex: row.__rowIndex || 0,
  status,
  errors: errors.map((error) => ({
    field: error.field || '',
    value: error.value == null ? '' : String(error.value),
    message: error.message
  }))
});

const buildInsertStatement = (schema, table, payload, returningColumn = '') => {
  const columns = Object.keys(payload);
  if (!columns.length) {
    throw new Error(`No values supplied for ${table}`);
  }

  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  const columnSql = columns.map(quoteIdentifier).join(', ');
  const returningSql = returningColumn ? ` RETURNING ${quoteIdentifier(returningColumn)}` : '';

  return {
    text: `INSERT INTO ${quoteIdentifier(schema)}.${quoteIdentifier(table)} (${columnSql}) VALUES (${placeholders})${returningSql}`,
    values: columns.map((column) => payload[column])
  };
};

const resolveStudentEmail = (studentPayload) => {
  const emailField = Object.keys(studentPayload).find((key) => key.toLowerCase() === 'email');
  return emailField ? studentPayload[emailField] : null;
};

const buildStudentLinkPayload = (studentId, email) => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + STUDENT_LINK_EXPIRY_DAYS);

  return {
    student_id: studentId,
    email: email || null,
    token: generateToken(),
    expires_at: expiresAt
  };
};

const buildStudentLinkUrl = (token) =>
  `${config.app.frontendUrl.replace(/\/$/, '')}/student-form/${token}`;

export const getFullStudentWorkbookStats = async (buffer, metadata) => {
  const { totalRows } = await parseWorkbookByMeta(buffer, metadata);
  return { totalRows };
};

export const processFullStudentUploadJob = async (jobId) => {
  const job = await getJob(jobId);
  if (!job) {
    throw new Error(`Job "${jobId}" not found`);
  }

  const template = await TemplateModel.findOne({ templateId: job.templateId }).lean();
  if (!template) {
    throw new Error(`Template "${job.templateId}" not found`);
  }

  const buffer = await getObjectBuffer(`uploads/${jobId}.xlsx`);
  const workbookMeta = template?.workbookMeta || null;
  const metadata = workbookMeta || {
    sheets: Object.fromEntries(
      template.tables.map((table) => [
        table,
        template.headerMap.filter((entry) => entry.table === table).map((entry) => entry.header)
      ])
    )
  };

  try {
    await ensureStudentLinksTable();

    await updateJob(jobId, {
      status: 'validating',
      rejectedRows: 0,
      errorSummary: '',
      updatedAt: new Date()
    });

    const { rowsBySheet, totalRows } = await parseWorkbookByMeta(buffer, metadata);
    const studentRows = rowsBySheet.students || [];
    const validationLogs = [];
    const groupedData = {};
    const seenRefs = new Set();

    if (!studentRows.length) {
      throw new Error('Students sheet must contain at least one row');
    }

    studentRows.forEach((row) => {
      const studentRef = String(row.student_ref || '').trim();

      if (!studentRef) {
        validationLogs.push(toLogRow(row, 'error', [{
          field: 'students.student_ref',
          value: '',
          message: 'student_ref is required'
        }]));
        return;
      }

      if (seenRefs.has(studentRef)) {
        validationLogs.push(toLogRow(row, 'error', [{
          field: 'students.student_ref',
          value: studentRef,
          message: 'Duplicate student_ref in students sheet'
        }]));
        return;
      }

      seenRefs.add(studentRef);
      groupedData[studentRef] = {
        student: row,
        student_addresses: []
      };
    });

    Object.entries(rowsBySheet).forEach(([sheetName, rows]) => {
      if (sheetName === 'students') {
        return;
      }

      if (!SUPPORTED_CHILD_SHEETS.has(sheetName)) {
        rows.forEach((row) => {
          validationLogs.push(toLogRow(row, 'error', [{
            field: `${sheetName}.student_ref`,
            value: row.student_ref,
            message: `Sheet "${sheetName}" is not supported yet in the multi-table upload flow`
          }]));
        });
        return;
      }

      rows.forEach((row) => {
        const studentRef = String(row.student_ref || '').trim();
        if (!studentRef) {
          validationLogs.push(toLogRow(row, 'error', [{
            field: `${sheetName}.student_ref`,
            value: '',
            message: 'student_ref is required'
          }]));
          return;
        }

        if (!groupedData[studentRef]) {
          validationLogs.push(toLogRow(row, 'error', [{
            field: `${sheetName}.student_ref`,
            value: studentRef,
            message: 'student_ref does not exist in students sheet'
          }]));
          return;
        }

        groupedData[studentRef][sheetName].push(row);
      });
    });

    if (validationLogs.length) {
      await appendLogRows(jobId, validationLogs);
      await updateJob(jobId, {
        status: 'failed',
        totalRows,
        processedRows: 0,
        committedRows: 0,
        rejectedRows: validationLogs.length,
        errorSummary: 'Validation failed for multi-table student upload',
        updatedAt: new Date()
      });
      return;
    }

    await updateJob(jobId, {
      status: 'ingesting',
      totalRows,
      updatedAt: new Date()
    });

    const client = await pgPool.connect();
    const successLogs = [];
    const emailQueue = [];
    let committedRows = 0;

    try {
      await client.query('BEGIN');

      for (const studentRef of Object.keys(groupedData)) {
        const group = groupedData[studentRef];
        const studentPayload = stripControlColumns(group.student);
        const studentInsert = buildInsertStatement(config.postgres.schema, 'students', studentPayload, 'student_id');
        const studentResult = await client.query(studentInsert.text, studentInsert.values);
        const studentId = studentResult.rows[0]?.student_id;

        if (!studentId) {
          throw new Error(`Failed to create student for reference "${studentRef}"`);
        }

        const studentLinkPayload = buildStudentLinkPayload(
          studentId,
          resolveStudentEmail(studentPayload)
        );
        const studentLinkInsert = buildInsertStatement(
          config.postgres.schema,
          'student_links',
          studentLinkPayload
        );
        await client.query(studentLinkInsert.text, studentLinkInsert.values);

        if (studentLinkPayload.email) {
          emailQueue.push({
            email: studentLinkPayload.email,
            link: buildStudentLinkUrl(studentLinkPayload.token)
          });
        }

        committedRows += 1;
        successLogs.push(toLogRow(group.student));

        for (const addressRow of group.student_addresses) {
          const addressPayload = {
            ...stripControlColumns(addressRow),
            student_id: studentId
          };
          const addressInsert = buildInsertStatement(config.postgres.schema, 'student_addresses', addressPayload);
          await client.query(addressInsert.text, addressInsert.values);
          committedRows += 1;
          successLogs.push(toLogRow(addressRow));
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    for (const message of emailQueue) {
      await sendStudentLinkEmail(message.email, message.link);
    }

    if (successLogs.length) {
      await appendLogRows(jobId, successLogs);
    }

    await updateJob(jobId, {
      status: 'done',
      totalRows,
      processedRows: committedRows,
      committedRows,
      rejectedRows: 0,
      errorSummary: '',
      updatedAt: new Date()
    });
  } catch (error) {
    await updateJob(jobId, {
      status: 'failed',
      errorSummary: error.message,
      updatedAt: new Date()
    }).catch(() => {});

    throw error;
  }
};
