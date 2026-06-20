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
