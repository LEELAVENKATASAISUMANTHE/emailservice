import * as notificationRepository from "../db/notificationRepository.js";
import { saveJobEmailBody, uploadAttachment } from "../utils/minio.js";
import { connectProducer, sendMessage } from "../utils/kafka.js";
import { addJobForStudents } from "../utils/redis.js";

export const getNotificationSummaries = async (req, res) => {
    try {
        const summaries = await notificationRepository.listNotificationSummaries();
        res.json(summaries);
    } catch (error) {
        console.error("Error fetching notification summaries:", error);
        res.status(500).json({ error: "Failed to fetch notification summaries" });
    }
};

export const getNotificationByJobId = async (req, res) => {
    try {
        const { jobId } = req.params;
        const notification = await notificationRepository.findNotificationByJobId(jobId);
        if (!notification) {
            return res.status(404).json({ error: "Notification not found" });
        }
        res.json(notification);
    } catch (error) {
        console.error("Error fetching notification:", error);
        res.status(500).json({ error: "Failed to fetch notification" });
    }
};

export const approveNotification = async (req, res) => {
    try {
        const { jobId } = req.params;
        const { emailBody, adminMessage } = req.body;

        if (!emailBody) {
            return res.status(400).json({ error: "emailBody is required" });
        }

        // 1. Save email body to MinIO
        const minioResult = await saveJobEmailBody(jobId, emailBody);

        // 2. Upload attachments to MinIO (if any)
        const files = req.files || [];
        const attachmentPaths = [];

        for (const file of files) {
            const result = await uploadAttachment(jobId, file);
            attachmentPaths.push(result.path);
        }

        // 3. Update notification status to APPROVED in MongoDB
        const notification = await notificationRepository.updatePendingNotificationToApproved({
            jobId: Number(jobId),
            adminMessage: adminMessage || null,
            adminMessageTextFile: minioResult.path,
            attachments: attachmentPaths,
            approvedAt: new Date(),
        });

        if (!notification) {
            return res.status(404).json({ error: "Notification not found or not in PENDING_APPROVAL status" });
        }

        const eligibleStudents = notification.eligibleStudents || [];
        const deadlineTs = new Date(notification.applicationDeadline).getTime();

        // 4. Store student → jobId mapping in Redis sorted set
        if (eligibleStudents.length > 0) {
            await addJobForStudents(eligibleStudents, notification.jobId, deadlineTs);
            console.log(`📌 Stored job ${jobId} in Redis for ${eligibleStudents.length} students`);
        }

        // 5. Connect producer and fan out one message per eligible student
        await connectProducer();

        for (const student of eligibleStudents) {
            await sendMessage("job.notification.send", {
                jobId: notification.jobId,
                companyName: notification.companyName,
                studentName: student.full_name,
                studentEmail: student.email,
                emailBodyPath: minioResult.path,
                emailBodyBucket: minioResult.bucket,
                attachments: attachmentPaths,
            });
        }

        console.log(`✅ Approved job ${jobId} — queued ${eligibleStudents.length} emails, ${attachmentPaths.length} attachments`);

        res.json({
            message: "Notification approved and emails queued",
            jobId: notification.jobId,
            emailsQueued: eligibleStudents.length,
            attachmentsUploaded: attachmentPaths.length,
            notification,
        });
    } catch (error) {
        console.error("Error approving notification:", error);
        res.status(500).json({ error: "Failed to approve notification" });
    }
};

export const rejectNotification = async (req, res) => {
    try {
        const { jobId } = req.params;
        const { adminMessage } = req.body;

        const notification = await notificationRepository.updatePendingNotificationToRejected({
            jobId: Number(jobId),
            adminMessage: adminMessage || null,
            adminMessageTextFile: null,
            rejectedAt: new Date(),
        });

        if (!notification) {
            return res.status(404).json({ error: "Notification not found or not in PENDING_APPROVAL status" });
        }

        console.log(`❌ Rejected job ${jobId}`);

        res.json({
            message: "Notification rejected",
            notification,
        });
    } catch (error) {
        console.error("Error rejecting notification:", error);
        res.status(500).json({ error: "Failed to reject notification" });
    }
};

export const markNotificationAsSent = async (req, res) => {
    try {
        const { jobId } = req.params;

        const notification = await notificationRepository.markApprovedNotificationAsSent(Number(jobId));

        if (!notification) {
            return res.status(404).json({ error: "Notification not found or not in APPROVED status" });
        }

        res.json({
            message: "Notification marked as sent",
            notification,
        });
    } catch (error) {
        console.error("Error marking notification as sent:", error);
        res.status(500).json({ error: "Failed to mark notification as sent" });
    }
};