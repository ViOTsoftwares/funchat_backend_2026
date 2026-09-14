// Mini Nitro Race V3 — Server-Authoritative Real-Time Multiplayer Handler
import { recordPlayerScore } from "../controllers/game.js";
import { NitroProfileModel } from "../models/index.js";
import {
  TRACK_CONFIGS,
  POWER_UP_TYPES,
  XP_FINISH_AWARDS,
  COIN_FINISH_AWARDS,
  calculateMultiplayerElo,
} from "./nitroGameData.js";

const TICK_RATE = 20; // 20 updates per second (50ms)
const TICK_INTERVAL = 1000 / TICK_RATE;
const MAX_PLAYERS_PER_ROOM = 8;
const MIN_PLAYERS_TO_START = 2;
const MAX_RACE_TIMEOUT_SEC = 180; // 3 minutes max duration

// Global in-memory storage for Mini Nitro Race
const nitroRooms = new Map(); // roomId -> Room object
const nitroCodes = new Map(); // shortCode -> roomId
let matchmakingQueue = []; // Array of { socketId, name, userId, selectedCar, isRanked }
let matchmakingTimer = null;

// Helper: Generate unique 6-character room code (e.g. ABC123)
function generateShortCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Helper: Distance between two 2D points
function distance(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Helper: Remove socket from matchmaking queue
function removeFromQueue(socketId) {
  matchmakingQueue = matchmakingQueue.filter((item) => item.socketId !== socketId);
}

// Clean up and safely leave active room
function leaveActiveNitroRoom(io, socket) {
  if (!socket) return;
  const roomId = socket.nitroRoomId;
  if (!roomId) return;

  try {
    socket.leave(roomId);
  } catch {}
  socket.nitroRoomId = null;

  if (nitroRooms.has(roomId)) {
    const room = nitroRooms.get(roomId);
    room.players.delete(socket.id);

    if (room.players.size === 0) {
      if (room.gameLoopInterval) clearInterval(room.gameLoopInterval);
      if (room.countdownInterval) clearInterval(room.countdownInterval);
      if (room.matchTimeoutTimer) clearTimeout(room.matchTimeoutTimer);
      if (room.shortCode) nitroCodes.delete(room.shortCode);
      nitroRooms.delete(roomId);
      console.log(`[NitroRace] Room ${roomId} disposed (all players left)`);
    } else {
      // If host left, elect new host
      if (room.hostId === socket.id) {
        const nextPlayer = room.players.keys().next().value;
        room.hostId = nextPlayer;
        io.to(roomId).emit("nitro_host_changed", { newHostId: nextPlayer });
      }
      broadcastRoomState(io, room);
    }
  }
}

// Broadcast current room lobby state
function broadcastRoomState(io, room) {
  if (!room) return;
  const playersList = Array.from(room.players.values()).map((p) => ({
    id: p.id,
    name: p.name,
    isHost: p.id === room.hostId,
    ready: p.ready,
    selectedCar: p.selectedCar,
    customization: p.customization,
    rating: p.rating,
    level: p.level,
  }));

  io.to(room.id).emit("nitro_room_state", {
    roomId: room.id,
    shortCode: room.shortCode,
    hostId: room.hostId,
    trackId: room.trackId,
    isRanked: room.isRanked,
    status: room.status,
    players: playersList,
    playerCount: playersList.length,
    maxPlayers: MAX_PLAYERS_PER_ROOM,
  });
}

/**
 * Register all Mini Nitro Race Socket.IO Handlers
 */
export default function registerNitroRaceHandlers(io, socket) {
  // ── 1. Matchmaking (Quick Race) ──
  socket.on("nitro_join_matchmaking", async (payload = {}) => {
    try {
      leaveActiveNitroRoom(io, socket);
      removeFromQueue(socket.id);

      const playerName = (payload.name || socket.profileName || "Racer").trim();
      const userId = socket.userId || socket.id;
      const isRanked = Boolean(payload.isRanked);

      // Load user profile for Elo rating & level
      let userRating = 1200;
      let userLevel = 1;
      try {
        const profile = await NitroProfileModel.findOne({ playerId: userId });
        if (profile) {
          userRating = profile.rating || 1200;
          userLevel = profile.level || 1;
        }
      } catch {}

      matchmakingQueue.push({
        socketId: socket.id,
        name: playerName,
        userId,
        selectedCar: payload.selectedCar || "speedster",
        customization: payload.customization || {},
        rating: userRating,
        level: userLevel,
        isRanked,
        joinedAt: Date.now(),
      });

      console.log(`[NitroMatchmaking] ${playerName} (${socket.id}) joined queue. Queue size: ${matchmakingQueue.length}`);

      // Notify player of queue status
      socket.emit("nitro_matchmaking_status", {
        inQueue: true,
        queueCount: matchmakingQueue.length,
        needed: MIN_PLAYERS_TO_START,
      });

      // Broadcast queue size updates to everyone in queue
      matchmakingQueue.forEach((item) => {
        io.to(item.socketId).emit("nitro_matchmaking_update", {
          queueCount: matchmakingQueue.length,
          maxPlayers: MAX_PLAYERS_PER_ROOM,
        });
      });

      // If we reach max players (8), trigger match immediately
      if (matchmakingQueue.length >= MAX_PLAYERS_PER_ROOM) {
        createMatchFromQueue(io);
      } else if (matchmakingQueue.length >= MIN_PLAYERS_TO_START && !matchmakingTimer) {
        // Start waiting period countdown (e.g., 6 seconds) so more players can join
        matchmakingTimer = setTimeout(() => {
          matchmakingTimer = null;
          if (matchmakingQueue.length >= MIN_PLAYERS_TO_START) {
            createMatchFromQueue(io);
          }
        }, 6000);
      }
    } catch (err) {
      console.error("[NitroRace] Error in nitro_join_matchmaking:", err);
    }
  });

  socket.on("nitro_leave_matchmaking", () => {
    removeFromQueue(socket.id);
    socket.emit("nitro_matchmaking_status", { inQueue: false });
    matchmakingQueue.forEach((item) => {
      io.to(item.socketId).emit("nitro_matchmaking_update", {
        queueCount: matchmakingQueue.length,
        maxPlayers: MAX_PLAYERS_PER_ROOM,
      });
    });
  });

  // ── 2. Private Room Creation & Joining ──
  socket.on("nitro_create_race", async (payload = {}) => {
    try {
      leaveActiveNitroRoom(io, socket);
      removeFromQueue(socket.id);

      const roomId = `nitro_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      let shortCode = generateShortCode();
      while (nitroCodes.has(shortCode)) {
        shortCode = generateShortCode();
      }

      const playerName = (payload.name || socket.profileName || "HostRacer").trim();
      const userId = socket.userId || socket.id;
      const trackId = payload.trackId && TRACK_CONFIGS[payload.trackId] ? payload.trackId : "city_rush";

      let userRating = 1200;
      let userLevel = 1;
      try {
        const profile = await NitroProfileModel.findOne({ playerId: userId });
        if (profile) {
          userRating = profile.rating || 1200;
          userLevel = profile.level || 1;
        }
      } catch {}

      const room = {
        id: roomId,
        shortCode,
        hostId: socket.id,
        trackId,
        isRanked: Boolean(payload.isRanked),
        status: "LOBBY", // LOBBY, COUNTDOWN, RACING, FINISHED
        players: new Map(),
        coinsState: new Map(),
        powerUpsState: new Map(),
        startTime: 0,
        finishCount: 0,
        gameLoopInterval: null,
        countdownInterval: null,
        matchTimeoutTimer: null,
      };

      room.players.set(socket.id, {
        id: socket.id,
        userId,
        name: playerName,
        rating: userRating,
        level: userLevel,
        selectedCar: payload.selectedCar || "speedster",
        customization: payload.customization || {},
        ready: true, // Host is ready by default
        gridSlot: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        angle: 0,
        speed: 0,
        currentLap: 1,
        lastCheckpointPassed: 0,
        checkpointsPassedInLap: new Set([0]),
        totalCheckpointsHit: 0,
        finished: false,
        finishRank: 0,
        finishTime: 0,
        nitro: 100,
        isNitroActive: false,
        isDrifting: false,
        activePowerUp: null,
        coinsCollected: 0,
        hasShield: false,
        lapTimes: [],
        lastLapTimestamp: 0,
      });

      nitroRooms.set(roomId, room);
      nitroCodes.set(shortCode, roomId);
      socket.nitroRoomId = roomId;
      socket.join(roomId);

      console.log(`[NitroRace] Created private race room ${roomId} (Code: ${shortCode}) by ${playerName}`);
      broadcastRoomState(io, room);
    } catch (err) {
      console.error("[NitroRace] Error in nitro_create_race:", err);
    }
  });

  socket.on("nitro_join_race", async (payload = {}) => {
    try {
      leaveActiveNitroRoom(io, socket);
      removeFromQueue(socket.id);

      const codeInput = String(payload.code || "").trim().toUpperCase();
      const targetRoomId = nitroCodes.get(codeInput) || payload.roomId;

      if (!targetRoomId || !nitroRooms.has(targetRoomId)) {
        socket.emit("nitro_error", { message: "Invalid or expired race code." });
        return;
      }

      const room = nitroRooms.get(targetRoomId);

      if (room.status !== "LOBBY") {
        socket.emit("nitro_error", { message: "Race has already started or finished." });
        return;
      }

      if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
        socket.emit("nitro_error", { message: "Room is full (Maximum 8 players)." });
        return;
      }

      const playerName = (payload.name || socket.profileName || "Racer").trim();
      const userId = socket.userId || socket.id;

      let userRating = 1200;
      let userLevel = 1;
      try {
        const profile = await NitroProfileModel.findOne({ playerId: userId });
        if (profile) {
          userRating = profile.rating || 1200;
          userLevel = profile.level || 1;
        }
      } catch {}

      room.players.set(socket.id, {
        id: socket.id,
        userId,
        name: playerName,
        rating: userRating,
        level: userLevel,
        selectedCar: payload.selectedCar || "speedster",
        customization: payload.customization || {},
        ready: false,
        gridSlot: room.players.size,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        angle: 0,
        speed: 0,
        currentLap: 1,
        lastCheckpointPassed: 0,
        checkpointsPassedInLap: new Set([0]),
        totalCheckpointsHit: 0,
        finished: false,
        finishRank: 0,
        finishTime: 0,
        nitro: 100,
        isNitroActive: false,
        isDrifting: false,
        activePowerUp: null,
        coinsCollected: 0,
        hasShield: false,
        lapTimes: [],
        lastLapTimestamp: 0,
      });

      socket.nitroRoomId = room.id;
      socket.join(room.id);

      console.log(`[NitroRace] ${playerName} joined room ${room.id} (${room.players.size}/${MAX_PLAYERS_PER_ROOM})`);
      broadcastRoomState(io, room);
    } catch (err) {
      console.error("[NitroRace] Error in nitro_join_race:", err);
    }
  });

  // ── 3. Lobby Customization & Readiness ──
  socket.on("nitro_update_car", (payload = {}) => {
    const roomId = socket.nitroRoomId;
    if (!roomId || !nitroRooms.has(roomId)) return;
    const room = nitroRooms.get(roomId);
    const player = room.players.get(socket.id);
    if (!player) return;

    if (payload.selectedCar) player.selectedCar = payload.selectedCar;
    if (payload.customization) player.customization = { ...player.customization, ...payload.customization };

    broadcastRoomState(io, room);
  });

  socket.on("nitro_select_track", (payload = {}) => {
    const roomId = socket.nitroRoomId;
    if (!roomId || !nitroRooms.has(roomId)) return;
    const room = nitroRooms.get(roomId);

    // Only host can select track
    if (room.hostId !== socket.id) return;
    if (payload.trackId && TRACK_CONFIGS[payload.trackId]) {
      room.trackId = payload.trackId;
      broadcastRoomState(io, room);
    }
  });

  socket.on("nitro_toggle_ready", () => {
    const roomId = socket.nitroRoomId;
    if (!roomId || !nitroRooms.has(roomId)) return;
    const room = nitroRooms.get(roomId);
    const player = room.players.get(socket.id);
    if (!player) return;

    player.ready = !player.ready;
    broadcastRoomState(io, room);
  });

  // ── 4. Host Starts Race ──
  socket.on("nitro_start_race", () => {
    const roomId = socket.nitroRoomId;
    if (!roomId || !nitroRooms.has(roomId)) return;
    const room = nitroRooms.get(roomId);

    if (room.hostId !== socket.id) {
      socket.emit("nitro_error", { message: "Only the room host can start the race." });
      return;
    }

    if (room.players.size < MIN_PLAYERS_TO_START) {
      socket.emit("nitro_error", { message: "Minimum 2 players required to start the race." });
      return;
    }

    if (room.status !== "LOBBY") return;
    startRaceCountdown(io, room);
  });

  // ── 5. Client Real-Time In-Race Input ──
  socket.on("nitro_player_input", (input = {}) => {
    const roomId = socket.nitroRoomId;
    if (!roomId || !nitroRooms.has(roomId)) return;
    const room = nitroRooms.get(roomId);
    if (room.status !== "RACING") return;

    const player = room.players.get(socket.id);
    if (!player || player.finished) return;

    // Server-Authoritative validation: cap speed & bounds
    const MAX_ALLOWED_SPEED = 900; // Hard max speed limit to prevent speed hack injection
    const rawSpeed = Number(input.speed) || 0;
    player.speed = Math.min(MAX_ALLOWED_SPEED, Math.max(-200, rawSpeed));

    if (typeof input.x === "number" && typeof input.y === "number") {
      player.x = input.x;
      player.y = input.y;
    }
    if (typeof input.angle === "number") player.angle = input.angle;
    if (typeof input.vx === "number") player.vx = input.vx;
    if (typeof input.vy === "number") player.vy = input.vy;

    player.isDrifting = Boolean(input.isDrifting);
    player.isNitroActive = Boolean(input.isNitroActive && player.nitro > 0);

    // Drifting provides small continuous nitro reward
    if (player.isDrifting && player.speed > 150) {
      player.nitro = Math.min(100, player.nitro + 0.35);
    }
  });

  // ── 6. Power-Up Trigger ──
  socket.on("nitro_use_powerup", () => {
    const roomId = socket.nitroRoomId;
    if (!roomId || !nitroRooms.has(roomId)) return;
    const room = nitroRooms.get(roomId);
    if (room.status !== "RACING") return;

    const player = room.players.get(socket.id);
    if (!player || !player.activePowerUp || player.finished) return;

    const powerUp = player.activePowerUp;
    player.activePowerUp = null;

    if (powerUp === "turbo") {
      player.speed = Math.min(850, player.speed + 250);
      io.to(room.id).emit("nitro_powerup_activated", {
        playerId: socket.id,
        powerUp: "turbo",
      });
    } else if (powerUp === "shield") {
      player.hasShield = true;
      io.to(room.id).emit("nitro_powerup_activated", {
        playerId: socket.id,
        powerUp: "shield",
      });
    } else if (powerUp === "nitro_refill") {
      player.nitro = 100;
      io.to(room.id).emit("nitro_powerup_activated", {
        playerId: socket.id,
        powerUp: "nitro_refill",
      });
    } else if (powerUp === "magnet") {
      // Collect all coins within 400px
      const track = TRACK_CONFIGS[room.trackId];
      if (track && track.coins) {
        track.coins.forEach((coin) => {
          if (!room.coinsState.get(coin.id)) {
            if (distance(player, coin) <= 450) {
              room.coinsState.set(coin.id, true);
              player.coinsCollected += 1;
              io.to(room.id).emit("nitro_coin_collected", {
                coinId: coin.id,
                playerId: socket.id,
                totalCoins: player.coinsCollected,
              });
            }
          }
        });
      }
      io.to(room.id).emit("nitro_powerup_activated", {
        playerId: socket.id,
        powerUp: "magnet",
      });
    }
  });

  // ── 7. Player Leaves or Disconnects ──
  socket.on("nitro_leave_race", () => {
    leaveActiveNitroRoom(io, socket);
  });

  socket.on("disconnect", () => {
    removeFromQueue(socket.id);
    leaveActiveNitroRoom(io, socket);
  });
}

/**
 * Automatically create a matched race from the matchmaking queue
 */
function createMatchFromQueue(io) {
  if (matchmakingQueue.length < MIN_PLAYERS_TO_START) return;

  // Take up to 8 players from front of queue
  const matched = matchmakingQueue.splice(0, MAX_PLAYERS_PER_ROOM);
  const roomId = `nitro_quick_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const shortCode = generateShortCode();

  // Random track selection for Quick Race
  const trackKeys = Object.keys(TRACK_CONFIGS);
  const randomTrack = trackKeys[Math.floor(Math.random() * trackKeys.length)];

  const room = {
    id: roomId,
    shortCode,
    hostId: matched[0].socketId,
    trackId: randomTrack,
    isRanked: matched.some((p) => p.isRanked),
    status: "LOBBY",
    players: new Map(),
    coinsState: new Map(),
    powerUpsState: new Map(),
    startTime: 0,
    finishCount: 0,
    gameLoopInterval: null,
    countdownInterval: null,
    matchTimeoutTimer: null,
  };

  matched.forEach((p, idx) => {
    room.players.set(p.socketId, {
      id: p.socketId,
      userId: p.userId,
      name: p.name,
      rating: p.rating,
      level: p.level,
      selectedCar: p.selectedCar,
      customization: p.customization,
      ready: true,
      gridSlot: idx,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      angle: 0,
      speed: 0,
      currentLap: 1,
      lastCheckpointPassed: 0,
      checkpointsPassedInLap: new Set([0]),
      totalCheckpointsHit: 0,
      finished: false,
      finishRank: 0,
      finishTime: 0,
      nitro: 100,
      isNitroActive: false,
      isDrifting: false,
      activePowerUp: null,
      coinsCollected: 0,
      hasShield: false,
      lapTimes: [],
      lastLapTimestamp: 0,
    });
  });

  nitroRooms.set(roomId, room);
  nitroCodes.set(shortCode, roomId);

  matched.forEach((p) => {
    const s = io.sockets.sockets.get(p.socketId);
    if (s) {
      s.nitroRoomId = roomId;
      s.join(roomId);
    }
  });

  console.log(`[NitroMatchmaking] Match found! Room ${roomId} created with ${matched.length} players.`);

  io.to(roomId).emit("nitro_match_found", {
    roomId,
    trackId: randomTrack,
    playerCount: matched.length,
  });

  broadcastRoomState(io, room);

  // Auto-start countdown after 2.5 seconds to allow scene transition
  setTimeout(() => {
    if (nitroRooms.has(roomId) && room.status === "LOBBY") {
      startRaceCountdown(io, room);
    }
  }, 2500);
}

/**
 * Start 3-2-1 Countdown and Launch Race Loop
 */
function startRaceCountdown(io, room) {
  if (!room || room.status !== "LOBBY") return;
  room.status = "COUNTDOWN";

  const track = TRACK_CONFIGS[room.trackId] || TRACK_CONFIGS.city_rush;

  // Assign starting grid positions
  let slotIdx = 0;
  room.players.forEach((player) => {
    const grid = track.gridPositions[slotIdx % track.gridPositions.length];
    player.gridSlot = slotIdx;
    player.x = grid.x;
    player.y = grid.y;
    player.angle = grid.angle;
    player.speed = 0;
    player.vx = 0;
    player.vy = 0;
    player.currentLap = 1;
    player.lastCheckpointPassed = 0;
    player.checkpointsPassedInLap = new Set([0]);
    player.finished = false;
    player.finishRank = 0;
    player.finishTime = 0;
    player.nitro = 100;
    player.coinsCollected = 0;
    player.lapTimes = [];
    slotIdx++;
  });

  let countdown = 3;
  io.to(room.id).emit("nitro_countdown", { countdown });

  room.countdownInterval = setInterval(() => {
    countdown--;
    if (countdown > 0) {
      io.to(room.id).emit("nitro_countdown", { countdown });
    } else if (countdown === 0) {
      io.to(room.id).emit("nitro_countdown", { countdown: 0 }); // "GO!"
    } else {
      clearInterval(room.countdownInterval);
      room.countdownInterval = null;
      launchRace(io, room);
    }
  }, 1000);
}

/**
 * Launch Active Race & 20 TPS Server Tick
 */
function launchRace(io, room) {
  if (!room) return;
  room.status = "RACING";
  room.startTime = Date.now();
  const track = TRACK_CONFIGS[room.trackId] || TRACK_CONFIGS.city_rush;

  // Initialize coins and powerups state
  room.coinsState.clear();
  room.powerUpsState.clear();

  room.players.forEach((p) => {
    p.lastLapTimestamp = room.startTime;
  });

  io.to(room.id).emit("nitro_race_started", {
    startTime: room.startTime,
    trackId: room.trackId,
    totalLaps: track.totalLaps,
  });

  // Maximum match timeout safety timer (3 minutes)
  room.matchTimeoutTimer = setTimeout(() => {
    endRace(io, room);
  }, MAX_RACE_TIMEOUT_SEC * 1000);

  // 20 TPS Server-Authoritative Tick Loop
  room.gameLoopInterval = setInterval(() => {
    const now = Date.now();
    const elapsedRaceTime = (now - room.startTime) / 1000;

    // Check checkpoints, laps, coins, and power-ups for each player
    room.players.forEach((player) => {
      if (player.finished) return;

      // 1. Checkpoint & Lap Validation
      const totalCheckpoints = track.checkpoints.length;
      const nextExpectedCheckpoint = (player.lastCheckpointPassed + 1) % totalCheckpoints;
      const chk = track.checkpoints[nextExpectedCheckpoint];

      if (chk && distance(player, chk) <= chk.radius) {
        player.lastCheckpointPassed = nextExpectedCheckpoint;
        player.checkpointsPassedInLap.add(nextExpectedCheckpoint);
        player.totalCheckpointsHit++;

        // Passing finish gate (checkpoint 0) after completing circuit of checkpoints
        if (nextExpectedCheckpoint === 0 && player.checkpointsPassedInLap.size >= totalCheckpoints - 2) {
          const lapTime = (now - player.lastLapTimestamp) / 1000;
          player.lapTimes.push(lapTime);
          player.lastLapTimestamp = now;

          if (player.currentLap >= track.totalLaps) {
            // Player Finished!
            player.finished = true;
            room.finishCount++;
            player.finishRank = room.finishCount;
            player.finishTime = (now - room.startTime) / 1000;

            io.to(room.id).emit("nitro_player_finished", {
              playerId: player.id,
              rank: player.finishRank,
              finishTime: player.finishTime,
              lapTimes: player.lapTimes,
            });

            // If 1st player finishes, start a 25-second countdown to conclude race for remaining racers
            if (player.finishRank === 1 && room.players.size > 1) {
              setTimeout(() => {
                if (room.status === "RACING") {
                  endRace(io, room);
                }
              }, 25000);
            }
          } else {
            player.currentLap++;
            player.checkpointsPassedInLap = new Set([0]);
            io.to(room.id).emit("nitro_lap_completed", {
              playerId: player.id,
              lap: player.currentLap,
              lapTime,
            });
          }
        }
      }

      // 2. Nitro Drain & Slow Recharge
      if (player.isNitroActive) {
        player.nitro = Math.max(0, player.nitro - 1.8);
      } else {
        player.nitro = Math.min(100, player.nitro + 0.25);
      }

      // 3. Coin Pickups (+10 coins)
      if (track.coins) {
        track.coins.forEach((coin) => {
          if (!room.coinsState.get(coin.id)) {
            if (distance(player, coin) <= 55) {
              room.coinsState.set(coin.id, true);
              player.coinsCollected += 1;
              io.to(room.id).emit("nitro_coin_collected", {
                coinId: coin.id,
                playerId: player.id,
                totalCoins: player.coinsCollected,
              });
            }
          }
        });
      }

      // 4. Power-Up Mystery Boxes
      if (track.powerUps && !player.activePowerUp) {
        track.powerUps.forEach((pw) => {
          if (!room.powerUpsState.get(pw.id)) {
            if (distance(player, pw) <= 65) {
              room.powerUpsState.set(pw.id, true);
              const rolledType = POWER_UP_TYPES[Math.floor(Math.random() * POWER_UP_TYPES.length)];
              player.activePowerUp = rolledType;

              io.to(room.id).emit("nitro_powerup_collected", {
                pwId: pw.id,
                playerId: player.id,
                powerUp: rolledType,
              });

              // Power-up box respawns after 12 seconds
              setTimeout(() => {
                if (room.coinsState) {
                  room.powerUpsState.delete(pw.id);
                  io.to(room.id).emit("nitro_powerup_respawned", { pwId: pw.id });
                }
              }, 12000);
            }
          }
        });
      }

      // 5. Boost Pad Triggers
      if (track.boostPads) {
        track.boostPads.forEach((pad) => {
          if (distance(player, pad) <= 70) {
            player.speed = Math.min(850, player.speed + 180);
          }
        });
      }
    });

    // Check if all players finished
    const allFinished = Array.from(room.players.values()).every((p) => p.finished);
    if (allFinished && room.players.size > 0) {
      endRace(io, room);
      return;
    }

    // Dynamic Live Leaderboard Positions Calculation
    const sortedPlayers = Array.from(room.players.values()).sort((a, b) => {
      if (a.finished && b.finished) return a.finishRank - b.finishRank;
      if (a.finished) return -1;
      if (b.finished) return 1;
      if (b.currentLap !== a.currentLap) return b.currentLap - a.currentLap;
      return b.totalCheckpointsHit - a.totalCheckpointsHit;
    });

    const liveStates = sortedPlayers.map((p, idx) => ({
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      angle: p.angle,
      speed: Math.round(p.speed),
      nitro: Math.round(p.nitro),
      isDrifting: p.isDrifting,
      isNitroActive: p.isNitroActive,
      lap: p.currentLap,
      rank: p.finished ? p.finishRank : idx + 1,
      finished: p.finished,
      activePowerUp: p.activePowerUp,
      coinsCollected: p.coinsCollected,
    }));

    io.to(room.id).emit("nitro_race_state", {
      time: elapsedRaceTime,
      players: liveStates,
    });
  }, TICK_INTERVAL);
}

/**
 * Conclude Race, Calculate Elo, XP, Coins, and Persist Results
 */
async function endRace(io, room) {
  if (!room || room.status === "FINISHED") return;
  room.status = "FINISHED";

  if (room.gameLoopInterval) {
    clearInterval(room.gameLoopInterval);
    room.gameLoopInterval = null;
  }
  if (room.matchTimeoutTimer) {
    clearTimeout(room.matchTimeoutTimer);
    room.matchTimeoutTimer = null;
  }

  // Sort final ranks: finished players first by finishRank, then unfinished by progress
  const finalLeaderboard = Array.from(room.players.values()).sort((a, b) => {
    if (a.finished && b.finished) return a.finishRank - b.finishRank;
    if (a.finished) return -1;
    if (b.finished) return 1;
    if (b.currentLap !== a.currentLap) return b.currentLap - a.currentLap;
    return b.totalCheckpointsHit - a.totalCheckpointsHit;
  });

  // Assign final rank 1..N
  finalLeaderboard.forEach((p, idx) => {
    p.finalRank = idx + 1;
  });

  // Elo rating adjustments
  const eloInput = finalLeaderboard.map((p) => ({
    id: p.id,
    rating: p.rating,
    rank: p.finalRank,
  }));
  const ratingDeltas = calculateMultiplayerElo(eloInput);

  const resultsPayload = [];

  for (const player of finalLeaderboard) {
    const rank = player.finalRank;
    const xpAward = (XP_FINISH_AWARDS[rank] || 25) + player.coinsCollected * 2;
    const coinsAward = (COIN_FINISH_AWARDS[rank] || 40) + player.coinsCollected * 10;
    const ratingChange = ratingDeltas[player.id] || 0;
    const newRating = Math.max(100, player.rating + ratingChange);

    resultsPayload.push({
      id: player.id,
      userId: player.userId,
      name: player.name,
      selectedCar: player.selectedCar,
      customization: player.customization,
      rank,
      finishTime: player.finishTime > 0 ? player.finishTime.toFixed(2) : "DNF",
      lapTimes: player.lapTimes,
      coinsCollected: player.coinsCollected,
      xpEarned: xpAward,
      coinsEarned: coinsAward,
      ratingChange,
      newRating,
    });

    // Persist to NitroProfileModel & GameLeaderboard
    try {
      const isWinner = rank === 1;
      await recordPlayerScore(
        "mini-nitro-race",
        player.name,
        newRating,
        `${newRating} Rating (${player.coinsCollected} Coins)`,
        isWinner
      );

      // Update NitroProfile
      let profile = await NitroProfileModel.findOne({ playerId: player.userId });
      if (!profile) {
        profile = new NitroProfileModel({
          playerId: player.userId,
          playerName: player.name,
          rating: newRating,
        });
      }

      profile.xp += xpAward;
      profile.coins += coinsAward;
      profile.rating = newRating;

      // Update rank tier
      if (newRating >= 2000) profile.rankTier = "Master";
      else if (newRating >= 1800) profile.rankTier = "Diamond";
      else if (newRating >= 1600) profile.rankTier = "Platinum";
      else if (newRating >= 1400) profile.rankTier = "Gold";
      else if (newRating >= 1200) profile.rankTier = "Silver";
      else profile.rankTier = "Bronze";

      // Recalculate level
      let lvl = 1;
      let needed = 150;
      let totalXP = profile.xp;
      while (totalXP >= needed) {
        totalXP -= needed;
        lvl++;
        needed = Math.round(lvl * 150);
      }
      profile.level = lvl;

      // Unlock cars if level requirement met
      const unlocks = new Set(profile.unlockedCars || ["speedster", "balanced"]);
      if (lvl >= 5) unlocks.add("drift_king");
      if (lvl >= 8) unlocks.add("nitro_x");
      if (lvl >= 12) unlocks.add("muscle");
      if (lvl >= 16) unlocks.add("rocket");
      profile.unlockedCars = Array.from(unlocks);

      // Update race stats
      profile.stats.races = (profile.stats.races || 0) + 1;
      if (rank === 1) profile.stats.wins = (profile.stats.wins || 0) + 1;
      if (rank <= 3) profile.stats.podiums = (profile.stats.podiums || 0) + 1;
      if (rank > 3) profile.stats.losses = (profile.stats.losses || 0) + 1;
      profile.stats.coinsCollected = (profile.stats.coinsCollected || 0) + player.coinsCollected;

      if (player.finishTime > 0 && (!profile.stats.bestRaceTime || player.finishTime < profile.stats.bestRaceTime)) {
        profile.stats.bestRaceTime = player.finishTime;
      }

      profile.weeklyStats.weeklyXP = (profile.weeklyStats.weeklyXP || 0) + xpAward;
      if (rank === 1) profile.weeklyStats.weeklyWins = (profile.weeklyStats.weeklyWins || 0) + 1;

      await profile.save();
    } catch (err) {
      console.error(`[NitroRace] Error saving stats for ${player.name}:`, err);
    }
  }

  console.log(`[NitroRace] Race in room ${room.id} concluded. Emitting final results.`);

  io.to(room.id).emit("nitro_race_finished", {
    roomId: room.id,
    trackId: room.trackId,
    results: resultsPayload,
  });
}
