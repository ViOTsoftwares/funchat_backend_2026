const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const { PORT, CORS_ORIGIN, MONGO_URL } = require("./config/env");
const { connectMongo } = require("./db/mongo");
const state = require("./store/state");
const createAdminRouter = require("./routes/admin");
const registerSocketHandlers = require("./sockets");

async function start() {
  await connectMongo(MONGO_URL);

  const app = express();
  app.use(cors({ origin: CORS_ORIGIN }));
  app.use(express.json());

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: CORS_ORIGIN,
      methods: ["GET", "POST"]
    }
  });

  registerSocketHandlers(io, state);

  app.use("/admin", createAdminRouter(io, state));

  app.get("/health", (req, res) => {
    res.json({ ok: true });
  });

  server.listen(PORT, () => {
    console.log(`FunChat backend listening on ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
