import nodemailer from "nodemailer";
import { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } from "./env.js";

export const createTransporter = () => {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
};
export const sendEmail = async (to, subject, html ) => {
  try {
    const transporter = createTransporter();

    const info = await transporter.sendMail({
      from: SMTP_USER,
      to,
      subject,
      html,
    });
    console.log("Email is sent", info);
  } catch (error) {
    console.log("error on send email----->");
  }
};