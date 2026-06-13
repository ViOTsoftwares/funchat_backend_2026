require("dotenv").config();

const PORT = process.env.PORT
const ADMIN_TOKEN = process.env.ADMIN_TOKEN
const CORS_ORIGIN = process.env.CORS_ORIGIN
const MONGO_URL = process.env.MONGO_URL
const SOCKET_URL = process.env.SOCKET_URL

module.exports = {
  PORT,
  ADMIN_TOKEN,
  CORS_ORIGIN,
  MONGO_URL,
  SOCKET_URL
};
