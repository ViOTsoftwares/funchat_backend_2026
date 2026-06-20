import { BlogModel } from "../models/index.js";
import { Pagination } from "../lib/pagination.js";
import { ColumnFilter } from "../lib/columnFilter.js";

export const BlogList = async (req, res) => {
  try {
    let { page, limit, filter } = req.query;
    const baseFilter = ColumnFilter(filter);
    const sort = { createdAt: -1 };
    const { skip } = Pagination({ page, limit });

    const list = await BlogModel.find(baseFilter).limit(limit).skip(skip).sort(sort);
    const count = await BlogModel.countDocuments(baseFilter);

    return res.status(200).json({ success: true, message: "Get all blogs", result: { list, count } });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

export const OneBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await BlogModel.findById(id);
    if (!result) return res.status(404).json({ success: false, message: "Not found" });
    return res.status(200).json({ success: true, message: "Get blog", result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

export const CreateBlog = async (req, res) => {
  try {
    const { title, content, author, status } = req.body;
    await BlogModel.create({ title, content, author, status: status || "active" });
    return res.status(200).json({ success: true, message: "Created successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

export const UpdateBlog = async (req, res) => {
  try {
    const { id, title, content, author, status } = req.body;
    const existing = await BlogModel.findById(id);
    if (!existing) return res.status(404).json({ success: false, message: "Not found" });

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (author !== undefined) updateData.author = author;
    if (status !== undefined) updateData.status = status;

    await BlogModel.updateOne({ _id: id }, updateData);
    return res.status(200).json({ success: true, message: "Updated successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

export const DeleteBlog = async (req, res) => {
  try {
    const { id } = req.body;
    await BlogModel.deleteOne({ _id: id });
    return res.status(200).json({ success: true, message: "Deleted successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};
