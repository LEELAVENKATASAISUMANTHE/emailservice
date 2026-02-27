import { Client } from "minio";

const minioUrl = new URL(process.env.MINIO_ENDPOINT || "http://minio:9000");

const minioClient = new Client({
    endPoint: minioUrl.hostname,
    port: Number(minioUrl.port) || 9000,
    useSSL: minioUrl.protocol === "https:",
    accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
    secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
});

const bucketName = process.env.MINIO_BUCKET || "email-bodies";

/**
 * Fetch the email body text from MinIO
 */
export async function getEmailBody(objectPath) {
    const stream = await minioClient.getObject(bucketName, objectPath);

    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        stream.on("error", reject);
    });
}

/**
 * Fetch an attachment from MinIO and return as base64 + metadata
 */
export async function getAttachment(objectPath) {
    const stream = await minioClient.getObject(bucketName, objectPath);
    const stat = await minioClient.statObject(bucketName, objectPath);

    const buffer = await new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
        stream.on("error", reject);
    });

    // Extract filename from path: "emails/123/attachments/resume.pdf" → "resume.pdf"
    const filename = objectPath.split("/").pop();

    return {
        filename,
        contentType: stat.metaData?.["content-type"] || "application/octet-stream",
        base64: buffer.toString("base64"),
    };
}
