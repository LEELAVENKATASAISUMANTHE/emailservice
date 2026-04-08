import { TemplateModel } from '../models/Template.js';
import { StudentModel } from '../models/Student.js';
import { getObjectStream } from '../db/minio.js';
import { HttpError } from '../middlewares/errorHandler.js';
import { ensureTemplate } from '../services/template.service.js';
import { parseWorkbookRows } from '../utils/excel.js';

export const listTemplates = async (req, res) => {
  const templates = await TemplateModel.find({}).sort({ createdAt: -1 });
  res.json(templates);
};

const sanitizeFilename = (value) => value.replace(/[^a-zA-Z0-9_-]/g, '_');
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRow(row) {
  const errors = [];

  if (
    !String(row['students.first_name'] || '').trim() &&
    !String(row['students.full_name'] || '').trim()
  ) {
    errors.push('Name is required (first_name or full_name)');
  }

  if (!String(row['students.email'] || '').trim()) {
    errors.push('Email is required');
  }

  const email = String(row['students.email'] || '').trim();
  if (email && !emailPattern.test(email)) {
    errors.push('Invalid email format');
  }

  return errors;
}

function mapToStudent(row) {
  const firstName = String(row['students.first_name'] || '').trim() || null;
  const middleName = String(row['students.middle_name'] || '').trim() || null;
  const lastName = String(row['students.last_name'] || '').trim() || null;
  const derivedFullName = [firstName, middleName, lastName].filter(Boolean).join(' ').trim();

  return {
    first_name: firstName,
    middle_name: middleName,
    last_name: lastName,
    full_name: String(row['students.full_name'] || '').trim() || derivedFullName || null,
    email: String(row['students.email'] || '').trim().toLowerCase()
  };
}

export const generateTemplate = async (req, res) => {
  const { tables, fields } = req.body;
  const template = await ensureTemplate({ tables, fields });
  const payload = template.toObject ? template.toObject() : template;
  delete payload._id;
  delete payload.schemaMeta;
  delete payload.foreignKeys;
  res.json(payload);
};

export const downloadTemplate = async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const template = await TemplateModel.findOne({ templateId }).lean();
    if (!template) {
      throw new HttpError(404, 'Template not found');
    }

    const stream = await getObjectStream(template.minioKey);
    const filename = `template_${sanitizeFilename(template.tables.join('_'))}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    stream.on('error', (err) => {
      next(err);
    });
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
};

export const uploadTemplateWorkbook = async (req, res) => {
  if (!req.file?.buffer) {
    throw new HttpError(400, 'Excel file is required');
  }

  const parsed = await parseWorkbookRows(req.file.buffer);
  const validRows = [];
  const invalidRows = [];
  let insertedCount = 0;

  parsed.rows.forEach((row, index) => {
    const errors = validateRow(row);

    if (errors.length) {
      invalidRows.push({
        rowNumber: index + 2,
        data: row,
        errors
      });
      return;
    }

    validRows.push(row);
  });

  if (validRows.length) {
    const students = validRows.map(mapToStudent);

    try {
      const inserted = await StudentModel.insertMany(students, {
        ordered: false
      });
      insertedCount = inserted.length;
    } catch (error) {
      if (Array.isArray(error?.insertedDocs)) {
        insertedCount = error.insertedDocs.length;
      } else {
        throw new HttpError(500, 'Failed to save valid students');
      }
    }
  }

  res.json({
    message: 'Upload processed',
    total: parsed.rows.length,
    validCount: validRows.length,
    invalidCount: invalidRows.length,
    insertedCount,
    failedToInsert: validRows.length - insertedCount,
    invalidRows
  });
};
