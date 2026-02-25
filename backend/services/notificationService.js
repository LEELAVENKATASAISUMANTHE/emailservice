const Notification = require("../models/Notification");

const NOTIFICATION_STATUS = Object.freeze({
  PENDING_APPROVAL: "PENDING_APPROVAL",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  SENT: "SENT"
});

class ApiError extends Error {
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

async function persistPendingNotification(payload) {
  const createPayload = {
    jobId: payload.jobId,
    companyName: payload.companyName,
    criteria: payload.criteria,
    eligibleStudents: payload.eligibleStudents,
    eligibleCount: payload.eligibleCount,
    applicationDeadline: payload.applicationDeadline,
    status: NOTIFICATION_STATUS.PENDING_APPROVAL,
    adminMessage: null,
    attachments: null,
    createdAt: new Date(),
    approvedAt: null,
    rejectedAt: null
  };

  await Notification.updateOne(
    { jobId: payload.jobId },
    {
      $setOnInsert: createPayload
    },
    { upsert: true }
  );

  return Notification.findOne({ jobId: payload.jobId }).lean();
}

async function listNotifications() {
  return Notification.find(
    {},
    {
      _id: 0,
      jobId: 1,
      companyName: 1,
      eligibleCount: 1,
      status: 1,
      applicationDeadline: 1,
      createdAt: 1,
      approvedAt: 1,
      rejectedAt: 1
    }
  )
    .sort({ createdAt: -1 })
    .lean();
}

async function getNotificationByJobId(jobId) {
  const parsedJobId = parseJobId(jobId);
  const notification = await Notification.findOne(
    { jobId: parsedJobId },
    {
      _id: 0
    }
  ).lean();

  if (!notification) {
    throw new ApiError(404, `Notification for jobId ${parsedJobId} not found.`);
  }

  return notification;
}

async function approveNotification(
  { jobId, adminMessage, attachments },
  { redisClient, kafkaProducer, sendTopic }
) {
  const parsedJobId = parseJobId(jobId);
  const existing = await Notification.findOne({ jobId: parsedJobId });

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

  const approvedAt = new Date();

  const updated = await Notification.findOneAndUpdate(
    {
      jobId: parsedJobId,
      status: NOTIFICATION_STATUS.PENDING_APPROVAL
    },
    {
      $set: {
        status: NOTIFICATION_STATUS.APPROVED,
        adminMessage: adminMessage || null,
        attachments: attachments && attachments.length > 0 ? attachments : null,
        approvedAt
      }
    },
    {
      new: true
    }
  );

  if (!updated) {
    throw new ApiError(
      409,
      "Notification is no longer pending approval. Refresh and retry."
    );
  }

  const expiryTimestamp = Math.floor(
    new Date(updated.applicationDeadline).getTime() / 1000
  );
  const redisCommands = redisClient.multi();

  for (const student of updated.eligibleStudents) {
    if (!student?.student_id) {
      continue;
    }

    redisCommands.zAdd(`student:${student.student_id}:jobs`, [
      {
        score: expiryTimestamp,
        value: String(updated.jobId)
      }
    ]);
  }

  if (updated.eligibleStudents.length > 0) {
    await redisCommands.exec();
  }

  const payload = {
    jobId: updated.jobId,
    eligibleStudents: updated.eligibleStudents,
    adminMessage: updated.adminMessage,
    attachments: updated.attachments,
    approvedAt: approvedAt.toISOString()
  };

  await kafkaProducer.send({
    topic: sendTopic,
    messages: [
      {
        key: String(updated.jobId),
        value: JSON.stringify(payload)
      }
    ]
  });

  updated.status = NOTIFICATION_STATUS.SENT;
  await updated.save();

  return updated.toObject({ versionKey: false });
}

async function rejectNotification({ jobId, adminMessage }) {
  const parsedJobId = parseJobId(jobId);
  const existing = await Notification.findOne({ jobId: parsedJobId });

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

  const rejectedAt = new Date();

  const updated = await Notification.findOneAndUpdate(
    {
      jobId: parsedJobId,
      status: NOTIFICATION_STATUS.PENDING_APPROVAL
    },
    {
      $set: {
        status: NOTIFICATION_STATUS.REJECTED,
        adminMessage: adminMessage || null,
        rejectedAt
      }
    },
    {
      new: true
    }
  );

  if (!updated) {
    throw new ApiError(
      409,
      "Notification is no longer pending approval. Refresh and retry."
    );
  }

  return updated.toObject({ versionKey: false });
}

async function getActiveJobsForStudent(studentId, { redisClient }) {
  if (!studentId || typeof studentId !== "string") {
    throw new ApiError(400, "studentId is required.");
  }

  const trimmedId = studentId.trim();
  const redisKey = `student:${trimmedId}:jobs`;
  const now = Math.floor(Date.now() / 1000);

  await redisClient.zRemRangeByScore(redisKey, "-inf", now - 1);
  const activeJobIds = await redisClient.zRangeByScore(redisKey, now, "+inf");

  const numericJobIds = activeJobIds
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value));

  const jobs =
    numericJobIds.length > 0
      ? await Notification.find(
          {
            jobId: { $in: numericJobIds }
          },
          {
            _id: 0,
            jobId: 1,
            companyName: 1,
            eligibleCount: 1,
            applicationDeadline: 1,
            status: 1
          }
        )
          .sort({ applicationDeadline: 1 })
          .lean()
      : [];

  return {
    studentId: trimmedId,
    now,
    activeJobIds,
    jobs
  };
}

module.exports = {
  NOTIFICATION_STATUS,
  ApiError,
  persistPendingNotification,
  listNotifications,
  getNotificationByJobId,
  approveNotification,
  rejectNotification,
  getActiveJobsForStudent
};
