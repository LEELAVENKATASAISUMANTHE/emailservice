import crypto from 'crypto';
import { config } from '../config/index.js';
import { pgPool } from '../db/postgres.js';
import { HttpError } from '../middlewares/errorHandler.js';

const quoteIdentifier = (value) => `"${String(value).replace(/"/g, '""')}"`;

const assertDebugAccess = (req) => {
  if (!config.app.debugEnabled) {
    throw new HttpError(404, 'Resource not found');
  }

  const headerToken = String(req.headers['x-debug-token'] || '');
  const expectedToken = String(config.app.debugToken || '');
  if (!headerToken || !expectedToken) {
    throw new HttpError(403, 'Debug access is not configured');
  }

  const provided = Buffer.from(headerToken);
  const expected = Buffer.from(expectedToken);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    throw new HttpError(403, 'Invalid debug token');
  }
};

export const getRecentStudents = async (req, res) => {
  assertDebugAccess(req);

  const requestedLimit = Number.parseInt(String(req.query.limit || '5'), 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(requestedLimit, 20))
    : 5;
  const singleEmail = String(req.query.email || '').trim().toLowerCase();
  const emailList = String(req.query.emails || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const filters = [];
  const values = [];

  if (singleEmail) {
    values.push(singleEmail);
    filters.push(`LOWER(email) = $${values.length}`);
  }

  if (emailList.length) {
    values.push(emailList);
    filters.push(`LOWER(email) = ANY($${values.length})`);
  }

  const sql = `
    SELECT
      student_id,
      first_name,
      middle_name,
      last_name,
      full_name,
      gender,
      dob,
      email,
      alt_email,
      college_email,
      mobile,
      emergency_contact,
      nationality,
      placement_fee_status,
      student_photo_path,
      branch,
      graduation_year,
      semester,
      created_at
    FROM ${quoteIdentifier(config.postgres.schema)}.${quoteIdentifier('students')}
    ${filters.length ? `WHERE ${filters.join(' OR ')}` : ''}
    ORDER BY created_at DESC NULLS LAST, student_id DESC
    LIMIT $${values.length + 1}
  `;

  const result = await pgPool.query(sql, [...values, limit]);

  res.json({
    table: 'students',
    limit,
    filters: {
      email: singleEmail || null,
      emails: emailList
    },
    count: result.rows.length,
    rows: result.rows
  });
};
