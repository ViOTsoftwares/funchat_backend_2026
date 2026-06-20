import mongoose from "mongoose";

const CMSSchema = new mongoose.Schema(
  {
    identifier: { type: String, default: "", unique: true },
    title: { type: String, default: "" },
    content: { type: String, default: "" },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true }
);

export default mongoose.model("CMS", CMSSchema, "cms");
