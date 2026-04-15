/**
 * Kafka client factory.
 * Creates a single Kafka instance; producer and consumers are created on demand.
 */
import { Kafka } from 'kafkajs';
import { kafka as config } from '../config/index.js';

const kafka = new Kafka({
  clientId: config.clientId,
  brokers: config.brokers,
});

// ── Producer ─────────────────────────────────────────────────────────────────

let producer = null;

export async function getProducer() {
  if (!producer) {
    producer = kafka.producer();
    await producer.connect();
    console.log('[kafka] producer connected');
  }
  return producer;
}

export async function sendMessage(topic, message) {
  const p = await getProducer();
  await p.send({
    topic,
    messages: [
      {
        key: String(message.jobId ?? ''),
        value: JSON.stringify(message),
      },
    ],
  });
  console.log(`[kafka] → ${topic}`);
}

// ── Consumer factory ──────────────────────────────────────────────────────────

/**
 * Create and return a Kafka consumer subscribed to the given topic.
 * @param {string} groupId
 * @param {string} topic
 * @param {(message: object) => Promise<void>} handler
 */
export async function startConsumer(groupId, topic, handler) {
  const consumer = kafka.consumer({ groupId });
  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: false });

  await consumer.run({
    autoCommit: false,
    eachMessage: async ({ topic: t, partition, message }) => {
      if (!message?.value) return;
      try {
        const payload = JSON.parse(message.value.toString());
        await handler(payload);
      } catch (err) {
        console.error(`[kafka] handler error on ${t}:`, err.message);
      } finally {
        await consumer.commitOffsets([
          {
            topic: t,
            partition,
            offset: (Number(message.offset) + 1).toString(),
          },
        ]);
      }
    },
  });

  console.log(`[kafka] consumer (${groupId}) subscribed to ${topic}`);
  return consumer;
}

export async function disconnectProducer() {
  if (!producer) return;
  await producer.disconnect().catch(() => {});
  producer = null;
}
