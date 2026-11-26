import * as THREE from 'three';
import { BIOMES, biomeIndexOf, laneLayoutOf, storedBiomeIndex, storedVisits, transitionIndexes } from './engine/biomes.js';
import { carriageAt, carriageLat, laneAtWorld, laneMarks, rideRuler, solidMarks } from './engine/carriage.js';
import { laneIndexByRoll, nearestLaneOffset } from './engine/lanes.js';
import { seatFromWorld, seatOnFrame, seatWorld } from './engine/seat.js';
import { emptyRideHold, followRide, readExit, ridingRibbon, sampleRide, surfaceWorld } from './engine/exit.js';
import { BRIDGE_EDGE, EXIT_LANE_HALF, besidePoint, branchPick, bridgeEdges, exitClock, forkOccupancy, forkOffset, forkSpreadAt, laneAnchor, logicalRoadLimits, onExitRibbon, reachedExit, roadCenter, sampleRoad, splitPick, stayOnAsphalt } from './engine/fork.js';
import { asphaltSpan, groundAt, groundEdge, shoulderHeight, shoulderLats, vergeAt } from './engine/asphalt.js';
import { decideZone } from './engine/route.js';
import { EXIT_RIGHT, RIGHT_FORK, courseLayoutOf, createVectorField, openCourse, vectorSpawnOf, zoneAt, zoneNose } from './engine/vectors.js';
import { makeProfile, mixDeriv, mixSecond, mixValue, smooth01 } from './engine/profile.js';
import { besidePose, spanEdges } from './engine/roadside.js';
import { icon } from '@bajajgo/design';
import { G } from './state.js';

/* =========================================================================
 * БИОМЫ: ПЛАН ЗАЕЗДА, ПРОФИЛЬ ДОРОГИ, РАЗВИЛКИ, ДЕКОРАЦИИ И СОХРАНЕНИЕ
 * -------------------------------------------------------------------------
 * Биом — функция пройденного пути, а не кадра. Живой биом (полосы, декор,
 * небо) и закреплённый профиль дороги читают одну точку маршрута, но разные
 * индексы. Замок зоны ставится в момент выбора ветки, не раньше: до выбора
 * профиль едет за стороной байка. Полосы на асфальте читают тот же индекс.
 * Развилка — прямой ход и необязательный съезд вправо. Взятый въезд сужает старую дорогу и приходит в новую.
 *
 * Кромки съезда — fork.js, чтение для езды — exit.js, одна проезжая часть —
 * carriage.js, сиденье — seat.js, полотно и откос — asphalt.js.
 * Слоты поля и МКАД — biomeScenery.js, лес, горы и набережная — свои модули.
 * ========================================================================= */

const ZONE_M = 1500;              // длина одной локации
const ROAD_FADE_M = 350;         // плавный переход профиля/ширины дороги между биомами после границы зоны, метров
const BRIDGE_FADE_M = 50;         // переход от дороги к полотну моста на берегах
const SPLIT_BANNER_AHEAD = 260;  // баннер выбора появляется за столько метров
const STORAGE_KEY = 'bajajGO_biomeKm';
const CURRENT_KEY = 'bajajGO_currentBiome';
const VISITS_KEY = 'bajajGO_visitCounts';
const PENDING_KEY = 'bajajGO_pendingBiome';
const PLAN_KEY = 'bajajGO_biomePlan';
// Половина окна смены декора: новый биом виден за SCENERY_PREVIEW_M до границы,
// старый держится ещё SCENERY_PREVIEW_M после неё и уходит только за кадром.
const SCENERY_PREVIEW_M = 900;

const CITY = biomeIndexOf('city');
const MKAD = biomeIndexOf('mkad');
const EMBANKMENT = biomeIndexOf('embankment');
const CABLE_BRIDGE = biomeIndexOf('cable_bridge');
const TRANSITIONS = transitionIndexes();

/* Профиль и цвет земли берутся из записи каталога, в том же порядке, что и индекс сохранения. */
const PROFILES = BIOMES.map((biome) => makeProfile(biome.road.x, biome.road.y));
const TERRAIN_COLORS = BIOMES.map((biome) => new THREE.Color(biome.ground));

/* ---------- Конфигурация полос ---------- */
function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function biomeIndex(value) {
  return clampInt(value, 0, BIOMES.length - 1, 0);
}

const LANE_CONFIG = BIOMES.map(laneLayoutOf);

/* ---------- Выбор следующего биома ---------- */
function getBiomeChoices(currentBiome, visitCounts) {
  const cur = biomeIndex(currentBiome);
  const allowed = (TRANSITIONS[cur] || TRANSITIONS[0]).filter((b) => b !== cur);
  const visits = (b) => {
    const n = visitCounts && Number(visitCounts[b]);
    return Number.isFinite(n) ? n : 0;
  };
  const onRoute = (b) => !!(BIOMES[b] && BIOMES[b].route);
  let pool = allowed.filter((b) => onRoute(b) && visits(b) < 2);
  if (pool.length === 0) pool = allowed.filter(onRoute);
  if (pool.length === 0) pool = BIOMES.map((_, index) => index).filter((b) => b !== cur && onRoute(b));

  const choices = [];
  if (pool.length >= 2) {
    choices.push(pool[0], pool[1]);
  } else {
    choices.push(pool[0]);
    const rest = [];
    for (let b = 0; b < BIOMES.length; b++) if (b !== cur && b !== choices[0] && onRoute(b)) rest.push(b);
    rest.sort((a, b) => (visits(a) - visits(b)) || (a - b));
    choices.push(rest[0]);
  }
  if (choices[1] === choices[0] || !onRoute(choices[1])) {
    const alternate = allowed.find((b) => b !== choices[0] && onRoute(b));
    const step = BIOMES.findIndex((_, index) => index !== choices[0] && onRoute(index));
    choices[1] = alternate == null ? step : alternate;
  }
  return choices;
}

/* ---------- План зон и сохранение ---------- */
let zoneBiomes = Object.create(null);   // zone → biome index
let splitChoices = Object.create(null); // zone → [left, right]
const chosenZones = new Set();
/** Зона → 1 если взят съезд, -1 если поехали прямо. Центр дороги из этого выбора считается, а не хранится. */
const chosenExit = Object.create(null);
/** Старые сохранения: центр зоны, если он совпал с формулой. Чужое число сюда не попадает. */
/** Метр, на котором выбор развилки зоны был зафиксирован. Нужен, чтобы
 *  схлопывание чужой ветки и сдвиг оси вводились плавно, а не рывком. */
const splitCommitMeters = Object.create(null);
/** Сторона предпросмотра в момент фиксации: отсюда начинается плавный ввод выбора. */
const previewSideHold = Object.create(null);
const SPLIT_RAMP_M = 60;

const ZERO_VISITS = () => BIOMES.map(() => 0);

function safeParse(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

function readStoredMeters() {
  try {
    const raw = Number(localStorage.getItem(STORAGE_KEY));
    // В localStorage лежат километры (ключ bajajGO_biomeKm), внутри — метры.
    if (Number.isFinite(raw) && raw > 0) return raw * 1000;
  } catch {
    /* приватный режим — просто начинаем с нуля */
  }
  return 0;
}

function readPending() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (raw == null || raw === '') return null;
    return storedBiomeIndex(raw);
  } catch {
    return null;
  }
}

function readVisits() {
  try {
    const raw = localStorage.getItem(VISITS_KEY);
    return storedVisits(raw ? safeParse(raw) : null);
  } catch {
    return ZERO_VISITS();
  }
}

function readPlan() {
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    const parsed = raw ? safeParse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return;
    if (parsed.zones && typeof parsed.zones === 'object') {
      for (const key of Object.keys(parsed.zones)) {
        const zone = Number(key);
        const zoneBiome = storedBiomeIndex(parsed.zones[key]);
        if (Number.isFinite(zone) && zoneBiome != null) zoneBiomes[zone] = zoneBiome;
      }
    }
    if (parsed.choices && typeof parsed.choices === 'object') {
      for (const key of Object.keys(parsed.choices)) {
        const zone = Number(key);
        const pair = parsed.choices[key];
        const left = Array.isArray(pair) ? storedBiomeIndex(pair[0]) : null;
        const right = Array.isArray(pair) ? storedBiomeIndex(pair[1]) : null;
        if (Number.isFinite(zone) && left != null && right != null) {
          splitChoices[zone] = [left, right];
        }
      }
    }
    if (Array.isArray(parsed.chosen)) {
      for (const zone of parsed.chosen) {
        if (Number.isFinite(Number(zone))) chosenZones.add(Math.round(Number(zone)));
      }
    }
    if (parsed.exits && typeof parsed.exits === 'object') {
      for (const key of Object.keys(parsed.exits)) {
        const zone = Number(key);
        const side = parsed.exits[key];
        if (Number.isFinite(zone) && (side === 1 || side === -1)) chosenExit[zone] = side;
      }
    }
  } catch {
    /* сохранение недоступно — план соберётся заново */
  }
}

function currentZone() {
  const meters = Number.isFinite(G.biomeStoredMeters) ? G.biomeStoredMeters : 0;
  return Math.max(0, Math.floor(meters / ZONE_M));
}

function ensureZonePlan(zone) {
  const z = Math.max(0, Math.round(zone));
  if (zoneBiomes[z] == null) {
    const prev = z > 0 ? zoneBiomes[z - 1] : null;
    zoneBiomes[z] = prev == null ? (G.currentBiome != null ? biomeIndex(G.currentBiome) : 0)
      : getBiomeChoices(prev, G.visitCounts || ZERO_VISITS())[0];
  }
  if (!splitChoices[z]) {
    splitChoices[z] = getBiomeChoices(zoneBiomes[z], G.visitCounts || ZERO_VISITS());
  }
  if (z >= 0 && zoneBiomes[z + 1] == null) {
    zoneBiomes[z + 1] = splitChoices[z][0];
  }
}

function zoneBiomeAt(zone) {
  const z = Math.max(0, Math.round(zone));
  if (zoneBiomes[z] == null) {
    // Идём назад до ближайшей известной зоны и достраиваем цепочку.
    let anchor = z - 1;
    while (anchor > 0 && zoneBiomes[anchor] == null) anchor--;
    ensureZonePlan(Math.max(0, anchor));
    for (let i = Math.max(1, anchor); i <= z; i++) ensureZonePlan(i);
  }
  return biomeIndex(zoneBiomes[z] ?? G.currentBiome ?? 0);
}

/** Насколько байк уже ушёл на правую ленту развилки. 0 — прямая, 1 — съезд. */
function previewSideWeight(zone) {
  const z = Math.max(0, Math.round(zone));
  const s = Number.isFinite(G.playerS) ? G.playerS : 0;
  if (onBridgeAtS(s)) return 0;
  const frame = frameAt(s);
  const spot = readExit(frame);
  if (!spot.ribbon) return 0;
  const axis = laneAnchor(frame);
  const center = surfaceWorld(axis, spot, true);
  const dist = center - axis;
  if (!(dist > 0.1)) return 0;
  const world = Number.isFinite(riderWorld)
    ? riderWorld
    : carriageLat(axis, laneSpanAt(s), G.laneOffset);
  return smooth01(Math.max(0, Math.min(1, (world - axis) / dist)));
}

/**
 * Биом за развилкой — не индекс, а микс двух ветвей. Пока выбор открыт, вес
 * идёт от бокового положения байка; после фиксации дотягивается до выбранной
 * ветви за SPLIT_RAMP_M метров. Декор, небо и щиты читают этот же микс.
 */
function previewBiomeAt(zone) {
  const z = Math.max(0, Math.round(zone));
  const choices = splitChoices[z] || getBiomeChoices(zoneBiomeAt(z), G.visitCounts || ZERO_VISITS());
  const left = biomeIndex(choices[0]);
  const right = biomeIndex(choices[1]);
  if (left === right) return { a: left, b: left, t: 0 };
  const lateral = previewSideWeight(z);
  if (!chosenZones.has(z) && G.pendingBiome == null) return { a: left, b: right, t: lateral };
  const target = biomeIndex(zoneBiomeAt(z + 1)) === right ? 1 : 0;
  const from = Number.isFinite(previewSideHold[z]) ? previewSideHold[z] : lateral;
  const s = Number.isFinite(G.playerS) ? G.playerS : 0;
  const ramp = splitDecisionWeight(z, blendMetersAt(s));
  return { a: left, b: right, t: from + (target - from) * ramp };
}

function persistBiome() {
  if (G.forkLabActive) return;
  try {
    const km = Math.max(0, Number.isFinite(G.biomeStoredMeters) ? G.biomeStoredMeters : 0) / 1000;
    localStorage.setItem(STORAGE_KEY, km.toFixed(3));
    const visits = G.visitCounts || ZERO_VISITS();
    localStorage.setItem(CURRENT_KEY, BIOMES[biomeIndex(G.currentBiome)].id);
    localStorage.setItem(VISITS_KEY, JSON.stringify(Object.fromEntries(BIOMES.map((biome, index) => [biome.id, visits[index] || 0]))));
    if (G.pendingBiome == null) localStorage.removeItem(PENDING_KEY);
    else localStorage.setItem(PENDING_KEY, BIOMES[biomeIndex(G.pendingBiome)].id);

    const zone = currentZone();
    const plan = { zones: {}, choices: {}, chosen: [], exits: {} };
    for (let z = Math.max(0, zone - 2); z <= zone + 4; z++) {
      if (zoneBiomes[z] != null) plan.zones[z] = BIOMES[biomeIndex(zoneBiomes[z])].id;
      if (splitChoices[z]) plan.choices[z] = splitChoices[z].slice(0, 2).map((index) => BIOMES[biomeIndex(index)].id);
      if (chosenZones.has(z)) plan.chosen.push(z);
      if (chosenExit[z] === 1 || chosenExit[z] === -1) plan.exits[z] = chosenExit[z];
    }
    localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
  } catch {
    /* сохранение недоступно — игра продолжает работать */
  }
}

/* ---------- Разбор точки маршрута ----------
 * Живой биом (декор, небо) и профиль дороги — два индекса одной точки.
 * Результат возвращается объектом. Глобального «текущего» разбора нет:
 * вложенный запрос не затирает то, что читает вызывающий.
 */

/** Зона → биом уже нарисованной дороги. Пока выбор не сделан, замок пуст. */
const roadLock = Object.create(null);

function blendMetersAt(s) {
  return G.biomeOffsetM + s;
}

function fadeWeights(local) {
  if (!(local < ROAD_FADE_M)) return { t: 1, t1: 0, t2: 0 };
  const u = Math.max(0, Math.min(1, local / ROAD_FADE_M));
  return {
    t: u * u * (3 - 2 * u),
    t1: (6 * u * (1 - u)) / ROAD_FADE_M,
    t2: (6 - 12 * u) / (ROAD_FADE_M * ROAD_FADE_M)
  };
}

function zoneSample(meters) {
  const m = Number.isFinite(meters) ? Math.max(0, meters) : 0;
  const zone = Math.floor(m / ZONE_M);
  const local = m - zone * ZONE_M;
  const fade = zone > 0 ? fadeWeights(local) : { t: 1, t1: 0, t2: 0 };
  return { m, zone, local, fade };
}

/** Профиль зоны замирает, когда выбор ветки, которая в неё ведёт, уже сделан. */
function roadZoneIndex(zone) {
  const z = Math.max(0, zone);
  const live = zoneBiomeAt(z);
  const decided = z === 0 || chosenZones.has(z - 1);
  if (!decided) return live;
  const start = z * ZONE_M;
  const playerM = (Number.isFinite(G.biomeOffsetM) ? G.biomeOffsetM : 0)
    + (Number.isFinite(G.playerS) ? G.playerS : 0);
  if (start > playerM + 340) return live;
  if (roadLock[z] == null) roadLock[z] = live;
  return roadLock[z];
}

function liveAtMeters(meters) {
  const sample = zoneSample(meters);
  return {
    zone: sample.zone,
    meters: sample.m,
    a: zoneBiomeAt(sample.zone - 1),
    b: zoneBiomeAt(sample.zone),
    t: sample.fade.t,
    t1: sample.fade.t1,
    t2: sample.fade.t2
  };
}

let roadCacheM = NaN;
let roadCache = null;
/** Сиденье байка. Ось и вливание съезда считает js/engine/seat.js. */
let riderSeat = { kind: /** @type {'road' | 'exit'} */ ('road'), lane: 0 };
/** Мир байка с прошлого кадра. Через скачок оси въезда полоса собирается из него. */
let riderWorld = NaN;
/** Ось, на которой посчитан riderWorld. */
let riderAxis = NaN;
/** Память езды вместе с лентой: surface/heldLat/ribbonHalf, как у трафика. */
const riderHold = emptyRideHold();
/** Масштаб, которым посчитана текущая полоса байка. Пока неизвестен — полоса не пересчитывается. */
let riderSpan = NaN;

function roadAtMeters(meters) {
  if (meters === roadCacheM && roadCache) return roadCache;
  const sample = zoneSample(meters);
  roadCacheM = sample.m;
  roadCache = {
    zone: sample.zone,
    meters: sample.m,
    a: roadZoneIndex(sample.zone - 1),
    b: roadZoneIndex(sample.zone),
    t: sample.fade.t,
    t1: sample.fade.t1,
    t2: sample.fade.t2
  };
  return roadCache;
}

function dropRoadCache() {
  roadCacheM = NaN;
  roadCache = null;
  layoutCache = null;
  frameKey = NaN;
  frameHit = null;
  roadFrameKey = NaN;
  roadFrameHit = null;
  headKey = NaN;
  headHit = null;
}

function roadProfiles(s) {
  const r = roadAtMeters(blendMetersAt(s));
  return { a: PROFILES[r.a], b: PROFILES[r.b], t: r.t, t1: r.t1, t2: r.t2 };
}

function biomeRoadX(s) {
  const r = roadProfiles(s);
  return mixValue(r.a.x(s), r.b.x(s), r.t);
}

function biomeRoadDX(s) {
  const r = roadProfiles(s);
  return mixDeriv(r.a.x(s), r.b.x(s), r.a.dx(s), r.b.dx(s), r.t, r.t1);
}

function biomeRoadDDX(s) {
  const r = roadProfiles(s);
  return mixSecond(r.a.x(s), r.b.x(s), r.a.dx(s), r.b.dx(s), r.a.ddx(s), r.b.ddx(s), r.t, r.t1, r.t2);
}

function biomeRoadY(s) {
  const r = roadProfiles(s);
  return mixValue(r.a.y(s), r.b.y(s), r.t);
}

function biomeRoadDY(s) {
  const r = roadProfiles(s);
  return mixDeriv(r.a.y(s), r.b.y(s), r.a.dy(s), r.b.dy(s), r.t, r.t1);
}

/* ---------- Ширина дороги и развилка ---------- */
function baseRoadWidthAtMeters(meters) {
  const r = roadAtMeters(meters);
  const wa = LANE_CONFIG[r.a].width;
  const wb = LANE_CONFIG[r.b].width;
  return wa + (wb - wa) * r.t;
}

function liveForkAtS(s, peak) {
  const frame = frameAt(s);
  const layout = courseLayout();
  const raw = forkSpreadAt(blendMetersAt(s), layout.zoneLength, layout.lead, peak);
  return forkOccupancy(raw, frame.phase.kind, frame.chosen, frame.local, frame.phase.t);
}

function forkSpreadAtS(s) {
  return liveForkAtS(s, courseLayout().spread);
}

/** В эту зону вошли по съезду: её ширина и полосы — биом зоны, без смеси со старой. */
function zoneEnteredByExit(sample) {
  return sample.zone > 0 && chosenExit[sample.zone - 1] === 1;
}

/** Полуширина дороги в этой точке. Въезд в зону не смешивает её со старой шириной. */
function catalogHalfAt(s) {
  const meters = blendMetersAt(s);
  const sample = zoneSample(meters);
  if (zoneEnteredByExit(sample)) {
    const layout = LANE_CONFIG[biomeIndex(zoneBiomes[sample.zone])];
    if (layout) return layout.width * 0.5;
  }
  return baseRoadWidthAtMeters(meters) * 0.5;
}

/** Откуда начинается курс съезда: середина прижатой +1 полосы, не кромка дороги. */
function exitBornAt(spawn) {
  const at = Number.isFinite(spawn.turnAt) ? spawn.turnAt : spawn.nose;
  return catalogHalfAt(at) + EXIT_LANE_HALF;
}

/** Полуширина биома, в который ведёт съезд этой зоны. */
function arriveHalfAt(zone) {
  ensureZonePlan(zone + 1);
  const layout = LANE_CONFIG[biomeIndex(zoneBiomes[zone + 1])];
  return layout ? layout.width * 0.5 : 0;
}

function splitAmountAtS(s) {
  return liveForkAtS(s, 1);
}

const EXIT_CLOCK = exitClock();
const vectors = createVectorField();
let layoutCache = null;
let frameKey = NaN;
let frameHit = null;
let headKey = NaN;
let headHit = null;

function clearBranchPaths() {
  vectors.clear();
}

/** @returns {import('./engine/vectors.js').CourseLayout} */
function courseLayout() {
  const offset = Number.isFinite(G.biomeOffsetM) ? G.biomeOffsetM : 0;
  if (layoutCache && layoutCache.offset === offset) return layoutCache;
  layoutCache = courseLayoutOf(EXIT_CLOCK, ZONE_M, offset);
  return layoutCache;
}

/** Зона и нос развилки в точке s. */
function layoutAt(s) {
  const layout = courseLayout();
  const along = Number.isFinite(s) ? s : 0;
  const zone = zoneAt(along, layout);
  return { layout, zone, nose: zoneNose(zone, layout) };
}

/**
 * Центр развилки в координате s игрока. Единственная формула, её читает и полотно.
 * Сам нос не сдвигается: ввод выбранной ветки идёт через splitDecisionWeight
 * в roadFrameAt, поэтому ось и кромки едут плавно за SPLIT_RAMP_M метров.
 */
function splitCenterS(playerS) {
  return layoutAt(playerS).nose;
}

/** Решение зоны: открыто, прямая или съезд. Кромки читают side. */
function decisionAt(zone) {
  if (!chosenZones.has(zone)) return decideZone({ committed: false });
  const stored = chosenExit[zone];
  if (stored === 1 || stored === -1) return decideZone({ committed: true, storedSide: stored });
  const choices = splitChoices[zone];
  const next = zoneBiomes[zone + 1];
  if (!choices || next == null) return decideZone({ committed: true, nextIsExit: null });
  return decideZone({
    committed: true,
    nextIsExit: biomeIndex(next) === biomeIndex(choices[1]),
  });
}

/** Взятые въезды, которые уже стали дорогой. Дальше путь идёт их курсом. */
function ownedCourse(s) {
  const layout = courseLayout();
  const here = zoneAt(s, layout);
  const owned = [];
  for (let z = 0; z <= here; z++) {
    if (decisionAt(z).side !== 1) continue;
    const spawn = vectorSpawnOf(z, EXIT_RIGHT, layout);
    if (!spawn || !(s >= spawn.ownsFrom)) continue;
    owned.push({ ...spawn, born: exitBornAt(spawn) });
  }
  return owned;
}

/** Биом, в который ведёт взятый въезд. */
function entranceBiome(s) {
  const zone = routeAt(s).zone;
  ensureZonePlan(zone + 1);
  return biomeIndex(zoneBiomes[zone + 1]);
}

/** Въезд уже стал дорогой: чтение съезда говорит arrived, отдельной ленты нет. */
function arrivedRoad(frame) {
  return readExit(frame).life === 'arrived';
}

const ribbonHeads = new Map();

function computeHeading(s) {
  const at = layoutAt(s);
  const frame = frameAt(s);
  const owned = ownedCourse(s);
  headKey = s;
  headHit = vectors.heading({
    s,
    y: biomeRoadY(s),
    nose: at.nose,
    edges: frame.world,
    owned,
    branches: openCourse(RIGHT_FORK, s, at.layout).map((spawn) => ({
      ...spawn,
      born: exitBornAt(spawn),
    })),
    origin: owned.length ? laneAnchor(frame) : roadCenter(frame),
    turn: at.layout.turn,
    ownedHere: owned.length > 0,
  }, (u) => ({ x: biomeRoadX(u), dx: biomeRoadDX(u), ddx: biomeRoadDDX(u) }));
  return headHit;
}

function roadHeading(s) {
  const remembered = ribbonHeads.get(s);
  if (remembered) return remembered;
  if (s === headKey && headHit) return headHit;
  return computeHeading(s);
}

function rememberRibbonHeadings(samples) {
  ribbonHeads.clear();
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    ribbonHeads.set(s, computeHeading(s));
  }
}

function embedRoad(s, lat) {
  return vectors.place(roadHeading(s), lat);
}

/** Точка обочины: курс берётся у кромки дороги, не у хорды клина. */
function embedBeside(s, edge, lat) {
  const pose = embedRoad(s, edge);
  const at = besidePoint(pose, edge, lat);
  return {
    x: at.x,
    y: pose.y,
    z: at.z,
    fx: pose.fx,
    fz: pose.fz,
    rx: pose.rx,
    rz: pose.rz,
    curvature: pose.curvature,
  };
}

function roadCurvature(s) {
  const lat = riderLatAt(s);
  return embedRoad(s, lat).curvature;
}

function roadBiomeAtS(s) {
  const r = roadAtMeters(blendMetersAt(s));
  return r.t >= 1 ? r.b : r.a;
}

/**
 * У моста одно полотно шириной 38 м: 4 полосы — 2 встречные и 2 попутные.
 * Раскладку берём из каталога, чтобы трафик, полосы и разметка не расходились
 * с объявленными `lanes: 4, oncoming: 2`. Кромки — в fork.ts, без ленты съезда.
 */

/** Вес моста: 0 на берегах, 1 в пролёте, линейный переход на въезде/съезде. */
function bridgeWeightAtS(s) {
  const meters = Math.max(0, blendMetersAt(s));
  const local = meters - Math.floor(meters / ZONE_M) * ZONE_M;
  if (local <= BRIDGE_START_M - BRIDGE_FADE_M || local >= BRIDGE_END_M + BRIDGE_FADE_M) return 0;
  if (local <= BRIDGE_START_M) return (local - (BRIDGE_START_M - BRIDGE_FADE_M)) / BRIDGE_FADE_M;
  if (local >= BRIDGE_END_M) return (BRIDGE_END_M + BRIDGE_FADE_M - local) / BRIDGE_FADE_M;
  return 1;
}

/** Мост включается только в зоне своего биома, не в такой же части чужой зоны. */
function onBridgeAtS(s) {
  return bridgeWeightAtS(s) > 0 && roadBiomeAtS(s) === CABLE_BRIDGE;
}

const BRIDGE_START_M = 350;
const BRIDGE_END_M = 950;

const BRIDGE_ROAD = LANE_CONFIG[CABLE_BRIDGE];

/** Масштаб разметки: живая полуширина кадра и смещения его полос. */
function laneSpanAt(s) {
  const at = Number.isFinite(s) ? s : G.playerS;
  const scale = roadCarriageAt(at).scale;
  return Number.isFinite(scale) && scale !== 0 ? scale : 1;
}

/** Штрихи шоссе. Это промежутки его полос, на его оси. */
function laneMarksAtS(s) {
  return laneMarks(roadCarriageAt(s));
}

/** Двойная сплошная проезжей части. Съезд — её полоса, отдельной разметки у него нет. */
function solidMarksAtS(s) {
  return solidMarks(roadCarriageAt(s));
}

function markAxis(marks) {
  if (!marks || marks.length < 2) return null;
  return (marks[0].lat + marks[1].lat) * 0.5;
}

/**
 * Бетонный отбойник МКАД. Он стоит на дороге МКАД и не переезжает
 * на пришедшую дорогу другого биома.
 */
function medianLatsAt(s) {
  const lats = [];
  if (carriageBiomeAt(s, frameAt(s)) === MKAD) {
    const at = markAxis(solidMarksAtS(s));
    if (at != null) lats.push(at);
  }
  return lats;
}

function routeAt(s) {
  const meters = Math.max(0, blendMetersAt(s));
  const zone = Math.floor(meters / ZONE_M);
  return { meters, zone, local: meters - zone * ZONE_M };
}

/** 0…1 — насколько выбор развилки уже введён в геометрию. В момент
 *  авто-выбора вес 0, дальше растёт за SPLIT_RAMP_M метров. Иначе ось
 *  дороги и схлопывание ветки прыгали на ~4 м в одном кадре. */
function splitDecisionWeight(zone, meters) {
  const c = splitCommitMeters[zone];
  if (!Number.isFinite(c)) return 1; // выбор был в прошлой сессии — он уже в силе
  const u = Math.max(0, Math.min(1, (meters - c) / SPLIT_RAMP_M));
  return u * u * (3 - 2 * u);
}

/** Кадр моста: одно полотно, кромки вне проезжей части, без съездов. */
function bridgeFrameAt(s) {
  const blended = blendMetersAt(s);
  const z = zoneSample(blended).zone;
  const profile = PROFILES[roadZoneIndex(z)];
  const x = profile.x(blended);
  const local = bridgeEdges();
  return {
    local,
    world: {
      leftOuter: local.leftOuter + x,
      leftInner: local.leftInner + x,
      rightInner: local.rightInner + x,
      rightOuter: local.rightOuter + x,
    },
    origin: x,
    block: null,
    phase: { kind: 'settle', t: 1, open: 0 },
    chosen: 0,
  };
}

/** Обычный кадр дороги, без мостовых кромок. Полосы и съезды читают только его. */
let roadFrameKey = NaN;
let roadFrameHit = null;
function roadFrameAt(s) {
  if (s === roadFrameKey && roadFrameHit) return roadFrameHit;
  const route = routeAt(s);
  const side = decisionAt(route.zone).side;
  roadFrameKey = s;
  roadFrameHit = sampleRoad({
    forkDistance: forkOffset(route.meters, ZONE_M, EXIT_CLOCK.lead),
    half: catalogHalfAt(s),
    chosen: side,
    baseOrigin: 0,
    endWeight: splitDecisionWeight(route.zone, route.meters),
    arriveHalf: side === 1 ? arriveHalfAt(route.zone) : undefined,
  });
  return roadFrameHit;
}

function frameAt(s) {
  if (s === frameKey && frameHit) return frameHit;
  frameKey = s;
  const w = onBridgeAtS(s) ? bridgeWeightAtS(s) : 0;
  if (w >= 1) {
    frameHit = bridgeFrameAt(s);
    return frameHit;
  }
  const road = roadFrameAt(s);
  if (w <= 0) {
    frameHit = road;
    return frameHit;
  }
  const bridge = bridgeFrameAt(s);
  const lerp = (a, b) => a + (b - a) * w;
  const world = {};
  for (const key of Object.keys(road.world)) world[key] = lerp(road.world[key], bridge.world[key]);
  frameHit = {
    ...road,
    world,
    origin: lerp(road.origin, bridge.origin),
  };
  return frameHit;
}

function roadEdgesAt(s) {
  return frameAt(s).world;
}

function forkCloseAtS(s) {
  const phase = frameAt(s).phase;
  if (phase.kind === 'settle') return 1;
  if (phase.kind === 'end') return phase.t;
  return 0;
}

/** Оболочка живого асфальта: прямая и съезд, пока у каждой есть ширина. */
function asphaltSpanAt(s) {
  const frame = frameAt(s);
  return asphaltSpan(frame.world);
}

/** Портал и мост накрывают эту проезжую часть, не обе ленты. */
function drivenSpanAt(s) {
  const road = roadCarriageAt(s);
  const half = road.half;
  return {
    left: road.axis - half,
    right: road.axis + half,
    mid: road.axis,
    width: half * 2,
  };
}

/** Байк на полосе съезда. Лента есть, пока чтение съезда её ещё держит. */
function drivenIsExitAt(s) {
  return ridingRibbon(roadCarriageAt(s).spot, riderSeat.kind);
}

/** Полоса этой проезжей части в мировых метрах. Съезд — та же ось. */
function drivenLaneAt(s, offset) {
  const road = roadCarriageAt(s);
  return carriageLat(road.axis, road.scale, offset);
}

/**
 * Точка сбоку от всей оболочки дороги.
 * На чужой асфальт не садится: если между кромкой и точкой лежит другая лента, точки нет.
 * На развилке берётся внешняя кромка всей оболочки, чтобы декор ветки был виден издалека.
 */
function flankAt(s, side, depth) {
  const world = frameAt(s).world;
  const sign = side < 0 ? -1 : 1;
  const edge = sign < 0 ? world.leftOuter : world.rightOuter;
  if (!Number.isFinite(edge)) return null;
  const lat = edge + sign * Math.max(0, Number.isFinite(depth) ? depth : 0);
  const at = groundAt(world, lat);
  if (at.dist === 0) return null;
  const fromNearest = at.dist - at.half;
  if (fromNearest + 0.25 < Math.abs(lat - edge)) return null;
  return { edge, lat };
}

/** Кромки этой же проезжей части. Лес и горы по-прежнему читают всю оболочку. */
function drivenFrameAt(s) {
  const span = drivenSpanAt(s);
  const frame = frameAt(s);
  return { edges: spanEdges(span), origin: frame.origin };
}

/**
 * Биом проезжей части в точке.
 * После прихода и на всей следующей зоне это биом новой дороги.
 * Прямой ход держит старые полосы, пока ширина ещё перетекает.
 */
function carriageBiomeAt(s, frame) {
  if (arrivedRoad(frame)) return entranceBiome(s);
  const sample = zoneSample(blendMetersAt(s));
  if (zoneEnteredByExit(sample)) return biomeIndex(zoneBiomes[sample.zone]);
  return biomeIndex(roadBiomeAtS(s));
}

function roadCarriageAt(s) {
  // Полосы всегда читают обычный кадр: мостовые кромки не съезд и не вторая лента.
  const frame = roadFrameAt(s);
  const dom = carriageBiomeAt(s, frame);
  const normal = carriageAt({
    frame,
    biome: LANE_CONFIG[dom] || LANE_CONFIG[0],
  });
  const w = onBridgeAtS(s) ? bridgeWeightAtS(s) : 0;
  if (w <= 0) return normal;
  const bridge = {
    ...normal,
    phase: 'road',
    axis: frame.origin,
    scale: 1,
    half: BRIDGE_EDGE,
    exitHalf: 0,
    spot: { ...normal.spot, ribbon: null },
    lanes: {
      id: 'cable_bridge',
      ...BRIDGE_ROAD,
      lanes: BRIDGE_ROAD.lanes.map((lane) => ({ ...lane })),
      offsets: BRIDGE_ROAD.offsets.slice(),
      speeds: BRIDGE_ROAD.speeds.slice(),
      biomeOncoming: BRIDGE_ROAD.oncomingCount,
    },
    way: BRIDGE_ROAD.way,
    marks: [],
    solid: [],
  };
  if (w >= 1) return bridge;
  const mix = (a, b) => a + (b - a) * w;
  return {
    ...bridge,
    axis: mix(normal.axis, bridge.axis),
    scale: mix(normal.scale, bridge.scale),
    half: mix(normal.half, bridge.half),
    width: mix(normal.width, bridge.width),
    marks: w < 0.5 ? normal.marks : [],
    solid: w < 0.5 ? normal.solid : [],
  };
}

/** Ширина живой проезжей части. В кадр уходит ширина каталога, без второго смешивания. */
function roadWidthAtS(s) {
  return roadCarriageAt(s).half * 2;
}

/** Байк на дороге или на ленте съезда. В клине между ними его нет. */
function updateExitHold() {
  const frame = frameAt(G.playerS);
  const scale = laneSpanAt(G.playerS);
  const axis = laneAnchor(frame);
  const span = Number.isFinite(riderSpan) && riderSpan !== 0 ? riderSpan : scale;
  const steeredWorld = Number.isFinite(riderAxis)
    ? carriageLat(riderAxis, span, G.laneOffset)
    : carriageLat(axis, scale, G.laneOffset);
  const spot = readExit(frame);
  const onRibbon = ridingRibbon(spot, riderSeat.kind);
  // Въезд растёт в новую дорогу симметрично вокруг середины. Правая кромка —
  // линия въезда: байк остаётся на ней и вливается справа, а не в центр.
  const merged = followRide(riderHold, steeredWorld, spot, axis, onRibbon);
  let seat;
  if (G.forkLabActive && Number.isFinite(G.forkLabLateral)) {
    const stick = riderSeat.kind === 'exit' ? 'exit' : 'road';
    const held = stayOnAsphalt(frame.local, G.forkLabLateral, stick);
    const kind = onExitRibbon(held, frame.local) ? 'exit' : 'road';
    const ruler = rideRuler(frame, kind === 'exit', scale);
    seat = { kind, lane: laneAtWorld(frame.origin + held, ruler.axis, ruler.scale) };
  } else {
    const local = merged - frame.origin;
    const stick = onRibbon ? 'exit' : 'road';
    const held = stayOnAsphalt(frame.local, local, stick);
    seat = seatFromWorld(frame, frame.origin + held, riderSeat, scale);
  }
  const used = rideRuler(frame, seat.kind === 'exit', scale);
  riderSeat = seat;
  riderSpan = used.scale;
  riderAxis = used.axis;
  riderHold.onRibbon = ridingRibbon(spot, seat.kind);
  riderHold.surface = surfaceWorld(axis, spot, riderHold.onRibbon);
  riderWorld = seatWorld(frame, riderSeat, scale);
  G.laneOffset = riderSeat.lane;
}

function riderFrameSeat(s, lane) {
  const frame = frameAt(s);
  const home = frameAt(G.playerS).origin;
  return seatOnFrame(frame, { kind: riderSeat.kind, lane }, home);
}

/** Точка той же дороги, что у байка, в метрах курса. */
function rideAt(s, factor) {
  const frame = frameAt(s);
  const player = frameAt(G.playerS);
  const playerSpot = readExit(player);
  return sampleRide(
    readExit(frame),
    playerSpot,
    ridingRibbon(playerSpot, riderSeat.kind),
    riderLatAt(G.playerS),
    frame.origin,
    player.origin,
    factor,
  );
}

/** Полоса байка. Явное смещение и точка байка считаются сиденьем. Остальные точки — той же дорогой. */
function riderLatAt(s, laneOffset) {
  const explicit = typeof laneOffset === 'number';
  // В кадре игрока держим уже пересчитанную через retargetRide точку. Пересчёт
  // из текущей оси снова прибавил бы сдвиг ленты и дал рывок на въезде.
  if (!explicit && s === G.playerS && Number.isFinite(riderWorld)) return riderWorld;
  const lane = explicit ? laneOffset : G.laneOffset;
  const frame = frameAt(s);
  const seat = riderFrameSeat(s, lane);
  const span = laneSpanAt(s);
  const here = seatWorld(frame, seat, span);
  if (s === G.playerS || explicit) return here;
  return rideAt(s, 1);
}

/** Байк реально сидит на полосе съезда, а не просто едет рядом с ней. */
function onExitLane() {
  return riderSeat.kind === 'exit';
}

/**
 * Боковая точка следа камеры в абсолютных метрах курса.
 * Сзади и спереди это та же дорога, что у байка.
 */
function followLatAt(s, factor = 1, extra = 0) {
  const f = Number.isFinite(factor) ? Math.max(0, Math.min(1.5, factor)) : 1;
  const add = Number.isFinite(extra) ? extra : 0;
  return rideAt(s, f) + add;
}

/** Доминирующий биом в точке s — из тех же весов, что читают небо и декор. */
function dominantBiomeAtS(s) {
  const w = biomeWeightsAtS(s);
  let dom = 0;
  let best = -1;
  for (let i = 0; i < w.length; i++) {
    if (w[i] > best) { best = w[i]; dom = i; }
  }
  return dom;
}

/** Ближайшая попутная полоса к логическому смещению. */
function nearestRunLane(lateralOffset, cfg = null) {
  const config = cfg || lanesAtS(G.playerS);
  return nearestLaneOffset(config, lateralOffset, 'with');
}

function weightOf(live, index) {
  let w = 0;
  if (live.a === index) w += 1 - live.t;
  if (live.b === index) w += live.t;
  return w;
}

function cityWeightAtS(s) {
  return weightOf(liveAtMeters(blendMetersAt(s)), CITY);
}

function mkadWeightAtS(s) {
  return weightOf(liveAtMeters(blendMetersAt(s)), MKAD);
}

/** Свой массив на каждый вызов: вложенный запрос не затирает уже прочитанные веса. */
function fillWeights(live) {
  const weights = new Array(BIOMES.length);
  for (let i = 0; i < BIOMES.length; i++) weights[i] = 0;
  weights[live.a] += 1 - live.t;
  weights[live.b] += live.t;
  return weights;
}

/** Прибавить к весам микс двух биомов с общим весом scale. */
function addBiomeMix(weights, a, b, t, scale) {
  const w = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  const k = Math.max(0, Math.min(1, Number.isFinite(scale) ? scale : 0));
  if (a === b) {
    weights[a] += k;
    return;
  }
  weights[a] += (1 - w) * k;
  weights[b] += w * k;
}

/**
 * Веса декора. В отличие от профиля дороги, смена идёт симметрично вокруг
 * границы зоны: новый биом виден издалека, а старый не пропадает сразу за
 * границей. За развилкой читается не один индекс, а микс двух ветвей.
 */
function sceneryWeightsAtMeters(meters) {
  const m = Math.max(0, meters);
  const zone = Math.floor(m / ZONE_M);
  const local = m - zone * ZONE_M;
  const half = Math.max(1, SCENERY_PREVIEW_M);
  const span = half * 2;
  const weights = new Array(BIOMES.length);
  for (let i = 0; i < weights.length; i++) weights[i] = 0;
  // До первой границы нечего смешивать: в начале зоны всегда её собственный биом.
  if (zone === 0 && local <= ZONE_M - half) {
    weights[zoneBiomeAt(0)] = 1;
    return weights;
  }
  if (local > ZONE_M - half) {
    const t = smooth01((local - (ZONE_M - half)) / span);
    const own = zoneBiomeAt(zone);
    addBiomeMix(weights, own, own, 0, 1 - t);
    const preview = previewBiomeAt(zone);
    addBiomeMix(weights, preview.a, preview.b, preview.t, t);
    return weights;
  }
  if (local < half && zone > 0) {
    const t = smooth01((local + half) / span);
    weights[zoneBiomeAt(zone - 1)] += 1 - t;
    weights[zoneBiomeAt(zone)] += t;
    return weights;
  }
  weights[zoneBiomeAt(zone)] = 1;
  return weights;
}

function biomeWeightsAtS(s) {
  return sceneryWeightsAtMeters(blendMetersAt(s));
}


/* Профиль откоса. Те же точки рисует слой земли в ground.js через G.shoulder.
 * Ровная бровка под тротуар есть только у шоссе. Съезд начинается от асфальта. */
const SHOULDER = {
  berm: 22,
  far: 95,
  lipY: 0.08,
  bermY: 1.8,
  farY: -4.5,
  /** Бордюр 0.35 м + тротуар 3.2 м. Только кромки шоссе. */
  cityEdge: 3.55
};

/** Высота земли в мировой точке lat. Профиль тот же, что у откоса этой кромки. */
function groundOffset(lat, s, latAbs = lat) {
  const frame = frameAt(s);
  const at = groundAt(frame.world, lat, latAbs);
  const fromCenter = at.half;
  const cityOuter = SHOULDER.cityEdge * cityWeightAtS(s);
  const apron = vergeAt(frame.world, groundEdge(frame.world, lat), cityOuter);
  const lats = shoulderLats(fromCenter, apron, SHOULDER);
  const dist = at.dist;
  const side = lat >= 0 ? 1 : -1;
  // Набережная: справа пологая пешеходная зона и спуск к воде вместо откоса.
  let embW = 0;
  if (side > 0 && EMBANKMENT >= 0) {
    embW = smooth01(((biomeWeightsAtS(s)[EMBANKMENT] || 0) - 0.02) / 0.4);
  }
  if (embW > 0.01) {
    const mix = (a, b) => G.lerp(a, b, embW);
    const eLats = { lip: mix(lats.lip, fromCenter), berm: mix(lats.berm, 17), far: mix(lats.far, 30) };
    const eShoulder = Object.assign({}, SHOULDER, {
      lipY: mix(SHOULDER.lipY, 0.08),
      bermY: mix(SHOULDER.bermY, 0.08),
      farY: mix(SHOULDER.farY, -6)
    });
    return shoulderHeight(dist, eLats, eShoulder);
  }
  return shoulderHeight(dist, lats, SHOULDER);
}

/* ---------- Состояние, баннеры и HUD ---------- */
let saveTimer = 0;
let bannerTimer = 0;
let lastRunZone = -1;
let lastHudKey = '';
let lastSplitKey = '';
const _terrain = new THREE.Color();
const _terrainTmp = new THREE.Color();

function bannerEls() {
  const root = document.getElementById('biome-banner');
  if (!root) return null;
  return {
    root,
    icon: root.querySelector('.biome-ico'),
    name: root.querySelector('.biome-name'),
    sub: root.querySelector('.biome-sub')
  };
}

function showBiomeBanner(biome) {
  const els = bannerEls();
  if (!els) return;
  if (els.icon) els.icon.setAttribute('name', biome.icon);
  if (els.name) els.name.textContent = biome.name;
  if (els.sub) els.sub.textContent = biome.sub;
  els.root.style.setProperty('--biome-accent', hexColor(biome.accent));
  els.root.classList.add('show');
  bannerTimer = 2.1;
}

function hexColor(value) {
  const n = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0xffffff;
  return '#' + n.toString(16).padStart(6, '0');
}

function hideBiomeBanner() {
  const els = bannerEls();
  if (els) els.root.classList.remove('show');
  bannerTimer = 0;
}

function updateBanner(dt) {
  if (bannerTimer <= 0) return;
  bannerTimer -= dt;
  if (bannerTimer <= 0) hideBiomeBanner();
}

function updateBiomeChip(biomeIndexValue) {
  const chip = document.getElementById('biome-chip');
  if (!chip) return;
  const biome = BIOMES[biomeIndexValue] || BIOMES[0];
  const key = biome.id;
  if (key === lastHudKey) return;
  lastHudKey = key;
  const ico = chip.querySelector('.chip-ico');
  const name = chip.querySelector('.chip-name');
  if (ico) ico.setAttribute('name', biome.icon);
  if (name) name.textContent = biome.short;
  chip.style.setProperty('--chip-accent', hexColor(biome.accent));
}

/** @returns {{root: HTMLElement, head: HTMLElement|null, hint: HTMLElement|null, left: HTMLElement|null, right: HTMLElement|null, leftIco: HTMLElement|null, leftName: HTMLElement|null, rightIco: HTMLElement|null, rightName: HTMLElement|null}|null} */
function splitEls() {
  const root = document.getElementById('split-banner');
  if (!root) return null;
  const q = (sel) => /** @type {HTMLElement|null} */ (root.querySelector(sel));
  return {
    root,
    head: q('.split-head'),
    hint: q('.split-hint'),
    left: q('.split-opt.left'),
    right: q('.split-opt.right'),
    leftIco: q('.split-opt.left .split-ico'),
    leftName: q('.split-opt.left .split-name'),
    rightIco: q('.split-opt.right .split-ico'),
    rightName: q('.split-opt.right .split-name')
  };
}

function hideSplitBanner() {
  const els = splitEls();
  if (els) els.root.hidden = true;
  lastSplitKey = '';
}

function updateSplitBanner(info) {
  const els = splitEls();
  if (!els) return;
  if (!info || !info.show) {
    if (!els.root.hidden) els.root.hidden = true;
    lastSplitKey = '';
    return;
  }
  const side = info.chosen ? info.chosenSide : info.previewSide;
  const key = `${info.left}|${info.right}|${side}|${info.chosen ? 1 : 0}`;
  if (key === lastSplitKey) return;
  lastSplitKey = key;

  const leftBiome = BIOMES[info.left];
  const rightBiome = BIOMES[info.right];
  if (els.leftIco) els.leftIco.setAttribute('name', leftBiome.icon);
  if (els.leftName) els.leftName.textContent = leftBiome.short;
  if (els.rightIco) els.rightIco.setAttribute('name', rightBiome.icon);
  if (els.rightName) els.rightName.textContent = rightBiome.short;
  if (els.left) {
    els.left.style.setProperty('--opt-accent', hexColor(leftBiome.accent));
    els.left.classList.toggle('active', side === 0);
  }
  if (els.right) {
    els.right.style.setProperty('--opt-accent', hexColor(rightBiome.accent));
    els.right.classList.toggle('active', side === 1);
  }
  if (els.head) els.head.textContent = info.chosen ? 'ПУТЬ ВЫБРАН' : 'ВЫБОР ПУТИ';
  if (els.hint) {
    const picked = side === 1 ? rightBiome : leftBiome;
    els.hint.textContent = info.chosen
      ? (side === 1 ? `Съезд · ${picked.short}` : `Прямо · ${picked.short}`)
      : 'Правая лента — съезд. На своей полосе остаёшься прямо.';
  }
  els.root.hidden = false;
  els.root.classList.toggle('decided', !!info.chosen);
}

function updateTerrainTint(weights) {
  const grass = G.M && G.M.grass;
  if (!grass) return;
  _terrain.setRGB(0, 0, 0);
  for (let i = 0; i < BIOMES.length; i++) {
    const w = weights[i];
    if (w <= 0.0001) continue;
    _terrainTmp.copy(TERRAIN_COLORS[i]).multiplyScalar(w);
    _terrain.add(_terrainTmp);
  }
  grass.color.copy(_terrain);
}

let lastLaneBiome = -1;
let lastExitLaneMode = false;

function applyLaneConfig(playerS) {
  const live = roadCarriageAt(playerS);
  const cfg = live.lanes;
  const isExit = onExitLane();
  const carriageBiome = biomeIndexOf(cfg.id);
  const modeChanged = isExit !== lastExitLaneMode;
  const biomeChanged = carriageBiome !== lastLaneBiome;

  G.laneCount = cfg.count;
  G.oncomingCount = cfg.oncomingCount;
  G.LANE_OFFSETS = cfg.offsets.slice();
  G.LANE_SPEEDS = cfg.speeds.slice();
  G.START_LANE = cfg.startLane;

  if (biomeChanged || modeChanged) {
    lastLaneBiome = carriageBiome;
    lastExitLaneMode = isExit;
    const target = nearestRunLane(G.laneOffset, cfg);
    if (Math.abs(G.laneOffset - target) > 0.35) {
      G.laneAssistTarget = target;
    }
    if (G.remapTrafficLanes) G.remapTrafficLanes(cfg);
  } else {
    lastLaneBiome = carriageBiome;
    lastExitLaneMode = isExit;
  }

  const frame = frameAt(playerS);
  const limits = logicalRoadLimits(frame.local, live.scale, onExitLane(), frame.chosen !== -1);
  G.roadEdgeMin = limits.min;
  G.roadEdgeMax = limits.max;
  G.ROAD_EDGE = Math.max(Math.abs(limits.min), limits.max);
}

function updateScenery(dt) {
  if (G.updateBiomeScenery) G.updateBiomeScenery(dt);
}

/** Полосы дороги в точке s. Без s — под байком. Съезд — правая полоса этой дороги.
 *  @returns {import('./engine/lanes.js').CarriageLayout} */
function lanesAtS(s) {
  const at = Number.isFinite(s) ? s : G.playerS;
  return roadCarriageAt(at).lanes;
}

/** Случайная попутная полоса дороги. Полоса съезда не подходит: она уезжает вместе с лентой. */
function randomRunLane(s) {
  const road = lanesAtS(s);
  const stable = road.lanes.filter((lane) => !lane.exit);
  const use = stable.length > 0 ? { ...road, lanes: stable } : road;
  return laneIndexByRoll(use, 'with', Math.random());
}

/** Смещение остаётся, если это попутная полоса дороги байка. Иначе ближайшая такая полоса. */
function holdDrivenLane(s, offset) {
  const road = lanesAtS(s);
  const lane = Number.isFinite(offset) ? offset : 0;
  for (const item of road.lanes) {
    if (item.direction === 'with' && Math.abs(item.offset - lane) < 0.05) return item.offset;
  }
  return nearestLaneOffset(road, lane, 'with');
}

function clearForkChoice(zone) {
  chosenZones.delete(zone);
  delete chosenExit[zone];
  delete splitCommitMeters[zone];
  delete previewSideHold[zone];
  delete roadLock[zone + 1];
}

/** Страница развилки сама называет сторону. Сохранение и счётчик визитов не трогает. */
function applyForkLab(zone, meters) {
  if (!G.forkLabActive) return;
  const want = G.forkLabChoice;
  if (want !== 0 && want !== 1) {
    if (chosenZones.has(zone)) clearForkChoice(zone);
    return;
  }
  const stored = want === 1 ? 1 : -1;
  if (chosenZones.has(zone) && chosenExit[zone] === stored) return;
  clearForkChoice(zone);
  commitSplit(zone, want, meters);
}

function commitSplit(zone, side, commitMeters) {
  // На пролёте развилки нет: въезд и съезд остаются на берегах.
  if (onBridgeAtS(Number.isFinite(commitMeters) ? commitMeters - G.biomeOffsetM : G.playerS)) return;
  if (chosenZones.has(zone)) return;
  const choices = splitChoices[zone] || getBiomeChoices(zoneBiomeAt(zone), G.visitCounts);
  const chosen = choices[side === 1 ? 1 : 0];
  // Выбор фиксируется здесь, но предпросмотр едет от последней стороны байка.
  previewSideHold[zone] = previewSideWeight(zone);
  chosenZones.add(zone);
  chosenExit[zone] = side === 1 ? 1 : -1;
  if (Number.isFinite(commitMeters)) splitCommitMeters[zone] = commitMeters;
  zoneBiomes[zone + 1] = chosen;
  // Снимаем фикс профиля следующей зоны, чтобы он совпал с фактическим выбором.
  delete roadLock[zone + 1];
  G.pendingBiome = chosen;
  if (G.forkLabActive) {
    dropRoadCache();
    return;
  }
  if (side === 0 && G.trackForkLeftChoice) G.trackForkLeftChoice();
  G.visitCounts = G.visitCounts || ZERO_VISITS();
  G.visitCounts[chosen] = Math.min(2, (G.visitCounts[chosen] || 0) + 1);
  G.currentBiome = chosen;
  if (G.trackBiomeVisitByIndex) G.trackBiomeVisitByIndex(chosen);
  updateBiomeChip(chosen);
  showBiomeBanner(BIOMES[chosen]);
  persistBiome();
  dropRoadCache();
}

function updateZoneProgress(meters) {
  const zone = Math.max(0, Math.floor(meters / ZONE_M));
  if (lastRunZone < 0) {
    lastRunZone = zone;
    return;
  }
  if (zone === lastRunZone) return;

  const previous = lastRunZone;
  lastRunZone = zone;
  if (zone > previous) {
    const nextBiome = zoneBiomes[zone] != null
      ? biomeIndex(zoneBiomes[zone])
      : (G.pendingBiome != null ? biomeIndex(G.pendingBiome) : biomeIndex(G.currentBiome));
    G.currentBiome = nextBiome;
    G.pendingBiome = null;
    G.visitCounts = G.visitCounts || ZERO_VISITS();
    if ((G.visitCounts[nextBiome] || 0) < 1) G.visitCounts[nextBiome] = 1;
    ensureZonePlan(zone);
    ensureZonePlan(zone + 1);
    chosenZones.delete(zone);
    updateBiomeChip(nextBiome);
    persistBiome();
  } else {
    // Откат мира (рестарт/телепорт) — просто выравниваем план.
    ensureZonePlan(zone);
    ensureZonePlan(zone + 1);
    updateBiomeChip(G.currentBiome);
  }
}

/* ---------- Публичный апдейт ---------- */
function updateBiome(dt) {
  dropRoadCache();
  const meters = G.biomeOffsetM + G.playerS;
  if (G.started && !G.ended && !G.forkLabActive) {
    G.biomeStoredMeters = meters;
    saveTimer += dt;
    if (saveTimer >= 2.5) {
      saveTimer = 0;
      persistBiome();
    }
  }

  const live = liveAtMeters(meters);
  const weights = fillWeights(live);

  // Конфиг/идентичность биома переключаем только когда профиль дороги уже
  // полностью стал новым (t>=1). Иначе логика (полосы, трафик, лимиты) резко
  // перестраивается, пока визуально дорога ещё прежняя/морфит — это даёт дёрганье.
  const dominant = live.t >= 1 ? live.b : live.a;
  const zone = live.zone;
  const cityWeight = weights[CITY];
  const mkadWeight = weights[MKAD];

  if (G.started && !G.ended) updateZoneProgress(meters);

  ensureZonePlan(zone);
  ensureZonePlan(zone + 1);

  const layout = courseLayout();
  const splitM = zoneNose(zone, layout) + layout.offset;
  const splitD = meters - splitM;
  const choices = splitChoices[zone] || getBiomeChoices(zoneBiomeAt(zone), G.visitCounts || ZERO_VISITS());
  splitChoices[zone] = choices;

  updateExitHold();
  applyForkLab(zone, meters);
  const chosenBefore = chosenZones.has(zone);
  const previewSide = chosenBefore
    ? (G.pendingBiome === choices[1] ? 1 : 0)
    : (reachedExit(riderLatAt(G.playerS, G.laneOffset), frameAt(G.playerS).world) ? 1 : 0);

  // Выбор фиксируется в конце параллельного участка. До этого следующая
  // локация не переписывается: уход со съезда обратно на прямую остаётся прямым.
  if (G.started && !G.ended && !G.forkLabActive && !chosenBefore && splitD >= layout.choiceAt) {
    commitSplit(zone, previewSide, meters);
  }
  // commitSplit мог выбрать биом прямо в этом кадре — HUD и баннер должны
  // увидеть решение сразу, а не следующим кадром.
  const chosen = chosenZones.has(zone);
  const forkAhead = splitM - meters;
  G.forkView = forkAhead < 340 && forkAhead > -90 ? 1 : 0;

  G.biomeState = {
    meters,
    zone,
    current: live.a,
    next: live.b,
    t: live.t,
    dominant,
    weights,
    cityWeight,
    mkadWeight,
    id: BIOMES[dominant].id
  };
  G.biomeDominant = dominant;
  G.biomeTransition = {
    active: G.started && !G.ended && live.t > 0.001 && live.t < 0.999,
    from: live.a,
    to: live.b,
    t: live.t
  };

  const chosenSide = splitPick(chosen ? (G.pendingBiome === choices[1] ? 1 : 0) : -1);
  const bannerSide = branchPick(previewSide);
  G.splitState = {
    active: G.started && !G.ended && !onBridgeAtS(G.playerS) && splitD > -SPLIT_BANNER_AHEAD && splitD < layout.ownAfter,
    zone,
    s: splitM - G.biomeOffsetM,
    d: splitD,
    side: bannerSide,
    chosen,
    chosenSide,
    choices: choices.slice(),
  };

  updateBanner(dt);
  // currentBiome читаем после commitSplit: в кадре авто-выбора чип должен
  // сразу показать новый биом, а не обновиться следующим кадром.
  updateBiomeChip(G.currentBiome);
  applyLaneConfig(G.playerS);

  if (G.started && !G.ended && onExitLane()) G.laneAssistTarget = null;

  updateTerrainTint(weights);

  const showSplit = !!G.splitState.active;
  updateSplitBanner(showSplit ? {
    show: true,
    left: choices[0],
    right: choices[1],
    previewSide,
    chosenSide,
    chosen
  } : null);

  updateScenery(dt);
  if (G.updateForest) G.updateForest();
  if (G.updateMountain) G.updateMountain();
  if (G.updateEmbankment) G.updateEmbankment(dt);
  if (G.updateCableBridge) G.updateCableBridge(dt);
}

/** Сброс мира на старте заезда: биом продолжается с сохранённого места. */
function resetBiomeRun() {
  G.biomeOffsetM = G.biomeStoredMeters;
  const zone = Math.max(0, Math.floor(G.biomeOffsetM / ZONE_M));
  zoneBiomes[zone] = biomeIndex(G.currentBiome);
  if (zoneBiomes[zone - 1] == null) zoneBiomes[zone - 1] = biomeIndex(G.currentBiome);
  G.visitCounts = ZERO_VISITS();
  G.visitCounts[G.currentBiome] = 1;
  G.pendingBiome = null;
  chosenZones.clear();
  for (const key of Object.keys(chosenExit)) delete chosenExit[key];
  // План следующей зоны пересобирается под свежие счётчики посещений.
  delete splitChoices[zone];
  delete splitChoices[zone + 1];
  zoneBiomes[zone + 1] = null;
  ensureZonePlan(zone);
  ensureZonePlan(zone + 1);
  lastRunZone = zone;
  lastLaneBiome = -1;
  lastExitLaneMode = false;
  riderSeat = { kind: 'road', lane: G.laneOffset };
  riderSpan = NaN;
  riderWorld = NaN;
  riderAxis = NaN;
  Object.assign(riderHold, emptyRideHold());
  for (const key of Object.keys(roadLock)) delete roadLock[key];
  for (const key of Object.keys(splitCommitMeters)) delete splitCommitMeters[key];
  for (const key of Object.keys(previewSideHold)) delete previewSideHold[key];
  dropRoadCache();
  clearBranchPaths();
  G.laneAssistTarget = null;
  saveTimer = 0;
  hideBiomeBanner();
  hideSplitBanner();
  G.splitState = null;
  if (G.resetBiomeScenery) G.resetBiomeScenery();
  if (G.resetForest) G.resetForest();
  if (G.resetMountain) G.resetMountain();
  if (G.resetEmbankment) G.resetEmbankment();
  if (G.resetCableBridge) G.resetCableBridge();
  if (G.resetRoadside) G.resetRoadside();
  if (G.resetMegaStructures) G.resetMegaStructures();
  if (G.resetForkPark) G.resetForkPark();
  applyLaneConfig(G.playerS);
}

/* ---------- Меню и пауза ---------- */
function biomeDisplayInfo() {
  const meters = Math.max(0, G.biomeStoredMeters || 0);
  const zone = Math.max(0, Math.floor(meters / ZONE_M));
  ensureZonePlan(zone);
  const current = zoneBiomeAt(zone);
  const layout = courseLayout();
  const splitM = zoneNose(zone, layout) + layout.offset;
  const span = layout.zoneLength - layout.lead;
  const local = meters - zone * ZONE_M;
  const progress = Math.max(0, Math.min(1, local / span));
  const choices = splitChoices[zone] || getBiomeChoices(current, G.visitCounts || ZERO_VISITS());
  const next = G.pendingBiome != null ? biomeIndex(G.pendingBiome) : choices[0];
  return {
    biome: BIOMES[current],
    biomeIndex: current,
    next: BIOMES[next],
    nextIndex: next,
    choices,
    progress,
    leftM: Math.max(0, splitM - meters),
    zone
  };
}

function biomeMenuMarkup() {
  const info = biomeDisplayInfo();
  const pct = Math.round(info.progress * 100);
  const visits = G.visitCounts || ZERO_VISITS();
  const marks = info.choices.map((b) => {
    const biome = BIOMES[b];
    return `<span title="посещений: ${visits[b] || 0}/2">${icon(biome.icon)} ${biome.short}</span>`;
  }).join('<i>·</i>');
  return `<div class="biome-strip">
    <span class="biome-strip-icon">${icon(info.biome.icon)}</span>
    <div class="biome-strip-main">
      <div class="biome-strip-row"><b>${info.biome.short}</b><span>развилка: ${marks} · ${(info.leftM / 1000).toFixed(1)} км</span></div>
      <div class="biome-strip-bar"><i style="width:${pct}%"></i></div>
    </div>
  </div>`;
}

function biomePauseValue() {
  const info = biomeDisplayInfo();
  return `${info.biome.short} · ${Math.round(info.progress * 100)}%`;
}

/* ---------- Инициализация ---------- */
export function initBiome() {
  G.biomeRoadX = biomeRoadX;
  G.biomeRoadDX = biomeRoadDX;
  G.biomeRoadDDX = biomeRoadDDX;
  G.biomeRoadY = biomeRoadY;
  G.biomeRoadDY = biomeRoadDY;
  G.cityWeightAtS = cityWeightAtS;
  G.mkadWeightAtS = mkadWeightAtS;
  G.bridgeWeightAtS = bridgeWeightAtS;
  G.onBridgeAtS = onBridgeAtS;
  G.embankmentWeightAtS = (s) => weightOf(liveAtMeters(blendMetersAt(s)), EMBANKMENT);
  G.biomeWeightsAtS = biomeWeightsAtS;
  G.roadWidthAtS = roadWidthAtS;
  G.roadsAt = roadCarriageAt;
  G.nominalRoadWidth = LANE_CONFIG[CITY].width;
  G.forkSpreadAtS = forkSpreadAtS;
  G.roadOriginAt = (s) => frameAt(s).origin;
  G.embedRoad = embedRoad;
  G.rememberRibbonHeadings = rememberRibbonHeadings;
  G.embedBeside = embedBeside;
  G.roadCurvature = roadCurvature;
  G.roadBlockAt = (s) => frameAt(s).block;
  G.riderLatAt = riderLatAt;
  G.onExitLane = onExitLane;
  G.followLatAt = followLatAt;
  G.forkCloseAtS = forkCloseAtS;
  G.roadEdgesAt = roadEdgesAt;
  G.roadsideFrameAt = (s) => {
    const frame = frameAt(s);
    return { edges: frame.world, origin: frame.origin };
  };
  G.besidePose = besidePose;
  G.asphaltSpan = asphaltSpanAt;
  /** Ключ полного каркаса асфальта: меняется при открытии съезда и смене ветки. */
  G.roadShellKeyAt = (s) => {
    const at = asphaltSpanAt(s);
    return `${Math.round(at.left)}:${Math.round(at.right)}:${Math.round(at.mid)}`;
  };
  G.drivenSpanAt = drivenSpanAt;
  G.drivenIsExitAt = drivenIsExitAt;
  G.drivenFrameAt = drivenFrameAt;
  G.drivenLaneAt = drivenLaneAt;
  G.holdDrivenLane = holdDrivenLane;
  G.flankAt = flankAt;
  G.roadBiomeAtS = roadBiomeAtS;
  G.splitAmountAtS = splitAmountAtS;
  G.splitCenterS = splitCenterS;
  /** Насколько ввод выбранной ветки уже применён к центру/кромкам. */
  G.splitCommitWeightAtS = (s) => {
    const at = layoutAt(s);
    return splitDecisionWeight(at.zone, blendMetersAt(s));
  };
  G.shoulder = SHOULDER;
  G.groundOffset = groundOffset;
  G.laneMarksAtS = laneMarksAtS;
  G.solidMarksAtS = solidMarksAtS;
  G.medianLatsAt = medianLatsAt;
  G.laneSpanAt = laneSpanAt;
  G.dominantBiomeAtS = dominantBiomeAtS;
  G.forkView = 0;
  G.biomeState = null;
  G.biomeTransition = { active: false, from: 0, to: 0, t: 0 };
  G.splitState = null;

  G.visitCounts = ZERO_VISITS();
  G.pendingBiome = null;
  G.currentBiome = 0;
  G.laneAssistTarget = null;

  const stored = readStoredMeters();
  G.biomeStoredMeters = stored;
  G.biomeOffsetM = stored;

  const zone = Math.max(0, Math.floor(stored / ZONE_M));
  readPlan();
  let savedCurrent = null;
  try {
    savedCurrent = storedBiomeIndex(localStorage.getItem(CURRENT_KEY));
  } catch {
    savedCurrent = null;
  }
  G.currentBiome = savedCurrent == null ? 0 : savedCurrent;
  if (zoneBiomes[zone] == null) zoneBiomes[zone] = G.currentBiome;
  if (zoneBiomes[zone - 1] == null) zoneBiomes[zone - 1] = G.currentBiome;
  const pending = readPending();
  if (pending != null) {
    G.pendingBiome = pending;
    zoneBiomes[zone + 1] = pending;
  }
  G.visitCounts = readVisits();
  if (!G.visitCounts.some((n) => n > 0)) G.visitCounts[G.currentBiome] = 1;
  else if ((G.visitCounts[G.currentBiome] || 0) < 1) G.visitCounts[G.currentBiome] = 1;

  lastRunZone = zone;
  ensureZonePlan(zone);
  ensureZonePlan(zone + 1);
  applyLaneConfig(0);

  G.updateBiome = updateBiome;
  G.resetBiomeRun = resetBiomeRun;
  G.randomRunLane = randomRunLane;
  G.lanesAtS = lanesAtS;
  G.persistBiome = persistBiome;
  G.biomeMenuMarkup = biomeMenuMarkup;
  G.biomePauseValue = biomePauseValue;
  G.hideBiomeBanner = hideBiomeBanner;
  G.showBiomeBanner = (biomeIndexValue) => showBiomeBanner(BIOMES[biomeIndexValue] || BIOMES[0]);
  G.BIOMES = BIOMES;

  addEventListener('pagehide', persistBiome);
  addEventListener('beforeunload', persistBiome);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistBiome();
  });
}

