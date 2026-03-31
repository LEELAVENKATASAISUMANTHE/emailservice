import { Router } from 'express';
import templateRoutes from './template.routes.js';
import uploadRoutes from './upload.routes.js';

const router = Router();

router.use('/templates', templateRoutes);
router.use('/uploads', uploadRoutes);

export default router;
