const Conversation = require("../models/Conversation");

async function saveMessage(conversationId, payload) {
  if (!conversationId) return null;
  const message = {
    userId: payload.from || "system",
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

async function clearConversation(conversationId) {
  if (!conversationId) return;
  await Conversation.deleteOne({ conversationId });
}

async function getConversationMessages(conversationId) {
  if (!conversationId) return [];
  const convo = await Conversation.findOne({ conversationId }).lean();
  return convo?.messages || [];
}

module.exports = {
  saveMessage,
  clearConversation,
  getConversationMessages
};
