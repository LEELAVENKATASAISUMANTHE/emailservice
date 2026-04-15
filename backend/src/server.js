import 'dotenv/config';
import { server as serverConfig, postgres as postgresConfig } from './config/index.js';
import { connectMongo, disconnectMongo } from './db/mongo.js';
import { connectRedis, disconnectRedis } from './db/redis.js';
import { connectPostgres, disconnectPostgres, getPool } from './db/postgres.js';
import { disconnectProducer } from './shared/kafka.js';
import { startNotificationConsumer, stopNotificationConsumer } from './modules/notifications/notification.consumer.js';
import { startEmailConsumer, stopEmailConsumer } from './shared/emailConsumer.js';
import { ensureImportLogsTable, ensureStudentUserTrigger } from './modules/importer/import.service.js';
import { getTableList, buildCsvTemplate } from './modules/importer/schema.service.js';
import { uploadTemplate } from './shared/objectStorage.js';
import app from './app.js';

const PORT = serverConfig.port;

async function start() {
  // ── MongoDB ──────────────────────────────────────────────────────────────
  await connectMongo();

  // ── Redis ────────────────────────────────────────────────────────────────
  await connectRedis();

  // ── PostgreSQL (optional — importer features only) ───────────────────────
  if (postgresConfig.connectionString) {
    await connectPostgres();

    // Run DDL migrations
    const pool = getPool();
    await ensureImportLogsTable(pool);
    console.log('[startup] import_logs table ready');

    await ensureStudentUserTrigger(pool);
    console.log('[startup] student user trigger cleaned up');

    // Pre-generate CSV templates in background (non-fatal)
    getTableList(pool)
      .then(async (tables) => {
        for (const table of tables) {
          try {
            const csv    = await buildCsvTemplate(pool, table);
            await uploadTemplate(Buffer.from(csv, 'utf-8'), table);
          } catch (err) {
            console.warn(`[startup] template generation failed for ${table}:`, err.message);
          }
        }
      })
      .catch(() => {});
  } else {
    console.warn('[startup] DATABASE_URL not set — PostgreSQL/importer features disabled');
  }

  // ── Kafka consumers ──────────────────────────────────────────────────────
  await startNotificationConsumer().catch((err) =>
    console.error('[startup] notification consumer failed:', err.message)
  );

  await startEmailConsumer().catch((err) =>
    console.error('[startup] email consumer failed:', err.message)
  );

  // ── HTTP server ──────────────────────────────────────────────────────────
  app.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
  });
}

async function shutdown() {
  console.log('[server] shutting down…');
  await Promise.allSettled([
    stopNotificationConsumer(),
    stopEmailConsumer(),
    disconnectProducer(),
    disconnectMongo(),
    disconnectRedis(),
    disconnectPostgres(),
  ]);
  process.exit(0);
}

process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);

start().catch((err) => {
  console.error('[startup] fatal error:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
