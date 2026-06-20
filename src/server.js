import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

import { PORT, CORS_ORIGIN, MONGO_URL, SOCKET_URL, ADMIN_TOKEN } from "./config/env.js";
import state from "./store/state.js";
import createAdminRouter from "./routes/admin.js";
import adminRestRouter from "./routes/admin.router.js";
import registerSocketHandlers from "./sockets/index.js";
import { connectDB } from "./config/DB.js";

async function start() {
  await connectDB();

  const app = express();
  const AllowOrigins = CORS_ORIGIN.split(",");
  const AllowedSocketOrigins = SOCKET_URL.split(",");
  console.log("AllowOrigins", AllowOrigins);
  console.log("AllowedSocketOrigins", AllowedSocketOrigins);

  app.use(cors({ origin: AllowOrigins, credentials: true }));
  app.use(express.json());

  // Serve uploaded files statically
  app.use("/uploads", express.static("src/uploads"));

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

  app.get("/health", (req, res) => {
    res.json({ ok: true });
  });

  server.listen(PORT, () => {
    console.log(`FunChat backend listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
