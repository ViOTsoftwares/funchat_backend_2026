import SettingModel from "../models/setting.js";
import fs from "fs";
import path from "path";
import { isEmpty } from "../lib/isEmpty.js";
import { ENV } from "../config/env.js";

export const GetSetting = async (req, res) => {
  try {
    const result = await SettingModel.findOne();

    return res
      .status(200)
      .json({ success: true, message: "site data", result });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ success: false, message: "Something went wrong" });
  }
};

export const UpdateSetting = async (req, res) => {
  try {
    const {
      title,
      address,
      project,
      client,
      phone,
      email,
      linkedinlink,
      xlink,
      instagramlink,
      facebooklink,
    } = req.body;

    const errors = {};
    if (isEmpty(title)) errors.title = "Title is required";
    if (isEmpty(project)) errors.project = "Project is required";
    if (isEmpty(client)) errors.client = "Client is required";
    if (isEmpty(phone)) errors.phone = "Phone is required";
    if (isEmpty(email)) errors.email = "Email is required";
    if (!isEmpty(email) && !String(email).includes("@")) {
      errors.email = "Invalid email";
    }
    if (isEmpty(address)) errors.address = "Address is required";

    const isValidUrl = (value) => {
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    };

    if (!isEmpty(linkedinlink) && !isValidUrl(linkedinlink)) {
      errors.linkedinlink = "Invalid URL";
    }
    if (!isEmpty(xlink) && !isValidUrl(xlink)) {
      errors.xlink = "Invalid URL";
    }
    if (!isEmpty(instagramlink) && !isValidUrl(instagramlink)) {
      errors.instagramlink = "Invalid URL";
    }
    if (!isEmpty(facebooklink) && !isValidUrl(facebooklink)) {
      errors.facebooklink = "Invalid URL";
    }

    if (!isEmpty(errors)) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors,
      });
    }

    // 1️⃣ Find existing setting
    const existingSetting = await SettingModel.findOne();

    if (!req.file && isEmpty(existingSetting?.logo)) {
      return res.status(400).json({
        success: false,
        message: "Logo is required",
        errors: { logo: "Logo is required" },
      });
    }

    // 2️⃣ Delete old image if exists
    if (req.file && existingSetting?.logo) {
      const oldFilename = existingSetting.logo.includes("/logos/")
        ? existingSetting.logo.split("/logos/")[1]
        : existingSetting.logo;

      if (oldFilename) {
        const oldFilePath = path.join(
          process.cwd(),
          "src/uploads/logos",
          oldFilename,
        );
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      }
    }

    // 3️⃣ Save new image
    const file = req.file;
    const logo = file ? file.filename : existingSetting?.logo || "";

    // 4️⃣ Update DB
    if (existingSetting?._id) {
      await SettingModel.updateOne(
        { _id: existingSetting._id },
        {
          title,
          address,
          project,
          client,
          phone,
          email,
          logo,
          linkedinlink,
          xlink,
          instagramlink,
          facebooklink,
        },
      );
    } else {
      await SettingModel.create({
        title,
        address,
        project,
        client,
        phone,
        email,
        logo,
        linkedinlink,
        xlink,
        instagramlink,
        facebooklink,
      });
    }

    return res
      .status(200)
      .json({ success: true, message: "Updated successfully" });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ success: false, message: "Something went wrong" });
  }
};

const DEFAULT_FEATURE_CONTROL = {
  chat: "live",
  video: "live",
  community: "live",
};

export const GetFeatureControl = async (req, res) => {
  try {
    const setting = await SettingModel.findOne();
    const result = setting?.featureControl || DEFAULT_FEATURE_CONTROL;
    return res.status(200).json({
      success: true,
      message: "Feature control settings",
      result,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

export const UpdateFeatureControl = async (req, res) => {
  try {
    const { chat = "live", video = "live", community = "live" } = req.body;
    const allowed = ["live", "coming_soon", "maintenance"];

    const validChat = allowed.includes(chat) ? chat : "live";
    const validVideo = allowed.includes(video) ? video : "live";
    const validCommunity = allowed.includes(community) ? community : "live";

    const featureControl = {
      chat: validChat,
      video: validVideo,
      community: validCommunity,
    };

    const existingSetting = await SettingModel.findOne();
    if (existingSetting?._id) {
      await SettingModel.updateOne(
        { _id: existingSetting._id },
        { $set: { featureControl } }
      );
    } else {
      await SettingModel.create({
        featureControl,
      });
    }

    // Broadcast update via Socket.IO if available
    const io = req.app.get("io");
    if (io) {
      io.emit("feature_control_updated", featureControl);
    }

    return res.status(200).json({
      success: true,
      message: "Feature control updated successfully",
      result: featureControl,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

export const GetPublicFeatureControl = async (req, res) => {
  try {
    const setting = await SettingModel.findOne();
    const result = setting?.featureControl || DEFAULT_FEATURE_CONTROL;
    return res.status(200).json({
      success: true,
      result,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      result: DEFAULT_FEATURE_CONTROL,
    });
  }
};

export const GetPublicSetting = async (req, res) => {
  try {
    const result = await SettingModel.findOne();
    return res.status(200).json({
      success: true,
      message: "Setting data",
      result,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

export const GetCommunityMediaSettings = async (req, res) => {
  try {
    const setting = await SettingModel.findOne();
    const result = setting?.communityImageUpload || { enabled: true, maxFileSizeMB: 5 };
    return res.status(200).json({ success: true, result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

export const UpdateCommunityMediaSettings = async (req, res) => {
  try {
    const { enabled = true, maxFileSizeMB = 5 } = req.body;
    const communityImageUpload = {
      enabled: enabled === true || enabled === "true",
      maxFileSizeMB: Math.min(Math.max(Number(maxFileSizeMB) || 5, 1), 5), // clamp to 1-5MB max
    };

    const existingSetting = await SettingModel.findOne();
    if (existingSetting?._id) {
      await SettingModel.updateOne(
        { _id: existingSetting._id },
        { $set: { communityImageUpload } }
      );
    } else {
      await SettingModel.create({
        communityImageUpload,
      });
    }

    const io = req.app.get("io");
    if (io) {
      io.emit("community_media_settings_updated", communityImageUpload);
    }

    return res.status(200).json({
      success: true,
      message: "Community image settings updated successfully",
      result: communityImageUpload,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

