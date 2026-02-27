import { Kafka } from "kafkajs";

const kafka = new Kafka({
  clientId: "email-service",
  brokers: ["redpanda:9092"],
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: "email-service-group" });

const connectConsumer = async () => {
  try {
    await consumer.connect();
    await consumer.subscribe({ topic: "job.notification.pending", fromBeginning: true });
    console.log("✅ Kafka consumer connected and subscribed to email-jobs");
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