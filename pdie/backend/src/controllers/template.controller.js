import { ensureTemplate } from '../services/template.service.js';

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
