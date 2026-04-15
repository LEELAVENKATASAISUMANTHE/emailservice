/**
 * Notification repository — all MongoDB reads/writes for notifications.
 */
import { getNotificationDb } from '../../db/mongo.js';

const COLLECTION = 'notifications';

function col() {
  return getNotificationDb().collection(COLLECTION);
}

const SUMMARY_PROJECTION = {
  _id: 0,
  jobId: 1,
  companyName: 1,
  eligibleCount: 1,
  status: 1,
  applicationDeadline: 1,
  createdAt: 1,
  approvedAt: 1,
  rejectedAt: 1,
};

export async function upsertPendingNotification(payload) {
  await col().updateOne(
    { jobId: payload.jobId },
    { $setOnInsert: payload },
    { upsert: true }
  );
  return col().findOne({ jobId: payload.jobId }, { projection: { _id: 0 } });
}

export async function listNotificationSummaries() {
  return col()
    .find({}, { projection: SUMMARY_PROJECTION })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function findNotificationByJobId(jobId) {
  return col().findOne({ jobId }, { projection: { _id: 0 } });
}

export async function updatePendingToApproved({
  jobId,
  adminMessage,
  adminMessageTextFile,
  attachments,
  approvedAt,
}) {
  return col().findOneAndUpdate(
    { jobId, status: 'PENDING_APPROVAL' },
    {
      $set: {
        status: 'APPROVED',
        adminMessage,
        adminMessageTextFile,
        attachments,
        approvedAt,
      },
    },
    { returnDocument: 'after', projection: { _id: 0 } }
  );
}

export async function updatePendingToRejected({
  jobId,
  adminMessage,
  rejectedAt,
}) {
  return col().findOneAndUpdate(
    { jobId, status: 'PENDING_APPROVAL' },
    {
      $set: {
        status: 'REJECTED',
        adminMessage,
        rejectedAt,
      },
    },
    { returnDocument: 'after', projection: { _id: 0 } }
  );
}

export async function markApprovedAsSent(jobId) {
  return col().findOneAndUpdate(
    { jobId, status: 'APPROVED' },
    { $set: { status: 'SENT' } },
    { returnDocument: 'after', projection: { _id: 0 } }
  );
}

export async function findJobsByIds(jobIds) {
  if (!jobIds || jobIds.length === 0) return [];
  return col()
    .find(
      { jobId: { $in: jobIds } },
      {
        projection: {
          _id: 0,
          jobId: 1,
          companyName: 1,
          eligibleCount: 1,
          applicationDeadline: 1,
          status: 1,
        },
      }
    )
    .sort({ applicationDeadline: 1 })
    .toArray();
}
