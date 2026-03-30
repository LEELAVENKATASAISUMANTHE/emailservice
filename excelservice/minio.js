import { Client } from 'minio';

const BUCKET = 'excel-service';

const minioClient = new Client({
  endPoint: 'localhost',
  port: 9000,
  useSSL: false,
  accessKey: 'minioadmin',
  secretKey: 'minioadmin',
});

export async function ensureBuckets() {
  try {
    const exists = await minioClient.bucketExists(BUCKET);
    if (!exists) {
      await minioClient.makeBucket(BUCKET, 'us-east-1');
      console.log(`[minio] Bucket "${BUCKET}" created`);
    } else {
      console.log(`[minio] Bucket "${BUCKET}" ready`);
    }
  } catch (err) {
    console.error('[minio] ensureBuckets error:', err.message);
  }
}

/**
 * Upload a .xlsx buffer to excel-templates/{sessionId}/{filename}
 */
export async function uploadTemplate(sessionId, buffer, filename) {
  const objectName = `excel-templates/${sessionId}/${filename}`;
  await minioClient.putObject(BUCKET, objectName, buffer, buffer.length, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  return objectName;
}

/**
 * Returns a 1-hour presigned GET URL for a template object
 */
export async function getPresignedTemplateUrl(objectName) {
  return minioClient.presignedGetObject(BUCKET, objectName, 3600);
}

/**
 * Upload all log lines as a single NDJSON file at import completion
 * excel-logs/{sessionId}/import_{timestamp}.ndjson
 */
export async function uploadLog(sessionId, timestamp, lines) {
  const objectName = `excel-logs/${sessionId}/import_${timestamp}.ndjson`;
  const content = lines.join('\n') + '\n';
  const buffer = Buffer.from(content, 'utf-8');
  await minioClient.putObject(BUCKET, objectName, buffer, buffer.length, {
    'Content-Type': 'application/x-ndjson',
  });
  console.log(`[minio] Log saved: ${objectName}`);
  return objectName;
}

/**
 * Returns a 1-hour presigned GET URL for a log object
 */
export async function getPresignedLogUrl(objectName) {
  return minioClient.presignedGetObject(BUCKET, objectName, 3600);
}

/**
 * Health check — returns true if MinIO is reachable
 */
export async function pingMinio() {
  try {
    await minioClient.listBuckets();
    return true;
  } catch {
    return false;
  }
}
