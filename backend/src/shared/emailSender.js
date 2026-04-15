/**
 * ZeptoMail email sender.
 */
import { email as config } from '../config/index.js';

export function isEmailConfigured() {
  return Boolean(config.token && config.fromEmail);
}

/**
 * Send an email via ZeptoMail.
 * @param {{ to: string, toName: string, subject: string, body: string, attachments?: Array }} opts
 */
export async function sendEmail({ to, toName, subject, body, attachments = [] }) {
  if (!config.token) throw new Error('ZEPTOMAIL_TOKEN is not configured');
  if (!config.fromEmail) throw new Error('FROM_EMAIL is not configured');

  const payload = {
    from: { address: config.fromEmail, name: config.fromName },
    to: [{ email_address: { address: to, name: toName } }],
    subject,
    htmlbody: `<div>${String(body || '').replace(/\n/g, '<br>')}</div>`,
  };

  if (attachments.length > 0) {
    payload.attachments = attachments.map((a) => ({
      content: a.base64,
      mime_type: a.contentType,
      name: a.filename,
    }));
  }

  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: config.token,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`ZeptoMail request failed (${response.status}): ${errorBody}`);
  }

  return response.json().catch(() => ({}));
}
