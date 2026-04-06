import { TemplateModel } from '../models/Template.js';
import { getObjectStream } from '../db/minio.js';
import { HttpError } from '../middlewares/errorHandler.js';
import { ensureTemplate } from '../services/template.service.js';
import { parseWorkbookRows } from '../utils/excel.js';

export const listTemplates = async (req, res) => {
  const templates = await TemplateModel.find({}).sort({ createdAt: -1 });
  res.json(templates);
};

const sanitizeFilename = (value) => value.replace(/[^a-zA-Z0-9_-]/g, '_');

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

  res.json({
    message: 'File parsed successfully',
    headers: parsed.headers,
    rows: parsed.rows
  });
};
