import * as notificationRepository from "../db/notificationRepository.js";
import { getJobsForStudent } from "../utils/redis.js";

export const getStudentDashboard = async (req, res) => {
    try {
        const { studentId } = req.query;

        if (!studentId) {
            return res.status(400).json({ error: "studentId query parameter is required" });
        }

        // 1. Get active jobIds from Redis sorted set (fast lookup)
        const activeJobIds = await getJobsForStudent(studentId);

        // 2. Fetch job details from MongoDB for those jobIds
        const jobs = activeJobIds.length > 0
            ? await notificationRepository.findJobsByIds(activeJobIds.map(Number))
            : [];

        res.json({
            studentId,
            activeJobIds: activeJobIds.map(Number),
            jobs,
        });
    } catch (error) {
        console.error("Error fetching student dashboard:", error);
        res.status(500).json({ error: "Failed to fetch student dashboard" });
    }
};
