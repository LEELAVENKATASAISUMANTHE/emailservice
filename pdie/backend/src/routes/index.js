import { Router } from 'express';
import { listTables } from '../controllers/tables.controller.js';
import { downloadTemplate, generateTemplate, listTemplates } from '../controllers/template.controller.js';
import { getJobReport, getJobStatus, uploadExcel, uploadMiddleware } from '../controllers/upload.controller.js';

const router = Router();

router.get('/tables', listTables);
router.get('/templates', listTemplates);
router.post('/templates', generateTemplate);
router.get('/templates/:templateId/download', downloadTemplate);
router.post('/uploads', uploadMiddleware, uploadExcel);
router.get('/jobs/:job_id', getJobStatus);
router.get('/jobs/:job_id/report', getJobReport);

export default router;
