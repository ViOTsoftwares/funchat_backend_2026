import mongoose from "mongoose";

const ModuleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    path: { type: String, default: "" },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  { timestamps: true },
);

const Modules = mongoose.model("Module", ModuleSchema);
export default Modules;
