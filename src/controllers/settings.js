import SettingModel from "../models/setting.js";
import fs from "fs";
import path from "path";
import { isEmpty } from "../lib/isEmpty.js";
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

    // if (!existingSetting) {
    //   return res.status(404).json({ message: "Setting not found" });
    // }

    // 2️⃣ Delete old image if exists
    if (req.file && existingSetting?.logo) {
      const oldFilename = existingSetting.logo.split("/logos/")[1];
      const oldFilePath = path.join(
        process.cwd(),
        "src/uploads/logos",
        oldFilename,
      );
      console.log(oldFilePath);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
    }

    // 3️⃣ Save new image
    const file = req.file;
    const logo = file ? `${process.env.IMAGE_URL}/logos/${file.filename}` : existingSetting?.logo || "";

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
