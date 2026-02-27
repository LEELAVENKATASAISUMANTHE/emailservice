import { Router } from "express";
import multer from "multer";
import {
    getNotificationSummaries,
    getNotificationByJobId,
    approveNotification,
    rejectNotification,
    markNotificationAsSent,
} from "../controller/notification.controller.js";

const router = Router();

// Multer config — store files in memory (then upload to MinIO)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
});

// GET  /api/notifications           — list all notification summaries
router.get("/", getNotificationSummaries);

// GET  /api/notifications/:jobId    — get full notification by jobId
router.get("/:jobId", getNotificationByJobId);

// POST /api/notifications/:jobId/approve  — approve & queue emails
// Form fields: emailBody (text), adminMessage (text, optional)
// File field:  attachments (multiple files, optional)
router.post("/:jobId/approve", upload.array("attachments"), approveNotification);

// POST /api/notifications/:jobId/reject   — reject a notification
router.post("/:jobId/reject", rejectNotification);

// POST /api/notifications/:jobId/sent     — mark as sent
router.post("/:jobId/sent", markNotificationAsSent);

export default router;
