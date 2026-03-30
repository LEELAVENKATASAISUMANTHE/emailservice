import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { connectMongo } from "./db/mongo.js";
import excelRoutes from "./excel/routes/excel.routes.js";
import {
  runExcelRetentionCleanup,
  startExcelRetentionCleanupLoop,
} from "./excel/services/excel.service.js";
import { startExcelConsumer } from "./excel/consumer/excel.consumer.js";
import {
  connectConsumer,
  connectProducer,
  disconnectKafka,
} from "./utils/kafka.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 4001);

app.use(cors());
app.use(express.json());

app.use("/api/excel", excelRoutes);
app.get("/", (_req, res) => {
  res.send("Excel service is running");
});

app.listen(PORT, async () => {
  console.log(`Excel service is running on port ${PORT}`);
  await connectMongo();
  await runExcelRetentionCleanup();
  startExcelRetentionCleanupLoop();
  await connectProducer();
  await connectConsumer();
  await startExcelConsumer();
});

process.on("SIGINT", async () => {
  await disconnectKafka();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await disconnectKafka();
  process.exit(0);
});
