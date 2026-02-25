const { pendingNotificationSchema } = require("../schemas/pendingNotification");

async function commitMessage(consumer, topic, partition, offset) {
  await consumer.commitOffsets([
    {
      topic,
      partition,
      offset: (BigInt(offset) + 1n).toString()
    }
  ]);
}

function buildPendingNotificationConsumer({
  consumer,
  topic,
  persistPendingNotification
}) {
  async function start() {
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });

    await consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message }) => {
        const messageValue = message.value?.toString();

        if (!messageValue) {
          console.warn("[kafka] skipping empty message value");
          await commitMessage(consumer, topic, partition, message.offset);
          return;
        }

        let parsedPayload;
        try {
          parsedPayload = JSON.parse(messageValue);
        } catch (error) {
          console.error("[kafka] invalid JSON payload, committing offset", error);
          await commitMessage(consumer, topic, partition, message.offset);
          return;
        }

        const validation = pendingNotificationSchema.safeParse(parsedPayload);
        if (!validation.success) {
          console.error(
            "[kafka] payload schema validation failed, committing offset",
            validation.error.flatten()
          );
          await commitMessage(consumer, topic, partition, message.offset);
          return;
        }

        try {
          await persistPendingNotification(validation.data);
          await commitMessage(consumer, topic, partition, message.offset);
          console.log(
            `[kafka] stored pending notification for jobId=${validation.data.jobId}`
          );
        } catch (error) {
          console.error(
            `[kafka] failed to persist jobId=${validation.data.jobId}, offset not committed`,
            error
          );
        }
      }
    });

    console.log(`[kafka] consumer started for ${topic}`);
  }

  async function stop() {
    await consumer.disconnect();
    console.log("[kafka] consumer stopped");
  }

  return {
    start,
    stop
  };
}

module.exports = { buildPendingNotificationConsumer };
