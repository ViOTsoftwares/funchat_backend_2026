import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

import { ENV } from "./config/env.js";
import state from "./store/state.js";
import createAdminRouter from "./routes/admin.js";
import adminRestRouter from "./routes/admin.router.js";
import publicRestRouter from "./routes/public.router.js";
import registerSocketHandlers from "./sockets/index.js";
import { connectDB } from "./config/DB.js";
import { seedDefaultAds } from "./controllers/advertisement.js";
import { seedDefaultCMS } from "./controllers/cms.js";
import { seedDefaultEmailTemplates } from "./controllers/emailTemplate.js";

async function start() {
  await connectDB();
  await seedDefaultAds();
  await seedDefaultCMS();
  await seedDefaultEmailTemplates();

  const app = express();
  const defaultAllowedOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:4000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
  ];
  const AllowOrigins = ENV.CORS_ORIGIN
    ? ENV.CORS_ORIGIN.split(",").map((o) => o.trim())
    : defaultAllowedOrigins;
  const AllowedSocketOrigins = ENV.SOCKET_URL
    ? ENV.SOCKET_URL.split(",").map((o) => o.trim())
    : defaultAllowedOrigins;

  console.log("AllowOrigins:", AllowOrigins);
  console.log("AllowedSocketOrigins:", AllowedSocketOrigins);

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, postman) or matching origins
        if (!origin || AllowOrigins.includes("*") || AllowOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(null, true); // Permissive in dev
      },
      credentials: true,
    })
  );
  app.use(express.json());

  // Serve uploaded files statically
  app.use("/image", express.static("src/uploads"));

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  app.set("io", io);

  registerSocketHandlers(io, state);

  // Simple Socket.IO admin endpoints (stats, ban, disconnect)
  app.use("/admin", createAdminRouter(io, state));

  // Full JWT-based REST admin API (login, CRUD, dashboard, etc.)
  app.use("/api/admin", adminRestRouter);

  // Public REST API
  app.use("/api/public", publicRestRouter);

  // Google OAuth Root Aliases
  app.get("/auth/google/redirect", (req, res, next) => {
    req.url = "/auth/google/redirect" + (req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "");
    publicRestRouter(req, res, next);
  });
  app.get("/auth/google/callback", (req, res, next) => {
    req.url = "/auth/google/callback" + (req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "");
    publicRestRouter(req, res, next);
  });

  app.get("/health", (req, res) => {
    res.json({ ok: true });
  });

  server.listen(ENV.PORT, () => {
    console.log(`🚀 Server running on port ${ENV.PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
