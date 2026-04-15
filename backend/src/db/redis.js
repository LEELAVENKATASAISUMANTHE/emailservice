/**
 * Redis client.
 * Used for student→job sorted-set lookups.
 */
import { createClient } from 'redis';
import { redis as config } from '../config/index.js';

let client = null;

export async function connectRedis() {
  if (client && client.isOpen) return client;

  client = createClient({ url: config.url });
  client.on('error', (err) => console.error('[redis] error:', err));
  await client.connect();
  console.log('[redis] connected');
  return client;
}

function getClient() {
  if (!client || !client.isOpen) {
    throw new Error('Redis not connected');
  }
  return client;
}

/** Add a jobId to a student's eligible-jobs sorted set (score = deadline ts). */
export async function addJobForStudents(students, jobId, deadlineTimestamp) {
  const r = getClient();
  const pipeline = r.multi();
  for (const student of students) {
    pipeline.zAdd(`student:${student.student_id}:jobs`, {
      score: deadlineTimestamp,
      value: String(jobId),
    });
  }
  await pipeline.exec();
}

/** Get all active jobIds for a student, sorted by deadline ascending. */
export async function getJobsForStudent(studentId) {
  return getClient().zRange(`student:${studentId}:jobs`, 0, -1);
}

export async function disconnectRedis() {
  if (!client) return;
  await client.quit();
  client = null;
  console.log('[redis] disconnected');
}
