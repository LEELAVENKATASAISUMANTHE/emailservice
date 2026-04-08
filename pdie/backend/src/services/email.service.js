import nodemailer from 'nodemailer';
import { config } from '../config/index.js';

const isEmailConfigured = () => Boolean(config.email.user && config.email.pass);

const transporter = isEmailConfigured()
  ? nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.email.user,
      pass: config.email.pass
    }
  })
  : null;

export const sendStudentLinkEmail = async (email, link) => {
  if (!isEmailConfigured() || !transporter) {
    throw new Error('Email service is not configured. Set EMAIL_USER and EMAIL_PASS.');
  }

  await transporter.sendMail({
    to: email,
    subject: 'Complete your profile',
    html: `
      <p>Hello,</p>
      <p>Please complete your student profile using the link below:</p>
      <p><a href="${link}">${link}</a></p>
      <p>This link may expire soon.</p>
    `
  });
};
