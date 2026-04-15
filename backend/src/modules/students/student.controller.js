import { getJobsForStudent } from '../../db/redis.js';
import { findJobsByIds } from '../notifications/notification.repository.js';

export async function getStudentDashboard(req, res, next) {
  try {
    const { studentId } = req.query;

    if (!studentId) {
      return res.status(400).json({ error: 'studentId query parameter is required' });
    }

    // 1. Get active jobIds from Redis sorted set (fast lookup by student)
    const activeJobIds = await getJobsForStudent(studentId);

    // 2. Fetch full job details from MongoDB
    const jobs = activeJobIds.length > 0
      ? await findJobsByIds(activeJobIds.map(Number))
      : [];

    res.json({ studentId, activeJobIds: activeJobIds.map(Number), jobs });
  } catch (err) {
    next(err);
  }
}
