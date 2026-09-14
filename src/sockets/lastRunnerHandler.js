// Last Runner — 1v1 Real-Time Multiplayer Server-Authoritative Handler
import { recordPlayerScore } from "../controllers/game.js";

const TICK_RATE = 20; // 20 TPS server tick
const MATCH_DURATION = 90; // 90 seconds max
const LANES = [0, 1, 2]; // 0: Left, 1: Center, 2: Right
const LANE_WIDTH = 120; // spacing between lanes

// Base speeds by time elapsed (seconds)
function getBaseSpeed(elapsedSec) {
  if (elapsedSec < 20) return 320; // 0–20s: Normal
  if (elapsedSec < 40) return 440; // 20–40s: Fast
  if (elapsedSec < 60) return 580; // 40–60s: Very Fast
  return 720; // 60s+: Extreme
}

// Helper: Generate short unique 6-character room code (e.g. ABC123)
function generateShortCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Global server state for Last Runner
const lastRunnerRooms = new Map(); // roomId -> Room
const lastRunnerCodes = new Map(); // shortCode -> roomId
let matchmakingQueue = []; // Array of { socketId, name, userId, joinedAt }

/**
 * Remove a socket from the matchmaking queue
 */
function removeFromMatchmaking(socketId) {
  if (!socketId) return;
  matchmakingQueue = matchmakingQueue.filter((item) => item.socketId !== socketId);
}

/**
 * Safely removes a socket from their current active Last Runner room
 */
function leaveActiveLastRunnerRoom(io, socket) {
  if (!socket) return;
  const roomId = socket.lastRunnerRoomId;
  if (!roomId) return;

  try {
    socket.leave(roomId);
  } catch {}
  socket.lastRunnerRoomId = null;

  if (lastRunnerRooms.has(roomId)) {
    const room = lastRunnerRooms.get(roomId);
    room.players.delete(socket.id);
    room.readyVotes.delete(socket.id);

    if (room.players.size === 0) {
      if (room.gameLoopInterval) clearInterval(room.gameLoopInterval);
      if (room.countdownInterval) clearInterval(room.countdownInterval);
      if (room.shortCode) lastRunnerCodes.delete(room.shortCode);
      lastRunnerRooms.delete(roomId);
    } else {
      // Notify remaining players in the room that opponent left
      io.to(room.roomId).emit("lastRunner_opponentLeft", {
        message: "Opponent left the match.",
      });
      if (room.status === "PLAYING" || room.status === "COUNTDOWN") {
        endLastRunnerGame(io, room, "Opponent left the match");
      }
    }
  }
}

/**
 * Creates procedural track chunks with obstacles and collectibles
 */
function generateTrackBatch(startDist, count = 20) {
  const batch = [];
  let currentDist = startDist;

  const obstacleTypes = ["barrier", "low", "overhead"];
  const itemTypes = ["mud", "ice", "bomb", "shield"];

  for (let i = 0; i < count; i++) {
    currentDist += 280 + Math.floor(Math.random() * 120); // Spacing between track elements
    const lane = Math.floor(Math.random() * 3); // 0, 1, or 2

    // 65% chance obstacle, 35% chance collectible
    if (Math.random() < 0.65) {
      const type = obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];
      batch.push({
        id: `obs_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
        category: "obstacle",
        type, // barrier, low, overhead
        lane,
        distance: currentDist,
        passed: { p1: false, p2: false },
      });
    } else {
      const type = itemTypes[Math.floor(Math.random() * itemTypes.length)];
      batch.push({
        id: `item_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
        category: "item",
        type, // mud, ice, bomb, shield
        lane,
        distance: currentDist,
        collected: false,
      });
    }
  }

  return batch;
}

/**
 * Creates a fresh 1v1 room object
 */
function createLastRunnerRoom(roomId, shortCode = null, isPrivate = false) {
  return {
    roomId,
    shortCode: shortCode || generateShortCode(),
    isPrivate,
    status: "WAITING", // WAITING, COUNTDOWN, PLAYING, ENDED
    players: new Map(), // socketId -> Player
    readyVotes: new Set(),
    track: generateTrackBatch(500, 30),
    nextTrackDist: 500 + 30 * 350,
    startTime: null,
    endTime: null,
    gameLoopInterval: null,
    countdownInterval: null,
    attacksThrown: 0,
    attacksHit: 0,
  };
}

/**
 * Serializes player state for client synchronization
 */
function serializePlayer(p) {
  return {
    id: p.id,
    name: p.name,
    role: p.role, // "p1" or "p2"
    lane: p.lane, // 0, 1, 2
    targetLane: p.targetLane,
    distance: Math.round(p.distance),
    speed: Math.round(p.speed),
    isJumping: p.isJumping,
    isSliding: p.isSliding,
    hasShield: p.hasShield,
    attackItem: p.attackItem, // null or "mud" | "ice" | "bomb"
    isSlowed: p.isSlowed,
    slowPercent: p.slowPercent,
    eliminated: p.eliminated,
    eliminationReason: p.eliminationReason,
    attacksThrown: p.attacksThrown,
    attacksHit: p.attacksHit,
  };
}

/**
 * Main 1v1 Server Game Loop
 */
function startLastRunnerLoop(io, room) {
  room.status = "PLAYING";
  room.startTime = Date.now();
  room.endTime = room.startTime + MATCH_DURATION * 1000;

  if (room.gameLoopInterval) clearInterval(room.gameLoopInterval);

  room.gameLoopInterval = setInterval(() => {
    if (room.status !== "PLAYING") return;

    const now = Date.now();
    const elapsedSec = (now - room.startTime) / 1000;
    const timeRemaining = Math.max(0, Math.ceil((room.endTime - now) / 1000));
    const baseSpeed = getBaseSpeed(elapsedSec);

    const playersArr = Array.from(room.players.values());
    if (playersArr.length < 2) {
      endLastRunnerGame(io, room, "Opponent disconnected");
      return;
    }

    // 1. Update player distances, states, and progressive speeds
    for (const p of playersArr) {
      if (p.eliminated) continue;

      // Handle jump timing
      if (p.isJumping && now >= p.jumpEndTime) {
        p.isJumping = false;
      }

      // Handle slide timing
      if (p.isSliding && now >= p.slideEndTime) {
        p.isSliding = false;
      }

      // Handle shield expiration
      if (p.hasShield && now >= p.shieldEndTime) {
        p.hasShield = false;
        io.to(room.roomId).emit("lastRunner_shieldExpired", { playerId: p.id });
      }

      // Handle slowdown debuff expiration
      if (p.isSlowed && now >= p.slowEndTime) {
        p.isSlowed = false;
        p.slowPercent = 0;
        io.to(room.roomId).emit("lastRunner_slowExpired", { playerId: p.id });
      }

      // Calculate effective speed
      let effectiveSpeed = baseSpeed;
      if (p.isSlowed) {
        effectiveSpeed = Math.round(baseSpeed * (1 - p.slowPercent / 100));
      }
      p.speed = effectiveSpeed;

      // Advance player distance forward based on tick
      const dt = 1 / TICK_RATE;
      p.distance += effectiveSpeed * dt;

      // Smooth lane transition towards targetLane
      if (p.lane !== p.targetLane) {
        p.lane = p.targetLane;
      }
    }

    // 2. Check collision with track elements (obstacles & collectibles)
    for (const elem of room.track) {
      for (const p of playersArr) {
        if (p.eliminated) continue;

        // Check if player is near the obstacle distance (within 35px collision zone)
        const distDiff = elem.distance - p.distance;

        // Collision Window: player is at the track element
        if (distDiff <= 30 && distDiff >= -30 && elem.lane === p.lane) {
          if (elem.category === "obstacle") {
            // Check if player passed safely or failed
            if (!elem.passed[p.role]) {
              elem.passed[p.role] = true;

              let avoided = false;
              if (elem.type === "barrier" || elem.type === "low") {
                avoided = p.isJumping;
              } else if (elem.type === "overhead") {
                avoided = p.isSliding;
              }

              if (!avoided) {
                // 💥 ELIMINATION! Player hit obstacle
                p.eliminated = true;
                p.eliminationReason = `Crashed into ${elem.type}`;
                console.log(`[LastRunner] ${p.name} eliminated by ${elem.type} in room ${room.roomId}`);

                io.to(room.roomId).emit("lastRunner_playerEliminated", {
                  playerId: p.id,
                  playerName: p.name,
                  reason: p.eliminationReason,
                  distance: Math.round(p.distance),
                });

                // Other player wins!
                const winner = playersArr.find((other) => other.id !== p.id);
                setTimeout(() => {
                  endLastRunnerGame(io, room, "elimination", winner);
                }, 800);
                return;
              }
            }
          } else if (elem.category === "item" && !elem.collected) {
            // Player collects item!
            elem.collected = true;
            if (elem.type === "shield") {
              p.hasShield = true;
              p.shieldEndTime = now + 5000; // 5s duration
              io.to(room.roomId).emit("lastRunner_shieldActivated", {
                playerId: p.id,
                durationMs: 5000,
              });
            } else {
              // Attack item: mud, ice, bomb (can carry 1 at a time)
              p.attackItem = elem.type;
              io.to(room.roomId).emit("lastRunner_itemCollected", {
                playerId: p.id,
                itemType: elem.type,
              });
            }
          }
        }
      }
    }

    // 3. Extend track procedurally if players get close to end of generated track
    const maxPlayerDist = Math.max(...playersArr.map((p) => p.distance));
    if (maxPlayerDist + 3000 > room.nextTrackDist) {
      const newBatch = generateTrackBatch(room.nextTrackDist, 25);
      room.track.push(...newBatch);
      room.nextTrackDist += 25 * 350;

      // Prune old passed track elements to keep memory optimal
      room.track = room.track.filter((e) => e.distance > maxPlayerDist - 800);

      io.to(room.roomId).emit("lastRunner_trackExtended", {
        newElements: newBatch,
      });
    }

    // 4. Check 90s match time expiration
    if (timeRemaining <= 0) {
      // Determine winner by distance or draw
      const sorted = [...playersArr].sort((a, b) => b.distance - a.distance);
      let winner = sorted[0];
      if (Math.abs(sorted[0].distance - sorted[1].distance) < 5) {
        winner = null; // Draw
      }
      endLastRunnerGame(io, room, "timeout", winner);
      return;
    }

    // 5. Broadcast authoritative game state diff to both players
    io.to(room.roomId).emit("lastRunner_gameState", {
      timeRemaining,
      elapsedSec: Math.floor(elapsedSec),
      baseSpeed,
      speedTier: elapsedSec < 20 ? "Normal" : elapsedSec < 40 ? "Fast" : elapsedSec < 60 ? "Very Fast" : "Extreme",
      players: playersArr.map(serializePlayer),
      track: elapsedSec < 6 ? room.track : undefined,
    });
  }, 1000 / TICK_RATE);
}

/**
 * Ends game and broadcasts winner & statistics
 */
function endLastRunnerGame(io, room, reason = "match_ended", winner = null) {
  room.status = "ENDED";

  if (room.gameLoopInterval) {
    clearInterval(room.gameLoopInterval);
    room.gameLoopInterval = null;
  }
  if (room.countdownInterval) {
    clearInterval(room.countdownInterval);
    room.countdownInterval = null;
  }

  const playersArr = Array.from(room.players.values());
  const stats = playersArr.map(serializePlayer);

  io.to(room.roomId).emit("lastRunner_gameEnded", {
    reason,
    winner: winner ? serializePlayer(winner) : null,
    isDraw: !winner,
    players: stats,
  });

  // Persist scores to Top 10 leaderboard
  try {
    for (const p of playersArr) {
      const isWin = winner && winner.id === p.id;
      recordPlayerScore("last-runner", p.name, p.distance, `${Math.round(p.distance)}m`, isWin);
    }
  } catch (err) {
    console.error("[LastRunner] Error updating leaderboard:", err);
  }

  console.log(`🏁 [LastRunner] Game ended in ${room.roomId}. Winner: ${winner?.name || "Draw"}, Reason: ${reason}`);

  if (room.shortCode) {
    lastRunnerCodes.delete(room.shortCode);
  }

  // Auto clean inactive room after 45 seconds
  setTimeout(() => {
    if (room.status === "ENDED" && lastRunnerRooms.has(room.roomId)) {
      lastRunnerRooms.delete(room.roomId);
    }
  }, 45000);
}

/**
 * Triggers 3..2..1..GO countdown
 */
function startCountdown(io, room) {
  room.status = "COUNTDOWN";
  if (room.gameLoopInterval) {
    clearInterval(room.gameLoopInterval);
    room.gameLoopInterval = null;
  }
  // Always generate fresh track batch starting from distance 400 for fresh race / rematch
  room.track = generateTrackBatch(400, 35);
  room.nextTrackDist = 400 + 35 * 350;
  room.readyVotes.clear();

  // Reset player race stats
  let rIdx = 1;
  for (const [, p] of room.players) {
    p.role = `p${rIdx}`;
    p.lane = rIdx === 1 ? 0 : 2; // P1 starts Left, P2 starts Right
    p.targetLane = p.lane;
    p.distance = 0;
    p.speed = 320;
    p.isJumping = false;
    p.isSliding = false;
    p.hasShield = false;
    p.attackItem = null;
    p.isSlowed = false;
    p.slowPercent = 0;
    p.eliminated = false;
    p.eliminationReason = null;
    p.attacksThrown = 0;
    p.attacksHit = 0;
    rIdx++;
  }

  const playersPayload = Array.from(room.players.values()).map(serializePlayer);
  let count = 3;
  io.to(room.roomId).emit("lastRunner_countdown", { count, track: room.track, players: playersPayload });

  if (room.countdownInterval) clearInterval(room.countdownInterval);

  room.countdownInterval = setInterval(() => {
    count--;
    if (count > 0) {
      io.to(room.roomId).emit("lastRunner_countdown", { count, track: room.track, players: playersPayload });
    } else {
      clearInterval(room.countdownInterval);
      room.countdownInterval = null;
      io.to(room.roomId).emit("lastRunner_countdown", { count: 0, track: room.track, players: playersPayload }); // GO!
      startLastRunnerLoop(io, room);
    }
  }, 1000);
}

/**
 * Creates and starts a 1v1 match between two verified sockets
 */
function createAndStartMatch(io, s1, name1, s2, name2) {
  leaveActiveLastRunnerRoom(io, s1);
  leaveActiveLastRunnerRoom(io, s2);

  const roomId = `lr_room_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const room = createLastRunnerRoom(roomId, null, false);

  const player1 = {
    id: s1.id,
    name: name1,
    role: "p1",
    lane: 0,
    targetLane: 0,
    distance: 0,
    speed: 320,
    isJumping: false,
    isSliding: false,
    hasShield: false,
    attackItem: null,
    isSlowed: false,
    slowPercent: 0,
    eliminated: false,
    attacksThrown: 0,
    attacksHit: 0,
  };

  const player2 = {
    id: s2.id,
    name: name2,
    role: "p2",
    lane: 2,
    targetLane: 2,
    distance: 0,
    speed: 320,
    isJumping: false,
    isSliding: false,
    hasShield: false,
    attackItem: null,
    isSlowed: false,
    slowPercent: 0,
    eliminated: false,
    attacksThrown: 0,
    attacksHit: 0,
  };

  room.players.set(s1.id, player1);
  room.players.set(s2.id, player2);
  lastRunnerRooms.set(roomId, room);

  s1.join(roomId);
  s2.join(roomId);

  s1.lastRunnerRoomId = roomId;
  s2.lastRunnerRoomId = roomId;

  console.log(`⚔️ [LastRunner Match] Pair found: ${name1} (${s1.id}) vs ${name2} (${s2.id}) in ${roomId}`);

  const playersPayload = [serializePlayer(player1), serializePlayer(player2)];

  // Emit matchFound to both players with track and player stats
  io.to(s1.id).emit("lastRunner_matchFound", {
    roomId,
    role: "p1",
    opponent: { id: s2.id, name: name2 },
    track: room.track,
    players: playersPayload,
  });

  io.to(s2.id).emit("lastRunner_matchFound", {
    roomId,
    role: "p2",
    opponent: { id: s1.id, name: name1 },
    track: room.track,
    players: playersPayload,
  });

  // Start 3..2..1 countdown
  setTimeout(() => {
    startCountdown(io, room);
  }, 500);
}

/**
 * Attempts to match any available pairs in the matchmaking queue
 */
function tryMatchLastRunner(io) {
  // 1. Purge disconnected sockets
  let i = matchmakingQueue.length - 1;
  while (i >= 0) {
    const item = matchmakingQueue[i];
    const sock = io.sockets.sockets.get(item.socketId);
    if (!sock || sock.disconnected) {
      matchmakingQueue.splice(i, 1);
    }
    i--;
  }

  // 2. Broadcast updated queue status to everyone currently in queue
  for (const item of matchmakingQueue) {
    io.to(item.socketId).emit("lastRunner_queueStatus", {
      inQueue: true,
      queueSize: matchmakingQueue.length,
    });
  }

  // 3. Pair active players in a loop
  while (matchmakingQueue.length >= 2) {
    const p1Item = matchmakingQueue.shift();
    const p2Item = matchmakingQueue.shift();

    const s1 = io.sockets.sockets.get(p1Item.socketId);
    const s2 = io.sockets.sockets.get(p2Item.socketId);

    if (!s1 || s1.disconnected) {
      if (s2 && !s2.disconnected) matchmakingQueue.unshift(p2Item);
      continue;
    }
    if (!s2 || s2.disconnected || s1.id === s2.id) {
      if (s1 && !s1.disconnected) matchmakingQueue.unshift(p1Item);
      continue;
    }

    createAndStartMatch(io, s1, p1Item.name, s2, p2Item.name);
  }

  // 4. Update status for any remaining players after pairing
  for (const item of matchmakingQueue) {
    io.to(item.socketId).emit("lastRunner_queueStatus", {
      inQueue: true,
      queueSize: matchmakingQueue.length,
    });
  }
}

/**
 * Registers all Socket.IO handlers for Last Runner
 */
export default function registerLastRunnerHandlers(io, socket) {
  // ── OPTION 1: Join Random Matchmaking ──
  socket.on("lastRunner_joinMatchmaking", ({ name }) => {
    const playerName = (name || socket.profileName || "Runner").trim();

    leaveActiveLastRunnerRoom(io, socket);
    removeFromMatchmaking(socket.id);

    console.log(`[LastRunner Queue] ${playerName} (${socket.id}) joined matchmaking.`);
    matchmakingQueue.push({
      socketId: socket.id,
      name: playerName,
      userId: socket.userId || socket.id,
      joinedAt: Date.now(),
    });

    socket.emit("lastRunner_queueStatus", {
      inQueue: true,
      queueSize: matchmakingQueue.length,
    });

    tryMatchLastRunner(io);
  });

  // ── Leave Matchmaking Queue ──
  socket.on("lastRunner_leaveMatchmaking", () => {
    removeFromMatchmaking(socket.id);
    socket.emit("lastRunner_queueStatus", { inQueue: false, queueSize: matchmakingQueue.length });
    console.log(`[LastRunner Queue] Socket ${socket.id} left queue.`);
    tryMatchLastRunner(io);
  });

  // ── OPTION 2: Create Game With Short Code ──
  socket.on("lastRunner_createGame", ({ name }, ack) => {
    removeFromMatchmaking(socket.id);
    leaveActiveLastRunnerRoom(io, socket);

    const playerName = (name || socket.profileName || "Runner").trim();
    let shortCode = generateShortCode();
    while (lastRunnerCodes.has(shortCode)) {
      shortCode = generateShortCode();
    }
    const roomId = `lr_code_${shortCode}`;

    const room = createLastRunnerRoom(roomId, shortCode, true);

    const hostPlayer = {
      id: socket.id,
      name: playerName,
      role: "p1",
      lane: 0,
      targetLane: 0,
      distance: 0,
      speed: 320,
      isJumping: false,
      isSliding: false,
      hasShield: false,
      attackItem: null,
      isSlowed: false,
      slowPercent: 0,
      eliminated: false,
      attacksThrown: 0,
      attacksHit: 0,
    };

    room.players.set(socket.id, hostPlayer);
    lastRunnerRooms.set(roomId, room);
    lastRunnerCodes.set(shortCode, roomId);

    socket.join(roomId);
    socket.lastRunnerRoomId = roomId;

    console.log(`[LastRunner Private] Room created with code ${shortCode} by ${playerName} (${socket.id})`);

    const payload = {
      success: true,
      code: shortCode,
      roomId,
      player: serializePlayer(hostPlayer),
    };

    if (typeof ack === "function") ack(payload);
    socket.emit("lastRunner_gameCreated", payload);
  });

  // ── OPTION 2: Join Game With Code ──
  socket.on("lastRunner_joinGame", ({ code, name }, ack) => {
    removeFromMatchmaking(socket.id);
    leaveActiveLastRunnerRoom(io, socket);

    const playerName = (name || socket.profileName || "Runner").trim();
    const normalizedCode = (code || "").trim().toUpperCase();
    const roomId = lastRunnerCodes.get(normalizedCode);

    const respondError = (msg) => {
      const errPayload = { success: false, message: msg };
      if (typeof ack === "function") ack(errPayload);
      socket.emit("lastRunner_joinError", errPayload);
    };

    if (!roomId || !lastRunnerRooms.has(roomId)) {
      return respondError("Invalid game code. Room not found.");
    }

    const room = lastRunnerRooms.get(roomId);

    if (room.players.has(socket.id)) {
      return respondError("You are already in this game.");
    }

    if (room.players.size >= 2) {
      return respondError("Game is already full.");
    }

    if (room.status !== "WAITING") {
      return respondError("This match has already started or ended.");
    }

    // Join room as P2
    const guestPlayer = {
      id: socket.id,
      name: playerName,
      role: "p2",
      lane: 2,
      targetLane: 2,
      distance: 0,
      speed: 320,
      isJumping: false,
      isSliding: false,
      hasShield: false,
      attackItem: null,
      isSlowed: false,
      slowPercent: 0,
      eliminated: false,
      attacksThrown: 0,
      attacksHit: 0,
    };

    room.players.set(socket.id, guestPlayer);
    socket.join(roomId);
    socket.lastRunnerRoomId = roomId;

    const host = Array.from(room.players.values()).find((p) => p.id !== socket.id);

    console.log(`[LastRunner Private] ${playerName} joined room ${normalizedCode} (Host: ${host?.name})`);

    const playersPayload = [serializePlayer(host), serializePlayer(guestPlayer)];

    const joinSuccess = {
      success: true,
      roomId,
      code: normalizedCode,
      players: playersPayload,
    };

    if (typeof ack === "function") ack(joinSuccess);

    // Notify host & guest
    io.to(socket.id).emit("lastRunner_matchFound", {
      roomId,
      role: "p2",
      opponent: { id: host.id, name: host.name },
      track: room.track,
      players: playersPayload,
    });

    io.to(host.id).emit("lastRunner_matchFound", {
      roomId,
      role: "p1",
      opponent: { id: socket.id, name: guestPlayer.name },
      track: room.track,
      players: playersPayload,
    });

    // Both players present: start countdown
    setTimeout(() => {
      startCountdown(io, room);
    }, 500);
  });

  // ── Player Controls: Lane Shift, Jump, Slide ──
  socket.on("lastRunner_playerInput", ({ action }) => {
    const roomId = socket.lastRunnerRoomId;
    if (!roomId) return;
    const room = lastRunnerRooms.get(roomId);
    if (!room || room.status !== "PLAYING") return;

    const player = room.players.get(socket.id);
    if (!player || player.eliminated) return;

    const now = Date.now();

    if (action === "left") {
      if (player.targetLane > 0) {
        player.targetLane -= 1;
        player.lane = player.targetLane;
      }
    } else if (action === "right") {
      if (player.targetLane < 2) {
        player.targetLane += 1;
        player.lane = player.targetLane;
      }
    } else if (action === "jump") {
      if (!player.isJumping && !player.isSliding) {
        player.isJumping = true;
        player.jumpEndTime = now + 750;
        io.to(room.roomId).emit("lastRunner_playerAction", {
          playerId: player.id,
          action: "jump",
          durationMs: 750,
        });
      }
    } else if (action === "slide") {
      if (!player.isSliding && !player.isJumping) {
        player.isSliding = true;
        player.slideEndTime = now + 650;
        io.to(room.roomId).emit("lastRunner_playerAction", {
          playerId: player.id,
          action: "slide",
          durationMs: 650,
        });
      }
    }
  });

  // ── Attack System: Throw Collected Item at Opponent ──
  socket.on("lastRunner_throwItem", () => {
    const roomId = socket.lastRunnerRoomId;
    if (!roomId) return;
    const room = lastRunnerRooms.get(roomId);
    if (!room || room.status !== "PLAYING") return;

    const sender = room.players.get(socket.id);
    if (!sender || sender.eliminated || !sender.attackItem) return;

    const itemType = sender.attackItem;
    sender.attackItem = null; // Consume inventory
    sender.attacksThrown += 1;
    room.attacksThrown += 1;

    // Find target opponent
    const opponent = Array.from(room.players.values()).find((p) => p.id !== sender.id);
    if (!opponent || opponent.eliminated) return;

    console.log(`🎯 [LastRunner Attack] ${sender.name} threw ${itemType} at ${opponent.name}`);

    // Broadcast projectile launched
    io.to(room.roomId).emit("lastRunner_itemThrown", {
      senderId: sender.id,
      targetId: opponent.id,
      itemType,
      flightTimeMs: 700,
    });

    // Resolve projectile hit after flight time (700ms)
    setTimeout(() => {
      if (room.status !== "PLAYING") return;

      const now = Date.now();
      sender.attacksHit += 1;
      room.attacksHit += 1;

      // 1. Check if opponent has Shield active
      if (opponent.hasShield) {
        opponent.hasShield = false; // Shield breaks!
        console.log(`🛡️ [LastRunner Defense] ${opponent.name}'s shield blocked ${itemType}!`);
        io.to(room.roomId).emit("lastRunner_attackBlocked", {
          targetId: opponent.id,
          blockedItem: itemType,
        });
        return;
      }

      // 2. Apply item specific slowdown debuff
      let slowPercent = 40;
      let durationMs = 2000;

      if (itemType === "mud") {
        slowPercent = 40; // -40% speed for 2s
        durationMs = 2000;
      } else if (itemType === "ice") {
        slowPercent = 60; // -60% speed for 1.5s
        durationMs = 1500;
      } else if (itemType === "bomb") {
        slowPercent = 70; // -70% speed for 2s + knockback
        durationMs = 2000;
        opponent.distance = Math.max(0, opponent.distance - 40);
      }

      opponent.isSlowed = true;
      opponent.slowPercent = slowPercent;
      opponent.slowEndTime = now + durationMs;

      io.to(room.roomId).emit("lastRunner_itemHit", {
        targetId: opponent.id,
        itemType,
        slowPercent,
        durationMs,
      });
    }, 700);
  });

  // ── Rematch / Play Again ──
  socket.on("lastRunner_playAgain", () => {
    const roomId = socket.lastRunnerRoomId;
    if (!roomId) {
      socket.emit("lastRunner_opponentLeft", { message: "Match ended. Please find a new opponent." });
      return;
    }
    const room = lastRunnerRooms.get(roomId);
    if (!room) {
      socket.emit("lastRunner_opponentLeft", { message: "Room expired. Please find a new opponent." });
      return;
    }

    if (room.players.size < 2) {
      socket.emit("lastRunner_opponentLeft", { message: "Opponent has left the game. Please search for a new match." });
      return;
    }

    room.readyVotes.add(socket.id);
    io.to(room.roomId).emit("lastRunner_rematchVote", {
      playerId: socket.id,
      votesCount: room.readyVotes.size,
    });

    // When both players have clicked Play Again: restart match!
    if (room.readyVotes.size >= 2) {
      console.log(`🔄 [LastRunner Rematch] Starting rematch in room ${room.roomId}`);
      startCountdown(io, room);
    }
  });

  // ── Leave Room ──
  socket.on("lastRunner_leaveGame", () => {
    removeFromMatchmaking(socket.id);
    leaveActiveLastRunnerRoom(io, socket);
  });

  // ── Socket Disconnection Handling ──
  socket.on("disconnect", () => {
    removeFromMatchmaking(socket.id);
    leaveActiveLastRunnerRoom(io, socket);
  });
}

