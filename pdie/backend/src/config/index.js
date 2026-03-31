import dotenv from 'dotenv';

dotenv.config();

const required = (value, name) => {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

export const config = {
  app: {
    port: Number(process.env.PORT) || 8080,
    nodeEnv: process.env.NODE_ENV || 'development',
    startupRetryAttempts: Number(process.env.STARTUP_RETRY_ATTEMPTS) || 30,
    startupRetryDelayMs: Number(process.env.STARTUP_RETRY_DELAY_MS) || 2000
  },
  postgres: {
    connectionString: required(process.env.POSTGRES_URL, 'POSTGRES_URL'),
    schema: process.env.POSTGRES_SCHEMA || 'public'
  },
  mongo: {
    uri: required(process.env.MONGODB_URI, 'MONGODB_URI')
  },
  minio: {
    endPoint: required(process.env.MINIO_ENDPOINT, 'MINIO_ENDPOINT'),
    port: Number(process.env.MINIO_PORT) || 9000,
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: required(process.env.MINIO_ACCESS_KEY, 'MINIO_ACCESS_KEY'),
    secretKey: required(process.env.MINIO_SECRET_KEY, 'MINIO_SECRET_KEY'),
    buckets: {
      templates: process.env.MINIO_TEMPLATES_BUCKET || 'templates',
      uploads: process.env.MINIO_UPLOADS_BUCKET || 'uploads',
      processed: process.env.MINIO_PROCESSED_BUCKET || 'processed',
      failed: process.env.MINIO_FAILED_BUCKET || 'failed'
    }
  },
  redpanda: {
    clientId: process.env.REDPANDA_CLIENT_ID || 'pdie-backend',
    brokers: required(process.env.REDPANDA_BROKERS, 'REDPANDA_BROKERS').split(',').map((broker) => broker.trim()).filter(Boolean),
    uploadTopic: process.env.REDPANDA_UPLOAD_TOPIC || 'pdie.uploads'
  }
};
