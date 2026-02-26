import express from "express";
import cors from "cors";

import { env } from "./config/env.js";
import { connectMongo, disconnectMongo } from "./db/mongo.js";
import { connectRedis, disconnectRedis } from "./utils/redis.js";
import { createKafkaClients } from "./utils/kafka.js";
import {
  connectMinio,
  disconnectMinio,
  uploadAttachmentFiles,
  uploadAdminMessageTextFile,
  getFileStreamByApiPath,
  getFileStatByApiPath
} from "./utils/minio.js";
import {
  createAdminNotificationRouter
} from "./routes/adminNotifications.js";
import {
  createStudentDashboardRouter
} from "./routes/studentDashboard.js";
import { createFilesRouter } from "./routes/files.js";
import {
  createAdminNotificationsController
} from "./controllers/adminNotificationsController.js";
import {
  createStudentDashboardController
} from "./controllers/studentDashboardController.js";
import { createFilesController } from "./controllers/filesController.js";
import {
  persistPendingNotification,
  listNotifications,
  getNotificationByJobId,
  approveNotification,
  rejectNotification,
  getActiveJobsForStudent
} from "./services/notificationService.js";
import {
  buildPendingNotificationConsumer
} from "./consumers/pendingNotificationConsumer.js";
import {
  notFoundHandler,
  errorHandler
} from "./middlewares/errorHandler.js";

async function start() {
  await connectMongo();
  const redisClient = await connectRedis();
  await connectMinio();

  const { consumer, producer, topics } = createKafkaClients();
  await producer.connect();
  console.log("[kafka] producer connected");

  const pendingConsumer = buildPendingNotificationConsumer({
    consumer,
    topic: topics.pending,
    persistPendingNotification
  });
  await pendingConsumer.start();

  const minioService = {
    uploadAttachmentFiles,
    uploadAdminMessageTextFile
  };

  const adminNotificationsController = createAdminNotificationsController({
    listNotifications,
    getNotificationByJobId,
    approveNotification: (payload) =>
      approveNotification(payload, {
        redisClient,
        kafkaProducer: producer,
        sendTopic: topics.send,
        minioService
      }),
    rejectNotification: (payload) =>
      rejectNotification(payload, {
        minioService
      })
  });

  const studentDashboardController = createStudentDashboardController({
    getActiveJobsForStudent: (studentId) =>
      getActiveJobsForStudent(studentId, { redisClient })
  });

  const filesController = createFilesController({
    getFileStreamByApiPath,
    getFileStatByApiPath
  });

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString()
    });
  });

  app.use(
    "/api/admin/notifications",
    createAdminNotificationRouter({ adminNotificationsController })
  );
  app.use(
    "/api/student",
    createStudentDashboardRouter({ studentDashboardController })
  );
  app.use("/api/files", createFilesRouter({ filesController }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  const server = app.listen(env.PORT, () => {
    console.log(`[http] listening on http://localhost:${env.PORT}`);
  });

  async function shutdown() {
    console.log("[system] shutting down");
    await new Promise((resolve) => server.close(resolve));
    await pendingConsumer.stop();
    await producer.disconnect();
    await disconnectRedis();
    await disconnectMongo();
    await disconnectMinio();
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((error) => {
  console.error("[system] failed to start", error);
  process.exit(1);
});
