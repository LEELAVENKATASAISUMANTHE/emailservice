import { SendMailClient } from "zeptomail";

const url = process.env.ZEPTOMAIL_API_URL || "https://api.zeptomail.in/v1.1/email";
const token = process.env.ZEPTOMAIL_TOKEN;
const FROM_EMAIL =  "noreply@sumantheluri.tech";
const FROM_NAME = "Placement Cell";

let client;

function getClient() {
    if (!token) {
        throw new Error("ZEPTOMAIL_TOKEN is not set in environment variables");
    }
    if (!client) {
        client = new SendMailClient({ url, token });
    }
    return client;
}

/**
 * Send an email via ZeptoMail (Zoho) with optional attachments
 *
 * @param {Object} options
 * @param {string} options.to           - Recipient email
 * @param {string} options.toName       - Recipient name
 * @param {string} options.subject      - Email subject
 * @param {string} options.body         - Email body (plain text, will be wrapped in HTML)
 * @param {Array}  options.attachments  - Array of { filename, contentType, base64 }
 */
export async function sendEmail({ to, toName, subject, body, attachments = [] }) {
    const mailClient = getClient();

    const mailOptions = {
        from: {
            address: FROM_EMAIL,
            name: FROM_NAME,
        },
        to: [
            {
                email_address: {
                    address: to,
                    name: toName,
                },
            },
        ],
        subject,
        htmlbody: `<div>${body.replace(/\n/g, "<br>")}</div>`,
    };

    // Add attachments if any
    if (attachments.length > 0) {
        mailOptions.attachments = attachments.map((att) => ({
            content: att.base64,
            mime_type: att.contentType,
            name: att.filename,
        }));
    }

    const result = await mailClient.sendMail(mailOptions);
    return result;
}
