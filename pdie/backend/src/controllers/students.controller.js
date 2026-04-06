import crypto from 'crypto';
import { TemplateModel } from '../models/Template.js';
import { JobModel } from '../models/Job.js';
import { uploadBuffer } from '../db/minio.js';
import { ensureStudentLinksTable, pgPool } from '../db/postgres.js';
import { config } from '../config/index.js';
import { HttpError } from '../middlewares/errorHandler.js';
import { createJob } from '../services/job.service.js';
import { getFullStudentWorkbookStats, processFullStudentUploadJob } from '../services/student-ingest.service.js';
import { ensureFullStudentTemplate } from '../services/student-template.service.js';
import { ensureTemplate } from '../services/template.service.js';
import { sendStudentLinkEmail } from '../services/email.service.js';
import { readExcelMeta } from '../utils/excel.js';
import { logger } from '../utils/logger.js';
import { uploadExcel } from './upload.controller.js';

const STUDENT_TABLES = ['students'];
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;
const generateToken = () => crypto.randomBytes(32).toString('hex');

const buildStudentLinkUrl = (token) =>
  `${config.app.frontendUrl.replace(/\/$/, '')}/student-form/${token}`;

const toTemplateResponse = (template) => {
  const payload = template.toObject ? template.toObject() : { ...template };
  delete payload._id;
  delete payload.schemaMeta;
  delete payload.foreignKeys;
  return payload;
};

const isStudentsOnlyTemplate = (template) =>
  Array.isArray(template?.tables) &&
  template.tables.length === 1 &&
  template.tables[0] === 'students';

const buildStudentSheetDetails = (template, sheetNames = []) =>
  sheetNames.map((sheetName) => ({
    sheetName,
    columns: (template.schemaMeta?.[sheetName] || [])
      .map((column) => column.column_name)
      .filter((columnName) => {
        if ((template.excludedColumns?.[sheetName] || []).includes(columnName)) {
          return false;
        }

        if (sheetName !== 'students' && columnName === 'student_id') {
          return false;
        }

        return true;
      }),
    rowReference: 'student_ref'
  }));

export const getStudents = async (_req, res) => {
  const result = await pgPool.query(
    `
      SELECT
        s.student_id,
        s.first_name,
        s.middle_name,
        s.last_name,
        s.full_name,
        s.gender,
        s.dob,
        s.email,
        s.alt_email,
        s.college_email,
        s.mobile,
        s.emergency_contact,
        s.nationality,
        s.placement_fee_status,
        s.student_photo_path,
        s.created_at,
        s.branch,
        s.graduation_year,
        s.semester
      FROM ${quoteIdentifier(config.postgres.schema)}.${quoteIdentifier('students')} s
      ORDER BY s.student_id DESC
    `
  );

  res.json(result.rows);
};

export const getStudentByToken = async (req, res) => {
  const token = String(req.params.token || '').trim();
  if (!token) {
    throw new HttpError(400, 'Token is required');
  }

  await ensureStudentLinksTable();

  const linkResult = await pgPool.query(
    `
      SELECT id, student_id, email, token, status, created_at, expires_at
      FROM ${quoteIdentifier(config.postgres.schema)}.${quoteIdentifier('student_links')}
      WHERE token = $1
      LIMIT 1
    `,
    [token]
  );

  const link = linkResult.rows[0];
  if (!link) {
    throw new HttpError(404, 'Invalid or expired link');
  }

  if (link.expires_at && new Date() > new Date(link.expires_at)) {
    throw new HttpError(400, 'Link expired');
  }

  let status = link.status;
  if (link.status === 'pending') {
    const updateResult = await pgPool.query(
      `
        UPDATE ${quoteIdentifier(config.postgres.schema)}.${quoteIdentifier('student_links')}
        SET status = 'opened'
        WHERE token = $1
          AND status = 'pending'
        RETURNING status
      `,
      [token]
    );

    if (updateResult.rows[0]?.status) {
      status = updateResult.rows[0].status;
    }
  }

  const studentResult = await pgPool.query(
    `
      SELECT *
      FROM ${quoteIdentifier(config.postgres.schema)}.${quoteIdentifier('students')}
      WHERE student_id = $1
      LIMIT 1
    `,
    [link.student_id]
  );

  const student = studentResult.rows[0];
  if (!student) {
    throw new HttpError(404, 'Student not found for this link');
  }

  res.json({
    student,
    status
  });
};

export const resendStudentLink = async (req, res) => {
  const studentId = Number.parseInt(String(req.params.studentId || ''), 10);
  if (!Number.isFinite(studentId) || studentId <= 0) {
    throw new HttpError(400, 'Valid studentId is required');
  }

  await ensureStudentLinksTable();

  const linkResult = await pgPool.query(
    `
      SELECT id, student_id, email, token, status, created_at, expires_at
      FROM ${quoteIdentifier(config.postgres.schema)}.${quoteIdentifier('student_links')}
      WHERE student_id = $1
      ORDER BY created_at DESC NULLS LAST, id DESC
      LIMIT 1
    `,
    [studentId]
  );

  const link = linkResult.rows[0];
  if (!link) {
    throw new HttpError(404, 'No link found for this student');
  }

  if (!link.email) {
    throw new HttpError(400, 'This student link does not have an email address');
  }

  const linkUrl = buildStudentLinkUrl(link.token);
  await sendStudentLinkEmail(link.email, linkUrl);

  res.json({
    success: true,
    studentId,
    email: link.email
  });
};

export const generateStudentLink = async (req, res) => {
  const studentId = Number.parseInt(String(req.params.studentId || ''), 10);
  if (!Number.isFinite(studentId) || studentId <= 0) {
    throw new HttpError(400, 'Valid studentId is required');
  }

  await ensureStudentLinksTable();

  const studentResult = await pgPool.query(
    `
      SELECT student_id, email, college_email, first_name, middle_name, last_name, full_name
      FROM ${quoteIdentifier(config.postgres.schema)}.${quoteIdentifier('students')}
      WHERE student_id = $1
      LIMIT 1
    `,
    [studentId]
  );

  const student = studentResult.rows[0];
  if (!student) {
    throw new HttpError(404, 'Student not found');
  }

  const targetEmail = student.email || student.college_email || '';
  if (!targetEmail) {
    throw new HttpError(400, 'Student does not have an email address');
  }

  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await pgPool.query(
    `
      INSERT INTO ${quoteIdentifier(config.postgres.schema)}.${quoteIdentifier('student_links')}
      (student_id, email, token, status, expires_at)
      VALUES ($1, $2, $3, 'pending', $4)
    `,
    [studentId, targetEmail, token, expiresAt]
  );

  const linkUrl = buildStudentLinkUrl(token);
  await sendStudentLinkEmail(targetEmail, linkUrl);

  res.json({
    success: true,
    studentId,
    email: targetEmail
  });
};

export const getStudentTemplate = async (_req, res) => {
  const template = await ensureTemplate(STUDENT_TABLES);
  const payload = toTemplateResponse(template);

  res.json({
    ...payload,
    resource: 'students',
    downloadUrl: `/api/templates/${payload.templateId}/download`
  });
};

export const getFullStudentTemplate = async (_req, res) => {
  const { template, sheetNames } = await ensureFullStudentTemplate();
  const payload = toTemplateResponse(template);

  res.json({
    ...payload,
    resource: 'students-full',
    workbookMode: 'multi-sheet',
    referenceColumn: 'student_ref',
    sheetNames,
    sheetDetails: buildStudentSheetDetails(template, sheetNames),
    downloadUrl: `/api/templates/${payload.templateId}/download`
  });
};

export const uploadStudents = async (req, res) => {
  if (!req.file?.buffer) {
    throw new HttpError(400, 'Excel file is required');
  }

  const buffer = req.file.buffer;
  let metadata;
  try {
    metadata = await readExcelMeta(buffer);
  } catch (_error) {
    throw new HttpError(400, 'Invalid template - _meta sheet missing or corrupt');
  }

  const template = await TemplateModel.findOne({ templateId: metadata.templateId }).lean();
  if (!template) {
    throw new HttpError(400, 'Template not found for uploaded workbook');
  }

  if (metadata.templateType === 'students-full') {
    const fileHash = sha256(buffer);
    const duplicate = await JobModel.findOne({ fileHash, status: 'done' }).lean();
    if (duplicate) {
      throw new HttpError(409, 'Duplicate file', { existingJobId: duplicate.jobId });
    }

    const { totalRows } = await getFullStudentWorkbookStats(buffer, {
      sheets: template.workbookMeta?.sheets || metadata.sheets || {}
    });

    const job = await createJob({
      templateId: template.templateId,
      originalFilename: req.file.originalname,
      fileHash,
      status: 'queued',
      totalRows,
      processedRows: 0,
      committedRows: 0,
      rejectedRows: 0,
      errorSummary: ''
    });

    await uploadBuffer(`uploads/${job.jobId}.xlsx`, buffer, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    Promise.resolve(processFullStudentUploadJob(job.jobId)).catch((error) => {
      logger.error({ err: error, jobId: job.jobId }, 'Multi-table student upload failed');
    });

    res.status(202).json({ jobId: job.jobId, mode: 'students-full' });
    return;
  }

  if (!isStudentsOnlyTemplate(template)) {
    throw new HttpError(400, 'Only PDIE student templates can be uploaded to this endpoint');
  }

  return uploadExcel(req, res);
};
