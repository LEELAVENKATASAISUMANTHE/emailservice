import dotenv from "dotenv";

dotenv.config();

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getOptionalEnv(name, fallback) {
  return process.env[name] || fallback;
}

export const env = {
  PORT: Number(getOptionalEnv("PORT", "4000")),
  MONGO_URI: getRequiredEnv("MONGO_URI"),
  MONGO_DB_NAME: getOptionalEnv("MONGO_DB_NAME", "placement_erp"),
  REDIS_URL: getRequiredEnv("REDIS_URL"),
  KAFKA_CLIENT_ID: getOptionalEnv("KAFKA_CLIENT_ID", "placement-approval-service"),
  KAFKA_BROKERS: getRequiredEnv("KAFKA_BROKERS")
    .split(",")
    .map((broker) => broker.trim())
    .filter(Boolean),
  KAFKA_CONSUMER_GROUP: getOptionalEnv(
    "KAFKA_CONSUMER_GROUP",
    "placement-approval-group"
  ),
  KAFKA_PENDING_TOPIC: getOptionalEnv(
    "KAFKA_PENDING_TOPIC",
    "job.notification.pending"
  ),
  KAFKA_SEND_TOPIC: getOptionalEnv("KAFKA_SEND_TOPIC", "job.notification.send"),
  MINIO_ENDPOINT: getRequiredEnv("MINIO_ENDPOINT"),
  MINIO_ACCESS_KEY: getRequiredEnv("MINIO_ACCESS_KEY"),
  MINIO_SECRET_KEY: getRequiredEnv("MINIO_SECRET_KEY"),
  MINIO_BUCKET: getOptionalEnv("MINIO_BUCKET", "email-bodies")
};
