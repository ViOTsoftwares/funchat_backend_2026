import express from "express";
import { ADMIN_TOKEN } from "../config/env.js";

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token !== ADMIN_TOKEN) return res.status(401).json({ error: "unauthorized" });
  next();
}

function createAdminRouter(io, state) {
  const router = express.Router();

  router.get("/stats", requireAdmin, (req, res) => {
    const activeUsers = io.engine.clientsCount;
    const activePairs = Math.floor(state.pairedWith.size / 2);
    res.json({
      activeUsers,
      activePairs,
      chatQueue: state.chatQueue.length,
      videoQueue: state.videoQueue.length,
      reportsCount: state.reports.length
    });
  });

  router.get("/reports", requireAdmin, (req, res) => {
    res.json({ reports: state.reports });
  });

  router.post("/ban", requireAdmin, (req, res) => {
    const { socketId } = req.body || {};
    if (!socketId) return res.status(400).json({ error: "socketId required" });
    state.banned.add(socketId);
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit("banned", { reason: "banned by admin" });
      socket.disconnect(true);
    }
    res.json({ ok: true });
  });

  router.post("/disconnect", requireAdmin, (req, res) => {
    const { socketId } = req.body || {};
    if (!socketId) return res.status(400).json({ error: "socketId required" });
    const socket = io.sockets.sockets.get(socketId);
    if (socket) socket.disconnect(true);
    res.json({ ok: true });
  });

  return router;
}

export default createAdminRouter;
