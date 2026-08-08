import CommunityCategory from "../models/communityCategory.js";
import CommunityGroup from "../models/communityGroup.js";
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
            description: g.description,
            chat_timing: g.chat_timing,
            isPopular: Boolean(g.isPopular),
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
    if (payload.isActive !== undefined) {
      payload.isActive = payload.isActive === "true" || payload.isActive === true;
    }
    if (payload.isPopular !== undefined) {
      payload.isPopular = payload.isPopular === "true" || payload.isPopular === true;
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
    if (payload.isActive !== undefined) {
      payload.isActive = payload.isActive === "true" || payload.isActive === true;
    }
    if (payload.isPopular !== undefined) {
      payload.isPopular = payload.isPopular === "true" || payload.isPopular === true;
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
