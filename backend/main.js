const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");

const { env } = require("./config/env");
const { connectMongo, disconnectMongo } = require("./utils/mongo");
const { connectRedis, disconnectRedis } = require("./utils/redis");
const { createKafkaClients } = require("./utils/kafka");
const {
  createAdminNotificationRouter
} = require("./routes/adminNotifications");
const {
  createStudentDashboardRouter
} = require("./routes/studentDashboard");
const {
  persistPendingNotification,
  listNotifications,
  getNotificationByJobId,
  approveNotification,
  rejectNotification,
  getActiveJobsForStudent
} = require("./services/notificationService");
const {
  buildPendingNotificationConsumer
} = require("./consumers/pendingNotificationConsumer");
const {
  notFoundHandler,
  errorHandler
} = require("./middlewares/errorHandler");

async function start() {
  await connectMongo();
  const redisClient = await connectRedis();
  const { consumer, producer, topics } = createKafkaClients();

  await producer.connect();
  console.log("[kafka] producer connected");

  const pendingConsumer = buildPendingNotificationConsumer({
    consumer,
    topic: topics.pending,
    persistPendingNotification
  });

  await pendingConsumer.start();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  const uploadsDir = path.join(__dirname, "uploads");
  fs.mkdirSync(uploadsDir, { recursive: true });
  app.use("/uploads", express.static(uploadsDir));

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString()
    });
  });

  app.use(
    "/api/admin/notifications",
    createAdminNotificationRouter({
      listNotifications,
      getNotificationByJobId,
      approveNotification: (payload) =>
        approveNotification(payload, {
          redisClient,
          kafkaProducer: producer,
          sendTopic: topics.send
        }),
      rejectNotification
    })
  );

  app.use(
    "/api/student",
    createStudentDashboardRouter({
      getActiveJobsForStudent: (studentId) =>
        getActiveJobsForStudent(studentId, { redisClient })
    })
  );

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
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((error) => {
  console.error("[system] failed to start", error);
  process.exit(1);
});
