import * as minio from "minio";
import { env } from "../config/env.js";

const { Client } = minio;

let client;

function parseMinioEndpoint(endpointValue) {
  const normalizedEndpoint = endpointValue.startsWith("http://") ||
    endpointValue.startsWith("https://")
    ? endpointValue
    : `http://${endpointValue}`;

  const parsedUrl = new URL(normalizedEndpoint);

  return {
    endPoint: parsedUrl.hostname,
    port: Number(parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80)),
    useSSL: parsedUrl.protocol === "https:"
  };
}

function sanitizeFileName(fileName) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function buildObjectName(prefix, fileName) {
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const safeFileName = sanitizeFileName(fileName);
  return `${prefix}-${Date.now()}-${randomSuffix}-${safeFileName}`;
}

function buildFileApiPath(objectName) {
  return `/api/files/${encodeURIComponent(objectName)}`;
}

function getObjectNameFromApiPath(apiPath) {
  const prefix = "/api/files/";

  if (!apiPath || typeof apiPath !== "string" || !apiPath.startsWith(prefix)) {
    throw new Error("Invalid file path.");
  }

  return decodeURIComponent(apiPath.slice(prefix.length));
}

export async function connectMinio() {
  const { endPoint, port, useSSL } = parseMinioEndpoint(env.MINIO_ENDPOINT);

  client = new Client({
    endPoint,
    port,
    useSSL,
    accessKey: env.MINIO_ACCESS_KEY,
    secretKey: env.MINIO_SECRET_KEY
  });

  const bucketExists = await client.bucketExists(env.MINIO_BUCKET);
  if (!bucketExists) {
    await client.makeBucket(env.MINIO_BUCKET);
    console.log(`[minio] bucket created: ${env.MINIO_BUCKET}`);
  }

  console.log(`[minio] connected to bucket: ${env.MINIO_BUCKET}`);
  return client;
}

export function getMinioClient() {
  if (!client) {
    throw new Error("MinIO client not initialized. Call connectMinio() first.");
  }

  return client;
}

export async function disconnectMinio() {
  client = null;
  console.log("[minio] disconnected");
}

export async function uploadAttachmentFiles(jobId, files) {
  const minioClient = getMinioClient();
  const uploadPaths = [];

  for (const file of files || []) {
    if (!file || !file.buffer || !file.originalname) {
      continue;
    }

    const objectName = buildObjectName(
      `job-${jobId}-attachment`,
      file.originalname
    );

    await minioClient.putObject(
      env.MINIO_BUCKET,
      objectName,
      file.buffer,
      file.buffer.length,
      {
        "Content-Type": file.mimetype || "application/octet-stream"
      }
    );

    uploadPaths.push(buildFileApiPath(objectName));
  }

  return uploadPaths;
}

export async function uploadAdminMessageTextFile(jobId, action, adminMessage) {
  const messageText =
    typeof adminMessage === "string" ? adminMessage : "";

  if (!messageText.trim()) {
    return null;
  }

  const minioClient = getMinioClient();
  const objectName = buildObjectName(
    `job-${jobId}-${action}-message`,
    "message.txt"
  );
  const messageBuffer = Buffer.from(messageText, "utf8");

  await minioClient.putObject(
    env.MINIO_BUCKET,
    objectName,
    messageBuffer,
    messageBuffer.length,
    {
      "Content-Type": "text/plain; charset=utf-8"
    }
  );

  return buildFileApiPath(objectName);
}

export async function getFileStreamByApiPath(apiPath) {
  const minioClient = getMinioClient();
  const objectName = getObjectNameFromApiPath(apiPath);
  return minioClient.getObject(env.MINIO_BUCKET, objectName);
}

export async function getFileStatByApiPath(apiPath) {
  const minioClient = getMinioClient();
  const objectName = getObjectNameFromApiPath(apiPath);
  return minioClient.statObject(env.MINIO_BUCKET, objectName);
}
