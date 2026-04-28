import { Router } from 'express';
import multer from 'multer';
import {
  getNotificationSummaries,
  getNotificationByJobId,
  getNotificationEmailBody,
  approveNotification,
  rejectNotification,
  markNotificationAsSent,
} from './notification.controller.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
});

// GET  /api/notifications
router.get('/', getNotificationSummaries);

// GET  /api/notifications/:jobId
router.get('/:jobId', getNotificationByJobId);

// GET /api/notifications/:jobId/email-body
router.get('/:jobId/email-body', getNotificationEmailBody);

// POST /api/notifications/:jobId/approve
router.post('/:jobId/approve', upload.array('attachments'), approveNotification);

// POST /api/notifications/:jobId/reject
router.post('/:jobId/reject', rejectNotification);

// POST /api/notifications/:jobId/sent
router.post('/:jobId/sent', markNotificationAsSent);

export default router;
