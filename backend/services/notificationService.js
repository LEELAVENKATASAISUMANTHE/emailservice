import * as notificationRepository from "../db/notificationRepository.js";

export const NOTIFICATION_STATUS = Object.freeze({
  PENDING_APPROVAL: "PENDING_APPROVAL",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  SENT: "SENT"
});

export class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

function parseJobId(jobId) {
  const parsed = Number(jobId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError(400, "jobId must be a positive integer.");
  }
  return parsed;
}

function normalizeAdminMessage(adminMessage) {
  return typeof adminMessage === "string" ? adminMessage : "";
}

export async function persistPendingNotification(payload) {
  const createPayload = {
    jobId: payload.jobId,
    companyName: payload.companyName,
    criteria: payload.criteria,
    eligibleStudents: payload.eligibleStudents,
    eligibleCount: payload.eligibleCount,
    applicationDeadline: payload.applicationDeadline,
    status: NOTIFICATION_STATUS.PENDING_APPROVAL,
    adminMessage: null,
    adminMessageTextFile: null,
    attachments: [],
    createdAt: new Date(),
    approvedAt: null,
    rejectedAt: null
  };

  return notificationRepository.upsertPendingNotification(createPayload);
}

export async function listNotifications() {
  return notificationRepository.listNotificationSummaries();
}

export async function getNotificationByJobId(jobId) {
  const parsedJobId = parseJobId(jobId);
  const notification =
    await notificationRepository.findNotificationByJobId(parsedJobId);

  if (!notification) {
    throw new ApiError(404, `Notification for jobId ${parsedJobId} not found.`);
  }

  return notification;
}

async function addApprovedJobToStudentCache(redisClient, notification) {
  const expiryTimestamp = Math.floor(
    new Date(notification.applicationDeadline).getTime() / 1000
  );
  const redisCommands = redisClient.multi();
  let hasAnyStudent = false;

  for (const student of notification.eligibleStudents || []) {
    if (!student?.student_id) {
      continue;
    }

    hasAnyStudent = true;
    redisCommands.zAdd(`student:${student.student_id}:jobs`, [
      {
        score: expiryTimestamp,
        value: String(notification.jobId)
      }
    ]);
  }

  if (hasAnyStudent) {
    await redisCommands.exec();
  }
}

export async function approveNotification(
  { jobId, adminMessage, attachmentFiles },
  { redisClient, kafkaProducer, sendTopic, minioService }
) {
  const parsedJobId = parseJobId(jobId);
  const existing =
    await notificationRepository.findNotificationByJobId(parsedJobId);

  if (!existing) {
    throw new ApiError(404, `Notification for jobId ${parsedJobId} not found.`);
  }

  if (existing.status === NOTIFICATION_STATUS.REJECTED) {
    throw new ApiError(409, "Rejected job cannot be approved.");
  }

  if (
    existing.status === NOTIFICATION_STATUS.APPROVED ||
    existing.status === NOTIFICATION_STATUS.SENT
  ) {
    throw new ApiError(409, "Job is already approved.");
  }

  const safeAdminMessage = normalizeAdminMessage(adminMessage);
  const approvedAt = new Date();

  const [attachmentPaths, adminMessageTextFile] = await Promise.all([
    minioService.uploadAttachmentFiles(parsedJobId, attachmentFiles || []),
    minioService.uploadAdminMessageTextFile(
      parsedJobId,
      "approved",
      safeAdminMessage
    )
  ]);

  const approvedNotification =
    await notificationRepository.updatePendingNotificationToApproved({
      jobId: parsedJobId,
      adminMessage: safeAdminMessage || null,
      adminMessageTextFile,
      attachments: attachmentPaths,
      approvedAt
    });

  if (!approvedNotification) {
    throw new ApiError(
      409,
      "Notification is no longer pending approval. Refresh and retry."
    );
  }

  await addApprovedJobToStudentCache(redisClient, approvedNotification);

  const payload = {
    jobId: approvedNotification.jobId,
    eligibleStudents: approvedNotification.eligibleStudents,
    adminMessage: approvedNotification.adminMessage,
    adminMessageTextFile: approvedNotification.adminMessageTextFile,
    attachments: approvedNotification.attachments,
    approvedAt: approvedAt.toISOString()
  };

  await kafkaProducer.send({
    topic: sendTopic,
    messages: [
      {
        key: String(approvedNotification.jobId),
        value: JSON.stringify(payload)
      }
    ]
  });

  const sentNotification =
    await notificationRepository.markApprovedNotificationAsSent(parsedJobId);

  if (!sentNotification) {
    throw new ApiError(
      500,
      "Notification approved but could not be marked as SENT."
    );
  }

  return sentNotification;
}

export async function rejectNotification(
  { jobId, adminMessage },
  { minioService }
) {
  const parsedJobId = parseJobId(jobId);
  const existing =
    await notificationRepository.findNotificationByJobId(parsedJobId);

  if (!existing) {
    throw new ApiError(404, `Notification for jobId ${parsedJobId} not found.`);
  }

  if (existing.status === NOTIFICATION_STATUS.REJECTED) {
    throw new ApiError(409, "Job is already rejected.");
  }

  if (
    existing.status === NOTIFICATION_STATUS.APPROVED ||
    existing.status === NOTIFICATION_STATUS.SENT
  ) {
    throw new ApiError(409, "Approved job cannot be rejected.");
  }

  const safeAdminMessage = normalizeAdminMessage(adminMessage);
  const rejectedAt = new Date();

  const adminMessageTextFile = await minioService.uploadAdminMessageTextFile(
    parsedJobId,
    "rejected",
    safeAdminMessage
  );

  const rejectedNotification =
    await notificationRepository.updatePendingNotificationToRejected({
      jobId: parsedJobId,
      adminMessage: safeAdminMessage || null,
      adminMessageTextFile,
      rejectedAt
    });

  if (!rejectedNotification) {
    throw new ApiError(
      409,
      "Notification is no longer pending approval. Refresh and retry."
    );
  }

  return rejectedNotification;
}

export async function getActiveJobsForStudent(studentId, { redisClient }) {
  if (!studentId || typeof studentId !== "string") {
    throw new ApiError(400, "studentId is required.");
  }

  const trimmedStudentId = studentId.trim();
  const redisKey = `student:${trimmedStudentId}:jobs`;
  const now = Math.floor(Date.now() / 1000);

  await redisClient.zRemRangeByScore(redisKey, "-inf", now - 1);
  const activeJobIds = await redisClient.zRangeByScore(redisKey, now, "+inf");

  const numericJobIds = activeJobIds
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value));

  const jobs = await notificationRepository.findJobsByIds(numericJobIds);

  return {
    studentId: trimmedStudentId,
    now,
    activeJobIds,
    jobs
  };
}
