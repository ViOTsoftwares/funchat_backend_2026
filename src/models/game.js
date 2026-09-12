import mongoose from "mongoose";

const GameSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    status: {
      type: String,
      enum: ["active", "coming_soon", "maintenance"],
      default: "active",
    },
    subtitle: { type: String, default: "" },
    description: { type: String, default: "" },
    badge: { type: String, default: "" },
    players: { type: String, default: "2–8 Players" },
    duration: { type: String, default: "60s Rounds" },
    maintenanceNotice: {
      type: String,
      default: "This game is currently undergoing scheduled maintenance. Please check back shortly!",
    },
    comingSoonNotice: {
      type: String,
      default: "This game is currently in development and will launch soon. Stay tuned!",
    },
    color: {
      type: String,
      default: "linear-gradient(135deg, #f59e0b, #ec4899)",
    },
    icon: { type: String, default: "SportsEsports" },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Game", GameSchema, "games");
