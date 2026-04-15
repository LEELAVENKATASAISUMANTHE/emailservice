/**
 * Central configuration.
 * All process.env reads happen here — the rest of the app imports from this module.
 */

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function getEnv(name, defaultValue = '') {
  return process.env[name] || defaultValue;
}

function parseBoolean(value, defaultValue = false) {
  if (typeof value !== 'string' || !value.trim()) return defaultValue;
  return value.trim().toLowerCase() === 'true';
}

function getFirstEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

// ── Server ──────────────────────────────────────────────────────────────────
export const server = {
  port: parseInt(getEnv('PORT', '4000'), 10),
  nodeEnv: getEnv('NODE_ENV', 'development'),
  allowedOrigins: getEnv('ALLOWED_ORIGINS', '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
};

// ── MongoDB ──────────────────────────────────────────────────────────────────
export const mongo = {
  uri: getEnv('MONGO_URI', 'mongodb://mongodb:27017'),
  notificationDb: getEnv('MONGO_DB_NAME', 'placement_erp'),
  importerDb: getEnv('MONGO_IMPORTER_DB', 'db_importer'),
};

// ── PostgreSQL ───────────────────────────────────────────────────────────────
export const postgres = {
  connectionString: getEnv('DATABASE_URL', ''),
};

// ── Redis ────────────────────────────────────────────────────────────────────
export const redis = {
  url: getEnv('REDIS_URL', 'redis://redis:6379'),
};

// ── Kafka ────────────────────────────────────────────────────────────────────
export const kafka = {
  clientId: getEnv('KAFKA_CLIENT_ID', 'placement-erp-backend'),
  brokers: getEnv('KAFKA_BROKERS', 'redpanda:9092')
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean),
  pendingTopic: getEnv('KAFKA_PENDING_TOPIC', 'job.notification.pending'),
  sendTopic: getEnv('KAFKA_SEND_TOPIC', 'job.notification.send'),
  notificationConsumerGroup: getEnv(
    'KAFKA_CONSUMER_GROUP',
    'placement-approval-group'
  ),
  emailConsumerGroup: getEnv(
    'KAFKA_EMAIL_CONSUMER_GROUP',
    'placement-email-consumer-group'
  ),
  emailConsumerEnabled: parseBoolean(
    getEnv('EMAIL_CONSUMER_ENABLED', 'true'),
    true
  ),
};

// ── Object Storage (MinIO / R2) ──────────────────────────────────────────────
function resolveStorageConfig() {
  const rawEndpoint = getFirstEnv(
    'OBJECT_STORAGE_ENDPOINT',
    'R2_ENDPOINT',
    'MINIO_ENDPOINT'
  );
  const rawUseSSL = getFirstEnv(
    'OBJECT_STORAGE_USE_SSL',
    'R2_USE_SSL',
    'MINIO_USE_SSL'
  );
  const rawPort = getFirstEnv(
    'OBJECT_STORAGE_PORT',
    'R2_PORT',
    'MINIO_PORT'
  );

  let endPoint = '';
  let useSSL = parseBoolean(rawUseSSL, true);
  let port = useSSL ? 443 : 80;

  if (rawEndpoint) {
    try {
      const url = new URL(
        rawEndpoint.startsWith('http') ? rawEndpoint : `https://${rawEndpoint}`
      );
      endPoint = url.hostname;
      useSSL = rawUseSSL
        ? parseBoolean(rawUseSSL, url.protocol === 'https:')
        : url.protocol === 'https:';
      port = rawPort
        ? parseInt(rawPort, 10)
        : url.port
        ? parseInt(url.port, 10)
        : useSSL ? 443 : 80;
    } catch {
      endPoint = rawEndpoint;
      port = rawPort ? parseInt(rawPort, 10) : useSSL ? 443 : 80;
    }
  }

  return {
    endPoint,
    port,
    useSSL,
    accessKey: getFirstEnv(
      'OBJECT_STORAGE_ACCESS_KEY',
      'R2_ACCESS_KEY_ID',
      'MINIO_ACCESS_KEY'
    ),
    secretKey: getFirstEnv(
      'OBJECT_STORAGE_SECRET_KEY',
      'R2_SECRET_ACCESS_KEY',
      'MINIO_SECRET_KEY'
    ),
    bucket: getFirstEnv(
      'OBJECT_STORAGE_BUCKET',
      'R2_BUCKET',
      'MINIO_BUCKET'
    ) || 'placement-erp-assets',
    autoCreateBucket: parseBoolean(
      getFirstEnv(
        'OBJECT_STORAGE_AUTO_CREATE_BUCKET',
        'R2_AUTO_CREATE_BUCKET',
        'MINIO_AUTO_CREATE_BUCKET'
      ),
      false
    ),
    region: getFirstEnv(
      'OBJECT_STORAGE_REGION',
      'R2_REGION',
      'MINIO_REGION'
    ) || 'us-east-1',
  };
}

export const storage = resolveStorageConfig();

// ── Email (ZeptoMail) ────────────────────────────────────────────────────────
export const email = {
  apiUrl: getEnv(
    'ZEPTOMAIL_API_URL',
    'https://api.zeptomail.in/v1.1/email'
  ),
  token: getEnv('ZEPTOMAIL_TOKEN', ''),
  fromEmail: getEnv('FROM_EMAIL', ''),
  fromName: getEnv('FROM_NAME', 'Placement Cell'),
};
