import { ensureTemplate } from '../services/template.service.js';
import { TemplateModel } from '../models/mongo/Template.js';
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

export const downloadTemplate = async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const template = await TemplateModel.findOne({ templateId });
    if (!template) {
      throw new HttpError(404, 'Template not found');
    }

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
