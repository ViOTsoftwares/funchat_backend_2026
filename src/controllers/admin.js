import jwt from "jsonwebtoken";
import { comparePassword, hashPassword } from "../lib/bcrypt.js";
import { Pagination } from "../lib/pagination.js";
import { ColumnFilter } from "../lib/columnFilter.js";
import {
  AdminModel,
  BlogModel,
  SettingModel,
  TestimonialModel,
} from "../models/index.js";
import state from "../store/state.js";

export const adminLogin = async (req, res) => {
  try {
    console.log("----------", req.body);
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const adminData = await AdminModel.findOne({ email });
    if (!adminData) {
      return res.status(500).json({
        success: false,
        errors: { email: "Invalid email" },
      });
    }

    const isPasswordMatch = await comparePassword(password, adminData.password);

    if (!isPasswordMatch) {
      return res.status(500).json({
        success: false,
        errors: { password: "Invalid password" },
      });
    }

    const token = jwt.sign(
      {
        id: adminData._id,
        email: adminData.email,
        role: adminData.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );
    res.cookie("adminToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000,
    });
    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};
export const changePassword = async (req, res) => {
  try {
    const { id } = req.admin;
    const { confirmPassword, currentPassword, newPassword } = req.body;
    const User = await AdminModel.findById(id);
    const isCorrect = await comparePassword(currentPassword, User.password);
    const isSamePassword = await comparePassword(newPassword, User.password);
    if (confirmPassword !== newPassword) {
      return res.status(500).json({
        success: false,
        errors: { confirmPassword: "Password is not match " },
      });
    }
    if (!isCorrect) {
      return res.status(500).json({
        success: false,
        errors: { currentPassword: "Password is not incorrect" },
      });
    }
    if (isSamePassword) {
      return res.status(500).json({
        success: false,
        errors: {
          newPassword: "New password must be different from current password",
        },
      });
    }
    const newhash = await hashPassword(newPassword);
    User.password = newhash;
    await User.save();
    return res.status(200).json({
      success: true,
      message: "Password is changed successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};
export const adminLogout = (req, res) => {
  try {
    res.clearCookie("adminToken", {
      httpOnly: true,
      sameSite: "strict",
    });

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};
export const getAllDataCounts = async (req, res) => {
  try {
    const result = {};
    result.blog = await BlogModel.countDocuments();
    result.testimonial = await TestimonialModel.countDocuments();

    const io = req.app.get("io");
    result.activeUsers = io ? io.engine.clientsCount : 0;

    let chatUsers = 0;
    let videoUsers = 0;
    if (state.socketMode) {
      for (const [_, mode] of state.socketMode.entries()) {
        if (mode === "chat") chatUsers++;
        else if (mode === "video") videoUsers++;
      }
    }
    result.chatUsers = chatUsers;
    result.videoUsers = videoUsers;
    result.chatQueue = state.chatQueue ? state.chatQueue.length : 0;
    result.videoQueue = state.videoQueue ? state.videoQueue.length : 0;

    return res.status(200).json({
      success: true,
      message: "get data count",
      result,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

export const CreateAdmin = async (req, res) => {
  try {
    const { username, email, password, role, restriction } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Username, email and password are required",
      });
    }

    const existing = await AdminModel.findOne({ email });
    if (existing) {
      return res.status(500).json({
        success: false,
        errors: { email: "Email already exists" },
      });
    }

    const hashed = await hashPassword(password);
    await AdminModel.create({
      username,
      email,
      password: hashed,
      role: role || "subadmin",
      restriction: Array.isArray(restriction) ? restriction : [],
    });

    return res
      .status(200)
      .json({ success: true, message: "Admin created successfully" });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ success: false, message: "Something went wrong" });
  }
};

export const AdminList = async (req, res) => {
  try {
    let { page, limit, filter } = req.query;
    const baseFilter = ColumnFilter(filter);
    const filterWithRole = { ...baseFilter, role: { $ne: "superadmin" } };
    const sort = { createdAt: -1 };
    const { skip } = Pagination({ page, limit });

    const list = await AdminModel.find(filterWithRole)
      .select("-password")
      .limit(limit)
      .skip(skip)
      .sort(sort);

    const count = await AdminModel.countDocuments(filterWithRole);

    return res.status(200).json({
      success: true,
      message: "Get all admins",
      result: { list, count },
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ success: false, message: "Something went wrong" });
  }
};

export const OneAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await AdminModel.findById(id).select("-password");
    if (!result) {
      return res.status(404).json({ success: false, message: "Not found" });
    }
    return res.status(200).json({
      success: true,
      message: "Get admin",
      result,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ success: false, message: "Something went wrong" });
  }
};

export const UpdateAdmin = async (req, res) => {
  try {
    const { id, username, email, password, role, restriction } = req.body;
    const existing = await AdminModel.findById(id);

    if (!existing) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    if (email && email !== existing.email) {
      const emailExists = await AdminModel.findOne({ email });
      if (emailExists) {
        return res.status(500).json({
          success: false,
          errors: { email: "Email already exists" },
        });
      }
    }

    const updateData = {};
    if (username !== undefined) updateData.username = username;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) updateData.role = role;
    if (restriction !== undefined) updateData.restriction = restriction;
    if (password) {
      updateData.password = await hashPassword(password);
    }

    await AdminModel.updateOne({ _id: existing._id }, updateData);

    return res
      .status(200)
      .json({ success: true, message: "Admin updated successfully" });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ success: false, message: "Something went wrong" });
  }
};

export const DeleteAdmin = async (req, res) => {
  try {
    const { id } = req.body;
    await AdminModel.deleteOne({ _id: id });
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

export const getMe = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      message: "Get admin",
      result: req.admin,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ success: false, message: "Something went wrong" });
  }
};

