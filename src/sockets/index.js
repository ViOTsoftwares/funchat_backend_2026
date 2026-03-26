const { removeFromQueue, getQueue } = require("../utils/queue");
const { safeEmit, clearPairing, tryMatch } = require("../services/matchmaking");
const { saveMessage, getConversationMessages } = require("../services/messages");

function registerSocketHandlers(io, state) {
  io.on("connection", (socket) => {
    if (state.banned.has(socket.id)) {
      socket.emit("banned", { reason: "You are banned" });
      socket.disconnect(true);
      return;
    }

    socket.on("join", async ({ mode }, ack) => {
      console.log("[join]", socket.id, "mode:", mode);
      if (mode !== "chat" && mode !== "video") {
        socket.emit("error", { message: "Invalid mode" });
        if (typeof ack === "function") {
          ack({ ok: false, error: "invalid_mode" });
        }
        return;
      }
      await clearPairing(io, state, socket.id, "restart");
      state.socketMode.set(socket.id, mode);
      const queue = getQueue(state, mode);
      if (!queue.includes(socket.id)) queue.push(socket.id);
      console.log("[queue]", mode, "size:", queue.length);
      await tryMatch(io, state, mode);
      if (typeof ack === "function") {
        ack({ ok: true, mode, queueSize: queue.length });
      }
    });

    socket.on("message", async ({ text, emojiUrl, parts }) => {
      const partnerId = state.pairedWith.get(socket.id);
      if (!partnerId) return;
      let derivedText = text || "";
      if (Array.isArray(parts) && parts.length) {
        derivedText = parts
          .filter((part) => part?.type === "text")
          .map((part) => part.text || "")
          .join("");
      }
      let derivedEmoji = emojiUrl;
      if (!derivedEmoji && Array.isArray(parts)) {
        const firstEmoji = parts.find((part) => part?.type === "emoji");
        if (firstEmoji && derivedText.trim() === "") {
          derivedEmoji = firstEmoji.url;
        }
      }
      safeEmit(io, partnerId, "message", {
        text: derivedText,
        emojiUrl: derivedEmoji,
        parts,
        from: socket.id
      });
      const conversationId = state.conversationIdBySocket.get(socket.id);
      saveMessage(conversationId, {
        text: derivedText,
        emojiUrl: derivedEmoji,
        parts,
        from: socket.id
      }).catch(() => {});
    });

    socket.on("next", async () => {
      const mode = state.socketMode.get(socket.id);
      if (!mode) return;
      const partnerId = state.pairedWith.get(socket.id);
      const conversationId = state.conversationIdBySocket.get(socket.id);
      const systemMessage = { text: "User has left the chat.", from: "system" };
      safeEmit(io, socket.id, "message", systemMessage);
      if (partnerId) {
        safeEmit(io, partnerId, "message", systemMessage);
      }
      saveMessage(conversationId, systemMessage).catch(() => {});
      await clearPairing(io, state, socket.id, "next");
      const queue = getQueue(state, mode);
      if (!queue.includes(socket.id)) queue.push(socket.id);
      await tryMatch(io, state, mode);
    });

    socket.on("close_chat", async () => {
      const partnerId = state.pairedWith.get(socket.id);
      const conversationId = state.conversationIdBySocket.get(socket.id);
      const systemMessage = { text: "Chat is closed.", from: "system" };
      safeEmit(io, socket.id, "message", systemMessage);
      if (partnerId) {
        safeEmit(io, partnerId, "message", systemMessage);
      }
      saveMessage(conversationId, systemMessage).catch(() => {});
      await clearPairing(io, state, socket.id, "close");
    });

    socket.on("offer", ({ sdp }) => {
      const partnerId = state.pairedWith.get(socket.id);
      if (!partnerId) return;
      safeEmit(io, partnerId, "offer", { sdp, from: socket.id });
    });

    socket.on("answer", ({ sdp }) => {
      const partnerId = state.pairedWith.get(socket.id);
      if (!partnerId) return;
      safeEmit(io, partnerId, "answer", { sdp, from: socket.id });
    });

    socket.on("ice-candidate", ({ candidate }) => {
      const partnerId = state.pairedWith.get(socket.id);
      if (!partnerId) return;
      safeEmit(io, partnerId, "ice-candidate", { candidate, from: socket.id });
    });


    socket.on("resume", async ({ conversationId }) => {
      if (!conversationId) return;
      const history = await getConversationMessages(conversationId);
      socket.emit("history", { conversationId, messages: history });

      const participants = state.conversationSockets.get(conversationId);
      if (participants) {
        const pending = state.pendingConversationClear.get(conversationId);
        if (pending) {
          clearTimeout(pending);
          state.pendingConversationClear.delete(conversationId);
        }
        participants.add(socket.id);
        const partnerId = [...participants].find((id) => id !== socket.id);
        if (partnerId) {
          state.pairedWith.set(socket.id, partnerId);
          state.pairedWith.set(partnerId, socket.id);
          state.conversationIdBySocket.set(socket.id, conversationId);
          state.conversationIdBySocket.set(partnerId, conversationId);
          safeEmit(io, socket.id, "matched", { partnerId, mode: state.socketMode.get(partnerId) || "chat", conversationId, resumed: true });
          safeEmit(io, partnerId, "matched", { partnerId: socket.id, mode: state.socketMode.get(partnerId) || "chat", conversationId, resumed: true });
        }
      }
    });

    socket.on("report", ({ reportedId, reason }) => {
      if (!reportedId) return;
      state.reports.push({
        reporterId: socket.id,
        reportedId,
        reason: reason || "unspecified",
        at: new Date().toISOString()
      });
      socket.emit("reported", { ok: true });
    });

    socket.on("disconnect", async () => {
      const mode = state.socketMode.get(socket.id);
      const conversationId = state.conversationIdBySocket.get(socket.id);
      if (mode) {
        removeFromQueue(getQueue(state, mode), socket.id);
      }
      await clearPairing(io, state, socket.id, "disconnect");
      if (conversationId) {
        const pending = state.pendingConversationClear.get(conversationId);
        if (pending) {
          clearTimeout(pending);
        }
        const timeoutId = setTimeout(async () => {
          const participants = state.conversationSockets.get(conversationId);
          if (!participants || participants.size <= 1) {
            state.conversationSockets.delete(conversationId);
            state.pendingConversationClear.delete(conversationId);
            const { clearConversation } = require("../services/messages");
            await clearConversation(conversationId);
          }
        }, 30000);
        state.pendingConversationClear.set(conversationId, timeoutId);
      }
      state.socketMode.delete(socket.id);
    });
  });
}

module.exports = registerSocketHandlers;
