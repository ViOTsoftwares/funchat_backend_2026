import { getQueue } from "../utils/queue.js";
import { saveMessage, clearConversation } from "./messages.js";

export function safeEmit(io, socketId, event, payload) {
  const socket = io.sockets.sockets.get(socketId);
  if (socket) socket.emit(event, payload);
}

export async function clearPairing(io, state, socketId, reason) {
  const otherId = state.pairedWith.get(socketId);
  if (!otherId) return;
  const conversationId = state.conversationIdBySocket.get(socketId);
  state.pairedWith.delete(socketId);
  state.pairedWith.delete(otherId);
  state.conversationIdBySocket.delete(socketId);
  state.conversationIdBySocket.delete(otherId);
  if (conversationId) {
    const setRef = state.conversationSockets.get(conversationId);
    if (setRef) {
      setRef.delete(socketId);
      if (reason !== "disconnect") {
        setRef.delete(otherId);
      }
      if (setRef.size === 0) {
        state.conversationSockets.delete(conversationId);
      }
    }
    if (reason !== "disconnect") {
      try {
        await clearConversation(conversationId);
      } catch {
        // don't block matching on db errors
      }
    }
  }
  if (reason === "next") {
    safeEmit(io, otherId, "conversation_cleared", { conversationId });
  }
  safeEmit(io, otherId, "partner_left", { reason: reason || "left" });
}

const soloTimers = new Map();

export function executePair(io, state, mode, a, b, customNameB = null) {
  state.pairedWith.set(a, b);
  state.pairedWith.set(b, a);
  const conversationId = `${a}:${b}:${Date.now()}`;
  state.conversationIdBySocket.set(a, conversationId);
  state.conversationIdBySocket.set(b, conversationId);
  state.conversationSockets.set(conversationId, new Set([a, b]));

  const pending = state.pendingConversationClear.get(conversationId);
  if (pending) {
    clearTimeout(pending);
    state.pendingConversationClear.delete(conversationId);
  }

  const nameA = io.sockets.sockets.get(a)?.profileName || "Stranger";
  const nameB = customNameB || io.sockets.sockets.get(b)?.profileName || "Stranger";

  safeEmit(io, a, "matched", { partnerId: b, mode, conversationId, partnerName: nameB });
  if (!b.startsWith("bot_")) {
    safeEmit(io, b, "matched", { partnerId: a, mode, conversationId, partnerName: nameA });
  }

  const autoMessage = { text: "Connected! Say hello to your partner 👋", from: "system" };
  safeEmit(io, a, "message", autoMessage);
  if (!b.startsWith("bot_")) {
    safeEmit(io, b, "message", autoMessage);
  }
  saveMessage(conversationId, autoMessage).catch(() => {});
}

export async function tryMatch(io, state, mode) {
  const queue = getQueue(state, mode);
  console.log("[tryMatch]", mode, "queue size:", queue.length);

  // 1. Pair real users first if 2 or more are in queue
  while (queue.length >= 2) {
    const a = queue.shift();
    const b = queue.shift();
    if (!a || !b || a === b) continue;

    if (soloTimers.has(a)) { clearTimeout(soloTimers.get(a)); soloTimers.delete(a); }
    if (soloTimers.has(b)) { clearTimeout(soloTimers.get(b)); soloTimers.delete(b); }

    executePair(io, state, mode, a, b);
  }

  // 2. If a single user is waiting in chat queue, match with companion after 3.5s so single user testing works
  if (queue.length === 1 && mode === "chat") {
    const singleSocketId = queue[0];
    if (!soloTimers.has(singleSocketId)) {
      const timer = setTimeout(() => {
        soloTimers.delete(singleSocketId);
        const idx = queue.indexOf(singleSocketId);
        if (idx !== -1) {
          queue.splice(idx, 1);
          const botId = `bot_${Date.now()}`;
          console.log("[FunBot Auto-Matched]", singleSocketId, botId);
          executePair(io, state, mode, singleSocketId, botId, "FunBot ✨");
        }
      }, 3500);
      soloTimers.set(singleSocketId, timer);
    }
  }
}
