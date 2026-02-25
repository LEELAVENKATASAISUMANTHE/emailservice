const { Kafka, logLevel } = require("kafkajs");
const { env } = require("../config/env");

function createKafkaClients() {
  const kafka = new Kafka({
    clientId: env.KAFKA_CLIENT_ID,
    brokers: env.KAFKA_BROKERS,
    logLevel: logLevel.INFO
  });

  const consumer = kafka.consumer({
    groupId: env.KAFKA_CONSUMER_GROUP
  });

  const producer = kafka.producer();

  return {
    consumer,
    producer,
    topics: {
      pending: env.KAFKA_PENDING_TOPIC,
      send: env.KAFKA_SEND_TOPIC
    }
  };
}

module.exports = { createKafkaClients };
