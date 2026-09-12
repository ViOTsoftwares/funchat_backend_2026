// Coin Rush Multiplayer Server-Authoritative Handler
import { recordPlayerScore } from "../controllers/game.js";

const ARENA_WIDTH = 1200;
const ARENA_HEIGHT = 800;
const PLAYER_RADIUS = 20;
const COIN_RADIUS = 14;
const POWERUP_RADIUS = 18;
const MIN_PLAYERS = 2;
const ROUND_DURATION = 60; // 60 seconds
const TARGET_COIN_COUNT = 15;
const MAX_POWERUPS = 2;
const BASE_SPEED = 220; // units per second

// Color palette for up to 8 players
const PLAYER_COLORS = [
  "#38bdf8", // Sky Blue
  "#f43f5e", // Rose / Red
  "#a855f7", // Purple
  "#22c55e", // Emerald Green
  "#f59e0b", // Amber / Yellow
  "#ec4899", // Pink
  "#14b8a6", // Teal
  "#8b5cf6", // Violet
];

// Walls / Obstacles in the arena for collision validation
const ARENA_WALLS = [
  // Outer boundary walls (thickness = 20)
  { x: 0, y: 0, w: ARENA_WIDTH, h: 20 },
  { x: 0, y: 0, w: 20, h: ARENA_HEIGHT },
  { x: 0, y: ARENA_HEIGHT - 20, w: ARENA_WIDTH, h: 20 },
  { x: ARENA_WIDTH - 20, y: 0, w: 20, h: ARENA_HEIGHT },

  // Tactical inner obstacle blocks
  { x: 300, y: 200, w: 120, h: 80 },
  { x: 780, y: 200, w: 120, h: 80 },
  { x: 300, y: 520, w: 120, h: 80 },
  { x: 780, y: 520, w: 120, h: 80 },
  { x: 540, y: 350, w: 120, h: 100 }, // Center pillar
];

// Helper: Generate random unique 6-character room code
function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "RUSH";
  for (let i = 0; i < 2; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Helper: Check if point collides with walls
function isPointCollidingWithWalls(x, y, radius = 20) {
  for (const wall of ARENA_WALLS) {
    if (
      x + radius > wall.x &&
      x - radius < wall.x + wall.w &&
      y + radius > wall.y &&
      y - radius < wall.y + wall.h
    ) {
      return true;
    }
  }
  return false;
}

// Helper: Spawn point generator avoiding walls
function getRandomValidPoint(padding = 40) {
  let attempts = 0;
  while (attempts < 100) {
    const x = padding + Math.random() * (ARENA_WIDTH - padding * 2);
    const y = padding + Math.random() * (ARENA_HEIGHT - padding * 2);
    if (!isPointCollidingWithWalls(x, y, 30)) {
      return { x: Math.round(x), y: Math.round(y) };
    }
    attempts++;
  }
  return { x: 600, y: 400 };
}

// Store active Coin Rush rooms
const coinRushRooms = new Map();

// Helper: Auto-assign balanced teams (blue vs red)
function assignPlayerTeam(room, requestedTeam = null) {
  if (room.playMode !== "TEAM") return null;

  if (requestedTeam === "blue" || requestedTeam === "red") {
    return requestedTeam;
  }

  let blueCount = 0;
  let redCount = 0;

  for (const [, p] of room.players) {
    if (p.teamId === "blue") blueCount++;
    if (p.teamId === "red") redCount++;
  }

  return blueCount <= redCount ? "blue" : "red";
}

function calculateTeamScores(room) {
  let blue = 0;
  let red = 0;
  if (room && room.players) {
    for (const [, p] of room.players) {
      if (p.teamId === "blue") blue += p.score || 0;
      else if (p.teamId === "red") red += p.score || 0;
    }
  }
  return { blue, red };
}

export default function registerCoinRushHandlers(io, socket) {
  // Helper to create a room object
  function createRoomObject(roomCode, hostSocketId, playerName, maxPlayers = 2, isPublic = true, playMode = "SOLO") {
    const hostColor = PLAYER_COLORS[0];
    const spawn = getRandomValidPoint(80);

    const parsedCap = [2, 4, 8].includes(Number(maxPlayers)) ? Number(maxPlayers) : 2;
    const mode = parsedCap > 2 && playMode === "TEAM" ? "TEAM" : "SOLO";
    const hostTeam = mode === "TEAM" ? "blue" : null;

    const room = {
      roomId: roomCode,
      status: "WAITING",
      hostId: hostSocketId,
      maxPlayers: parsedCap,
      playMode: mode,
      isPublic: Boolean(isPublic),
      players: new Map(),
      coins: [],
      powerUps: [],
      startTime: null,
      endTime: null,
      countdownVal: null,
      gameLoopInterval: null,
      countdownInterval: null,
      powerUpRespawnTimer: null,
      usedColors: new Set([hostColor]),
    };

    const hostPlayer = {
      id: hostSocketId,
      name: playerName,
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      score: 0,
      speed: BASE_SPEED,
      powerUp: null,
      color: hostColor,
      teamId: hostTeam,
      active: true,
      isHost: true,
    };

    room.players.set(hostSocketId, hostPlayer);
    coinRushRooms.set(roomCode, room);

    return room;
  }

  // Helper to start countdown
  function triggerCountdown(code) {
    const room = coinRushRooms.get(code);
    if (!room || (room.status !== "WAITING" && room.status !== "ENDED")) return;

    room.status = "COUNTDOWN";
    room.coins = spawnInitialCoins();
    room.powerUps = [];
    room.startTime = null;
    room.endTime = null;

    // Ensure all players have a team if playMode is TEAM
    if (room.playMode === "TEAM") {
      let idx = 0;
      for (const [, p] of room.players) {
        if (!p.teamId) {
          p.teamId = idx % 2 === 0 ? "blue" : "red";
        }
        idx++;
      }
    }

    for (const [, p] of room.players) {
      const spawn = getRandomValidPoint(100);
      p.x = spawn.x;
      p.y = spawn.y;
      p.vx = 0;
      p.vy = 0;
      p.score = 0;
      p.speed = BASE_SPEED;
      p.powerUp = null;
      p.active = true;
    }

    let countdown = 3;
    room.countdownVal = countdown;
    const serialized = serializeRoomState(room);
    io.to(`coinrush_${code}`).emit("coinRush_roomState", serialized);
    io.to(`coinrush_${code}`).emit("coinRush_countdown", { countdown });

    if (room.countdownInterval) clearInterval(room.countdownInterval);

    room.countdownInterval = setInterval(() => {
      countdown--;
      room.countdownVal = countdown;

      if (countdown > 0) {
        io.to(`coinrush_${code}`).emit("coinRush_countdown", { countdown });
      } else if (countdown === 0) {
        io.to(`coinrush_${code}`).emit("coinRush_countdown", { countdown: "GO!" });
      } else {
        clearInterval(room.countdownInterval);
        room.countdownInterval = null;
        startGameRound(io, room);
      }
    }, 1000);
  }

  // Leave active room helper
  function leaveCurrentRoom() {
    const code = socket.coinRushRoomId;
    if (!code) return;

    const room = coinRushRooms.get(code);
    if (!room) return;

    const player = room.players.get(socket.id);
    if (player) {
      room.usedColors.delete(player.color);
    }
    room.players.delete(socket.id);
    socket.leave(`coinrush_${code}`);
    socket.coinRushRoomId = null;

    console.log(`🎮 [CoinRush] Player ${socket.id} left room ${code}`);

    if (room.players.size === 0) {
      cleanUpRoom(room);
      coinRushRooms.delete(code);
      console.log(`🎮 [CoinRush] Room ${code} destroyed (empty)`);
    } else {
      if (room.hostId === socket.id) {
        const nextHostSocketId = room.players.keys().next().value;
        room.hostId = nextHostSocketId;
        const nextHost = room.players.get(nextHostSocketId);
        if (nextHost) nextHost.isHost = true;
      }
      const serialized = serializeRoomState(room);
      io.to(`coinrush_${code}`).emit("coinRush_roomState", serialized);
      io.to(`coinrush_${code}`).emit("coinRush_playerLeft", {
        playerId: socket.id,
        newHostId: room.hostId,
      });

      if ((room.status === "PLAYING" || room.status === "COUNTDOWN") && room.players.size < MIN_PLAYERS) {
        endGameRound(io, room, "Not enough players remaining");
      }
    }
  }

  // ── Create Custom Room ──
  socket.on("coinRush_createRoom", ({ name, maxPlayers = 2, playMode = "SOLO", isPublic = false }, ack) => {
    leaveCurrentRoom();

    let roomCode = generateRoomCode();
    while (coinRushRooms.has(roomCode)) {
      roomCode = generateRoomCode();
    }

    const playerName = (name || "Player 1").trim().substring(0, 16);
    const room = createRoomObject(roomCode, socket.id, playerName, maxPlayers, isPublic, playMode);

    socket.join(`coinrush_${roomCode}`);
    socket.coinRushRoomId = roomCode;

    console.log(`🎮 [CoinRush] Room ${roomCode} created by ${playerName} (${room.maxPlayers}P ${room.playMode})`);

    const serialized = serializeRoomState(room);
    const responseData = {
      ok: true,
      roomId: roomCode,
      isHost: true,
      roomState: serialized,
    };

    if (typeof ack === "function") ack(responseData);
    socket.emit("coinRush_roomState", serialized);
  });

  // ── Toggle Play Mode (SOLO vs TEAM) in Lobby ──
  socket.on("coinRush_togglePlayMode", ({ playMode }, ack) => {
    const code = socket.coinRushRoomId;
    if (!code) return;
    const room = coinRushRooms.get(code);
    if (!room || room.hostId !== socket.id || room.status !== "WAITING") return;

    room.playMode = ["SOLO", "TEAM"].includes(playMode) ? playMode : "SOLO";

    // Reassign teams if switched to TEAM
    let idx = 0;
    for (const [, p] of room.players) {
      p.teamId = room.playMode === "TEAM" ? (idx % 2 === 0 ? "blue" : "red") : null;
      idx++;
    }

    const serialized = serializeRoomState(room);
    io.to(`coinrush_${code}`).emit("coinRush_roomState", serialized);
    if (typeof ack === "function") ack({ ok: true, roomState: serialized });
  });

  // ── Toggle Player Team (Blue vs Red) ──
  socket.on("coinRush_toggleTeam", ({ teamId }, ack) => {
    const code = socket.coinRushRoomId;
    if (!code) return;
    const room = coinRushRooms.get(code);
    if (!room || room.status !== "WAITING" || room.playMode !== "TEAM") return;

    const player = room.players.get(socket.id);
    if (player) {
      player.teamId = ["blue", "red"].includes(teamId) ? teamId : player.teamId === "blue" ? "red" : "blue";
      const serialized = serializeRoomState(room);
      io.to(`coinrush_${code}`).emit("coinRush_roomState", serialized);
      if (typeof ack === "function") ack({ ok: true, roomState: serialized });
    }
  });

  // ── Random Quick Match / Party Find Opponents Matchmaking ──
  socket.on("coinRush_quickMatch", ({ name, maxPlayers = 2, playMode = "SOLO" }, ack) => {
    const playerName = (name || "Player").trim().substring(0, 16);
    const targetCapacity = [2, 4, 8].includes(Number(maxPlayers)) ? Number(maxPlayers) : 2;
    const targetMode = targetCapacity > 2 && playMode === "TEAM" ? "TEAM" : "SOLO";

    // If player is already in a party room (e.g. 2, 3, or 4 friends together) and host triggers Quick Match
    const currentCode = socket.coinRushRoomId;
    const currentRoom = currentCode ? coinRushRooms.get(currentCode) : null;

    if (currentRoom && currentRoom.status === "WAITING" && currentRoom.hostId === socket.id && currentRoom.players.size > 1) {
      // Find another waiting party/room to merge with or fill remaining slots!
      let opponentRoom = null;
      for (const [, r] of coinRushRooms) {
        if (
          r.roomId !== currentCode &&
          r.status === "WAITING" &&
          r.maxPlayers === targetCapacity &&
          r.playMode === targetMode &&
          r.players.size + currentRoom.players.size <= targetCapacity
        ) {
          opponentRoom = r;
          break;
        }
      }

      if (opponentRoom) {
        // Merge party into opponent room
        for (const [pId, p] of currentRoom.players) {
          p.isHost = false;
          p.teamId = targetMode === "TEAM" ? "red" : null; // Assign opposing team
          opponentRoom.players.set(pId, p);
          const socketObj = io.sockets.sockets.get(pId);
          if (socketObj) {
            socketObj.leave(`coinrush_${currentCode}`);
            socketObj.join(`coinrush_${opponentRoom.roomId}`);
            socketObj.coinRushRoomId = opponentRoom.roomId;
          }
        }
        coinRushRooms.delete(currentCode);

        const serialized = serializeRoomState(opponentRoom);
        io.to(`coinrush_${opponentRoom.roomId}`).emit("coinRush_roomState", serialized);

        if (opponentRoom.players.size >= opponentRoom.maxPlayers) {
          triggerCountdown(opponentRoom.roomId);
        }
        if (typeof ack === "function") ack({ ok: true, roomId: opponentRoom.roomId, roomState: serialized });
        return;
      } else {
        // Expand room capacity to allow opponents to join in Quick Match
        currentRoom.isPublic = true;
        currentRoom.maxPlayers = targetCapacity;
        currentRoom.playMode = targetMode;
        const serialized = serializeRoomState(currentRoom);
        io.to(`coinrush_${currentCode}`).emit("coinRush_roomState", serialized);
        if (typeof ack === "function") ack({ ok: true, roomId: currentCode, roomState: serialized });
        return;
      }
    }

    leaveCurrentRoom();

    let matchedRoom = null;

    // 1st Priority: Match open room with exact target capacity & playMode
    for (const [, room] of coinRushRooms) {
      if (
        room.status === "WAITING" &&
        room.players.size < room.maxPlayers &&
        room.maxPlayers === targetCapacity &&
        room.playMode === targetMode
      ) {
        matchedRoom = room;
        break;
      }
    }

    // 2nd Priority: Match ANY open room with space
    if (!matchedRoom) {
      for (const [, room] of coinRushRooms) {
        if (room.status === "WAITING" && room.players.size < room.maxPlayers) {
          matchedRoom = room;
          break;
        }
      }
    }

    if (matchedRoom) {
      let color = PLAYER_COLORS.find((c) => !matchedRoom.usedColors.has(c));
      if (!color) color = PLAYER_COLORS[matchedRoom.players.size % PLAYER_COLORS.length];
      matchedRoom.usedColors.add(color);

      const spawn = getRandomValidPoint(80);
      const assignedTeam = assignPlayerTeam(matchedRoom);

      const player = {
        id: socket.id,
        name: playerName,
        x: spawn.x,
        y: spawn.y,
        vx: 0,
        vy: 0,
        score: 0,
        speed: BASE_SPEED,
        powerUp: null,
        color,
        teamId: assignedTeam,
        active: true,
        isHost: false,
      };

      matchedRoom.players.set(socket.id, player);
      socket.join(`coinrush_${matchedRoom.roomId}`);
      socket.coinRushRoomId = matchedRoom.roomId;

      console.log(`⚡ [CoinRush QuickMatch] ${playerName} joined Room ${matchedRoom.roomId} (${matchedRoom.players.size}/${matchedRoom.maxPlayers}P)`);

      const serialized = serializeRoomState(matchedRoom);
      if (typeof ack === "function") {
        ack({ ok: true, roomId: matchedRoom.roomId, isHost: false, roomState: serialized });
      }

      io.to(`coinrush_${matchedRoom.roomId}`).emit("coinRush_roomState", serialized);
      io.to(`coinrush_${matchedRoom.roomId}`).emit("coinRush_playerJoined", {
        player: serializePlayer(player),
        roomState: serialized,
      });

      if (matchedRoom.players.size >= matchedRoom.maxPlayers) {
        triggerCountdown(matchedRoom.roomId);
      }
    } else {
      let roomCode = generateRoomCode();
      while (coinRushRooms.has(roomCode)) {
        roomCode = generateRoomCode();
      }

      const newRoom = createRoomObject(roomCode, socket.id, playerName, targetCapacity, true, targetMode);
      socket.join(`coinrush_${roomCode}`);
      socket.coinRushRoomId = roomCode;

      console.log(`⚡ [CoinRush QuickMatch] Created new Public Room ${roomCode} for ${playerName} (Max ${targetCapacity}P ${targetMode})`);

      const serialized = serializeRoomState(newRoom);
      const responseData = {
        ok: true,
        roomId: roomCode,
        isHost: true,
        roomState: serialized,
      };

      if (typeof ack === "function") ack(responseData);
      socket.emit("coinRush_roomState", serialized);
    }
  });

  // ── Join Specific Room Code ──
  socket.on("coinRush_joinRoom", ({ roomId, name }, ack) => {
    leaveCurrentRoom();

    const code = (roomId || "").toUpperCase().trim();
    const room = coinRushRooms.get(code);

    if (!room) {
      const err = { ok: false, message: "Room not found" };
      if (typeof ack === "function") ack(err);
      return socket.emit("coinRush_error", err);
    }

    if (room.status !== "WAITING") {
      const err = { ok: false, message: "Game already in progress" };
      if (typeof ack === "function") ack(err);
      return socket.emit("coinRush_error", err);
    }

    if (room.players.size >= room.maxPlayers) {
      const err = { ok: false, message: `Room is full (max ${room.maxPlayers} players)` };
      if (typeof ack === "function") ack(err);
      return socket.emit("coinRush_error", err);
    }

    let color = PLAYER_COLORS.find((c) => !room.usedColors.has(c));
    if (!color) color = PLAYER_COLORS[room.players.size % PLAYER_COLORS.length];
    room.usedColors.add(color);

    const playerName = (name || `Player ${room.players.size + 1}`).trim().substring(0, 16);
    const spawn = getRandomValidPoint(80);
    const assignedTeam = assignPlayerTeam(room);

    const player = {
      id: socket.id,
      name: playerName,
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      score: 0,
      speed: BASE_SPEED,
      powerUp: null,
      color,
      teamId: assignedTeam,
      active: true,
      isHost: false,
    };

    room.players.set(socket.id, player);
    socket.join(`coinrush_${code}`);
    socket.coinRushRoomId = code;

    console.log(`🎮 [CoinRush] ${playerName} joined Room ${code} (${room.players.size}/${room.maxPlayers}P)`);

    const serialized = serializeRoomState(room);
    if (typeof ack === "function") {
      ack({ ok: true, roomId: code, isHost: false, roomState: serialized });
    }

    io.to(`coinrush_${code}`).emit("coinRush_roomState", serialized);
    io.to(`coinrush_${code}`).emit("coinRush_playerJoined", {
      player: serializePlayer(player),
      roomState: serialized,
    });

    if (room.players.size >= room.maxPlayers) {
      triggerCountdown(code);
    }
  });

  // ── Host Starts Game ──
  socket.on("coinRush_startGame", ({ roomId }, ack) => {
    const code = roomId || socket.coinRushRoomId;
    const room = coinRushRooms.get(code);

    if (!room) return;
    if (room.hostId !== socket.id) {
      const err = { ok: false, message: "Only the host can start the game" };
      if (typeof ack === "function") ack(err);
      return;
    }

    if (room.players.size < MIN_PLAYERS) {
      const err = { ok: false, message: "Minimum 2 players required to start!" };
      if (typeof ack === "function") ack(err);
      return socket.emit("coinRush_error", err);
    }

    if (typeof ack === "function") ack({ ok: true });
    triggerCountdown(code);
  });

  // ── Player Input Handler ──
  socket.on("coinRush_playerInput", ({ dx, dy, vx, vy, roomId }, ack) => {
    const code = socket.coinRushRoomId || roomId;
    if (!code) return;
    const room = coinRushRooms.get(code);
    if (!room || room.status !== "PLAYING") return;

    // Ensure socket.coinRushRoomId is set
    if (!socket.coinRushRoomId) socket.coinRushRoomId = code;

    const player = room.players.get(socket.id);
    if (!player || !player.active) return;

    let currentSpeed = BASE_SPEED;
    if (player.powerUp && player.powerUp.type === "speed") {
      currentSpeed = BASE_SPEED * 1.8;
    }

    let inputX = typeof vx === "number" ? vx : typeof dx === "number" ? dx * currentSpeed : 0;
    let inputY = typeof vy === "number" ? vy : typeof dy === "number" ? dy * currentSpeed : 0;

    const speedMag = Math.hypot(inputX, inputY);
    if (speedMag > currentSpeed * 1.1 && speedMag > 0) {
      inputX = (inputX / speedMag) * currentSpeed;
      inputY = (inputY / speedMag) * currentSpeed;
    }

    player.vx = inputX;
    player.vy = inputY;

    if (typeof ack === "function") {
      ack({ ok: true });
    }
  });

  // ── Room Voice Chat Signaling ──
  socket.on("coinRush_voice_signal", ({ targetSocketId, signalData }) => {
    if (!targetSocketId || !signalData) return;
    io.to(targetSocketId).emit("coinRush_voice_signal", {
      fromSocketId: socket.id,
      signalData,
    });
  });

  socket.on("coinRush_voice_mute_toggle", ({ isMuted }) => {
    const code = socket.coinRushRoomId;
    if (!code) return;
    const room = coinRushRooms.get(code);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (player) {
      player.isMuted = Boolean(isMuted);
      io.to(`coinrush_${code}`).emit("coinRush_voice_player_mute_changed", {
        playerId: socket.id,
        isMuted: player.isMuted,
      });
    }
  });

  // ── Leave Room / Disconnect ──
  socket.on("coinRush_leaveRoom", leaveCurrentRoom);
  socket.on("disconnect", leaveCurrentRoom);
}

// ── Helper: Professional 2D Rigid-Body Circle Collision Response System ──
function resolveRigidBodyCollision(A, B) {
  if (!A || !B) return { collided: false };

  let dx = B.x - A.x;
  let dy = B.y - A.y;
  let distance = Math.hypot(dx, dy);

  let nx, ny;
  if (distance < 0.0001) {
    nx = 1;
    ny = 0;
    distance = 0.0001;
  } else {
    nx = dx / distance;
    ny = dy / distance;
  }

  const radiusA = typeof A.radius === "number" ? A.radius : PLAYER_RADIUS;
  const radiusB = typeof B.radius === "number" ? B.radius : COIN_RADIUS;

  const minDistance = radiusA + radiusB;
  if (distance >= minDistance) {
    return { collided: false };
  }

  const massA = typeof A.mass === "number" && A.mass > 0 ? A.mass : 1.0;
  const massB = typeof B.mass === "number" && B.mass > 0 ? B.mass : 0.5;
  const invMassA = 1 / massA;
  const invMassB = 1 / massB;

  const relativeVx = (B.vx || 0) - (A.vx || 0);
  const relativeVy = (B.vy || 0) - (A.vy || 0);

  const velocityAlongNormal = relativeVx * nx + relativeVy * ny;

  let impulseMagnitude = 0;
  let impulseX = 0;
  let impulseY = 0;

  // Resolve impulse ONLY if objects are moving toward each other
  if (velocityAlongNormal < 0) {
    const restitutionA = typeof A.restitution === "number" ? A.restitution : 0.8;
    const restitutionB = typeof B.restitution === "number" ? B.restitution : 0.8;
    const restitution = Math.min(restitutionA, restitutionB);

    impulseMagnitude = (-(1 + restitution) * velocityAlongNormal) / (invMassA + invMassB);

    impulseX = impulseMagnitude * nx;
    impulseY = impulseMagnitude * ny;

    A.vx = (A.vx || 0) - impulseX * invMassA;
    A.vy = (A.vy || 0) - impulseY * invMassA;

    B.vx = (B.vx || 0) + impulseX * invMassB;
    B.vy = (B.vy || 0) + impulseY * invMassB;

    // Coulomb Tangential Friction Impulse (preserves tangential speed for side/glancing hits)
    const frictionA = typeof A.friction === "number" ? A.friction : 0.1;
    const frictionB = typeof B.friction === "number" ? B.friction : 0.1;
    const frictionCoefficient = Math.sqrt(frictionA * frictionB);

    const tx = -ny;
    const ty = nx;

    const tangentVelocity = relativeVx * tx + relativeVy * ty;
    let frictionImpulse = -tangentVelocity / (invMassA + invMassB);
    const maxFriction = impulseMagnitude * frictionCoefficient;

    frictionImpulse = Math.max(-maxFriction, Math.min(maxFriction, frictionImpulse));

    const frictionX = frictionImpulse * tx;
    const frictionY = frictionImpulse * ty;

    A.vx -= frictionX * invMassA;
    A.vy -= frictionY * invMassA;

    B.vx += frictionX * invMassB;
    B.vy += frictionY * invMassB;
  }

  // Positional Correction (Prevents sticking & embedding)
  const penetration = minDistance - distance;
  if (penetration > 0) {
    const totalInverseMass = invMassA + invMassB;
    const correctionPercent = 0.8;
    const slop = 0.01;

    const correctionMagnitude = (Math.max(penetration - slop, 0) / totalInverseMass) * correctionPercent;

    const correctionX = correctionMagnitude * nx;
    const correctionY = correctionMagnitude * ny;

    A.x -= correctionX * invMassA;
    A.y -= correctionY * invMassA;

    B.x += correctionX * invMassB;
    B.y += correctionY * invMassB;
  }

  // Velocity Clamping to prevent NaN or infinite spikes
  const MAX_VELOCITY = 650;
  const speedA = Math.hypot(A.vx || 0, A.vy || 0);
  if (speedA > MAX_VELOCITY) {
    A.vx = ((A.vx || 0) / speedA) * MAX_VELOCITY;
    A.vy = ((A.vy || 0) / speedA) * MAX_VELOCITY;
  }
  const speedB = Math.hypot(B.vx || 0, B.vy || 0);
  if (speedB > MAX_VELOCITY) {
    B.vx = ((B.vx || 0) / speedB) * MAX_VELOCITY;
    B.vy = ((B.vy || 0) / speedB) * MAX_VELOCITY;
  }

  return {
    collided: true,
    impulseMagnitude,
    impulseX,
    impulseY,
    collisionNormalX: nx,
    collisionNormalY: ny,
  };
}

// ── Helper: Vector Wall Reflection Physics Engine ──
function resolveWallReflection(obj) {
  if (!obj) return;
  const radius = typeof obj.radius === "number" ? obj.radius : 14;
  const rest = typeof obj.restitution === "number" ? obj.restitution : 0.8;

  let hit = false;
  let wnx = 0;
  let wny = 0;

  // 1. Check Arena Boundaries
  if (obj.x - radius < 20) {
    wnx = 1; wny = 0; hit = true;
  } else if (obj.x + radius > ARENA_WIDTH - 20) {
    wnx = -1; wny = 0; hit = true;
  }

  if (obj.y - radius < 20) {
    wnx = 0; wny = 1; hit = true;
  } else if (obj.y + radius > ARENA_HEIGHT - 20) {
    wnx = 0; wny = -1; hit = true;
  }

  if (hit) {
    const dot = (obj.vx || 0) * wnx + (obj.vy || 0) * wny;
    if (dot < 0) {
      obj.vx = ((obj.vx || 0) - 2 * dot * wnx) * rest;
      obj.vy = ((obj.vy || 0) - 2 * dot * wny) * rest;
    }
    obj.x = Math.max(radius + 20, Math.min(ARENA_WIDTH - radius - 20, obj.x));
    obj.y = Math.max(radius + 20, Math.min(ARENA_HEIGHT - radius - 20, obj.y));
  }

  // 2. Check Inner Obstacle Rectangles
  for (const wall of ARENA_WALLS) {
    if (wall.x === 0 || wall.y === 0 || wall.w === ARENA_WIDTH || wall.h === ARENA_HEIGHT) continue;

    const closestX = Math.max(wall.x, Math.min(obj.x, wall.x + wall.w));
    const closestY = Math.max(wall.y, Math.min(obj.y, wall.y + wall.h));
    let dx = obj.x - closestX;
    let dy = obj.y - closestY;
    let dist = Math.hypot(dx, dy);

    if (dist < radius) {
      let nx, ny;
      if (dist < 0.0001) {
        nx = 1; ny = 0; dist = 0.0001;
      } else {
        nx = dx / dist;
        ny = dy / dist;
      }

      const dot = (obj.vx || 0) * nx + (obj.vy || 0) * ny;
      if (dot < 0) {
        obj.vx = ((obj.vx || 0) - 2 * dot * nx) * rest;
        obj.vy = ((obj.vy || 0) - 2 * dot * ny) * rest;
      }
      const overlap = radius - dist;
      obj.x += nx * overlap;
      obj.y += ny * overlap;
    }
  }
}

// ── Spawn Initial Coins ──
function getCoinPhysicalProps(type) {
  if (type === "super") {
    return { radius: 14, mass: 0.6, restitution: 0.80, friction: 0.10, value: 30 };
  } else if (type === "blue") {
    return { radius: 15, mass: 1.2, restitution: 0.85, friction: 0.05, value: 25 };
  } else if (type === "red") {
    return { radius: 15, mass: 1.0, restitution: 0.80, friction: 0.10, value: 50 };
  } else if (type === "mini_scatter") {
    return { radius: 9, mass: 0.3, restitution: 0.80, friction: 0.10, value: 5 };
  }
  return { radius: 14, mass: 0.5, restitution: 0.80, friction: 0.10, value: 10 };
}

function getRandomCoinType() {
  const rand = Math.random();
  if (rand < 0.60) {
    return { type: "normal" };
  } else if (rand < 0.75) {
    return { type: "super" };
  } else if (rand < 0.90) {
    return { type: "blue" };
  } else {
    return { type: "red" };
  }
}

function spawnInitialCoins() {
  const coins = [];
  for (let i = 0; i < TARGET_COIN_COUNT; i++) {
    const pt = getRandomValidPoint(50);
    const coinInfo = getRandomCoinType();
    const props = getCoinPhysicalProps(coinInfo.type);
    coins.push({
      id: `coin_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
      x: pt.x,
      y: pt.y,
      vx: 0,
      vy: 0,
      type: coinInfo.type,
      ...props,
    });
  }
  return coins;
}

// ── Spawn Power-Up ──
function trySpawnPowerUp(room) {
  if (room.powerUps.length >= MAX_POWERUPS) return;
  const types = ["speed", "double", "magnet"];
  const selectedType = types[Math.floor(Math.random() * types.length)];
  const pt = getRandomValidPoint(60);

  const powerUp = {
    id: `pw_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    x: pt.x,
    y: pt.y,
    type: selectedType,
    expiresAt: Date.now() + 15000,
  };

  room.powerUps.push(powerUp);
}

// ── Main Server Game Loop (20 TPS) ──
function startGameRound(io, room) {
  room.status = "PLAYING";
  room.startTime = Date.now();
  room.endTime = room.startTime + ROUND_DURATION * 1000;

  io.to(`coinrush_${room.roomId}`).emit("coinRush_gameStarted", {
    startTime: room.startTime,
    endTime: room.endTime,
    duration: ROUND_DURATION,
  });

  if (room.powerUpRespawnTimer) clearInterval(room.powerUpRespawnTimer);
  room.powerUpRespawnTimer = setInterval(() => {
    if (room.status === "PLAYING") {
      trySpawnPowerUp(room);
    }
  }, 9000);

  const TICK_RATE = 20;
  const DT = 1 / TICK_RATE;

  if (room.gameLoopInterval) clearInterval(room.gameLoopInterval);

  room.gameLoopInterval = setInterval(() => {
    if (room.status !== "PLAYING") return;

    const now = Date.now();
    const timeRemaining = Math.max(0, Math.ceil((room.endTime - now) / 1000));

    if (now >= room.endTime) {
      endGameRound(io, room, "Time's Up!");
      return;
    }

    // ── 1. Update Dynamic Moving Coins Physics & Wall Reflection ──
    for (let i = room.coins.length - 1; i >= 0; i--) {
      const coin = room.coins[i];
      if (!coin.radius) {
        Object.assign(coin, getCoinPhysicalProps(coin.type));
      }

      if (coin.vx || coin.vy) {
        coin.x += coin.vx * DT;
        coin.y += coin.vy * DT;

        resolveWallReflection(coin);

        coin.vx *= 0.95;
        coin.vy *= 0.95;

        if (Math.hypot(coin.vx, coin.vy) < 4) {
          coin.vx = 0;
          coin.vy = 0;
        }
      }
    }

    // ── 2. Update Player Kinematics, Power-Ups & Wall Reflection ──
    for (const [, player] of room.players) {
      if (!player.active) continue;

      player.radius = PLAYER_RADIUS;
      player.mass = player.powerUp?.type === "speed" ? 1.8 : 1.0;
      player.restitution = 0.85;
      player.friction = 0.15;

      if (player.powerUp && now >= player.powerUp.expiresAt) {
        player.powerUp = null;
        player.speed = BASE_SPEED;
      }

      const currentSpeed = player.powerUp?.type === "speed" ? BASE_SPEED * 1.8 : BASE_SPEED;
      player.speed = currentSpeed;

      player.x += (player.vx || 0) * DT;
      player.y += (player.vy || 0) * DT;

      resolveWallReflection(player);
    }

    // ── 3. Coin ↔ Coin & Mini-Coin ↔ Mini-Coin Pairwise Rigid-Body Collisions ──
    for (let i = 0; i < room.coins.length; i++) {
      for (let j = i + 1; j < room.coins.length; j++) {
        const c1 = room.coins[i];
        const c2 = room.coins[j];
        if ((c1.vx || c1.vy || c2.vx || c2.vy) && Math.hypot(c1.x - c2.x, c1.y - c2.y) < (c1.radius + c2.radius)) {
          resolveRigidBodyCollision(c1, c2);
        }
      }
    }

    // ── 4. Player ↔ Player Rigid Body Collision Pass ──
    const activePlayers = Array.from(room.players.values()).filter((p) => p.active);
    for (let i = 0; i < activePlayers.length; i++) {
      for (let j = i + 1; j < activePlayers.length; j++) {
        const p1 = activePlayers[i];
        const p2 = activePlayers[j];

        const res = resolveRigidBodyCollision(p1, p2);
        if (res.collided) {
          io.to(`coinrush_${room.roomId}`).emit("coinRush_playerBump", {
            x: Math.round((p1.x + p2.x) / 2),
            y: Math.round((p1.y + p2.y) / 2),
            player1Id: p1.id,
            player2Id: p2.id,
            intensity: parseFloat((res.impulseMagnitude / 200).toFixed(2)),
            impulseX: res.impulseX,
            impulseY: res.impulseY,
            collisionNormalX: res.collisionNormalX,
            collisionNormalY: res.collisionNormalY,
            impulseMagnitude: res.impulseMagnitude,
          });
        }
      }
    }

    // ── 5. Magnet Powerup Pull & Player vs Coin Collisions ──
    for (const [, player] of room.players) {
      if (!player.active) continue;

      if (player.powerUp?.type === "magnet") {
        const MAGNET_RADIUS = 180;
        const MAGNET_PULL_SPEED = 160;

        for (const coin of room.coins) {
          const dist = Math.hypot(player.x - coin.x, player.y - coin.y);
          if (dist > 0 && dist <= MAGNET_RADIUS) {
            const angle = Math.atan2(player.y - coin.y, player.x - coin.x);
            coin.vx += Math.cos(angle) * MAGNET_PULL_SPEED * DT * 2;
            coin.vy += Math.sin(angle) * MAGNET_PULL_SPEED * DT * 2;
          }
        }
      }

      for (let i = room.coins.length - 1; i >= 0; i--) {
        const coin = room.coins[i];
        if (!coin) continue;

        const dist = Math.hypot(player.x - coin.x, player.y - coin.y);
        const touchDist = PLAYER_RADIUS + (coin.radius || COIN_RADIUS);

        // Perform rigid-body collision response if touching but not yet collected
        if (dist < touchDist + 6 && (coin.vx || coin.vy)) {
          resolveRigidBodyCollision(player, coin);
        }

        if (dist <= touchDist) {
          let points = coin.value || 10;
          if (player.powerUp?.type === "double") {
            points *= 2;
          }

          player.score += points;
          const collectedType = coin.type;
          const coinId = coin.id;
          const coinX = coin.x;
          const coinY = coin.y;

          room.coins.splice(i, 1);

          // ── SPECIAL LAYERED DYNAMICS FOR BLUE & RED COINS ──
          const affectedPlayers = [];
          const newScatterCoins = [];
          let blastRadius = 0;
          let shockwaveStrength = 0;
          let recoilX = 0;
          let recoilY = 0;

          if (collectedType === "blue") {
            // 🧊 BLUE SAPPHIRE COIN: RADIAL ICE SHOCKWAVE IMPULSE
            blastRadius = 220;
            const MAX_FORCE = 420;

            for (const [, otherP] of room.players) {
              if (!otherP.active) continue;
              const pDist = Math.hypot(otherP.x - coinX, otherP.y - coinY);
              if (pDist <= blastRadius) {
                let nx, ny;
                if (pDist < 0.0001) {
                  nx = 1; ny = 0;
                } else {
                  nx = (otherP.x - coinX) / pDist;
                  ny = (otherP.y - coinY) / pDist;
                }
                const forceRatio = 1 - pDist / blastRadius;
                const pushMag = MAX_FORCE * forceRatio + 140;

                otherP.vx += nx * pushMag;
                otherP.vy += ny * pushMag;

                affectedPlayers.push({
                  id: otherP.id,
                  pushVx: Math.round(nx * pushMag),
                  pushVy: Math.round(ny * pushMag),
                });
              }
            }

            shockwaveStrength = MAX_FORCE;
            player.powerUp = {
              type: "speed",
              expiresAt: now + 4000,
            };
          } else if (collectedType === "red") {
            // 🔥 RED RUBY COIN: EXPLOSIVE RECOIL BLAST & EXACTLY 3 MINI-SCATTER COINS
            let dx = player.x - coinX;
            let dy = player.y - coinY;
            let pDist = Math.hypot(dx, dy);
            let nx, ny;
            if (pDist < 0.0001) {
              nx = 1; ny = 0;
            } else {
              nx = dx / pDist;
              ny = dy / pDist;
            }

            const RECOIL_FORCE = 450;
            recoilX = nx * RECOIL_FORCE;
            recoilY = ny * RECOIL_FORCE;

            player.vx += recoilX;
            player.vy += recoilY;

            blastRadius = 180;

            // Spawn exactly 3 Mini Gold Scatter Coins bursting outward
            for (let k = 0; k < 3; k++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = 200 + Math.random() * 100;
              const miniProps = getCoinPhysicalProps("mini_scatter");
              const miniCoin = {
                id: `coin_mini_${Date.now()}_${k}_${Math.random().toString(36).substring(2, 5)}`,
                x: coinX + Math.cos(angle) * 15,
                y: coinY + Math.sin(angle) * 15,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                type: "mini_scatter",
                ...miniProps,
              };
              room.coins.push(miniCoin);
              newScatterCoins.push(miniCoin);
            }
          }

          // Spawn replacement coin if non-mini coin collected
          let newCoin = null;
          if (collectedType !== "mini_scatter") {
            const newPt = getRandomValidPoint(50);
            const coinInfo = getRandomCoinType();
            const props = getCoinPhysicalProps(coinInfo.type);
            newCoin = {
              id: `coin_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              x: newPt.x,
              y: newPt.y,
              vx: 0,
              vy: 0,
              type: coinInfo.type,
              ...props,
            };
            room.coins.push(newCoin);
          }

          io.to(`coinrush_${room.roomId}`).emit("coinRush_coinCollected", {
            playerId: player.id,
            coinId,
            coinType: collectedType,
            pointsAdded: points,
            newScore: player.score,
            newCoin,
            affectedPlayers,
            newScatterCoins,
            impactX: coinX,
            impactY: coinY,
            blastRadius,
            shockwaveStrength,
            recoilX,
            recoilY,
          });
        }
      }

      for (let i = room.powerUps.length - 1; i >= 0; i--) {
        const pw = room.powerUps[i];
        const dist = Math.hypot(player.x - pw.x, player.y - pw.y);

        if (dist <= PLAYER_RADIUS + POWERUP_RADIUS) {
          const durationMs = pw.type === "double" ? 7000 : 5000;
          player.powerUp = {
            type: pw.type,
            expiresAt: now + durationMs,
          };

          room.powerUps.splice(i, 1);

          io.to(`coinrush_${room.roomId}`).emit("coinRush_powerUpCollected", {
            playerId: player.id,
            powerUpId: pw.id,
            type: pw.type,
            durationMs,
          });
        }
      }
    }

    room.powerUps = room.powerUps.filter((pw) => now < pw.expiresAt);

    const teamScores = calculateTeamScores(room);
    io.to(`coinrush_${room.roomId}`).emit("coinRush_gameState", {
      timeRemaining,
      players: Array.from(room.players.values()).map(serializePlayer),
      coins: room.coins,
      powerUps: room.powerUps,
      playMode: room.playMode || "SOLO",
      teamScores,
    });
  }, 1000 / TICK_RATE);
}

// ── End Game Round ──
function endGameRound(io, room, reason = "Time's Up!") {
  room.status = "ENDED";

  if (room.gameLoopInterval) {
    clearInterval(room.gameLoopInterval);
    room.gameLoopInterval = null;
  }
  if (room.powerUpRespawnTimer) {
    clearInterval(room.powerUpRespawnTimer);
    room.powerUpRespawnTimer = null;
  }

  const teamScores = calculateTeamScores(room);
  let winningTeam = null;
  if (room.playMode === "TEAM") {
    if (teamScores.blue > teamScores.red) winningTeam = "blue";
    else if (teamScores.red > teamScores.blue) winningTeam = "red";
    else winningTeam = "draw";
  }

  const playerList = Array.from(room.players.values()).map(serializePlayer);
  playerList.sort((a, b) => b.score - a.score);

  const mvp = playerList.length > 0 ? playerList[0] : null;

  console.log(`🏆 [CoinRush] Game ended in room ${room.roomId}. Mode: ${room.playMode}, Winning Team: ${winningTeam}, MVP: ${mvp?.name} (${mvp?.score} pts)`);

  io.to(`coinrush_${room.roomId}`).emit("coinRush_gameEnded", {
    reason,
    winner: room.playMode === "TEAM" ? winningTeam : mvp,
    winningTeam,
    teamScores,
    mvp,
    leaderboard: playerList,
  });

  // Persist scores to Top 10 leaderboard
  try {
    for (const p of playerList) {
      const isWinner = room.playMode === "TEAM" ? p.team === winningTeam : mvp && mvp.id === p.id;
      recordPlayerScore("coin-rush", p.name, p.score, `${p.score} Coins`, isWinner);
    }
  } catch (err) {
    console.error("[CoinRush] Error updating leaderboard:", err);
  }
}

// ── Clean Up Room ──
function cleanUpRoom(room) {
  if (room.gameLoopInterval) clearInterval(room.gameLoopInterval);
  if (room.countdownInterval) clearInterval(room.countdownInterval);
  if (room.powerUpRespawnTimer) clearInterval(room.powerUpRespawnTimer);
}

// ── Serialization Helpers ──
function serializePlayer(p) {
  return {
    id: p.id,
    name: p.name,
    x: Math.round(p.x),
    y: Math.round(p.y),
    vx: p.vx,
    vy: p.vy,
    score: p.score,
    speed: p.speed,
    powerUp: p.powerUp ? { type: p.powerUp.type, expiresAt: p.powerUp.expiresAt } : null,
    color: p.color,
    teamId: p.teamId || null,
    active: p.active,
    isHost: p.isHost,
    isMuted: p.isMuted || false,
  };
}

function serializeRoomState(room) {
  return {
    roomId: room.roomId,
    status: room.status,
    hostId: room.hostId,
    maxPlayers: room.maxPlayers || 2,
    playMode: room.playMode || "SOLO",
    isPublic: room.isPublic || true,
    players: Array.from(room.players.values()).map(serializePlayer),
    coins: room.coins,
    powerUps: room.powerUps,
    teamScores: calculateTeamScores(room),
    arenaWalls: ARENA_WALLS,
    arenaSize: { width: ARENA_WIDTH, height: ARENA_HEIGHT },
  };
}
