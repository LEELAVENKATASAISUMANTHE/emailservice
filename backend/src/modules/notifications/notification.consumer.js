/**
 * Kafka consumer for job.notification.pending.
 * Each message is upserted into MongoDB as a PENDING_APPROVAL notification.
 */
import { kafka as config } from '../../config/index.js';
import { startConsumer } from '../../shared/kafka.js';
import { upsertPendingNotification } from './notification.repository.js';

let consumer = null;

export async function startNotificationConsumer() {
  consumer = await startConsumer(
    config.notificationConsumerGroup,
    config.pendingTopic,
    async (job) => {
      await upsertPendingNotification(job);
      console.log(`[notify-consumer] upserted job ${job.jobId}`);
    }
  );
}

export async function stopNotificationConsumer() {
  if (!consumer) return;
  await consumer.disconnect().catch(() => {});
  consumer = null;
}
