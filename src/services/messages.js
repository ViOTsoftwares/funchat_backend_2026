import Conversation from "../models/Conversation.js";

export async function saveMessage(conversationId, payload) {
  if (!conversationId) return null;
  const message = {
    id: payload.id || payload.tempId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId: payload.userId || payload.from || "system",
    senderName: payload.senderName || "",
    text: payload.text || "",
    emojiUrl: payload.emojiUrl || "",
    imageUrl: payload.imageUrl || "",
    parts: Array.isArray(payload.parts) ? payload.parts : [],
    replyTo: payload.replyTo
      ? {
          id: payload.replyTo.id || "",
          senderName: payload.replyTo.senderName || "",
          text: payload.replyTo.text || "",
          emojiUrl: payload.replyTo.emojiUrl || "",
          imageUrl: payload.replyTo.imageUrl || "",
        }
      : null,
    isEdited: Boolean(payload.isEdited),
    editedAt: payload.editedAt || null,
    createdAt: payload.createdAt ? new Date(payload.createdAt) : new Date(),
  };

  return Conversation.findOneAndUpdate(
    { conversationId },
    { $push: { messages: message } },
    { upsert: true, new: true }
  );
}

export async function editMessage(conversationId, messageId, { text, emojiUrl, parts, userId }) {
  if (!conversationId || !messageId) return null;

  try {
    const convo = await Conversation.findOne({ conversationId });
    if (!convo || !convo.messages || convo.messages.length === 0) {
      console.warn(`[editMessage] Conversation ${conversationId} not found or empty.`);
      return null;
    }

    // Find the message index by matching id, _id, or hist index
    let targetIndex = convo.messages.findIndex(
      (m) => String(m.id || "") === String(messageId) || (m._id && String(m._id) === String(messageId))
    );

    // Fallback: If messageId has hist_timestamp_index pattern (for older pre-existing messages)
    if (targetIndex === -1 && typeof messageId === "string" && messageId.startsWith("hist_")) {
      const segs = messageId.split("_");
      const idx = parseInt(segs[segs.length - 1], 10);
      if (!isNaN(idx) && convo.messages[idx]) {
        targetIndex = idx;
      }
    }

    if (targetIndex === -1) {
      console.warn(`[editMessage] Message with ID ${messageId} not found in ${conversationId}`);
      return null;
    }

    const targetMsg = convo.messages[targetIndex];

    // Enforce 10-minute edit window (with 1 minute grace period for clock drift)
    const msgCreatedAt = targetMsg.createdAt ? new Date(targetMsg.createdAt).getTime() : 0;
    if (msgCreatedAt > 0) {
      const MAX_EDIT_AGE_MS = 11 * 60 * 1000; // 10 minutes + 1 minute grace period
      if (Date.now() - msgCreatedAt > MAX_EDIT_AGE_MS) {
        console.warn(`[editMessage] Edit rejected: Message ${messageId} is older than 10 minutes.`);
        return null;
      }
    }

    targetMsg.text = text || "";
    targetMsg.emojiUrl = emojiUrl || "";
    targetMsg.parts = Array.isArray(parts) ? parts : [];
    targetMsg.isEdited = true;
    targetMsg.editedAt = new Date();
    targetMsg.id = String(messageId);

    convo.markModified("messages");
    const updatedConvo = await convo.save();
    console.log(`[editMessage] Successfully updated and persisted message ${messageId} in ${conversationId}`);
    return updatedConvo;
  } catch (err) {
    console.error(`[editMessage] Failed to save edited message:`, err);
    return null;
  }
}

export async function clearConversation(conversationId) {
  if (!conversationId) return;
  await Conversation.deleteOne({ conversationId });
}

export async function getConversationMessages(conversationId) {
  if (!conversationId) return [];
  const convo = await Conversation.findOne({ conversationId }).lean();
  const rawList = convo?.messages || [];
  return rawList.map((m, idx) => ({
    ...m,
    id: m.id || (m._id ? String(m._id) : `msg_${m.createdAt ? new Date(m.createdAt).getTime() : idx}_${idx}`),
    isEdited: Boolean(m.isEdited),
  }));
}

/**
 * Fetch a paginated slice of messages for a conversation.
 * Returns the last `limit` messages before the given `skip` offset from the end.
 *
 * @param {string} conversationId
 * @param {number} limit   - how many messages to return (default 10)
 * @param {number} skip    - how many messages from the END to skip before reading (default 0)
 * @returns {{ messages: Array, total: number, hasMore: boolean }}
 */
export async function getConversationMessagesPaged(conversationId, limit = 10, skip = 0) {
  if (!conversationId) return { messages: [], total: 0, hasMore: false };

  const result = await Conversation.aggregate([
    { $match: { conversationId } },
    {
      $project: {
        total: { $size: "$messages" },
        messages: {
          $slice: [
            "$messages",
            // start index (from front): total - skip - limit, clamped to 0
            { $max: [{ $subtract: [{ $subtract: [{ $size: "$messages" }, skip] }, limit] }, 0] },
            limit
          ]
        }
      }
    }
  ]);

  if (!result || result.length === 0) {
    return { messages: [], total: 0, hasMore: false };
  }

  const { messages, total } = result[0];
  // hasMore = there are messages further back beyond what we returned
  const startIndex = Math.max(total - skip - limit, 0);
  const hasMore = startIndex > 0;

  const normalized = (messages || []).map((m, idx) => ({
    ...m,
    id: m.id || (m._id ? String(m._id) : `msg_${m.createdAt ? new Date(m.createdAt).getTime() : startIndex + idx}_${startIndex + idx}`),
    isEdited: Boolean(m.isEdited),
  }));

  return { messages: normalized, total, hasMore };
}
