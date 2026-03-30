import { Kafka } from "kafkajs";

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || "excel-service",
  brokers: (process.env.KAFKA_BROKERS || "redpanda:9092").split(","),
});

const producer = kafka.producer();
const consumer = kafka.consumer({
  groupId: process.env.KAFKA_CONSUMER_GROUP || "excel-service-group",
});

const PROCESS_TOPIC = process.env.EXCEL_PROCESS_TOPIC || "excel.job.process";
const RESULT_TOPIC = process.env.EXCEL_RESULT_TOPIC || "excel.job.result";

async function connectProducer() {
  try {
    await producer.connect();
    console.log("✅ Kafka producer connected");
  } catch (error) {
    console.error("Error connecting Kafka producer:", error);
  }
}

async function connectConsumer() {
  try {
    await consumer.connect();
    await consumer.subscribe({ topic: PROCESS_TOPIC, fromBeginning: false });
    console.log(`✅ Kafka consumer subscribed to ${PROCESS_TOPIC}`);
  } catch (error) {
    console.error("Error connecting Kafka consumer:", error);
  }
}

async function sendMessage(topic, message) {
  try {
    await producer.send({
      topic,
      messages: [
        {
          key: String(message.jobId || ""),
          value: JSON.stringify(message),
        },
      ],
    });
    console.log(`📤 Message sent to ${topic}`);
  } catch (error) {
    console.error("Error sending message to Kafka:", error);
  }
}

async function disconnectKafka() {
  await Promise.all([producer.disconnect(), consumer.disconnect()]).catch(() => {});
}

export {
  connectProducer,
  connectConsumer,
  disconnectKafka,
  sendMessage,
  consumer,
  PROCESS_TOPIC,
  RESULT_TOPIC,
};
