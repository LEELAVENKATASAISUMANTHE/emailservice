import Notification from "./models/Notification.js";

export async function upsertPendingNotification(createPayload) {
  await Notification.updateOne(
    { jobId: createPayload.jobId },
    { $setOnInsert: createPayload },
    { upsert: true }
  );

  return Notification.findOne({ jobId: createPayload.jobId }).lean();
}

export async function listNotificationSummaries() {
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

export async function findNotificationByJobId(jobId) {
  return Notification.findOne({ jobId }, { _id: 0 }).lean();
}

export async function updatePendingNotificationToApproved({
  jobId,
  adminMessage,
  adminMessageTextFile,
  attachments,
  approvedAt
}) {
  return Notification.findOneAndUpdate(
    {
      jobId,
      status: "PENDING_APPROVAL"
    },
    {
      $set: {
        status: "APPROVED",
        adminMessage,
        adminMessageTextFile,
        attachments,
        approvedAt
      }
    },
    {
      new: true,
      projection: { _id: 0 }
    }
  ).lean();
}

export async function markApprovedNotificationAsSent(jobId) {
  return Notification.findOneAndUpdate(
    {
      jobId,
      status: "APPROVED"
    },
    {
      $set: {
        status: "SENT"
      }
    },
    {
      new: true,
      projection: { _id: 0 }
    }
  ).lean();
}

export async function updatePendingNotificationToRejected({
  jobId,
  adminMessage,
  adminMessageTextFile,
  rejectedAt
}) {
  return Notification.findOneAndUpdate(
    {
      jobId,
      status: "PENDING_APPROVAL"
    },
    {
      $set: {
        status: "REJECTED",
        adminMessage,
        adminMessageTextFile,
        rejectedAt
      }
    },
    {
      new: true,
      projection: { _id: 0 }
    }
  ).lean();
}

export async function findJobsByIds(jobIds) {
  if (!jobIds || jobIds.length === 0) {
    return [];
  }

  return Notification.find(
    { jobId: { $in: jobIds } },
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
    .lean();
}

export async function findJobsForStudent(studentId) {
  return Notification.find(
    {
      "eligibleStudents.student_id": studentId,
      status: { $in: ["APPROVED", "SENT", "PENDING_APPROVAL"] }
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
    .lean();
}
