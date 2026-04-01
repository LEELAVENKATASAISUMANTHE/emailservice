import { Router } from 'express';
import {
  generateTemplate,
  listAllTemplates,
  getTemplate,
  removeTemplate,
  downloadTemplate
} from '../controllers/template.controller.js';

const router = Router();

router.get('/', listAllTemplates);
router.post('/', generateTemplate);
router.get('/:templateId', getTemplate);
router.delete('/:templateId', removeTemplate);
router.get('/:templateId/download', downloadTemplate);

export default router;
