import { G } from './state.js';
import { BIOMES } from './engine/biomes.js';
import { ACHIEVEMENT_DEFS, evaluateAchievements } from './achievements.js';

/**
 * Статистика игрока для будущих достижений.
 * Пока нигде не отображается, только накапливается и сохраняется.
 */
const STATS_KEY = 'bajajGO_playerStats';

const BIOME_IDS = BIOMES.map((b) => b.id);

function emptyBiomeMap(fill = 0) {
  const out = {};
  for (const id of BIOME_IDS) out[id] = fill;
  return out;
}

function emptyBiomeFlags(fill = false) {
  const out = {};
  for (const id of BIOME_IDS) out[id] = fill;
  return out;
}

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toNonNegativeInt(v, fallback = 0) {
  return Math.max(0, Math.floor(toNum(v, fallback)));
}

function toNonNegativeNum(v, fallback = 0) {
  return Math.max(0, toNum(v, fallback));
}

function normalizeStats(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const biomeDistanceM = emptyBiomeMap(0);
  const rawBiomeDist = src.biomeDistanceM && typeof src.biomeDistanceM === 'object' ? src.biomeDistanceM : {};
  for (const id of BIOME_IDS) biomeDistanceM[id] = toNonNegativeNum(rawBiomeDist[id], 0);

  const biomesVisited = emptyBiomeFlags(false);
  const rawVisited = src.biomesVisited && typeof src.biomesVisited === 'object' ? src.biomesVisited : {};
  for (const id of BIOME_IDS) biomesVisited[id] = !!rawVisited[id];

  return {
    flightDistanceM: toNonNegativeNum(src.flightDistanceM, 0),
    maxCombo: toNonNegativeInt(src.maxCombo, 0),
    maxSpeedKmh: toNonNegativeNum(src.maxSpeedKmh, 0),
    stoRepairs: toNonNegativeInt(src.stoRepairs, 0),
    fuelTowCalls: toNonNegativeInt(src.fuelTowCalls, 0),
    fuelTowRefusals: toNonNegativeInt(src.fuelTowRefusals, 0),
    bikesBought: toNonNegativeInt(src.bikesBought, Math.max(0, (G.ownedBikes?.length || 1) - 1)),
    successfulDeliveries: toNonNegativeInt(src.successfulDeliveries, 0),
    biomeDistanceM,
    biomesVisited,
    forkLeftChoices: toNonNegativeInt(src.forkLeftChoices, 0),
  };
}

export function initPlayerStats() {
  let stats = normalizeStats(null);
  let runBiomeCreditedM = 0;
  let saveTimer = 0;
  let dirty = false;
  let ready = false;
  const prevAch = new Map();

  try {
    const saved = JSON.parse(localStorage.getItem(STATS_KEY) || 'null');
    if (saved) stats = normalizeStats(saved);
  } catch {
    stats = normalizeStats(null);
  }

  function snapshotStats() {
    const base = {
      ...stats,
      biomeDistanceM: { ...stats.biomeDistanceM },
      biomesVisited: { ...stats.biomesVisited },
      totalBiomeDistanceM: BIOME_IDS.reduce((sum, id) => sum + (stats.biomeDistanceM[id] || 0), 0),
      allBiomesVisited: BIOME_IDS.every((id) => !!stats.biomesVisited[id]),
    };
    base.achievements = evaluateAchievements(base);
    return base;
  }

  function saveStats(force = false) {
    if (!force && !dirty) return;
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(snapshotStats()));
      dirty = false;
    } catch {
      // Приватный режим: статистика живёт до перезагрузки.
    }
  }

  function seedPrevAchievements(list) {
    prevAch.clear();
    for (const a of list || []) prevAch.set(a.id, { level: a.level || 0, unlocked: !!a.unlocked });
  }

  function checkAchievementUnlocks() {
    if (!ready) return;
    const snap = snapshotStats();
    const list = Array.isArray(snap.achievements) ? snap.achievements : [];
    for (const a of list) {
      const prev = prevAch.get(a.id) || { level: 0, unlocked: false };
      const levelUp = (a.level || 0) > (prev.level || 0);
      const unlockedNow = !!a.unlocked && !prev.unlocked;
      if (levelUp || unlockedNow) {
        const def = ACHIEVEMENT_DEFS.find((d) => d.id === a.id);
        if (def && typeof G.onAchievementUnlock === 'function') {
          G.onAchievementUnlock({ id: def.id, title: def.title, icon: def.icon, level: a.level || 0, unlocked: !!a.unlocked, type: def.type });
        }
      }
      prevAch.set(a.id, { level: a.level || 0, unlocked: !!a.unlocked });
    }
  }

  function markDirty() {
    dirty = true;
    checkAchievementUnlocks();
  }

  function getPlayerStats() {
    return snapshotStats();
  }

  function trackMaxCombo(combo) {
    const n = toNonNegativeInt(combo, 0);
    if (n > stats.maxCombo) { stats.maxCombo = n; markDirty(); }
  }

  function trackMaxSpeed(speedKmh) {
    const n = toNonNegativeNum(speedKmh, 0);
    if (n > stats.maxSpeedKmh) { stats.maxSpeedKmh = n; markDirty(); }
  }

  function trackFlightDistance(meters) {
    const n = toNonNegativeNum(meters, 0);
    if (n <= 0) return;
    stats.flightDistanceM += n;
    markDirty();
  }

  function trackStoRepair() { stats.stoRepairs += 1; markDirty(); }
  function trackFuelTowCall() { stats.fuelTowCalls += 1; markDirty(); }
  function trackFuelTowRefusal() { stats.fuelTowRefusals += 1; markDirty(); }
  function trackBikeBought() { stats.bikesBought += 1; markDirty(); }
  function trackSuccessfulDelivery() { stats.successfulDeliveries += 1; markDirty(); }
  function trackForkLeftChoice() { stats.forkLeftChoices += 1; markDirty(); }

  function trackBiomeVisitByIndex(index) {
    const biome = BIOMES[index];
    if (!biome) return;
    if (!stats.biomesVisited[biome.id]) {
      stats.biomesVisited[biome.id] = true;
      markDirty();
    }
  }

  function trackAllBiomeVisitsFromCounts() {
    const counts = G.visitCounts;
    if (!Array.isArray(counts)) return;
    for (let i = 0; i < BIOMES.length; i++) {
      if ((counts[i] || 0) > 0) trackBiomeVisitByIndex(i);
    }
  }

  function creditRunBiomeDistance() {
    const km = toNonNegativeNum(G.distance, 0);
    const meters = km * 1000;
    const delta = meters - runBiomeCreditedM;
    if (delta <= 0.05) return;
    runBiomeCreditedM = meters;

    const idx = Number.isInteger(G.biomeDominant) ? G.biomeDominant : G.currentBiome;
    const biome = BIOMES[idx];
    if (!biome) return;
    stats.biomeDistanceM[biome.id] = toNonNegativeNum(stats.biomeDistanceM[biome.id], 0) + delta;
    markDirty();
  }

  function resetRunPlayerStats() {
    runBiomeCreditedM = 0;
  }

  function tickPlayerStats(dt) {
    if (!G.started || G.ended) return;
    creditRunBiomeDistance();
    saveTimer += dt;
    if (saveTimer >= 2.5) {
      saveTimer = 0;
      saveStats();
    }
  }

  G.getPlayerStats = getPlayerStats;
  G.trackMaxCombo = trackMaxCombo;
  G.trackMaxSpeed = trackMaxSpeed;
  G.trackFlightDistance = trackFlightDistance;
  G.trackStoRepair = trackStoRepair;
  G.trackFuelTowCall = trackFuelTowCall;
  G.trackFuelTowRefusal = trackFuelTowRefusal;
  G.trackBikeBought = trackBikeBought;
  G.trackSuccessfulDelivery = trackSuccessfulDelivery;
  G.trackForkLeftChoice = trackForkLeftChoice;
  G.trackBiomeVisitByIndex = trackBiomeVisitByIndex;
  G.trackAllBiomeVisitsFromCounts = trackAllBiomeVisitsFromCounts;
  G.creditRunBiomeDistance = creditRunBiomeDistance;
  G.resetRunPlayerStats = resetRunPlayerStats;
  G.tickPlayerStats = tickPlayerStats;
  G.savePlayerStats = (force = false) => saveStats(force);

  addEventListener('pagehide', () => { creditRunBiomeDistance(); saveStats(true); });
  addEventListener('beforeunload', () => { creditRunBiomeDistance(); saveStats(true); });
  addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { creditRunBiomeDistance(); saveStats(true); }
  });

  // Засчитываем уже посещённые биомы из существующих счётчиков.
  trackAllBiomeVisitsFromCounts();
  seedPrevAchievements(snapshotStats().achievements);
  ready = true;
  saveStats(true);
}
