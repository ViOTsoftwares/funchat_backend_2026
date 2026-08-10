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

async function start() {
  await connectDB();
  await seedDefaultAds();
  await seedDefaultCMS();

  const app = express();
  const AllowOrigins = ENV.CORS_ORIGIN ? ENV.CORS_ORIGIN.split(",") : [];
  const AllowedSocketOrigins = ENV.SOCKET_URL ? ENV.SOCKET_URL.split(",") : [];
  console.log("AllowOrigins", AllowOrigins);
  console.log("AllowedSocketOrigins", AllowedSocketOrigins);

  app.use(cors({ origin: AllowOrigins, credentials: true }));
  app.use(express.json());

  // Serve uploaded files statically
  app.use("/image", express.static("src/uploads"));

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: AllowedSocketOrigins,
      methods: "*"
    }
  });

  app.set("io", io);

  registerSocketHandlers(io, state);

  // Simple Socket.IO admin endpoints (stats, ban, disconnect)
  app.use("/admin", createAdminRouter(io, state));

  // Full JWT-based REST admin API (login, CRUD, dashboard, etc.)
  app.use("/api/admin", adminRestRouter);

  // Public REST API
  app.use("/api/public", publicRestRouter);

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
