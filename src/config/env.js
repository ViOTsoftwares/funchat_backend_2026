require("dotenv").config();

const PORT = process.env.PORT || 4000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "dev-admin-token";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const MONGO_URL = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/funchat";

module.exports = {
  PORT,
  ADMIN_TOKEN,
  CORS_ORIGIN,
  MONGO_URL
};
