/**
 * Superadmin Seed Script
 * Run: dotenv -e .env.local -- node seed.js
 *
 * Creates a superadmin account if one does not already exist.
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const MONGO_URL = process.env.MONGO_URL;
const ADMIN_EMAIL = process.env.SEED_EMAIL || "admin@funchat.com";
const ADMIN_PASSWORD = process.env.SEED_PASSWORD || "Admin@123";
const ADMIN_USERNAME = process.env.SEED_USERNAME || "Super Admin";

if (!MONGO_URL) {
  console.error("❌ MONGO_URL is not set. Make sure to run: dotenv -e .env.local -- node seed.js");
  process.exit(1);
}

const AdminSchema = new mongoose.Schema(
  {
    username: { type: String, default: "" },
    email: { type: String, default: "", unique: true },
    password: { type: String, default: "" },
    role: { type: String, default: "subadmin" },
    restriction: { type: Array, default: [] },
  },
  { timestamps: true }
);

const AdminModel = mongoose.model("admin", AdminSchema, "admin");

async function seed() {
  await mongoose.connect(MONGO_URL);
  console.log("✅ Connected to MongoDB:", MONGO_URL);

  const existing = await AdminModel.findOne({ role: "superadmin" });
  if (existing) {
    console.log("ℹ️  Superadmin already exists:", existing.email);
    await mongoose.disconnect();
    return;
  }

  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await AdminModel.create({
    username: ADMIN_USERNAME,
    email: ADMIN_EMAIL,
    password: hashedPassword,
    role: "superadmin",
    restriction: [],
  });

  console.log("✅ Superadmin created successfully!");
  console.log("   Email   :", ADMIN_EMAIL);
  console.log("   Password:", ADMIN_PASSWORD);
  console.log("   ⚠️  Please change the password after first login.");

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});
