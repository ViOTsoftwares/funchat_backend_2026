import mongoose from "mongoose";

const SettingSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" },
    address: { type: String, default: "" },
    project: { type: String, default: "" },
    client: { type: String, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    logo: { type: String, default: "" },
    linkedinlink: { type: String, default: "" },
    xlink: { type: String, default: "" },
    instagramlink: { type: String, default: "" },
    facebooklink: { type: String, default: "" },
    featureControl: {
      chat: {
        type: String,
        enum: ["live", "coming_soon", "maintenance"],
        default: "live",
      },
      video: {
        type: String,
        enum: ["live", "coming_soon", "maintenance"],
        default: "live",
      },
      community: {
        type: String,
        enum: ["live", "coming_soon", "maintenance"],
        default: "live",
      },
    },
    communityImageUpload: {
      enabled: {
        type: Boolean,
        default: true,
      },
      maxFileSizeMB: {
        type: Number,
        default: 5,
      },
    },
  },
  { timestamps: true }
);

export default mongoose.model("Setting", SettingSchema, "settings");
