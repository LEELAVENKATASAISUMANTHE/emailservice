import * as repo from './notification.repository.js';
import { saveEmailBody, uploadAttachment } from '../../shared/objectStorage.js';
import { sendMessage } from '../../shared/kafka.js';
import { addJobForStudents } from '../../db/redis.js';
import { kafka as kafkaConfig } from '../../config/index.js';

export async function getNotificationSummaries(req, res, next) {
  try {
    const summaries = await repo.listNotificationSummaries();
    res.json(summaries);
  } catch (err) {
    next(err);
  }
}

export async function getNotificationByJobId(req, res, next) {
  try {
    const notification = await repo.findNotificationByJobId(Number(req.params.jobId));
    if (!notification) return res.status(404).json({ error: 'Notification not found' });
    res.json(notification);
  } catch (err) {
    next(err);
  }
}

export async function approveNotification(req, res, next) {
  try {
    const jobId = Number(req.params.jobId);
    const { emailBody, adminMessage } = req.body;

    if (!emailBody) return res.status(400).json({ error: 'emailBody is required' });

    // 1. Save email body to object storage
    const emailBodyRef = await saveEmailBody(jobId, emailBody);

    // 2. Upload attachments
    const files = req.files || [];
    const attachmentPaths = [];
    for (const file of files) {
      const result = await uploadAttachment(jobId, file);
      attachmentPaths.push(result.path);
    }

    // 3. Mark notification as APPROVED in MongoDB
    const notification = await repo.updatePendingToApproved({
      jobId,
      adminMessage: adminMessage || null,
      adminMessageTextFile: emailBodyRef.path,
      attachments: attachmentPaths,
      approvedAt: new Date(),
    });

    if (!notification) {
      return res.status(404).json({
        error: 'Notification not found or not in PENDING_APPROVAL status',
      });
    }

    const students = notification.eligibleStudents || [];
    const deadlineTs = new Date(notification.applicationDeadline).getTime();

    // 4. Store student→job mapping in Redis
    if (students.length > 0) {
      await addJobForStudents(students, notification.jobId, deadlineTs);
      console.log(
        `[notify] stored job ${jobId} in Redis for ${students.length} students`
      );
    }

    // 5. Fan out one Kafka message per eligible student
    for (const student of students) {
      await sendMessage(kafkaConfig.sendTopic, {
        jobId: notification.jobId,
        companyName: notification.companyName,
        studentName: student.full_name,
        studentEmail: student.email,
        emailBodyPath: emailBodyRef.path,
        emailBodyBucket: emailBodyRef.bucket,
        attachments: attachmentPaths,
      });
    }

    console.log(
      `[notify] approved job ${jobId} — queued ${students.length} emails, ${attachmentPaths.length} attachments`
    );

    res.json({
      message: 'Notification approved and emails queued',
      jobId: notification.jobId,
      emailsQueued: students.length,
      attachmentsUploaded: attachmentPaths.length,
      notification,
    });
  } catch (err) {
    next(err);
  }
}

export async function rejectNotification(req, res, next) {
  try {
    const jobId = Number(req.params.jobId);
    const { adminMessage } = req.body;

    const notification = await repo.updatePendingToRejected({
      jobId,
      adminMessage: adminMessage || null,
      rejectedAt: new Date(),
    });

    if (!notification) {
      return res.status(404).json({
        error: 'Notification not found or not in PENDING_APPROVAL status',
      });
    }

    console.log(`[notify] rejected job ${jobId}`);
    res.json({ message: 'Notification rejected', notification });
  } catch (err) {
    next(err);
  }
}

export async function markNotificationAsSent(req, res, next) {
  try {
    const notification = await repo.markApprovedAsSent(Number(req.params.jobId));

    if (!notification) {
      return res.status(404).json({
        error: 'Notification not found or not in APPROVED status',
      });
    }

    res.json({ message: 'Notification marked as sent', notification });
  } catch (err) {
    next(err);
  }
}
