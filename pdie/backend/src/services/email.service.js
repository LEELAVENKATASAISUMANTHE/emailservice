import nodemailer from 'nodemailer';
import { config } from '../config/index.js';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: config.email.user,
    pass: config.email.pass
  }
});

export const sendStudentLinkEmail = async (email, link) => {
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
