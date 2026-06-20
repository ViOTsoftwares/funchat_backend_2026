import mongoose from "mongoose";
import { MONGO_URL } from "./env.js";

export const connectDB = async () => {
  try {
    console.log("process.env.MONGO_URI", MONGO_URL);
    await mongoose.connect(MONGO_URL);
    console.log("✅ DB connected");
  } catch (error) {
    console.error("❌ DB connection failed");
    console.error(error.message);
    process.exit(1);
  }
};
