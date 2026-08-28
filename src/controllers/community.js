import fs from "fs";
import mongoose from "mongoose";
import CommunityCategory from "../models/communityCategory.js";
import CommunityGroup from "../models/communityGroup.js";
import Setting from "../models/setting.js";
import { HandleError } from "../utils/error.js";

// ----- Public Endpoints -----

export const GetPublicCommunities = async (req, res) => {
  try {
    const categories = await CommunityCategory.find({ isActive: true }).lean();
    
    const categoriesWithGroups = await Promise.all(
      categories.map(async (cat) => {
        const groups = await CommunityGroup.find({ category: cat._id, isActive: true }).lean();
        return {
          id: cat.slug, // mapping for frontend compatibility
          name: cat.name,
          image: cat.image,
          description: cat.description,
          isPopular: Boolean(cat.isPopular),
          groups: groups.map(g => ({
            id: g.slug,
            name: g.name,
            image: g.image || cat.image || "",
            categoryImage: cat.image || "",
            description: g.description,
            chat_timing: g.chat_timing,
            messageDelay: g.messageDelay || 0,
            isPopular: Boolean(g.isPopular),
            allowImages: g.allowImages !== false,
          })),
        };
      })
    );

    res.status(200).json({ ok: true, data: categoriesWithGroups });
  } catch (error) {
    HandleError(res, error, "Failed to get communities");
  }
};

// ----- Admin Endpoints for Category -----

export const CategoryList = async (req, res) => {
  try {
    const categories = await CommunityCategory.find().sort({ createdAt: -1 });
    res.status(200).json({ ok: true, data: categories });
  } catch (error) {
    HandleError(res, error, "Failed to get categories");
  }
};

export const OneCategory = async (req, res) => {
  try {
    const category = await CommunityCategory.findById(req.params.id);
    if (!category) return res.status(404).json({ ok: false, message: "Category not found" });
    res.status(200).json({ ok: true, data: category });
  } catch (error) {
    HandleError(res, error, "Failed to get category");
  }
};

export const CreateCategory = async (req, res) => {
  try {
    const payload = { ...req.body };
    if (req.file) {
      payload.image = req.file.filename;
    }
    if (payload.isActive !== undefined) {
      payload.isActive = payload.isActive === "true" || payload.isActive === true;
    }
    if (payload.isPopular !== undefined) {
      payload.isPopular = payload.isPopular === "true" || payload.isPopular === true;
    }
    const newCategory = await CommunityCategory.create(payload);
    res.status(201).json({ ok: true, data: newCategory, message: "Category created successfully" });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ ok: false, message: "Slug must be unique" });
    }
    HandleError(res, error, "Failed to create category");
  }
};

export const UpdateCategory = async (req, res) => {
  try {
    const payload = { ...req.body };
    if (req.file) {
      payload.image = req.file.filename;
    }
    if (payload.isActive !== undefined) {
      payload.isActive = payload.isActive === "true" || payload.isActive === true;
    }
    if (payload.isPopular !== undefined) {
      payload.isPopular = payload.isPopular === "true" || payload.isPopular === true;
    }
    const id = req.body._id || req.body.id;
    if (!id) {
      return res.status(400).json({ ok: false, message: "Category ID is required" });
    }
    const updated = await CommunityCategory.findByIdAndUpdate(id, payload, { new: true });
    if (!updated) return res.status(404).json({ ok: false, message: "Category not found" });
    res.status(200).json({ ok: true, data: updated, message: "Category updated successfully" });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ ok: false, message: "Slug must be unique" });
    }
    HandleError(res, error, "Failed to update category");
  }
};

export const DeleteCategory = async (req, res) => {
  try {
    await CommunityGroup.deleteMany({ category: req.body._id });
    const deleted = await CommunityCategory.findByIdAndDelete(req.body._id);
    if (!deleted) return res.status(404).json({ ok: false, message: "Category not found" });
    res.status(200).json({ ok: true, message: "Category and its groups deleted successfully" });
  } catch (error) {
    HandleError(res, error, "Failed to delete category");
  }
};

// ----- Public Image Upload Endpoint -----

export const UploadCommunityImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, success: false, message: "No image file provided" });
    }

    // 1. Check Global Admin Settings
    const setting = await Setting.findOne().lean();
    if (setting?.communityImageUpload?.enabled === false) {
      try {
        if (req.file.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } catch {}
      return res.status(403).json({
        ok: false,
        success: false,
        message: "Image uploads are currently disabled by administrator.",
      });
    }

    // 2. Check dynamic size limit (capped at max 5MB)
    const maxLimitMB = Math.min(setting?.communityImageUpload?.maxFileSizeMB || 5, 5);
    const maxBytes = maxLimitMB * 1024 * 1024;
    if (req.file.size > maxBytes) {
      try {
        if (req.file.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } catch {}
      return res.status(400).json({
        ok: false,
        success: false,
        message: `Image exceeds the maximum allowed size of ${maxLimitMB}MB.`,
      });
    }

    // 3. Check Group Level Settings (if groupId is provided)
    const targetGroupId = req.body.groupId || req.query.groupId;
    if (targetGroupId) {
      const isObjectId = mongoose.Types.ObjectId.isValid(targetGroupId);
      const group = await CommunityGroup.findOne({
        $or: [
          { slug: targetGroupId },
          ...(isObjectId ? [{ _id: targetGroupId }] : []),
        ],
      }).lean();

      if (group && group.allowImages === false) {
        try {
          if (req.file.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
        } catch {}
        return res.status(403).json({
          ok: false,
          success: false,
          message: "Image uploads are disabled in this community group.",
        });
      }
    }

    const filename = req.file.filename;
    const imageUrl = `/image/community/${filename}`;
    return res.status(200).json({
      ok: true,
      success: true,
      message: "Image uploaded successfully",
      imageUrl,
      filename,
      size: req.file.size,
    });
  } catch (error) {
    try {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch {}
    HandleError(res, error, "Failed to upload image");
  }
};

// ----- Admin Endpoints for Group -----

export const GroupList = async (req, res) => {
  try {
    const groups = await CommunityGroup.find().populate("category", "name").sort({ createdAt: -1 });
    res.status(200).json({ ok: true, data: groups });
  } catch (error) {
    HandleError(res, error, "Failed to get groups");
  }
};

export const OneGroup = async (req, res) => {
  try {
    const group = await CommunityGroup.findById(req.params.id);
    if (!group) return res.status(404).json({ ok: false, message: "Group not found" });
    res.status(200).json({ ok: true, data: group });
  } catch (error) {
    HandleError(res, error, "Failed to get group");
  }
};

export const CreateGroup = async (req, res) => {
  try {
    const payload = { ...req.body };
    if (req.file) {
      payload.image = req.file.filename;
    }
    if (payload.isActive !== undefined) {
      payload.isActive = payload.isActive === "true" || payload.isActive === true;
    }
    if (payload.isPopular !== undefined) {
      payload.isPopular = payload.isPopular === "true" || payload.isPopular === true;
    }
    if (payload.allowImages !== undefined) {
      payload.allowImages = payload.allowImages === "true" || payload.allowImages === true;
    }
    const newGroup = await CommunityGroup.create(payload);
    res.status(201).json({ ok: true, data: newGroup, message: "Group created successfully" });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ ok: false, message: "Slug must be unique" });
    }
    HandleError(res, error, "Failed to create group");
  }
};

export const UpdateGroup = async (req, res) => {
  try {
    const payload = { ...req.body };
    if (req.file) {
      payload.image = req.file.filename;
    }
    if (payload.isActive !== undefined) {
      payload.isActive = payload.isActive === "true" || payload.isActive === true;
    }
    if (payload.isPopular !== undefined) {
      payload.isPopular = payload.isPopular === "true" || payload.isPopular === true;
    }
    if (payload.allowImages !== undefined) {
      payload.allowImages = payload.allowImages === "true" || payload.allowImages === true;
    }
    const id = req.body._id || req.body.id;
    if (!id) {
      return res.status(400).json({ ok: false, message: "Group ID is required" });
    }
    const updated = await CommunityGroup.findByIdAndUpdate(id, payload, { new: true });
    if (!updated) return res.status(404).json({ ok: false, message: "Group not found" });
    res.status(200).json({ ok: true, data: updated, message: "Group updated successfully" });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ ok: false, message: "Slug must be unique" });
    }
    HandleError(res, error, "Failed to update group");
  }
};

export const DeleteGroup = async (req, res) => {
  try {
    const deleted = await CommunityGroup.findByIdAndDelete(req.body._id);
    if (!deleted) return res.status(404).json({ ok: false, message: "Group not found" });
    res.status(200).json({ ok: true, message: "Group deleted successfully" });
  } catch (error) {
    HandleError(res, error, "Failed to delete group");
  }
};
