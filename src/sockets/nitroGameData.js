// Server-Authoritative Game Data & Tracks for Mini Nitro Race V3

export const TRACK_CONFIGS = {
  city_rush: {
    id: "city_rush",
    name: "City Rush",
    totalLaps: 3,
    checkpoints: [
      { id: 0, x: 600, y: 1450, radius: 180 },
      { id: 1, x: 1150, y: 1450, radius: 180 },
      { id: 2, x: 1850, y: 1450, radius: 180 },
      { id: 3, x: 2150, y: 1100, radius: 190 },
      { id: 4, x: 2150, y: 600, radius: 190 },
      { id: 5, x: 1850, y: 350, radius: 180 },
      { id: 6, x: 1300, y: 350, radius: 180 },
      { id: 7, x: 900, y: 650, radius: 180 },
      { id: 8, x: 650, y: 350, radius: 180 },
      { id: 9, x: 350, y: 550, radius: 190 },
      { id: 10, x: 350, y: 950, radius: 190 },
      { id: 11, x: 350, y: 1300, radius: 190 },
    ],
    gridPositions: [
      { x: 550, y: 1410, angle: 0 },
      { x: 500, y: 1490, angle: 0 },
      { x: 440, y: 1410, angle: 0 },
      { x: 390, y: 1490, angle: 0 },
      { x: 330, y: 1410, angle: 0 },
      { x: 280, y: 1490, angle: 0 },
      { x: 220, y: 1410, angle: 0 },
      { x: 170, y: 1490, angle: 0 },
    ],
    coins: [
      { id: "c1", x: 800, y: 1450 },
      { id: "c2", x: 1000, y: 1450 },
      { id: "c3", x: 1400, y: 1450 },
      { id: "c4", x: 1600, y: 1450 },
      { id: "c5", x: 2050, y: 1300 },
      { id: "c6", x: 2150, y: 850 },
      { id: "c7", x: 2000, y: 450 },
      { id: "c8", x: 1550, y: 350 },
      { id: "c9", x: 1150, y: 480 },
      { id: "c10", x: 800, y: 500 },
      { id: "c11", x: 450, y: 420 },
      { id: "c12", x: 350, y: 750 },
      { id: "c13", x: 350, y: 1100 },
      { id: "c14", x: 420, y: 1380 },
    ],
    powerUps: [
      { id: "pw1", x: 1300, y: 1450 },
      { id: "pw2", x: 2150, y: 750 },
      { id: "pw3", x: 1450, y: 350 },
      { id: "pw4", x: 750, y: 420 },
      { id: "pw5", x: 350, y: 850 },
    ],
    boostPads: [
      { id: "bp1", x: 1650, y: 1450 },
      { id: "bp2", x: 2150, y: 950 },
      { id: "bp3", x: 1100, y: 350 },
      { id: "bp4", x: 350, y: 1200 },
    ],
  },
  desert_run: {
    id: "desert_run",
    name: "Desert Run",
    totalLaps: 3,
    checkpoints: [
      { id: 0, x: 650, y: 1450, radius: 180 },
      { id: 1, x: 1250, y: 1450, radius: 180 },
      { id: 2, x: 1850, y: 1350, radius: 180 },
      { id: 3, x: 2200, y: 950, radius: 190 },
      { id: 4, x: 2050, y: 550, radius: 190 },
      { id: 5, x: 1650, y: 350, radius: 180 },
      { id: 6, x: 1150, y: 350, radius: 180 },
      { id: 7, x: 750, y: 450, radius: 180 },
      { id: 8, x: 400, y: 650, radius: 180 },
      { id: 9, x: 350, y: 1000, radius: 190 },
      { id: 10, x: 500, y: 1250, radius: 190 },
      { id: 11, x: 450, y: 1450, radius: 180 },
    ],
    gridPositions: [
      { x: 590, y: 1410, angle: 0 },
      { x: 530, y: 1490, angle: 0 },
      { x: 470, y: 1410, angle: 0 },
      { x: 410, y: 1490, angle: 0 },
      { x: 350, y: 1410, angle: 0 },
      { x: 290, y: 1490, angle: 0 },
      { x: 230, y: 1410, angle: 0 },
      { x: 170, y: 1490, angle: 0 },
    ],
    coins: [
      { id: "c1", x: 900, y: 1450 },
      { id: "c2", x: 1100, y: 1450 },
      { id: "c3", x: 1550, y: 1450 },
      { id: "c4", x: 2050, y: 1250 },
      { id: "c5", x: 2200, y: 800 },
      { id: "c6", x: 1950, y: 420 },
      { id: "c7", x: 1400, y: 350 },
      { id: "c8", x: 950, y: 380 },
      { id: "c9", x: 550, y: 550 },
      { id: "c10", x: 350, y: 900 },
      { id: "c11", x: 420, y: 1200 },
    ],
    powerUps: [
      { id: "pw1", x: 1350, y: 1450 },
      { id: "pw2", x: 2150, y: 650 },
      { id: "pw3", x: 1300, y: 350 },
      { id: "pw4", x: 350, y: 800 },
    ],
    boostPads: [
      { id: "bp1", x: 1650, y: 1450 },
      { id: "bp2", x: 1800, y: 350 },
      { id: "bp3", x: 350, y: 1100 },
    ],
  },
  snow_mountain: {
    id: "snow_mountain",
    name: "Snow Mountain",
    totalLaps: 3,
    checkpoints: [
      { id: 0, x: 650, y: 1450, radius: 180 },
      { id: 1, x: 1200, y: 1450, radius: 180 },
      { id: 2, x: 1750, y: 1450, radius: 180 },
      { id: 3, x: 2150, y: 1250, radius: 190 },
      { id: 4, x: 2150, y: 700, radius: 190 },
      { id: 5, x: 1850, y: 400, radius: 180 },
      { id: 6, x: 1300, y: 400, radius: 180 },
      { id: 7, x: 800, y: 550, radius: 180 },
      { id: 8, x: 550, y: 750, radius: 180 },
      { id: 9, x: 350, y: 1000, radius: 190 },
      { id: 10, x: 350, y: 1300, radius: 190 },
      { id: 11, x: 480, y: 1450, radius: 180 },
    ],
    gridPositions: [
      { x: 590, y: 1410, angle: 0 },
      { x: 530, y: 1490, angle: 0 },
      { x: 470, y: 1410, angle: 0 },
      { x: 410, y: 1490, angle: 0 },
      { x: 350, y: 1410, angle: 0 },
      { x: 290, y: 1490, angle: 0 },
      { x: 230, y: 1410, angle: 0 },
      { x: 170, y: 1490, angle: 0 },
    ],
    coins: [
      { id: "c1", x: 950, y: 1450 },
      { id: "c2", x: 1450, y: 1450 },
      { id: "c3", x: 2000, y: 1380 },
      { id: "c4", x: 2150, y: 950 },
      { id: "c5", x: 1950, y: 500 },
      { id: "c6", x: 1500, y: 400 },
      { id: "c7", x: 1050, y: 450 },
      { id: "c8", x: 650, y: 650 },
      { id: "c9", x: 350, y: 850 },
      { id: "c10", x: 350, y: 1200 },
    ],
    powerUps: [
      { id: "pw1", x: 1300, y: 1450 },
      { id: "pw2", x: 2150, y: 800 },
      { id: "pw3", x: 1350, y: 400 },
      { id: "pw4", x: 400, y: 900 },
    ],
    boostPads: [
      { id: "bp1", x: 1600, y: 1450 },
      { id: "bp2", x: 2150, y: 1050 },
      { id: "bp3", x: 1000, y: 400 },
    ],
  },
  neon_circuit: {
    id: "neon_circuit",
    name: "Neon Circuit",
    totalLaps: 3,
    checkpoints: [
      { id: 0, x: 650, y: 1450, radius: 180 },
      { id: 1, x: 1200, y: 1450, radius: 180 },
      { id: 2, x: 1800, y: 1450, radius: 180 },
      { id: 3, x: 2200, y: 1200, radius: 190 },
      { id: 4, x: 2200, y: 600, radius: 190 },
      { id: 5, x: 1850, y: 350, radius: 180 },
      { id: 6, x: 1300, y: 350, radius: 180 },
      { id: 7, x: 850, y: 600, radius: 180 },
      { id: 8, x: 600, y: 350, radius: 180 },
      { id: 9, x: 350, y: 550, radius: 190 },
      { id: 10, x: 350, y: 1050, radius: 190 },
      { id: 11, x: 350, y: 1350, radius: 190 },
    ],
    gridPositions: [
      { x: 590, y: 1410, angle: 0 },
      { x: 530, y: 1490, angle: 0 },
      { x: 470, y: 1410, angle: 0 },
      { x: 410, y: 1490, angle: 0 },
      { x: 350, y: 1410, angle: 0 },
      { x: 290, y: 1490, angle: 0 },
      { x: 230, y: 1410, angle: 0 },
      { x: 170, y: 1490, angle: 0 },
    ],
    coins: [
      { id: "c1", x: 900, y: 1450 },
      { id: "c2", x: 1100, y: 1450 },
      { id: "c3", x: 1500, y: 1450 },
      { id: "c4", x: 2050, y: 1350 },
      { id: "c5", x: 2200, y: 900 },
      { id: "c6", x: 2000, y: 450 },
      { id: "c7", x: 1550, y: 350 },
      { id: "c8", x: 1100, y: 480 },
      { id: "c9", x: 750, y: 500 },
      { id: "c10", x: 420, y: 420 },
      { id: "c11", x: 350, y: 800 },
      { id: "c12", x: 350, y: 1200 },
    ],
    powerUps: [
      { id: "pw1", x: 1350, y: 1450 },
      { id: "pw2", x: 2200, y: 750 },
      { id: "pw3", x: 1400, y: 350 },
      { id: "pw4", x: 700, y: 420 },
      { id: "pw5", x: 350, y: 950 },
    ],
    boostPads: [
      { id: "bp1", x: 1650, y: 1450 },
      { id: "bp2", x: 2200, y: 1000 },
      { id: "bp3", x: 1150, y: 350 },
      { id: "bp4", x: 350, y: 1150 },
    ],
  },
};

export const POWER_UP_TYPES = ["turbo", "shield", "magnet", "nitro_refill"];

export const XP_FINISH_AWARDS = {
  1: 100,
  2: 75,
  3: 55,
  4: 45,
  5: 40,
  6: 35,
  7: 30,
  8: 25,
};

export const COIN_FINISH_AWARDS = {
  1: 250,
  2: 175,
  3: 125,
  4: 90,
  5: 75,
  6: 60,
  7: 50,
  8: 40,
};

// Calculate Elo rating changes for multiplayer race
export function calculateMultiplayerElo(playersWithRanks) {
  // playersWithRanks: Array of { id, rating, rank }
  const n = playersWithRanks.length;
  if (n < 2) return {};

  const ratingDeltas = {};
  const K = 32 / (n - 1); // Normalize K factor across multiplayer field

  for (let i = 0; i < n; i++) {
    const p1 = playersWithRanks[i];
    let totalDelta = 0;

    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const p2 = playersWithRanks[j];

      // Actual score against p2: 1 if finished ahead, 0.5 if tied, 0 if behind
      const actual = p1.rank < p2.rank ? 1 : p1.rank === p2.rank ? 0.5 : 0;
      // Expected score based on rating difference
      const expected = 1 / (1 + Math.pow(10, (p2.rating - p1.rating) / 400));
      totalDelta += K * (actual - expected);
    }

    ratingDeltas[p1.id] = Math.round(totalDelta);
  }

  return ratingDeltas;
}
