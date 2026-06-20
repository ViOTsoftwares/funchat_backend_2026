import mongoose from "mongoose";

const SubModuleSchema = new mongoose.Schema(
  {
    module: { type: String, required: true },
    moduleId: { type: String, required: true, ref: "Module" },
    name: { type: String, required: true },
    path: { type: String, required: true },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  { timestamps: true },
);

export default mongoose.model("SubModule", SubModuleSchema);
