import { connectConsumer, consumer } from "./kafka.js";
import * as notificationRepository from "../db/notificationRepository.js";


const autoconsume = async () => {
    try {
        await connectConsumer();
        await consumer.run({
            autoCommit: false,
            eachMessage: async ({ topic, partition, message }) => {
                console.log(`Received message: ${message.value}`);
                const job = JSON.parse(message.value);
                await notificationRepository.upsertPendingNotification(job);
                await consumer.commitOffsets([{ topic, partition, offset: (Number(message.offset) + 1).toString() }]);
            },
        });
    } catch (error) {
        console.error("Error in autoconsume:", error);
    }
}

export default autoconsume;
