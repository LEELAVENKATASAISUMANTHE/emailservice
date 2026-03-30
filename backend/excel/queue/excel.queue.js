// changes by nakul: isolated BullMQ queue setup for Excel processing
import { Queue } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://redis:6379";
const queueName = process.env.EXCEL_QUEUE_NAME || "excel-queue";

// changes by nakul: BullMQ works more reliably with maxRetriesPerRequest disabled
const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});

const excelQueue = new Queue(queueName, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: false,
  },
});

export { connection, excelQueue, queueName };
