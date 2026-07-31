import mongoose from "mongoose";
import { ENV } from "./env.js";

export const connectDB = async () => {
  try {
    console.log("process.env.MONGO_URI", ENV.MONGO_URL);
    await mongoose.connect(ENV.MONGO_URL);
    console.log("✅ DB connected");
  } catch (error) {
    console.error("❌ DB connection failed");
    console.error(error.message);
    process.exit(1);
  }
};
