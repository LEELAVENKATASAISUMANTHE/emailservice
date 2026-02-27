import { Kafka } from "kafkajs";

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || "email-service",
  brokers: (process.env.KAFKA_BROKERS || "redpanda:9092").split(","),
});

const producer = kafka.producer();
const consumer = kafka.consumer({
  groupId: process.env.KAFKA_CONSUMER_GROUP || "email-service-group",
});

const PENDING_TOPIC = process.env.KAFKA_PENDING_TOPIC || "job.notification.pending";

const connectConsumer = async () => {
  try {
    await consumer.connect();
    await consumer.subscribe({ topic: PENDING_TOPIC, fromBeginning: true });
    console.log(`✅ Kafka consumer connected and subscribed to ${PENDING_TOPIC}`);
  } catch (error) {
    console.error("Error connecting to Kafka:", error);
  }
};
const connectProducer = async () => {
  try {
    await producer.connect();
  } catch (error) {
    console.error("Error connecting to Kafka:", error);
  }
}

const sendMessage = async (topic, message) => {
  try {
    await producer.send({
      topic,
      messages: [
        {
          key: String(message.jobId),
          value: JSON.stringify(message),
        },
      ],
    });
    console.log(`📤 Message sent to ${topic}`);
  } catch (error) {
    console.error("Error sending message to Kafka:", error);
  }
};


export {
  connectProducer,
  sendMessage,
  connectConsumer,
  consumer
};