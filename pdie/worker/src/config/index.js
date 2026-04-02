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
    nodeEnv: process.env.NODE_ENV || 'development',
    startupRetryAttempts: Number(process.env.STARTUP_RETRY_ATTEMPTS) || 30,
    startupRetryDelayMs: Number(process.env.STARTUP_RETRY_DELAY_MS) || 2000
  },
  postgres: {
    connectionString: required(process.env.PG_CONNECTION_STRING, 'PG_CONNECTION_STRING'),
    schema: 'public'
  },
  mongo: {
    uri: required(process.env.MONGO_URI, 'MONGO_URI')
  },
  minio: {
    endPoint: required(process.env.MINIO_ENDPOINT, 'MINIO_ENDPOINT'),
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: required(process.env.MINIO_ACCESS_KEY, 'MINIO_ACCESS_KEY'),
    secretKey: required(process.env.MINIO_SECRET_KEY, 'MINIO_SECRET_KEY'),
    bucket: 'pdie-files'
  },
  redpanda: {
    clientId: process.env.REDPANDA_WORKER_CLIENT_ID || 'pdie-worker',
    groupId: process.env.REDPANDA_WORKER_GROUP_ID || 'pdie-workers',
    brokers: required(process.env.REDPANDA_BROKERS, 'REDPANDA_BROKERS').split(',').map((broker) => broker.trim()).filter(Boolean),
    topic: process.env.REDPANDA_TOPIC || 'pdie.ingest'
  }
};
