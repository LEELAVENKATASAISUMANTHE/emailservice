import { createClient } from "redis";

let client;

export async function connectRedis() {
    if (client && client.isOpen) return client;

    client = createClient({
        url: process.env.REDIS_URL || "redis://redis:6379",
    });

    client.on("error", (err) => console.error("[redis] Error:", err));

    await client.connect();
    console.log("[redis] Connected");
    return client;
}

/**
 * Add a jobId to a student's eligible jobs sorted set.
 * Score = application deadline timestamp (for sorted order).
 *
 * Key: student:{studentId}:jobs
 */
export async function addJobForStudent(studentId, jobId, deadlineTimestamp) {
    const redis = await connectRedis();
    await redis.zAdd(`student:${studentId}:jobs`, {
        score: deadlineTimestamp,
        value: String(jobId),
    });
}

/**
 * Add a jobId for multiple students at once.
 */
export async function addJobForStudents(students, jobId, deadlineTimestamp) {
    const redis = await connectRedis();
    const pipeline = redis.multi();

    for (const student of students) {
        pipeline.zAdd(`student:${student.student_id}:jobs`, {
            score: deadlineTimestamp,
            value: String(jobId),
        });
    }

    await pipeline.exec();
}

/**
 * Get all active jobIds for a student, sorted by deadline (ascending).
 */
export async function getJobsForStudent(studentId) {
    const redis = await connectRedis();
    return redis.zRange(`student:${studentId}:jobs`, 0, -1);
}

/**
 * Remove a job from all students (e.g., when rejected).
 */
export async function removeJobForStudents(students, jobId) {
    const redis = await connectRedis();
    const pipeline = redis.multi();

    for (const student of students) {
        pipeline.zRem(`student:${student.student_id}:jobs`, String(jobId));
    }

    await pipeline.exec();
}
