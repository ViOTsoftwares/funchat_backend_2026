import mongoose from "mongoose";

const BlogSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" },
    content: { type: String, default: "" },
    image: { type: String, default: "" },
    author: { type: String, default: "" },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true }
);

export default mongoose.model("Blog", BlogSchema, "blogs");
