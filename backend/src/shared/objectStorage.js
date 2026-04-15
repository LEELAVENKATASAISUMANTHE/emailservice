/**
 * Unified object-storage client (MinIO / Cloudflare R2 / any S3-compatible).
 */
import { Client } from 'minio';
import { storage as config } from '../config/index.js';

let minioClient = null;
let bucketEnsured = false;

function isConfigured() {
  return Boolean(
    config.endPoint && config.accessKey && config.secretKey && config.bucket
  );
}

function getClient() {
  if (!minioClient) {
    minioClient = new Client({
      endPoint: config.endPoint,
      port: config.port,
      useSSL: config.useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });
  }
  return minioClient;
}

async function ensureBucket() {
  if (!config.autoCreateBucket || bucketEnsured || !isConfigured()) return;
  const c = getClient();
  const exists = await c.bucketExists(config.bucket);
  if (!exists) {
    await c.makeBucket(config.bucket, config.region);
    console.log(`[storage] bucket "${config.bucket}" created`);
  }
  bucketEnsured = true;
}

// ── Write operations ─────────────────────────────────────────────────────────

/**
 * Upload a Buffer with a given key.
 * Returns the object key on success, null if storage is not configured.
 */
export async function putObject(key, buffer, contentType = 'application/octet-stream') {
  if (!isConfigured()) {
    console.warn('[storage] not configured — skipping upload of:', key);
    return null;
  }
  await ensureBucket();
  await getClient().putObject(config.bucket, key, buffer, buffer.length, {
    'Content-Type': contentType,
  });
  console.log(`[storage] uploaded ${config.bucket}/${key}`);
  return key;
}

/** Save an email body text file. Returns { bucket, path }. */
export async function saveEmailBody(jobId, body) {
  const key = `emails/${jobId}/email-body.txt`;
  const buffer = Buffer.from(body, 'utf-8');
  await putObject(key, buffer, 'text/plain');
  return { bucket: config.bucket, path: key };
}

/** Upload an email attachment (from multer). Returns { bucket, path, filename, contentType, size }. */
export async function uploadAttachment(jobId, file) {
  const key = `emails/${jobId}/attachments/${file.originalname}`;
  await putObject(key, file.buffer, file.mimetype);
  return {
    bucket: config.bucket,
    path: key,
    filename: file.originalname,
    contentType: file.mimetype,
    size: file.size,
  };
}

/** Upload an imported spreadsheet file. Returns the object key or null. */
export async function uploadImportFile(buffer, filename, contentType) {
  const date = new Date().toISOString().slice(0, 10);
  const key = `imports/${date}/${filename}`;
  return putObject(key, buffer, contentType);
}

/** Upload a CSV template. Returns the object key or null. */
export async function uploadTemplate(buffer, tableName) {
  const key = `templates/${tableName}.csv`;
  return putObject(key, buffer, 'text/csv');
}

// ── Read operations ──────────────────────────────────────────────────────────

/** Read a text object and return its contents as a string. */
export async function getTextObject(key) {
  const stream = await getClient().getObject(config.bucket, key);
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    stream.on('error', reject);
  });
}

/** Read a binary object and return { filename, contentType, base64 }. */
export async function getAttachment(key) {
  const c = getClient();
  const stream = await c.getObject(config.bucket, key);
  const stat = await c.statObject(config.bucket, key);

  const buffer = await new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (ch) => chunks.push(ch));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });

  return {
    filename: key.split('/').pop(),
    contentType: stat.metaData?.['content-type'] || 'application/octet-stream',
    base64: buffer.toString('base64'),
  };
}
