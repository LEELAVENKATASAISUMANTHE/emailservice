import { Router } from 'express';
import { listTables } from '../controllers/tables.controller.js';

const router = Router();

router.get('/', listTables);

export default router;
