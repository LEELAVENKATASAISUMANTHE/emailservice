import { ensureTemplate, listTemplates, getTemplateById, deleteTemplate } from '../services/template.service.js';
import { config } from '../config/index.js';
import { getObjectStream } from '../storage/minio.js';
import { HttpError } from '../middlewares/errorHandler.js';

export const generateTemplate = async (req, res) => {
  const { tables } = req.body;
  const template = await ensureTemplate({ tables });
  res.json({
    templateId: template.templateId,
    tables: template.tables,
    headers: template.headers,
    joinKeys: template.joinKeys,
    minioKey: template.minioKey,
    checksum: template.checksum
  });
};

export const listAllTemplates = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const result = await listTemplates({ page, limit });
  res.json(result);
};

export const getTemplate = async (req, res) => {
  const template = await getTemplateById(req.params.templateId);
  res.json(template);
};

export const removeTemplate = async (req, res) => {
  const result = await deleteTemplate(req.params.templateId);
  res.json(result);
};

export const downloadTemplate = async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const template = await getTemplateById(templateId);

    const stream = await getObjectStream(config.minio.buckets.templates, template.minioKey);
    const filename = `${template.templateId}.xlsx`;

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
