import { Client } from 'minio';
import { config } from '../config/index.js';

const minioClient = new Client({
  endPoint: config.minio.endPoint,
  port: config.minio.port,
  useSSL: config.minio.useSSL,
  accessKey: config.minio.accessKey,
  secretKey: config.minio.secretKey
});

export const ensureBuckets = async () => {
  const bucketNames = Object.values(config.minio.buckets);
  for (const bucket of bucketNames) {
    const exists = await minioClient.bucketExists(bucket).catch((err) => {
      if (err.code === 'NoSuchBucket') {
        return false;
      }
      throw err;
    });
    if (!exists) {
      await minioClient.makeBucket(bucket, '');
    }
  }
};

export const uploadBuffer = async ({ bucket, objectName, buffer, metadata }) => {
  await minioClient.putObject(bucket, objectName, buffer, {
    'Content-Type': metadata?.contentType || 'application/octet-stream',
    ...metadata
  });
  return { bucket, objectName };
};

export const uploadStream = async ({ bucket, objectName, stream, size, metadata }) => {
  await minioClient.putObject(bucket, objectName, stream, size || undefined, {
    'Content-Type': metadata?.contentType || 'application/octet-stream',
    ...metadata
  });
  return { bucket, objectName };
};

export const getObjectStream = async (bucket, objectName) => minioClient.getObject(bucket, objectName);

export { minioClient };
