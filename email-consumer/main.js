import { connectConsumer, consumer } from "./utils/kafka.js";
import { getEmailBody, getAttachment } from "./utils/minio.js";
import { sendEmail } from "./utils/zoho.js";

async function start() {
    console.log("🚀 Email Consumer starting...");

    await connectConsumer();

    await consumer.run({
        autoCommit: false,
        eachMessage: async ({ topic, partition, message }) => {
            const job = JSON.parse(message.value.toString());

            console.log(`📨 Processing email for ${job.studentName} (${job.studentEmail}) — Job ${job.jobId}`);

            try {
                // 1. Fetch email body from MinIO
                const emailBody = await getEmailBody(job.emailBodyPath);

                // 2. Fetch attachments from MinIO (if any)
                const attachments = [];
                if (job.attachments && job.attachments.length > 0) {
                    for (const attachmentPath of job.attachments) {
                        const attachment = await getAttachment(attachmentPath);
                        attachments.push(attachment);
                    }
                    console.log(`  📎 Fetched ${attachments.length} attachment(s)`);
                }

                // 3. Send email via ZeptoMail
                const subject = `Placement Opportunity — ${job.companyName}`;

                await sendEmail({
                    to: job.studentEmail,
                    toName: job.studentName,
                    subject,
                    body: emailBody,
                    attachments,
                });

                console.log(`  ✅ Email sent to ${job.studentEmail}`);

                // 4. Commit offset only after successful send
                await consumer.commitOffsets([
                    {
                        topic,
                        partition,
                        offset: (Number(message.offset) + 1).toString(),
                    },
                ]);
            } catch (error) {
                console.error(`  ❌ Failed to send email to ${job.studentEmail}:`, error.message);
                // Don't commit offset — Kafka will redeliver this message
            }
        },
    });

    console.log("✅ Email Consumer is running");
}

start().catch((err) => {
    console.error("Fatal error starting email consumer:", err);
    process.exit(1);
});
