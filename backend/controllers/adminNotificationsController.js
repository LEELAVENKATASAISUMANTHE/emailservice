export function createAdminNotificationsController({
  listNotifications,
  getNotificationByJobId,
  approveNotification,
  rejectNotification
}) {
  async function list(req, res, next) {
    try {
      const notifications = await listNotifications();
      res.json({
        count: notifications.length,
        data: notifications
      });
    } catch (error) {
      next(error);
    }
  }

  async function getByJobId(req, res, next) {
    try {
      const notification = await getNotificationByJobId(req.params.jobId);
      res.json(notification);
    } catch (error) {
      next(error);
    }
  }

  async function approve(req, res, next) {
    try {
      const updated = await approveNotification({
        jobId: req.params.jobId,
        adminMessage: req.body.adminMessage,
        attachmentFiles: req.files || []
      });

      res.status(200).json({
        message: "Notification approved and published.",
        data: updated
      });
    } catch (error) {
      next(error);
    }
  }

  async function reject(req, res, next) {
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
  }

  return {
    list,
    getByJobId,
    approve,
    reject
  };
}
