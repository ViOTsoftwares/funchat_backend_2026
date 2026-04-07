const { getQueue } = require("../utils/queue");
const { saveMessage, clearConversation } = require("./messages");

function safeEmit(io, socketId, event, payload) {
  const socket = io.sockets.sockets.get(socketId);
  if (socket) socket.emit(event, payload);
}

async function clearPairing(io, state, socketId, reason) {
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

async function tryMatch(io, state, mode) {
  const queue = getQueue(state, mode);
  console.log("[tryMatch]", mode, "queue:", queue.length);
  while (queue.length >= 2) {
    const a = queue.shift();
    const b = queue.shift();
    if (!a || !b || a === b) continue;

    console.log("[matched]", mode, a, b);
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

    safeEmit(io, a, "matched", { partnerId: b, mode, conversationId });
    safeEmit(io, b, "matched", { partnerId: a, mode, conversationId });

    const autoMessage = { text: "Hiii", from: "system" };
    safeEmit(io, a, "message", autoMessage);
    safeEmit(io, b, "message", autoMessage);
    saveMessage(conversationId, autoMessage).catch(() => {});
  }
}

module.exports = {
  safeEmit,
  clearPairing,
  tryMatch
};
