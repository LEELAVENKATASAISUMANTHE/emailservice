import { Router } from 'express';
import { downloadTemplate, generateTemplate } from '../controllers/template.controller.js';

const router = Router();

router.post('/', generateTemplate);
router.get('/:templateId/download', downloadTemplate);

export default router;
