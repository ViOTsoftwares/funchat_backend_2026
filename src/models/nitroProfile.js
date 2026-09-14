import mongoose from "mongoose";

const NitroProfileSchema = new mongoose.Schema(
  {
    playerId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    playerName: {
      type: String,
      required: true,
      trim: true,
    },
    xp: {
      type: Number,
      default: 0,
    },
    level: {
      type: Number,
      default: 1,
    },
    coins: {
      type: Number,
      default: 250,
    },
    rating: {
      type: Number,
      default: 1200,
      index: true,
    },
    rankTier: {
      type: String,
      enum: ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master"],
      default: "Bronze",
    },
    unlockedCars: {
      type: [String],
      default: ["speedster", "balanced"],
    },
    selectedCar: {
      type: String,
      default: "speedster",
    },
    customization: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({
        speedster: {
          paint: "#3b82f6",
          paintName: "Electric Blue",
          wheels: "sport",
          decal: "stripes",
          nitroEffect: "blue_flame",
          trail: "neon",
        },
      }),
    },
    upgrades: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({
        speedster: {
          engine: 1,
          acceleration: 1,
          handling: 1,
          nitro: 1,
          drift: 1,
        },
      }),
    },
    stats: {
      races: { type: Number, default: 0 },
      wins: { type: Number, default: 0 },
      podiums: { type: Number, default: 0 },
      losses: { type: Number, default: 0 },
      bestRaceTime: { type: Number, default: 0 },
      bestLapTime: { type: Number, default: 0 },
      coinsCollected: { type: Number, default: 0 },
      nitroUses: { type: Number, default: 0 },
      powerUpsUsed: { type: Number, default: 0 },
    },
    weeklyStats: {
      weeklyXP: { type: Number, default: 0 },
      weeklyWins: { type: Number, default: 0 },
      lastReset: { type: Date, default: Date.now },
    },
  },
  { timestamps: true }
);

NitroProfileSchema.index({ rating: -1 });
NitroProfileSchema.index({ "weeklyStats.weeklyXP": -1 });

export default mongoose.model("NitroProfile", NitroProfileSchema, "nitro_profiles");
