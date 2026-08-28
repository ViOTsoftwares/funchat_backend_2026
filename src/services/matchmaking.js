import { getQueue } from "../utils/queue.js";
import { saveMessage, clearConversation } from "./messages.js";

// Always use io.to(socketId).emit(...) for 100% reliable Socket.IO event delivery
export function safeEmit(io, socketId, event, payload) {
  if (!socketId) return;
  io.to(socketId).emit(event, payload);
}

export async function clearPairing(io, state, socketId, reason) {
  const otherId = state.pairedWith.get(socketId);

  // Purge socket from queues
  const chatIdx = state.chatQueue.indexOf(socketId);
  if (chatIdx !== -1) state.chatQueue.splice(chatIdx, 1);
  const videoIdx = state.videoQueue.indexOf(socketId);
  if (videoIdx !== -1) state.videoQueue.splice(videoIdx, 1);

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

export function executePair(io, state, mode, a, b) {
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

  const socketA = io.sockets.sockets.get(a);
  const socketB = io.sockets.sockets.get(b);

  const nameA = socketA?.profileName || "Stranger";
  const nameB = socketB?.profileName || "Stranger";

  console.log(`⚡ [MATCH SUCCESS] Real User A (${a} - ${nameA}) <===> Real User B (${b} - ${nameB})`);

  safeEmit(io, a, "matched", { partnerId: b, mode, conversationId, partnerName: nameB });
  safeEmit(io, b, "matched", { partnerId: a, mode, conversationId, partnerName: nameA });

  const autoMessage = { text: "Connected! Say hello to your partner 👋", from: "system" };
  safeEmit(io, a, "message", autoMessage);
  safeEmit(io, b, "message", autoMessage);
  saveMessage(conversationId, autoMessage).catch(() => {});
}

export async function tryMatch(io, state, mode) {
  const queue = getQueue(state, mode);

  // 1. Purge disconnected or already-paired sockets from queue before matching
  let i = queue.length - 1;
  while (i >= 0) {
    const sId = queue[i];
    const sock = io.sockets.sockets.get(sId);
    if (!sock || !sock.connected || state.pairedWith.has(sId)) {
      queue.splice(i, 1);
    }
    i--;
  }

  console.log(`[tryMatch] mode:${mode} | Queue Size: ${queue.length} | Connected Sockets: ${io.sockets.sockets.size}`);

  // 2. Instantly pair any two active real users
  while (queue.length >= 2) {
    const a = queue.shift();
    const b = queue.shift();

    if (!a || !b || a === b) continue;

    executePair(io, state, mode, a, b);
  }
}
