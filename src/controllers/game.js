import { GameModel, GameLeaderboardModel } from "../models/index.js";
import { Pagination } from "../lib/pagination.js";
import { ColumnFilter } from "../lib/columnFilter.js";

const DEFAULT_GAMES = [
  {
    title: "Last Runner",
    slug: "last-runner",
    status: "active",
    subtitle: "1v1 Real-time Running Battle & Attack Arena",
    description: "Battle head-to-head in a fast-paced 3-lane race! Jump barriers, slide under obstacles, collect attack objects (Mud Ball 🥚, Ice Ball 🧊, Bomb 💣), and slow down your opponent to be the Last Runner standing!",
    badge: "🟢 LIVE NOW",
    players: "1 vs 1 Battle",
    duration: "90s Max",
    color: "linear-gradient(135deg, #ef4444, #f59e0b)",
    icon: "DirectionsRun",
    maintenanceNotice: "Last Runner is temporarily undergoing scheduled maintenance and matchmaking server upgrades. Check back shortly!",
    comingSoonNotice: "Last Runner is coming soon! Get ready to run, attack, and survive.",
    sortOrder: 1,
    isActive: true,
  },
  {
    title: "Coin Rush",
    slug: "coin-rush",
    status: "active",
    subtitle: "Real-time top-down coin collecting arena",
    description: "Battle 2–8 players in a 60-second frenzy! Collect coins, grab power-ups (⚡ Speed, 🪙 Double Coins, 🧲 Magnet), and climb the live scoreboard!",
    badge: "🟢 LIVE NOW",
    players: "2–8 Players",
    duration: "60s Rounds",
    color: "linear-gradient(135deg, #f59e0b, #ec4899)",
    icon: "EmojiEvents",
    maintenanceNotice: "Coin Rush is temporarily undergoing scheduled maintenance and server performance upgrades. We'll be back online shortly!",
    comingSoonNotice: "Coin Rush 2.0 is coming soon! Get ready for new maps, power-ups, and ranked tournaments.",
    sortOrder: 1,
    isActive: true,
  },
];

// Helper to seed games if collection is empty or update missing properties
const ensureDefaultGames = async () => {
  try {
    // Clean up removed demo games
    await GameModel.deleteMany({
      slug: {
        $in: [
          "laser-tag",
          "pixel-tanks",
          "memory-match",
          "speed-racer",
          "tower-defence",
          "tower-defense",
        ],
      },
    });

    for (const g of DEFAULT_GAMES) {
      const existing = await GameModel.findOne({ slug: g.slug });
      if (!existing) {
        await GameModel.create(g);
      } else {
        let changed = false;
        if (!existing.title && (existing.name || g.title)) {
          existing.title = existing.title || existing.name || g.title;
          changed = true;
        }
        if (!existing.subtitle) { existing.subtitle = g.subtitle; changed = true; }
        if (!existing.badge) {
          existing.badge = existing.status === "active" ? "🟢 LIVE NOW" : existing.status === "coming_soon" ? "⚡ COMING SOON" : "🛠️ IN MAINTENANCE";
          changed = true;
        }
        if (!existing.players) { existing.players = g.players; changed = true; }
        if (!existing.duration) { existing.duration = g.duration; changed = true; }
        if (!existing.maintenanceNotice) { existing.maintenanceNotice = g.maintenanceNotice; changed = true; }
        if (!existing.comingSoonNotice) { existing.comingSoonNotice = g.comingSoonNotice; changed = true; }
        if (!existing.sortOrder) { existing.sortOrder = g.sortOrder; changed = true; }
        if (changed) {
          await existing.save();
        }
      }
    }
  } catch (err) {
    console.error("[Games] Error ensuring default games:", err);
  }
};

// Auto-seed on module load
ensureDefaultGames();

/**
 * Admin: List games with pagination & filter
 */
export const GameList = async (req, res) => {
  try {
    await ensureDefaultGames();
    let { page, limit, filter, status } = req.query;
    const baseFilter = ColumnFilter(filter);

    if (status && status !== "all") {
      baseFilter.status = status;
    }

    const sort = { sortOrder: 1, createdAt: -1 };
    const { skip } = Pagination({ page, limit });

    const list = await GameModel.find(baseFilter).limit(limit).skip(skip).sort(sort);
    const count = await GameModel.countDocuments(baseFilter);

    return res.status(200).json({
      success: true,
      message: "Games list fetched successfully",
      result: { list, count },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

/**
 * Admin: Get single game by ID or slug
 */
export const OneGame = async (req, res) => {
  try {
    const { id } = req.params;
    let result = null;

    // Check if ID is a valid Mongo ObjectId or a slug
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      result = await GameModel.findById(id);
    }
    if (!result) {
      result = await GameModel.findOne({ slug: id.toLowerCase() });
    }

    if (!result) {
      return res.status(404).json({ success: false, message: "Game not found" });
    }

    return res.status(200).json({ success: true, message: "Game fetched", result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

/**
 * Admin: Create game
 */
export const CreateGame = async (req, res) => {
  try {
    const {
      title,
      slug,
      status = "active",
      subtitle,
      description,
      badge,
      players,
      duration,
      maintenanceNotice,
      comingSoonNotice,
      color,
      icon,
      sortOrder = 0,
      isActive = true,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: "Title is required", errors: { title: "Title is required" } });
    }

    const normalizedSlug = (slug || title)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");

    const existing = await GameModel.findOne({ slug: normalizedSlug });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "A game with this slug already exists",
        errors: { slug: "Slug already exists" },
      });
    }

    const newGame = await GameModel.create({
      title: title.trim(),
      slug: normalizedSlug,
      status,
      subtitle: subtitle || "",
      description: description || "",
      badge: badge || (status === "active" ? "🟢 LIVE NOW" : status === "coming_soon" ? "⚡ COMING SOON" : "🛠️ MAINTENANCE"),
      players: players || "2–8 Players",
      duration: duration || "60s Rounds",
      maintenanceNotice: maintenanceNotice || "This game is currently undergoing scheduled maintenance.",
      comingSoonNotice: comingSoonNotice || "This game is currently in development and will launch soon.",
      color: color || "linear-gradient(135deg, #f59e0b, #ec4899)",
      icon: icon || "SportsEsports",
      sortOrder: Number(sortOrder) || 0,
      isActive: Boolean(isActive),
    });

    const io = req.app.get("io");
    if (io) {
      io.emit("game_status_updated", newGame);
    }

    return res.status(201).json({
      success: true,
      message: "Game created successfully",
      result: newGame,
    });
  } catch (error) {
    console.error(error);
    if (error?.code === 11000) {
      return res.status(400).json({ success: false, message: "Slug already exists", errors: { slug: "Slug already exists" } });
    }
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

/**
 * Admin: Update game
 */
export const UpdateGame = async (req, res) => {
  try {
    const { id, _id, ...fields } = req.body;
    const gameId = id || _id;

    let existing = null;
    if (gameId && String(gameId).match(/^[0-9a-fA-F]{24}$/)) {
      existing = await GameModel.findById(gameId);
    } else if (fields.slug) {
      existing = await GameModel.findOne({ slug: fields.slug.toLowerCase() });
    }

    if (!existing) {
      return res.status(404).json({ success: false, message: "Game not found" });
    }

    if (fields.slug && fields.slug !== existing.slug) {
      const slugExists = await GameModel.findOne({ slug: fields.slug.toLowerCase(), _id: { $ne: existing._id } });
      if (slugExists) {
        return res.status(400).json({
          success: false,
          message: "Another game already uses this slug",
          errors: { slug: "Slug already exists" },
        });
      }
    }

    const updated = await GameModel.findByIdAndUpdate(
      existing._id,
      { $set: fields },
      { new: true, runValidators: true }
    );

    const io = req.app.get("io");
    if (io) {
      io.emit("game_status_updated", updated);
    }

    return res.status(200).json({
      success: true,
      message: "Game updated successfully",
      result: updated,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

/**
 * Admin: Quick status update (active, coming_soon, maintenance)
 */
export const UpdateGameStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, maintenanceNotice, comingSoonNotice } = req.body;

    const allowed = ["active", "coming_soon", "maintenance"];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Allowed: active, coming_soon, maintenance",
      });
    }

    let game = null;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      game = await GameModel.findById(id);
    }
    if (!game) {
      game = await GameModel.findOne({ slug: id.toLowerCase() });
    }

    if (!game) {
      return res.status(404).json({ success: false, message: "Game not found" });
    }

    game.status = status;
    if (maintenanceNotice !== undefined) game.maintenanceNotice = maintenanceNotice;
    if (comingSoonNotice !== undefined) game.comingSoonNotice = comingSoonNotice;

    // Adjust badge if standard
    if (status === "active") {
      game.badge = "🟢 LIVE NOW";
    } else if (status === "coming_soon") {
      game.badge = "⚡ COMING SOON";
    } else if (status === "maintenance") {
      game.badge = "🛠️ IN MAINTENANCE";
    }

    await game.save();

    const io = req.app.get("io");
    if (io) {
      io.emit("game_status_updated", game);
    }

    return res.status(200).json({
      success: true,
      message: `Game status changed to ${status}`,
      result: game,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

/**
 * Admin: Delete game
 */
export const DeleteGame = async (req, res) => {
  try {
    const { id, _id } = req.body || {};
    const targetId = id || _id || req.query?.id || req.params?.id;

    const deleted = await GameModel.findByIdAndDelete(targetId);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Game not found" });
    }

    return res.status(200).json({ success: true, message: "Game deleted successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

/**
 * Admin: Re-seed default games if needed
 */
export const SeedGames = async (req, res) => {
  try {
    for (const g of DEFAULT_GAMES) {
      await GameModel.findOneAndUpdate(
        { slug: g.slug },
        { $setOnInsert: g },
        { upsert: true, new: true }
      );
    }
    const allGames = await GameModel.find().sort({ sortOrder: 1 });
    return res.status(200).json({
      success: true,
      message: "Default games seeded successfully",
      result: allGames,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Failed to seed games" });
  }
};

/**
 * Public: Get all active / available games
 */
export const GetPublicGames = async (req, res) => {
  try {
    await ensureDefaultGames();
    const games = await GameModel.find({ isActive: true }).sort({ sortOrder: 1 });
    return res.status(200).json({
      success: true,
      message: "Public games fetched",
      result: games,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

/**
 * Public: Get game status & details by slug (e.g. /api/public/game/coin-rush)
 */
export const GetPublicGameBySlug = async (req, res) => {
  try {
    await ensureDefaultGames();
    const { slug } = req.params;
    const game = await GameModel.findOne({ slug: slug.toLowerCase() });

    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Game details",
      result: game,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

const DUMMY_PLAYERS = [
  "CyberVault", "GoldPhantom", "NeonCollector", "PixelMagnet", "RubyStorm",
  "SapphireStrike", "SpeedyCoin", "ArcadeViper", "LuckyStriker", "RushHero",
  "ApexStrider", "SonicPulse", "ShadowDash", "TurboBlaster", "CyberGlider",
  "FrostRunner", "ShieldTitan", "NeonHurdler", "VaporDrift", "NitroSurfer",
];

/**
 * Remove any static/dummy leaderboard records from DB so only real players show
 */
export const cleanupDummyLeaderboards = async () => {
  try {
    await GameLeaderboardModel.deleteMany({ playerName: { $in: DUMMY_PLAYERS } });
  } catch (err) {
    console.error("[Leaderboard] Error cleaning dummy records:", err);
  }
};

// Run cleanup on module load
cleanupDummyLeaderboards();

/**
 * Public: Get Top 10 real players for a game
 */
export const GetGameLeaderboard = async (req, res) => {
  try {
    const { slug } = req.params;
    const normalizedSlug = (slug || "").toLowerCase();

    const leaderboard = await GameLeaderboardModel.find({ gameSlug: normalizedSlug })
      .sort({ score: -1 })
      .limit(10);

    const formatted = leaderboard.map((item, index) => ({
      _id: item._id,
      gameSlug: item.gameSlug,
      playerName: item.playerName,
      score: item.score,
      secondaryMetric: item.secondaryMetric || (normalizedSlug === "coin-rush" ? `${item.score} Coins` : `${item.score}m`),
      wins: item.wins || 1,
      matchesPlayed: item.matchesPlayed || 1,
      avatar: item.avatar || (index === 0 ? "👑" : index === 1 ? "🥈" : index === 2 ? "🥉" : "⚡"),
      badge: item.badge || "Challenger",
      rank: index + 1,
    }));

    return res.status(200).json({
      success: true,
      message: "Top 10 leaderboard fetched",
      result: formatted,
    });
  } catch (error) {
    console.error("[Leaderboard] Error fetching leaderboard:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      result: [],
    });
  }
};

/**
 * Record or update player high score in the database
 */
export const recordPlayerScore = async (gameSlug, playerName, score, secondaryMetric = "", won = false) => {
  try {
    if (!gameSlug || !playerName || !score) return null;
    const slug = gameSlug.toLowerCase();
    const cleanName = String(playerName).trim();
    if (!cleanName || cleanName.toLowerCase() === "runner" || cleanName.toLowerCase() === "player") return null;

    let entry = await GameLeaderboardModel.findOne({ gameSlug: slug, playerName: cleanName });
    if (!entry) {
      entry = new GameLeaderboardModel({
        gameSlug: slug,
        playerName: cleanName,
        score: Math.round(score),
        secondaryMetric: secondaryMetric || (slug === "coin-rush" ? `${Math.round(score)} Coins` : `${Math.round(score)}m`),
        wins: won ? 1 : 0,
        matchesPlayed: 1,
        avatar: "⚡",
        badge: "Contender",
      });
    } else {
      entry.matchesPlayed += 1;
      if (won) entry.wins += 1;
      if (score > entry.score) {
        entry.score = Math.round(score);
        entry.secondaryMetric = secondaryMetric || (slug === "coin-rush" ? `${Math.round(score)} Coins` : `${Math.round(score)}m`);
      }
    }

    await entry.save();
    return entry;
  } catch (err) {
    console.error("[Leaderboard] Failed to record player score:", err);
    return null;
  }
};

/**
 * Public: Submit a player's match score
 */
export const SubmitGameScore = async (req, res) => {
  try {
    const { slug } = req.params;
    const { playerName, score, secondaryMetric, won } = req.body;

    if (!playerName || typeof score !== "number") {
      return res.status(400).json({ success: false, message: "Player name and score are required" });
    }

    const saved = await recordPlayerScore(slug, playerName, score, secondaryMetric, won);
    return res.status(200).json({
      success: true,
      message: "Score recorded",
      result: saved,
    });
  } catch (error) {
    console.error("[Leaderboard] Error submitting score:", error);
    return res.status(500).json({ success: false, message: "Something went wrong" });
  }
};
