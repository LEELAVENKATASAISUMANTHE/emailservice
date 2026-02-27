import * as notificationRepository from "../db/notificationRepository.js";

export const getStudentDashboard = async (req, res) => {
    try {
        const { studentId } = req.query;

        if (!studentId) {
            return res.status(400).json({ error: "studentId query parameter is required" });
        }

        const jobs = await notificationRepository.findJobsForStudent(studentId);

        res.json({
            studentId,
            activeJobIds: jobs.map(j => j.jobId),
            jobs,
        });
    } catch (error) {
        console.error("Error fetching student dashboard:", error);
        res.status(500).json({ error: "Failed to fetch student dashboard" });
    }
};
