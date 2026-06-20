import { EmailTemplateModel, SettingModel } from "../models/index.js";
import { createTransporter, sendEmail } from "../config/mail.js";


export const renderEmailTemplate = async (identifier, to, variables = {}) => {
  try {
    const template = await EmailTemplateModel.findOne({ identifier });
    let setting = await SettingModel.findOne();
    const COMPANY_NAME = setting.title;
    const SUPPORT_EMAIL = setting.email;
    const CURRENT_YEAR = new Date().getFullYear();
    variables = { ...variables, COMPANY_NAME, CURRENT_YEAR, SUPPORT_EMAIL };
    if (!template) {
      throw new Error(`Template not found: ${identifier}`);
    }

    let subject = template.subject;
    let content = template.content;

    Object.keys(variables).forEach((key) => {
      const regex = new RegExp(`##${key}##`, "g");

      content = content.replace(regex, String(variables[key]));
    });
    console.log("content---");
    sendEmail(to, subject, content);
  } catch (error) {
    console.log("error on renderEmailTemplate", error);
  }
};
