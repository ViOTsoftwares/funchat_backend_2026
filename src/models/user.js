import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    username: {
      type: String,
      default: "",
      trim: true,
      unique: true,
      sparse: true,
    },
    avatar: {
      type: String,
      default: "",
    },
    bio: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["active", "banned"],
      default: "active",
    },
    googleId: {
      type: String,
      default: "",
    },
    authProvider: {
      type: String,
      enum: ["email", "google"],
      default: "email",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    otp: {
      type: String,
      default: null,
    },
    otpExpiresAt: {
      type: Date,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export default mongoose.model("User", UserSchema, "users");
