// Coin Rush Multiplayer Server-Authoritative Handler

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

export default function registerCoinRushHandlers(io, socket) {
  // Helper to create a room object
  function createRoomObject(roomCode, hostSocketId, playerName, maxPlayers = 2, isPublic = true) {
    const hostColor = PLAYER_COLORS[0];
    const spawn = getRandomValidPoint(80);

    const parsedCap = [2, 4, 8].includes(Number(maxPlayers)) ? Number(maxPlayers) : 2;

    const room = {
      roomId: roomCode,
      status: "WAITING",
      hostId: hostSocketId,
      maxPlayers: parsedCap,
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
  socket.on("coinRush_createRoom", ({ name, maxPlayers = 2, isPublic = true }, ack) => {
    leaveCurrentRoom();

    let roomCode = generateRoomCode();
    while (coinRushRooms.has(roomCode)) {
      roomCode = generateRoomCode();
    }

    const playerName = (name || "Player 1").trim().substring(0, 16);
    const room = createRoomObject(roomCode, socket.id, playerName, maxPlayers, isPublic);

    socket.join(`coinrush_${roomCode}`);
    socket.coinRushRoomId = roomCode;

    console.log(`🎮 [CoinRush] Custom Room ${roomCode} created by ${playerName} (Max ${room.maxPlayers}P)`);

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

  // ── Random Quick Match matchmaking ──
  socket.on("coinRush_quickMatch", ({ name, maxPlayers = 2 }, ack) => {
    leaveCurrentRoom();

    const playerName = (name || "Player").trim().substring(0, 16);
    const targetCapacity = [2, 4, 8].includes(Number(maxPlayers)) ? Number(maxPlayers) : 2;

    let matchedRoom = null;

    // 1st Priority: Match room with exact target capacity
    for (const [, room] of coinRushRooms) {
      if (
        room.status === "WAITING" &&
        room.players.size < room.maxPlayers &&
        room.maxPlayers === targetCapacity
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
      // Join existing room
      let color = PLAYER_COLORS.find((c) => !matchedRoom.usedColors.has(c));
      if (!color) color = PLAYER_COLORS[matchedRoom.players.size % PLAYER_COLORS.length];
      matchedRoom.usedColors.add(color);

      const spawn = getRandomValidPoint(80);
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
        active: true,
        isHost: false,
      };

      matchedRoom.players.set(socket.id, player);
      socket.join(`coinrush_${matchedRoom.roomId}`);
      socket.coinRushRoomId = matchedRoom.roomId;

      console.log(`⚡ [CoinRush QuickMatch] ${playerName} matched into Room ${matchedRoom.roomId} (${matchedRoom.players.size}/${matchedRoom.maxPlayers}P)`);

      const serialized = serializeRoomState(matchedRoom);
      if (typeof ack === "function") {
        ack({ ok: true, roomId: matchedRoom.roomId, isHost: false, roomState: serialized });
      }

      // Emit room state to ALL players in the room
      io.to(`coinrush_${matchedRoom.roomId}`).emit("coinRush_roomState", serialized);
      io.to(`coinrush_${matchedRoom.roomId}`).emit("coinRush_playerJoined", {
        player: serializePlayer(player),
        roomState: serialized,
      });

      // Auto-start countdown immediately when capacity is reached!
      if (matchedRoom.players.size >= matchedRoom.maxPlayers) {
        console.log(`⚡ [CoinRush QuickMatch] Room ${matchedRoom.roomId} FULL (${matchedRoom.maxPlayers}P). Launching countdown!`);
        triggerCountdown(matchedRoom.roomId);
      }
    } else {
      // Create new room
      let roomCode = generateRoomCode();
      while (coinRushRooms.has(roomCode)) {
        roomCode = generateRoomCode();
      }

      const newRoom = createRoomObject(roomCode, socket.id, playerName, targetCapacity, true);
      socket.join(`coinrush_${roomCode}`);
      socket.coinRushRoomId = roomCode;

      console.log(`⚡ [CoinRush QuickMatch] Created new Public Room ${roomCode} for ${playerName} (Max ${targetCapacity}P)`);

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

  // ── Leave Room / Disconnect ──
  socket.on("coinRush_leaveRoom", leaveCurrentRoom);
  socket.on("disconnect", leaveCurrentRoom);
}

// ── Spawn Initial Coins ──
function spawnInitialCoins() {
  const coins = [];
  for (let i = 0; i < TARGET_COIN_COUNT; i++) {
    const pt = getRandomValidPoint(50);
    const isSuper = Math.random() < 0.15;
    coins.push({
      id: `coin_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
      x: pt.x,
      y: pt.y,
      type: isSuper ? "super" : "normal",
      value: isSuper ? 30 : 10,
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

    for (const [, player] of room.players) {
      if (!player.active) continue;

      if (player.powerUp && now >= player.powerUp.expiresAt) {
        player.powerUp = null;
        player.speed = BASE_SPEED;
      }

      const currentSpeed = player.powerUp?.type === "speed" ? BASE_SPEED * 1.8 : BASE_SPEED;
      player.speed = currentSpeed;

      let newX = player.x + player.vx * DT;
      let newY = player.y + player.vy * DT;

      if (!isPointCollidingWithWalls(newX, player.y, PLAYER_RADIUS)) {
        player.x = newX;
      } else {
        player.vx = 0;
      }

      if (!isPointCollidingWithWalls(player.x, newY, PLAYER_RADIUS)) {
        player.y = newY;
      } else {
        player.vy = 0;
      }

      player.x = Math.max(PLAYER_RADIUS + 20, Math.min(ARENA_WIDTH - PLAYER_RADIUS - 20, player.x));
      player.y = Math.max(PLAYER_RADIUS + 20, Math.min(ARENA_HEIGHT - PLAYER_RADIUS - 20, player.y));

      if (player.powerUp?.type === "magnet") {
        const MAGNET_RADIUS = 180;
        const MAGNET_PULL_SPEED = 160;

        for (const coin of room.coins) {
          const dist = Math.hypot(player.x - coin.x, player.y - coin.y);
          if (dist > 0 && dist <= MAGNET_RADIUS) {
            const angle = Math.atan2(player.y - coin.y, player.x - coin.x);
            coin.x += Math.cos(angle) * MAGNET_PULL_SPEED * DT;
            coin.y += Math.sin(angle) * MAGNET_PULL_SPEED * DT;
          }
        }
      }

      for (let i = room.coins.length - 1; i >= 0; i--) {
        const coin = room.coins[i];
        const dist = Math.hypot(player.x - coin.x, player.y - coin.y);

        if (dist <= PLAYER_RADIUS + COIN_RADIUS) {
          let points = coin.value || 10;
          if (player.powerUp?.type === "double") {
            points *= 2;
          }

          player.score += points;
          room.coins.splice(i, 1);

          const newPt = getRandomValidPoint(50);
          const isSuper = Math.random() < 0.15;
          const newCoin = {
            id: `coin_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            x: newPt.x,
            y: newPt.y,
            type: isSuper ? "super" : "normal",
            value: isSuper ? 30 : 10,
          };
          room.coins.push(newCoin);

          io.to(`coinrush_${room.roomId}`).emit("coinRush_coinCollected", {
            playerId: player.id,
            coinId: coin.id,
            pointsAdded: points,
            newScore: player.score,
            newCoin,
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

    io.to(`coinrush_${room.roomId}`).emit("coinRush_gameState", {
      timeRemaining,
      players: Array.from(room.players.values()).map(serializePlayer),
      coins: room.coins,
      powerUps: room.powerUps,
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

  const playerList = Array.from(room.players.values()).map(serializePlayer);
  playerList.sort((a, b) => b.score - a.score);

  const winner = playerList.length > 0 ? playerList[0] : null;

  console.log(`🏆 [CoinRush] Game ended in room ${room.roomId}. Winner: ${winner?.name} with ${winner?.score} pts`);

  io.to(`coinrush_${room.roomId}`).emit("coinRush_gameEnded", {
    reason,
    winner,
    leaderboard: playerList,
  });
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
    active: p.active,
    isHost: p.isHost,
  };
}

function serializeRoomState(room) {
  return {
    roomId: room.roomId,
    status: room.status,
    hostId: room.hostId,
    maxPlayers: room.maxPlayers || 2,
    isPublic: room.isPublic || true,
    players: Array.from(room.players.values()).map(serializePlayer),
    coins: room.coins,
    powerUps: room.powerUps,
    arenaWalls: ARENA_WALLS,
    arenaSize: { width: ARENA_WIDTH, height: ARENA_HEIGHT },
  };
}
