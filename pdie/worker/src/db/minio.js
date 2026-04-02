import { Client } from 'minio';
import { config } from '../config/index.js';

export const minioClient = new Client({
  endPoint: config.minio.endPoint,
  port: config.minio.port,
  useSSL: config.minio.useSSL,
  accessKey: config.minio.accessKey,
  secretKey: config.minio.secretKey
});

const streamToBuffer = async (stream) => {
  const chunks = [];

  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
};

export const ensureBucket = async (name) => {
  const exists = await minioClient.bucketExists(name).catch((error) => {
    if (error?.code === 'NoSuchBucket') {
      return false;
    }
    throw error;
  });

  if (!exists) {
    await minioClient.makeBucket(name);
  }
};

export const getObjectBuffer = async (objectName) => {
  const stream = await minioClient.getObject(config.minio.bucket, objectName);
  return streamToBuffer(stream);
};
