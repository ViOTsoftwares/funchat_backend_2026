import { removeFromQueue, getQueue } from "../utils/queue.js";
import { safeEmit, clearPairing, tryMatch } from "../services/matchmaking.js";
import { saveMessage, editMessage, getConversationMessages, clearConversation, getConversationMessagesPaged } from "../services/messages.js";
import CommunityGroup from "../models/communityGroup.js";
import SettingModel from "../models/setting.js";

const GROUP_PAGE_SIZE = 10;

function registerSocketHandlers(io, state) {
  io.on("connection", (socket) => {
    socket.userId = socket.handshake.auth?.userId || socket.id;

    // Send current feature control status to newly connected client
    SettingModel.findOne()
      .then((setting) => {
        const fc = setting?.featureControl || {
          chat: "live",
          video: "live",
          community: "live",
        };
        socket.emit("feature_control_updated", fc);
      })
      .catch(() => {});

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

      // Check if feature is live
      try {
        const setting = await SettingModel.findOne();
        const fc = setting?.featureControl || { chat: "live", video: "live", community: "live" };
        const modeStatus = fc[mode] || "live";
        if (modeStatus !== "live") {
          socket.emit("feature_unavailable", { mode, status: modeStatus });
          if (typeof ack === "function") {
            ack({ ok: false, error: "feature_unavailable", status: modeStatus });
          }
          return;
        }
      } catch (err) {
        console.error("Feature check error on join:", err);
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
        senderName: senderName || "Stranger",
      });
      const conversationId = state.conversationIdBySocket.get(socket.id);
      saveMessage(conversationId, {
        text: derivedText,
        emojiUrl: derivedEmoji,
        parts,
        from: socket.userId,
        senderName: senderName || "Stranger",
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

        // Fetch last PAGE_SIZE messages for initial load
        const { messages: history, total, hasMore } = await getConversationMessagesPaged(conversationId, GROUP_PAGE_SIZE, 0);

        // Broadcast join message (not persisted in DB)
        socket.to(groupId).emit("group_message", {
          groupId,
          text: `${socket.profileName} joined the group.`,
          from: "system",
          createdAt: new Date().toISOString()
        });

        if (typeof ack === "function") {
          ack({ ok: true, history, hasMore, totalMessages: total, messageDelay, userRemainingMs });
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

    socket.on("group_message", async ({ groupId, text, parts, imageUrl, senderName, id, tempId, from, userId, replyTo }) => {
      if (!groupId) return;
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

      let finalImageUrl = imageUrl || "";
      if (finalImageUrl) {
        try {
          const setting = await SettingModel.findOne().lean();
          if (setting?.communityImageUpload?.enabled === false) {
            finalImageUrl = "";
          } else {
            const group = await CommunityGroup.findOne({ slug: groupId }).lean();
            if (group && group.allowImages === false) {
              finalImageUrl = "";
            }
          }
        } catch {}
      }

      const clientMsgId = id || tempId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const messagePayload = {
        id: clientMsgId,
        tempId: tempId || clientMsgId,
        groupId,
        text: derivedText,
        emojiUrl: derivedEmoji,
        imageUrl: finalImageUrl,
        parts,
        from: from || socket.userId,
        userId: userId || from || socket.userId,
        senderName: senderName || socket.profileName || "Stranger",
        replyTo: replyTo
          ? {
              id: replyTo.id || "",
              senderName: replyTo.senderName || "",
              text: replyTo.text || "",
              emojiUrl: replyTo.emojiUrl || "",
              imageUrl: replyTo.imageUrl || "",
            }
          : null,
        isEdited: false,
        createdAt: new Date().toISOString()
      };

      // Broadcast to EVERYONE in the room including sender
      io.to(groupId).emit("group_message", messagePayload);

      // Save to database under the namespace group:<groupId>
      const conversationId = `group:${groupId}`;
      saveMessage(conversationId, {
        id: messagePayload.id,
        text: derivedText,
        emojiUrl: derivedEmoji,
        imageUrl: messagePayload.imageUrl,
        parts,
        from: messagePayload.from,
        userId: messagePayload.userId,
        senderName: messagePayload.senderName,
        replyTo: messagePayload.replyTo,
        createdAt: messagePayload.createdAt,
      }).catch((err) => {
        console.error("Error saving group message:", err);
      });
    });

    // ── Edit Message Handler ──
    socket.on("edit_group_message", async ({ groupId, messageId, text, parts, emojiUrl }, ack) => {
      try {
        if (!groupId || !messageId) {
          if (typeof ack === "function") ack({ ok: false, error: "Missing groupId or messageId" });
          return;
        }

        let derivedText = text || "";
        if (Array.isArray(parts) && parts.length) {
          derivedText = parts
            .filter((part) => part?.type === "text")
            .map((part) => part.text || "")
            .join("");
        }
        let derivedEmoji = emojiUrl || "";
        if (Array.isArray(parts)) {
          const firstEmoji = parts.find((part) => part?.type === "emoji");
          if (firstEmoji && derivedText.trim() === "") {
            derivedEmoji = firstEmoji.url;
          }
        }

        const conversationId = `group:${groupId}`;
        const editedAt = new Date().toISOString();

        await editMessage(conversationId, messageId, {
          text: derivedText,
          emojiUrl: derivedEmoji,
          parts,
          userId: socket.userId
        });

        const editPayload = {
          groupId,
          messageId,
          text: derivedText,
          emojiUrl: derivedEmoji,
          parts,
          isEdited: true,
          editedAt
        };

        // Broadcast to EVERYONE in the room
        io.to(groupId).emit("group_message_edited", editPayload);

        if (typeof ack === "function") {
          ack({ ok: true, ...editPayload });
        }
      } catch (err) {
        console.error("Error editing group message:", err);
        if (typeof ack === "function") {
          ack({ ok: false, error: err.message });
        }
      }
    });

    // ── Load More Messages (lazy pagination) ──
    socket.on("load_more_messages", async ({ groupId, skip }, ack) => {
      const conversationId = `group:${groupId}`;
      try {
        const { messages, hasMore } = await getConversationMessagesPaged(
          conversationId,
          GROUP_PAGE_SIZE,
          typeof skip === "number" ? skip : 0
        );
        if (typeof ack === "function") {
          ack({ ok: true, messages, hasMore });
        }
      } catch (err) {
        console.error("Error loading more messages:", err);
        if (typeof ack === "function") {
          ack({ ok: false, error: err.message });
        }
      }
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
