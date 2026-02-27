import { Kafka } from "kafkajs";

const kafka = new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID || "email-consumer",
    brokers: (process.env.KAFKA_BROKERS || "redpanda:9092").split(","),
});

const consumer = kafka.consumer({
    groupId: process.env.KAFKA_CONSUMER_GROUP || "email-consumer-group",
});

const SEND_TOPIC = process.env.KAFKA_SEND_TOPIC || "job.notification.send";

export async function connectConsumer() {
    await consumer.connect();
    await consumer.subscribe({ topic: SEND_TOPIC, fromBeginning: true });
    console.log(`✅ Kafka consumer connected and subscribed to ${SEND_TOPIC}`);
}

export { consumer };
