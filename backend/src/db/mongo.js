/**
 * MongoDB connection.
 * Single client; two logical databases:
 *   - notificationDb  (placement_erp)  — job notifications
 *   - importerDb      (db_importer)    — import logs + temp passwords
 */
import { MongoClient } from 'mongodb';
import { mongo as config } from '../config/index.js';

let client = null;

export async function connectMongo() {
  if (client) return;
  client = new MongoClient(config.uri);
  await client.connect();
  console.log(`[mongo] connected → ${config.uri}`);

  // TTL index on importer temp passwords
  await client
    .db(config.importerDb)
    .collection('student_temp_passwords')
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    .catch(() => {});
}

export function getNotificationDb() {
  if (!client) throw new Error('MongoDB not connected');
  return client.db(config.notificationDb);
}

export function getImporterDb() {
  if (!client) throw new Error('MongoDB not connected');
  return client.db(config.importerDb);
}

/** Used by /api/mongo/status */
export async function getMongoStatus() {
  if (!client) {
    return { connected: false, uri: config.uri, databases: [] };
  }
  try {
    const admin = client.db().admin();
    const { databases } = await admin.listDatabases();
    return {
      connected: true,
      uri: config.uri,
      activeDb: config.importerDb,
      databases: databases.map((d) => ({
        name: d.name,
        sizeOnDisk: d.sizeOnDisk,
      })),
    };
  } catch (err) {
    return { connected: false, error: err.message, databases: [] };
  }
}

export async function disconnectMongo() {
  if (!client) return;
  await client.close();
  client = null;
  console.log('[mongo] disconnected');
}
