import { Router } from 'express';
import { getRecentStudents } from '../controllers/debug.controller.js';
import {
  generateStudentLink,
  getFullStudentTemplate,
  resendStudentLink,
  getStudents,
  getStudentByToken,
  getStudentTemplate,
  uploadStudents
} from '../controllers/students.controller.js';
import {
  getStudentRelatedTables,
  listTableDetails,
  listTables,
  listTemplateTables
} from '../controllers/tables.controller.js';
import { downloadTemplate, generateTemplate, listTemplates } from '../controllers/template.controller.js';
import { getJobReport, getJobStatus, uploadExcel, uploadMiddleware } from '../controllers/upload.controller.js';

const router = Router();

router.get('/templates/tables', listTemplateTables);
router.get('/tables', listTables);
router.get('/tables/details', listTableDetails);
router.get('/tables/students/related', getStudentRelatedTables);
router.get('/student-link/:token', getStudentByToken);
router.post('/student-link/:studentId/generate', generateStudentLink);
router.post('/student-link/:studentId/resend', resendStudentLink);
router.get('/students', getStudents);
router.get('/students/template', getStudentTemplate);
router.get('/students/template/full', getFullStudentTemplate);
router.get('/templates', listTemplates);
router.post('/templates', generateTemplate);
router.get('/templates/:templateId/download', downloadTemplate);
router.post('/students/upload', uploadMiddleware, uploadStudents);
router.post('/uploads', uploadMiddleware, uploadExcel);
router.get('/jobs/:job_id', getJobStatus);
router.get('/jobs/:job_id/report', getJobReport);
router.get('/debug/students/recent', getRecentStudents);

export default router;
