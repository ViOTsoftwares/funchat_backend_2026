import { EmailTemplateModel } from "../models/index.js";
import { Pagination } from "../lib/pagination.js";
import { ColumnFilter } from "../lib/columnFilter.js";

export const CreateEmailTemplate = async (req, res) => {
  try {
    const { identifier, subject, content } = req.body;

    await EmailTemplateModel.create({
      identifier,
      subject,
      content,
    });

    return res
      .status(200)
      .json({ success: true, message: "Added successfully" });
  } catch (error) {
    console.error(error);
    if (error?.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Identifier already exists",
        errors: { identifier: "Identifier already exists" },
      });
    }
    return res
      .status(500)
      .json({ success: false, message: "Something went wrong" });
  }
};

export const EmailTemplateList = async (req, res) => {
  try {
    let { page, limit, filter } = req.query;
    filter = ColumnFilter(filter);
    const { skip } = Pagination({ page, limit });
    const sort = { createdAt: -1 };

    const list = await EmailTemplateModel.find(filter || {})
      .limit(limit)
      .skip(skip)
      .sort(sort);

    const count = await EmailTemplateModel.countDocuments(filter || {});

    return res.status(200).json({
      success: true,
      message: "Get all email templates",
      result: { list, count },
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ success: false, message: "Something went wrong" });
  }
};

export const UpdateEmailTemplate = async (req, res) => {
  try {
    const { identifier, subject, content, id } = req.body;
    const existingData = await EmailTemplateModel.findById(id);

    if (!existingData) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    await EmailTemplateModel.updateOne(
      { _id: existingData._id },
      {
        identifier,
        subject,
        content,
      },
    );

    return res
      .status(200)
      .json({ success: true, message: "Updated successfully" });
  } catch (error) {
    console.error(error);
    if (error?.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Identifier already exists",
        errors: { identifier: "Identifier already exists" },
      });
    }
    return res
      .status(500)
      .json({ success: false, message: "Something went wrong" });
  }
};

export const OneEmailTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await EmailTemplateModel.findById(id);

    if (!result) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Get email template",
      result,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ success: false, message: "Something went wrong" });
  }
};

export const DeleteEmailTemplate = async (req, res) => {
  try {
    const { id } = req.body;

    await EmailTemplateModel.deleteOne({ _id: id });
    return res.status(200).json({
      success: true,
      message: "Deleted successfully",
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ success: false, message: "Something went wrong" });
  }
};

// ─── Seed Default Email Templates ─────────────────────────────────────────────
export const seedDefaultEmailTemplates = async () => {
  try {
    const existing = await EmailTemplateModel.findOne({
      identifier: "OTP_VERIFICATION",
    });

    if (!existing) {
      await EmailTemplateModel.create({
        identifier: "OTP_VERIFICATION",
        subject: "Your ##APP_NAME## Verification Code: ##OTP##",
        content: `<div style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #0b0f19; color: #ffffff; padding: 40px 20px; text-align: center;">
  <div style="max-width: 520px; margin: 0 auto; background: linear-gradient(180deg, #131b2e 0%, #0f172a 100%); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 20px; padding: 36px 28px; box-shadow: 0 10px 40px rgba(0,0,0,0.5);">
    <div style="display: inline-block; width: 50px; height: 50px; line-height: 50px; border-radius: 14px; background: linear-gradient(135deg, #6366f1, #3b82f6); color: #ffffff; font-size: 26px; margin-bottom: 20px; font-weight: bold;">⚡</div>
    <h1 style="font-size: 24px; font-weight: 800; margin: 0 0 10px 0; color: #ffffff; letter-spacing: -0.5px;">##APP_NAME##</h1>
    <p style="font-size: 15px; color: #94a3b8; margin: 0 0 26px 0; line-height: 1.5;">Welcome! Use the one-time verification code below to securely log in to your account.</p>
    
    <div style="background: rgba(99, 102, 241, 0.1); border: 2px dashed #6366f1; border-radius: 14px; padding: 18px 24px; margin: 0 0 26px 0; display: inline-block;">
      <span style="font-size: 36px; font-weight: 900; letter-spacing: 10px; color: #818cf8; font-family: monospace;">##OTP##</span>
    </div>
    
    <p style="font-size: 13px; color: #64748b; margin: 0 0 20px 0; line-height: 1.5;">This verification code is valid for <strong>##EXPIRY_MINUTES## minutes</strong>.<br />If you did not request this login code, you can safely ignore this email.</p>
    
    <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.08); margin: 24px 0;" />
    
    <p style="font-size: 12px; color: #475569; margin: 0;">© ##YEAR## ##APP_NAME##. All rights reserved.<br />Zero Log Policy · 256-Bit Encrypted</p>
  </div>
</div>`,
      });
      console.log("✅ Seeded default OTP_VERIFICATION Email Template successfully");
    }
  } catch (error) {
    console.error("Error seeding default email templates:", error);
  }
};

