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
    nodeEnv: process.env.NODE_ENV || 'development'
  },
  postgres: {
    connectionString: required(process.env.POSTGRES_URL, 'POSTGRES_URL'),
    schema: process.env.POSTGRES_SCHEMA || 'public'
  },
  mongo: {
    uri: required(process.env.MONGODB_URI, 'MONGODB_URI')
  },
  redpanda: {
    clientId: process.env.REDPANDA_WORKER_CLIENT_ID || 'pdie-worker',
    groupId: process.env.REDPANDA_WORKER_GROUP_ID || 'pdie-workers',
    brokers: required(process.env.REDPANDA_BROKERS, 'REDPANDA_BROKERS').split(',').map((broker) => broker.trim()).filter(Boolean),
    uploadTopic: process.env.REDPANDA_UPLOAD_TOPIC || 'pdie.uploads'
  }
};
