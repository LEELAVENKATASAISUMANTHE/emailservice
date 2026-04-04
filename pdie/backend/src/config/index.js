import dotenv from 'dotenv';

dotenv.config();

const required = (value, name) => {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const optionalBoolean = (value, fallback = false) => {
  if (value == null || value === '') {
    return fallback;
  }

  return String(value).toLowerCase() === 'true';
};

export const config = {
  app: {
    port: Number(process.env.PORT) || 4000,
    nodeEnv: process.env.NODE_ENV || 'development',
    startupRetryAttempts: Number(process.env.STARTUP_RETRY_ATTEMPTS) || 30,
    startupRetryDelayMs: Number(process.env.STARTUP_RETRY_DELAY_MS) || 2000,
    corsOrigins: (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5300')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    debugEnabled: optionalBoolean(process.env.PDIE_DEBUG_ENABLED, false),
    debugToken: process.env.PDIE_DEBUG_TOKEN || '',
    frontendUrl: required(process.env.FRONTEND_URL, 'FRONTEND_URL')
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
    clientId: process.env.REDPANDA_CLIENT_ID || 'pdie-backend',
    brokers: required(process.env.REDPANDA_BROKERS, 'REDPANDA_BROKERS')
      .split(',')
      .map((broker) => broker.trim())
      .filter(Boolean),
    topic: process.env.REDPANDA_TOPIC || 'pdie.ingest'
  },
  email: {
    user: required(process.env.EMAIL_USER, 'EMAIL_USER'),
    pass: required(process.env.EMAIL_PASS, 'EMAIL_PASS')
  }
};
