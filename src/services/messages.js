import Conversation from "../models/Conversation.js";

export async function saveMessage(conversationId, payload) {
  if (!conversationId) return null;
  const message = {
    userId: payload.from || "system",
    senderName: payload.senderName || "",
    text: payload.text || "",
    emojiUrl: payload.emojiUrl || "",
    parts: Array.isArray(payload.parts) ? payload.parts : [],
    createdAt: new Date()
  };

  return Conversation.findOneAndUpdate(
    { conversationId },
    { $push: { messages: message } },
    { upsert: true, new: true }
  );
}

export async function clearConversation(conversationId) {
  if (!conversationId) return;
  await Conversation.deleteOne({ conversationId });
}

export async function getConversationMessages(conversationId) {
  if (!conversationId) return [];
  const convo = await Conversation.findOne({ conversationId }).lean();
  return convo?.messages || [];
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

  return { messages: messages || [], total, hasMore };
}
