import mongoose from "mongoose";

const { Schema } = mongoose;

const AdminSchema = new Schema(
  {
    username: { type: String, default: "" },
    email: { type: String, default: "", unique: true },
    password: { type: String, default: "" },
    role: { type: String, default: "subadmin" },
    restriction:{type:Array,default:[]}
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("admin", AdminSchema, "admin");
