import nodemailer from "nodemailer";
import { ENV } from "./env.js";

export const createTransporter = () => {
  return nodemailer.createTransport({
    host: ENV.SMTP_HOST,
    port: Number(ENV.SMTP_PORT),
    secure: Number(ENV.SMTP_PORT) === 465,
    auth: {
      user: ENV.SMTP_USER,
      pass: ENV.SMTP_PASS,
    },
  });
};
export const sendEmail = async (to, subject, html) => {
  try {
    const transporter = createTransporter();

    const info = await transporter.sendMail({
      from: `"FunChat Connect" <${ENV.SMTP_USER}>`,
      to,
      subject,
      html,
    });
    console.log("<<=== Email is sent successfully ===>>", info?.messageId || "OK");
    return { success: true, info };
  } catch (error) {
    console.error("error on send email----->", error);
    return { success: false, error: error?.message || "Failed to send email" };
  }
};