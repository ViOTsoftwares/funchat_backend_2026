import mongoose from "mongoose";

const MessageItemSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    senderName: { type: String, default: "" },
    text: { type: String, default: "" },
    emojiUrl: { type: String, default: "" },
    parts: { type: Array, default: [] },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const ConversationSchema = new mongoose.Schema({
  conversationId: { type: String, index: true, unique: true, required: true },
  messages: { type: [MessageItemSchema], default: [] }
});

export default mongoose.model("Conversation", ConversationSchema);
