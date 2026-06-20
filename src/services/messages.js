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
