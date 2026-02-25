const express = require("express");
const multer = require("multer");
const path = require("path");

const MAX_UPLOAD_FILES = 5;
const uploadDir = path.join(__dirname, "..", "uploads");

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, callback) => {
    const safeName = file.originalname.replace(/\s+/g, "_");
    callback(null, `${Date.now()}_${safeName}`);
  }
});

const upload = multer({ storage });

function createAdminNotificationRouter({
  listNotifications,
  getNotificationByJobId,
  approveNotification,
  rejectNotification
}) {
  const router = express.Router();

  router.get("/", async (_req, res, next) => {
    try {
      const notifications = await listNotifications();
      res.json({
        count: notifications.length,
        data: notifications
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:jobId", async (req, res, next) => {
    try {
      const notification = await getNotificationByJobId(req.params.jobId);
      res.json(notification);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/:jobId/approve",
    upload.array("attachments", MAX_UPLOAD_FILES),
    async (req, res, next) => {
      try {
        const files = req.files || [];
        const attachmentPaths = files.map((file) => `/uploads/${file.filename}`);

        const updated = await approveNotification({
          jobId: req.params.jobId,
          adminMessage: req.body.adminMessage,
          attachments: attachmentPaths
        });

        res.status(200).json({
          message: "Notification approved and published.",
          data: updated
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post("/:jobId/reject", async (req, res, next) => {
    try {
      const updated = await rejectNotification({
        jobId: req.params.jobId,
        adminMessage: req.body.adminMessage
      });

      res.status(200).json({
        message: "Notification rejected.",
        data: updated
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createAdminNotificationRouter };
