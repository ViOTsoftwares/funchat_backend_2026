import { removeFromQueue, getQueue } from "../utils/queue.js";
import { safeEmit, clearPairing, tryMatch } from "../services/matchmaking.js";
import { saveMessage, getConversationMessages, clearConversation } from "../services/messages.js";
import CommunityGroup from "../models/communityGroup.js";

function registerSocketHandlers(io, state) {
  io.on("connection", (socket) => {
    socket.userId = socket.handshake.auth?.userId || socket.id;

    if (state.banned.has(socket.id)) {
      socket.emit("banned", { reason: "You are banned" });
      socket.disconnect(true);
      return;
    }

    socket.on("join", async ({ mode, name }, ack) => {
      console.log("[join]", socket.id, "mode:", mode, "name:", name);
      socket.profileName = name || "Stranger";
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

    socket.on("message", async ({ text, emojiUrl, parts, senderName }) => {
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
        from: socket.userId,
        senderName: senderName || "Stranger"
      });
      const conversationId = state.conversationIdBySocket.get(socket.id);
      saveMessage(conversationId, {
        text: derivedText,
        emojiUrl: derivedEmoji,
        parts,
        from: socket.userId,
        senderName: senderName || "Stranger"
      }).catch(() => {});
    });

    socket.on("typing", ({ isTyping }) => {
      const partnerId = state.pairedWith.get(socket.id);
      if (!partnerId) return;
      safeEmit(io, partnerId, "typing", { isTyping: Boolean(isTyping) });
    });

    socket.on("update_name", ({ name }) => {
      socket.profileName = name || "Stranger";
      const partnerId = state.pairedWith.get(socket.id);
      if (partnerId) {
        safeEmit(io, partnerId, "partner_name_changed", { name: socket.profileName });
      }
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

    socket.on("resume", async ({ conversationId, name }) => {
      if (!conversationId) return;

      socket.userId = socket.handshake.auth?.userId || socket.id;
      socket.profileName = name || "Stranger";

      const history = await getConversationMessages(conversationId);
      socket.emit("history", { conversationId, messages: history });

      const participants = state.conversationSockets.get(conversationId);
      if (participants) {
        const pendingClear = state.pendingConversationClear.get(conversationId);
        if (pendingClear) {
          clearTimeout(pendingClear);
          state.pendingConversationClear.delete(conversationId);
        }
        const pendingCleanup = state.pendingDisconnectCleanups.get(conversationId);
        if (pendingCleanup) {
          clearTimeout(pendingCleanup.timeoutId);
          state.pendingDisconnectCleanups.delete(conversationId);
        }

        let oldSocketId = null;
        let partnerId = null;
        for (const pid of participants) {
          const isConnected = io.sockets.sockets.has(pid);
          if (!isConnected) {
            oldSocketId = pid;
          } else {
            partnerId = pid;
          }
        }

        if (oldSocketId) {
          participants.delete(oldSocketId);
          state.pairedWith.delete(oldSocketId);
          state.conversationIdBySocket.delete(oldSocketId);
          state.socketMode.delete(oldSocketId);
        }

        participants.add(socket.id);

        if (!partnerId) {
          partnerId = [...participants].find((id) => id !== socket.id);
        }

        if (partnerId) {
          state.pairedWith.set(socket.id, partnerId);
          state.pairedWith.set(partnerId, socket.id);
          state.conversationIdBySocket.set(socket.id, conversationId);
          state.conversationIdBySocket.set(partnerId, conversationId);

          const partnerMode = state.socketMode.get(partnerId) || "chat";
          state.socketMode.set(socket.id, partnerMode);

          const myName = socket.profileName || "Stranger";
          const partnerName = io.sockets.sockets.get(partnerId)?.profileName || "Stranger";

          safeEmit(io, socket.id, "matched", { partnerId, mode: partnerMode, conversationId, partnerName, resumed: true });
          safeEmit(io, partnerId, "matched", { partnerId: socket.id, mode: partnerMode, conversationId, partnerName: myName, resumed: true });
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

    // ── Group Chat Handlers ──
    socket.on("join_group", async ({ groupId, name }, ack) => {
      console.log(`[join_group] socket:${socket.id} joined room:${groupId} name:${name}`);
      socket.profileName = name || "Stranger";
      socket.join(groupId);

      const conversationId = `group:${groupId}`;
      try {
        const group = await CommunityGroup.findOne({ slug: groupId });
        const messageDelay = group?.messageDelay || 0;
        state.groupDelays.set(groupId, messageDelay);

        let userRemainingMs = 0;
        if (messageDelay > 0) {
          const key = `${groupId}:${socket.userId}`;
          const lastSent = state.lastMessageTime.get(key) || 0;
          if (lastSent > 0) {
            const requiredDelay = messageDelay * 60 * 1000;
            const elapsed = Date.now() - lastSent;
            if (elapsed < requiredDelay) {
              userRemainingMs = requiredDelay - elapsed;
            }
          }
        }

        const history = await getConversationMessages(conversationId);
        
        // Broadcast join message (not persisted in DB)
        socket.to(groupId).emit("group_message", {
          groupId,
          text: `${socket.profileName} joined the group.`,
          from: "system",
          createdAt: new Date().toISOString()
        });

        if (typeof ack === "function") {
          ack({ ok: true, history, messageDelay, userRemainingMs });
        }
      } catch (err) {
        console.error("Error joining group:", err);
        if (typeof ack === "function") {
          ack({ ok: false, error: err.message });
        }
      }
    });

    socket.on("leave_group", ({ groupId }) => {
      console.log(`[leave_group] socket:${socket.id} left room:${groupId}`);
      socket.leave(groupId);
      
      // Broadcast leave message (not persisted in DB)
      socket.to(groupId).emit("group_message", {
        groupId,
        text: `${socket.profileName || "Stranger"} left the group.`,
        from: "system",
        createdAt: new Date().toISOString()
      });
    });

    socket.on("group_message", async ({ groupId, text, parts, senderName }) => {
      const delayMinutes = state.groupDelays.get(groupId) || 0;
      if (delayMinutes > 0) {
        const key = `${groupId}:${socket.userId}`;
        const lastSent = state.lastMessageTime.get(key) || 0;
        const now = Date.now();
        const elapsed = now - lastSent;
        const requiredDelay = delayMinutes * 60 * 1000;
        
        if (elapsed < requiredDelay) {
          const remainingMs = requiredDelay - elapsed;
          return socket.emit("slow_mode_error", { 
            message: `Slow mode is active. You must wait before sending another message.`,
            remainingMs 
          });
        }
        state.lastMessageTime.set(key, now);
      }

      let derivedText = text || "";
      if (Array.isArray(parts) && parts.length) {
        derivedText = parts
          .filter((part) => part?.type === "text")
          .map((part) => part.text || "")
          .join("");
      }
      let derivedEmoji = "";
      if (Array.isArray(parts)) {
        const firstEmoji = parts.find((part) => part?.type === "emoji");
        if (firstEmoji && derivedText.trim() === "") {
          derivedEmoji = firstEmoji.url;
        }
      }

      const messagePayload = {
        groupId,
        text: derivedText,
        emojiUrl: derivedEmoji,
        parts,
        from: socket.userId,
        senderName: senderName || socket.profileName || "Stranger",
        createdAt: new Date().toISOString()
      };

      // Broadcast to EVERYONE in the room including sender
      io.to(groupId).emit("group_message", messagePayload);

      // Save to database under the namespace group:<groupId>
      const conversationId = `group:${groupId}`;
      saveMessage(conversationId, {
        text: derivedText,
        emojiUrl: derivedEmoji,
        parts,
        from: socket.userId,
        senderName: senderName || socket.profileName || "Stranger"
      }).catch((err) => {
        console.error("Error saving group message:", err);
      });
    });

    socket.on("group_typing", ({ groupId, isTyping }) => {
      socket.to(groupId).emit("group_typing", {
        groupId,
        userId: socket.userId,
        senderName: socket.profileName || "Stranger",
        isTyping: Boolean(isTyping)
      });
    });

    socket.on("disconnect", async () => {
      const mode = state.socketMode.get(socket.id);
      const conversationId = state.conversationIdBySocket.get(socket.id);

      if (mode) {
        removeFromQueue(getQueue(state, mode), socket.id);
      }

      if (conversationId) {
        const timeoutId = setTimeout(async () => {
          await clearPairing(io, state, socket.id, "disconnect");
          state.pendingDisconnectCleanups.delete(conversationId);

          const pending = state.pendingConversationClear.get(conversationId);
          if (pending) {
            clearTimeout(pending);
          }
          const dbTimeoutId = setTimeout(async () => {
            const participants = state.conversationSockets.get(conversationId);
            if (!participants || participants.size <= 1) {
              state.conversationSockets.delete(conversationId);
              state.pendingConversationClear.delete(conversationId);
              await clearConversation(conversationId);
            }
          }, 30000);
          state.pendingConversationClear.set(conversationId, dbTimeoutId);
        }, 5000);

        state.pendingDisconnectCleanups.set(conversationId, {
          timeoutId,
          oldSocketId: socket.id
        });
      } else {
        await clearPairing(io, state, socket.id, "disconnect");
      }

      state.socketMode.delete(socket.id);
    });
  });
}

export default registerSocketHandlers;
