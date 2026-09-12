import mongoose from "mongoose";

const GameLeaderboardSchema = new mongoose.Schema(
  {
    gameSlug: {
      type: String,
      required: true,
      index: true,
      enum: ["coin-rush", "last-runner"],
    },
    playerName: {
      type: String,
      required: true,
      trim: true,
    },
    userId: {
      type: String,
      default: null,
    },
    score: {
      type: Number,
      required: true,
      default: 0,
      index: true,
    },
    secondaryMetric: {
      type: String,
      default: "",
    },
    wins: {
      type: Number,
      default: 1,
    },
    matchesPlayed: {
      type: Number,
      default: 1,
    },
    avatar: {
      type: String,
      default: "⚡",
    },
    badge: {
      type: String,
      default: "Competitor",
    },
    rank: {
      type: Number,
      default: 10,
    },
  },
  { timestamps: true }
);

GameLeaderboardSchema.index({ gameSlug: 1, score: -1 });

export default mongoose.model("GameLeaderboard", GameLeaderboardSchema, "game_leaderboards");
