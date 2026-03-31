import { Kafka } from 'kafkajs';
import { config } from '../config/index.js';

const kafka = new Kafka({
  clientId: config.redpanda.clientId,
  brokers: config.redpanda.brokers
});

let producer;

export const getProducer = async () => {
  if (!producer) {
    producer = kafka.producer({ allowAutoTopicCreation: false });
    await producer.connect();
  }
  return producer;
};

export const disconnectProducer = async () => {
  if (producer) {
    await producer.disconnect();
    producer = null;
  }
};

export { kafka };
