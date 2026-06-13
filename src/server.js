const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const { PORT, CORS_ORIGIN, MONGO_URL, SOCKET_URL } = require("./config/env");
const { connectMongo } = require("./db/mongo");
const state = require("./store/state");
const createAdminRouter = require("./routes/admin");
const registerSocketHandlers = require("./sockets");

async function start() {
  await connectMongo(MONGO_URL);

  const app = express();
  const AllowOrigins = CORS_ORIGIN.split(",");
  const AllowedSocketOrigins = SOCKET_URL.split(",");
  console.log("AllowOrigins", AllowOrigins)
  console.log("AllowedSocketOrigins", AllowedSocketOrigins)
  app.use(cors({ origin: AllowOrigins }));
  app.use(express.json());

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: AllowedSocketOrigins,
      methods: "*"
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
