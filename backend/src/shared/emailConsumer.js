/**
 * Kafka consumer for job.notification.send.
 * Reads email jobs, fetches body + attachments from object storage,
 * and sends via ZeptoMail.
 */
import { kafka as config } from '../config/index.js';
import { startConsumer } from './kafka.js';
import { getTextObject, getAttachment } from './objectStorage.js';
import { sendEmail, isEmailConfigured } from './emailSender.js';

let consumer = null;

export async function startEmailConsumer() {
  if (!config.emailConsumerEnabled) {
    console.log('[email-consumer] disabled (EMAIL_CONSUMER_ENABLED=false)');
    return;
  }

  if (!isEmailConfigured()) {
    throw new Error(
      'EMAIL_CONSUMER_ENABLED=true but ZeptoMail is not fully configured (ZEPTOMAIL_TOKEN + FROM_EMAIL)'
    );
  }

  consumer = await startConsumer(
    config.emailConsumerGroup,
    config.sendTopic,
    async (job) => {
      const emailBody = await getTextObject(job.emailBodyPath);

      const attachments = [];
      if (Array.isArray(job.attachments)) {
        for (const path of job.attachments) {
          attachments.push(await getAttachment(path));
        }
      }

      await sendEmail({
        to: job.studentEmail,
        toName: job.studentName,
        subject: `Placement Opportunity — ${job.companyName}`,
        body: emailBody,
        attachments,
      });

      console.log(
        `[email-consumer] sent → ${job.studentEmail} (job ${job.jobId})`
      );
    }
  );
}

export async function stopEmailConsumer() {
  if (!consumer) return;
  await consumer.disconnect().catch(() => {});
  consumer = null;
}
