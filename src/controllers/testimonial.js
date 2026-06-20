import { TestimonialModel } from "../models/index.js";
import { Pagination } from "../lib/pagination.js";
import { ColumnFilter } from "../lib/columnFilter.js";
import fs from "fs";
import path from "path";

export const TestimonialList = async (req, res) => {
  try {
    let { page, limit, filter } = req.query;
    const baseFilter = ColumnFilter(filter);
    const sort = { createdAt: -1 };
    const { skip } = Pagination({ page, limit });

    const list = await TestimonialModel.find(baseFilter).limit(limit).skip(skip).sort(sort);
    const count = await TestimonialModel.countDocuments(baseFilter);

    return res.status(200).json({ success: true, message: "Get all testimonials", result: { list, count } });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

export const OneTestimonial = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await TestimonialModel.findById(id);
    if (!result) return res.status(404).json({ success: false, message: "Not found" });
    return res.status(200).json({ success: true, message: "Get testimonial", result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

export const CreateTestimonial = async (req, res) => {
  try {
    const { name, designation, content, status } = req.body;
    const logo = req.file ? `${process.env.IMAGE_URL}/logos/${req.file.filename}` : "";
    await TestimonialModel.create({ name, designation, content, logo, status: status || "active" });
    return res.status(200).json({ success: true, message: "Created successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

export const UpdateTestimonial = async (req, res) => {
  try {
    const { id, name, designation, content, status } = req.body;
    const existing = await TestimonialModel.findById(id);
    if (!existing) return res.status(404).json({ success: false, message: "Not found" });

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (designation !== undefined) updateData.designation = designation;
    if (content !== undefined) updateData.content = content;
    if (status !== undefined) updateData.status = status;
    if (req.file) {
      if (existing.logo) {
        const oldFilename = existing.logo.split("/logos/")[1];
        if (oldFilename) {
          const oldPath = path.join(process.cwd(), "src/uploads/logos", oldFilename);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
      }
      updateData.logo = `${process.env.IMAGE_URL}/logos/${req.file.filename}`;
    }

    await TestimonialModel.updateOne({ _id: id }, updateData);
    return res.status(200).json({ success: true, message: "Updated successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

export const DeleteTestimonial = async (req, res) => {
  try {
    const { id } = req.body;
    await TestimonialModel.deleteOne({ _id: id });
    return res.status(200).json({ success: true, message: "Deleted successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};
