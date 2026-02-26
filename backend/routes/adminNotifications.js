import express from "express";
import multer from "multer";

const MAX_UPLOAD_FILES = 5;
const MAX_UPLOAD_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: MAX_UPLOAD_FILES,
    fileSize: MAX_UPLOAD_FILE_SIZE_BYTES
  }
});

export function createAdminNotificationRouter({ adminNotificationsController }) {
  const router = express.Router();

  router.get("/", adminNotificationsController.list);
  router.get("/:jobId", adminNotificationsController.getByJobId);
  router.post(
    "/:jobId/approve",
    upload.array("attachments", MAX_UPLOAD_FILES),
    adminNotificationsController.approve
  );
  router.post("/:jobId/reject", adminNotificationsController.reject);

  return router;
}
