import { Router } from 'express';
import { generateTemplate } from '../controllers/template.controller.js';

const router = Router();

router.post('/', generateTemplate);

export default router;
