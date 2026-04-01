import { Router } from 'express';
import {
  listTables,
  getTableColumns,
  getTableRelationships,
  getTablePreview
} from '../controllers/tables.controller.js';

const router = Router();

router.get('/', listTables);
router.get('/:tableName/columns', getTableColumns);
router.get('/:tableName/relationships', getTableRelationships);
router.get('/:tableName/preview', getTablePreview);

export default router;
