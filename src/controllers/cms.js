import { CMSModel } from "../models/index.js";
import { Pagination } from "../lib/pagination.js";
import { ColumnFilter } from "../lib/columnFilter.js";

export const CMSList = async (req, res) => {
  try {
    let { page, limit, filter } = req.query;
    const baseFilter = ColumnFilter(filter);
    const sort = { createdAt: -1 };
    const { skip } = Pagination({ page, limit });

    const list = await CMSModel.find(baseFilter).limit(limit).skip(skip).sort(sort);
    const count = await CMSModel.countDocuments(baseFilter);

    return res.status(200).json({ success: true, message: "Get all CMS", result: { list, count } });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

export const OneCMS = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await CMSModel.findById(id);
    if (!result) return res.status(404).json({ success: false, message: "Not found" });
    return res.status(200).json({ success: true, message: "Get CMS", result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

export const CreateCMS = async (req, res) => {
  try {
    const { identifier, title, content, status } = req.body;
    await CMSModel.create({ identifier, title, content, status: status || "active" });
    return res.status(200).json({ success: true, message: "Created successfully" });
  } catch (error) {
    console.error(error);
    if (error?.code === 11000) {
      return res.status(400).json({ success: false, message: "Identifier already exists", errors: { identifier: "Identifier already exists" } });
    }
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

export const UpdateCMS = async (req, res) => {
  try {
    const { id, identifier, title, content, status } = req.body;
    const existing = await CMSModel.findById(id);
    if (!existing) return res.status(404).json({ success: false, message: "Not found" });

    const updateData = {};
    if (identifier !== undefined) updateData.identifier = identifier;
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (status !== undefined) updateData.status = status;

    await CMSModel.updateOne({ _id: id }, updateData);
    return res.status(200).json({ success: true, message: "Updated successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

export const DeleteCMS = async (req, res) => {
  try {
    const { id } = req.body;
    await CMSModel.deleteOne({ _id: id });
    return res.status(200).json({ success: true, message: "Deleted successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};
