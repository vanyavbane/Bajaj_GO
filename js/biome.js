import * as THREE from 'three';
import { box, cylinder } from './geom.js';
import { BIOMES, biomeIndexOf, laneLayoutOf, transitionIndexes } from './engine/biomes.js';
import { laneDashOffsets } from './engine/lanes.js';
import { keepInWindow } from './engine/stream.js';
import { BRANCH_YAW, frameFromSpline, stepBranch } from './engine/branch.js';
import { EXIT_CHOICE, EXIT_DIVERGE, EXIT_END, FORK_LEAD, FORK_SPREAD, branchPick, canGrabExit, canReleaseExit, carriageEdge, chosenSideOf, exitCarryOrigin, exitChain, exitPhase, exitReserved, exitRibbonCenter, forkAmountAt, forkOffset, forkSpreadAt, laneMeters, liveForkAmount, logicalRoadLimits, outwardFrom, sampleRoad, shoulderHeight, shoulderLats, splitPick, worldEdge } from './engine/fork.js';
import { cos, makeProfile, mixDeriv, mixSecond, mixValue, sin } from './engine/profile.js';
import { besidePose, medianFits, medianPose, medianRoom } from './engine/roadside.js';
import { G } from './state.js';

/* =========================================================================
 * БИОМЫ: ПЛАН ЗАЕЗДА, ПРОФИЛЬ ДОРОГИ, РАЗВИЛКИ, ДЕКОРАЦИИ И СОХРАНЕНИЕ
 * -------------------------------------------------------------------------
 * Биом — функция пройденного пути, а не кадра. Живой биом (полосы, декор,
 * небо) и закреплённый профиль дороги читают одну точку маршрута, но разные
 * индексы. Замок зоны ставится в момент выбора ветки, не раньше: до выбора
 * профиль едет за стороной байка. Полосы на асфальте читают тот же индекс.
 * Развилка — прямой ход и необязательный съезд вправо. Ось дороги не переезжает.
 * ========================================================================= */

const ZONE_M = 1500;              // длина одной локации
const ROAD_FADE_M = 350;         // плавный переход профиля/ширины дороги между биомами после границы зоны, метров
const SPLIT_LEAD = FORK_LEAD;
const SPLIT_AUTO_D = EXIT_CHOICE; // выбор в конце раздельного участка, не на носу съезда
const SPLIT_BANNER_AHEAD = 260;  // баннер выбора появляется за столько метров
const STORAGE_KEY = 'bajajGO_biomeKm';
const CURRENT_KEY = 'bajajGO_currentBiome';
const VISITS_KEY = 'bajajGO_visitCounts';
const PENDING_KEY = 'bajajGO_pendingBiome';
const PLAN_KEY = 'bajajGO_biomePlan';
const SCENERY_SLOTS = 20;
const SCENERY_STEP = 28;
const SCENERY_SPAN = SCENERY_SLOTS * SCENERY_STEP;

const CITY = biomeIndexOf('city');
const MKAD = biomeIndexOf('mkad');
const TRANSITIONS = transitionIndexes();

/* -------------------------------------------------------------------------
 * Профили дороги. Волны и производные считаются в js/engine/profile.js.
 * ---------------------------------------------------------------------- */
const PROFILES = [
  makeProfile(
    [sin(34, 0.0042), cos(48, 0.0021)],
    [sin(1.65, 0.055), cos(1.15, 0.029)]
  ),
  makeProfile(
    [sin(14, 0.0035), cos(7, 0.0014)],
    [sin(0.55, 0.0062), cos(0.35, 0.0031)]
  ),
  makeProfile(
    [sin(18, 0.006), cos(10, 0.0027), sin(6, 0.0011)],
    [sin(1.2, 0.008), cos(0.7, 0.0042)]
  ),
  makeProfile(
    [sin(30, 0.019), sin(16, 0.0081), cos(7, 0.0023)],
    [sin(7.4, 0.0078), cos(4.6, 0.0039), sin(2.0, 0.0021)]
  ),
  makeProfile(
    [sin(70, 0.0045), sin(30, 0.0018), cos(12, 0.0009)],
    [sin(1.15, 0.0022), cos(0.75, 0.0011)]
  )
];

const TERRAIN_COLORS = [
  new THREE.Color(0x2a4d31), // city
  new THREE.Color(0x6f6a36), // field
  new THREE.Color(0x1e3d29), // forest
  new THREE.Color(0x5a6066), // mountain
  new THREE.Color(0x3a4048)  // mkad
];
if (PROFILES.length !== BIOMES.length || TERRAIN_COLORS.length !== BIOMES.length) {
  throw new Error('Профиль и цвет земли должны идти в том же порядке и количестве, что каталог биомов');
}

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

/** Публичный конфиг полос биома. Принимает id строкой или индекс. */
function getLaneConfig(biomeId) {
  let idx = 0;
  if (typeof biomeId === 'string') {
    const found = BIOMES.findIndex((b) => b.id === biomeId);
    if (found >= 0) idx = found;
  } else {
    idx = biomeIndex(biomeId);
  }
  return LANE_CONFIG[idx];
}

/** Публичный профиль биома в точке s. */
function biomeProfile(biomeId, s) {
  const idx = typeof biomeId === 'string'
    ? Math.max(0, BIOMES.findIndex((b) => b.id === biomeId))
    : biomeIndex(biomeId);
  const p = PROFILES[idx] || PROFILES[0];
  return {
    id: BIOMES[idx].id,
    x: p.x(s),
    dx: p.dx(s),
    ddx: p.ddx(s),
    y: p.y(s),
    dy: p.dy(s),
    ddy: p.ddy(s)
  };
}

/* ---------- Выбор следующего биома ---------- */
function getBiomeChoices(currentBiome, visitCounts) {
  const cur = biomeIndex(currentBiome);
  const allowed = (TRANSITIONS[cur] || TRANSITIONS[0]).filter((b) => b !== cur);
  const visits = (b) => {
    const n = visitCounts && Number(visitCounts[b]);
    return Number.isFinite(n) ? n : 0;
  };
  let pool = allowed.filter((b) => visits(b) < 2);
  if (pool.length === 0) pool = allowed.slice();
  if (pool.length === 0) pool = BIOMES.map((_, index) => index).filter((b) => b !== cur);

  const choices = [];
  if (pool.length >= 2) {
    choices.push(pool[0], pool[1]);
  } else {
    choices.push(pool[0]);
    const rest = [];
    for (let b = 0; b < BIOMES.length; b++) if (b !== cur && b !== choices[0]) rest.push(b);
    rest.sort((a, b) => (visits(a) - visits(b)) || (a - b));
    choices.push(rest[0]);
  }
  if (choices[1] === choices[0]) {
    const alternate = allowed.find((b) => b !== choices[0]);
    choices[1] = alternate == null ? (choices[0] + 1) % BIOMES.length : alternate;
  }
  return choices;
}

/* ---------- План зон и сохранение ---------- */
let zoneBiomes = Object.create(null);   // zone → biome index
let splitChoices = Object.create(null); // zone → [left, right]
const chosenZones = new Set();
/** Зона → 1 если взят съезд, -1 если поехали прямо. Не выводится из индекса биома. */
const chosenExit = Object.create(null);
/** Зона → мировой центр дороги после взятого съезда. На ось не возвращается. */
const chosenOrigin = Object.create(null);
/** Метр, на котором выбор развилки зоны был зафиксирован. Нужен, чтобы
 *  схлопывание чужой ветки и сдвиг оси вводились плавно, а не рывком. */
const splitCommitMeters = Object.create(null);
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

function readInt(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.round(n) : fallback;
  } catch {
    return fallback;
  }
}

function readPending() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? biomeIndex(n) : null;
  } catch {
    return null;
  }
}

function readVisits() {
  let visits = ZERO_VISITS();
  try {
    const raw = localStorage.getItem(VISITS_KEY);
    const parsed = raw ? safeParse(raw) : null;
    if (Array.isArray(parsed)) {
      for (let i = 0; i < visits.length; i++) {
        visits[i] = clampInt(parsed[i], 0, 2, 0);
      }
    }
  } catch {
    /* сохранение недоступно — начинаем с чистого заезда */
  }
  return visits;
}

function readPlan() {
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    const parsed = raw ? safeParse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return;
    if (parsed.zones && typeof parsed.zones === 'object') {
      for (const key of Object.keys(parsed.zones)) {
        const zone = Number(key);
        if (Number.isFinite(zone)) zoneBiomes[zone] = biomeIndex(parsed.zones[key]);
      }
    }
    if (parsed.choices && typeof parsed.choices === 'object') {
      for (const key of Object.keys(parsed.choices)) {
        const zone = Number(key);
        const pair = parsed.choices[key];
        if (Number.isFinite(zone) && Array.isArray(pair) && pair.length >= 2) {
          splitChoices[zone] = [biomeIndex(pair[0]), biomeIndex(pair[1])];
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
    if (parsed.origins && typeof parsed.origins === 'object') {
      for (const key of Object.keys(parsed.origins)) {
        const zone = Number(key);
        const origin = Number(parsed.origins[key]);
        if (Number.isFinite(zone) && Number.isFinite(origin)) chosenOrigin[zone] = origin;
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

function persistBiome() {
  try {
    const km = Math.max(0, Number.isFinite(G.biomeStoredMeters) ? G.biomeStoredMeters : 0) / 1000;
    localStorage.setItem(STORAGE_KEY, km.toFixed(3));
    localStorage.setItem(CURRENT_KEY, String(biomeIndex(G.currentBiome)));
    localStorage.setItem(VISITS_KEY, JSON.stringify((G.visitCounts || ZERO_VISITS()).slice(0, BIOMES.length)));
    if (G.pendingBiome == null) localStorage.removeItem(PENDING_KEY);
    else localStorage.setItem(PENDING_KEY, String(biomeIndex(G.pendingBiome)));

    const zone = currentZone();
    const plan = { zones: {}, choices: {}, chosen: [], exits: {}, origins: {} };
    for (let z = Math.max(0, zone - 2); z <= zone + 4; z++) {
      if (zoneBiomes[z] != null) plan.zones[z] = biomeIndex(zoneBiomes[z]);
      if (splitChoices[z]) plan.choices[z] = splitChoices[z].slice(0, 2);
      if (chosenZones.has(z)) plan.chosen.push(z);
      if (chosenExit[z] === 1 || chosenExit[z] === -1) plan.exits[z] = chosenExit[z];
      if (chosenOrigin[z] != null) plan.origins[z] = chosenOrigin[z];
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
/** Стабильная сторона превью развилки: не даёт дороге/биому перескакивать
 *  от мелкого рыскания у центра, пока выбор ещё не зафиксирован. */
/** Игрок удерживает съезд, пока лента не вернётся к дороге. */
let exitHold = false;

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

function biomeRoadDDY(s) {
  const r = roadProfiles(s);
  return mixSecond(r.a.y(s), r.b.y(s), r.a.dy(s), r.b.dy(s), r.a.ddy(s), r.b.ddy(s), r.t, r.t1, r.t2);
}

/* ---------- Ширина дороги и развилка ---------- */
function splitAmountAtMeters(meters) {
  return forkAmountAt(meters, ZONE_M, SPLIT_LEAD);
}

function baseRoadWidthAtMeters(meters) {
  const r = roadAtMeters(meters);
  const wa = LANE_CONFIG[r.a].width;
  const wb = LANE_CONFIG[r.b].width;
  return wa + (wb - wa) * r.t;
}

function forkSpreadAtMeters(meters) {
  return forkSpreadAt(meters, ZONE_M, SPLIT_LEAD, FORK_SPREAD);
}

function forkSpreadAtS(s) {
  const frame = frameAt(s);
  const raw = forkSpreadAtMeters(blendMetersAt(s));
  return liveForkAmount(raw, frame.phase.kind, frame.chosen);
}

/** Ширина одной ветки. Зазор между ветками сюда не входит: его рисует полотно отдельно. */
function roadWidthAtS(s) {
  return baseRoadWidthAtMeters(blendMetersAt(s));
}

function splitAmountAtS(s) {
  const frame = frameAt(s);
  const raw = splitAmountAtMeters(blendMetersAt(s));
  return liveForkAmount(raw, frame.phase.kind, frame.chosen);
}

/** Центр развилки в координате s игрока. Единственная формула, её читает и полотно. */
function splitCenterS(playerS) {
  const offset = Number.isFinite(G.biomeOffsetM) ? G.biomeOffsetM : 0;
  const meters = Math.max(0, offset + playerS);
  const zone = Math.floor(meters / ZONE_M);
  return (zone + 1) * ZONE_M - SPLIT_LEAD - offset;
}

const BRANCH_STEP = 2;
/** @type {Map<number, { nose: number, samples: import('./engine/branch.js').PathFrame[], frozen: { fx: number, fz: number } | null }>} */
const branchPaths = new Map();

function clearBranchPaths() {
  branchPaths.clear();
}

function mainPath(s) {
  return frameFromSpline(biomeRoadX(s), biomeRoadDX(s), s);
}

function noseOfZone(zone) {
  const offset = Number.isFinite(G.biomeOffsetM) ? G.biomeOffsetM : 0;
  return (zone + 1) * ZONE_M - FORK_LEAD - offset;
}

/** Взятые съезды, чей поворот уже кончился к точке s: дальше дорога идёт их вектором. */
function ownedNoses(s) {
  const offset = Number.isFinite(G.biomeOffsetM) ? G.biomeOffsetM : 0;
  const meters = Math.max(0, offset + s);
  const zone = Math.floor(meters / ZONE_M);
  const noses = [];
  for (let z = 0; z <= zone; z++) {
    if (chosenExit[z] !== 1) continue;
    const nose = noseOfZone(z);
    if (s >= nose + EXIT_CHOICE + EXIT_END - 0.01) noses.push(nose);
  }
  return noses;
}

function advanceBranch(rec, baseAt) {
  const prev = rec.samples[rec.samples.length - 1];
  const cursor = rec.nose + (rec.samples.length - 1) * BRANCH_STEP;
  const mid = cursor + BRANCH_STEP * 0.5;
  const stepped = stepBranch(prev, cursor, rec.nose, BRANCH_STEP, baseAt(mid), EXIT_DIVERGE, BRANCH_YAW, rec.frozen);
  rec.frozen = stepped.frozen;
  rec.samples.push(stepped.frame);
}

function pathFrom(nose, s, baseAt) {
  if (!(s > nose)) return baseAt(s);
  let rec = branchPaths.get(nose);
  if (!rec) {
    rec = { nose, samples: [baseAt(nose)], frozen: null };
    branchPaths.set(nose, rec);
  }
  const need = Math.ceil((s - nose) / BRANCH_STEP);
  while (rec.samples.length - 1 < need) advanceBranch(rec, baseAt);
  const t = (s - nose) / BRANCH_STEP;
  const i0 = Math.max(0, Math.min(rec.samples.length - 1, Math.floor(t)));
  const i1 = Math.min(rec.samples.length - 1, i0 + 1);
  const u = Math.max(0, Math.min(1, t - i0));
  const a = rec.samples[i0];
  const b = rec.samples[i1];
  const fx = a.fx + (b.fx - a.fx) * u;
  const fz = a.fz + (b.fz - a.fz) * u;
  const len = Math.hypot(fx, fz) || 1;
  const nfx = fx / len;
  const nfz = fz / len;
  return {
    x: a.x + (b.x - a.x) * u,
    z: a.z + (b.z - a.z) * u,
    fx: nfx,
    fz: nfz,
    rx: -nfz,
    rz: nfx,
    curvature: a.curvature + (b.curvature - a.curvature) * u,
  };
}

/** Центр дороги с учётом уже взятых съездов. Текущий поворот сюда не входит, пока он не стал дорогой. */
function centerline(s, skipNose) {
  const noses = ownedNoses(s);
  let nose = null;
  for (let i = noses.length - 1; i >= 0; i--) {
    if (noses[i] !== skipNose) { nose = noses[i]; break; }
  }
  if (nose == null) return mainPath(s);
  return pathFrom(nose, s, (u) => centerline(u, nose));
}

/** Лента съезда этой зоны, даже если игрок ещё едет прямо. */
function exitPath(s) {
  const nose = splitCenterS(s);
  if (!(s > nose)) return null;
  return pathFrom(nose, s, (u) => centerline(u, nose));
}

function embedRoad(s, lat) {
  const y = biomeRoadY(s);
  const edges = roadEdgesAt(s);
  const nose = splitCenterS(s);
  const exit = s > nose ? exitPath(s) : null;
  const width = edges.rightOuter - edges.rightInner;
  const gap = edges.rightInner - edges.leftInner;
  const ribbon = (edges.rightInner + edges.rightOuter) * 0.5;
  const zone = Math.floor(Math.max(0, (G.biomeOffsetM || 0) + s) / ZONE_M);
  const ownedHere = chosenExit[zone] === 1 && s >= nose + EXIT_CHOICE + EXIT_END - 0.01;
  if (exit && !ownedHere && width > 0.8 && lat >= edges.rightInner - 0.2) {
    const local = lat - ribbon;
    const base = centerline(s, nose);
    const peelT = Math.max(0, Math.min(1, (s - nose) / EXIT_DIVERGE));
    const peel = peelT * peelT * (3 - 2 * peelT);
    // Внешний край уходит сразу. Внутренний догоняет, только когда клин открылся,
    // иначе общая кромка прямой оторвалась бы от полотна.
    const separated = Math.max(0, Math.min(1, gap / 4));
    const outer = Math.max(0, Math.min(1, (lat - edges.rightInner) / Math.max(width, 0.5)));
    const weight = peel * Math.max(separated, outer);
    const sx = base.x + base.rx * lat;
    const sz = base.z + base.rz * lat;
    const bx = exit.x + exit.rx * local;
    const bz = exit.z + exit.rz * local;
    const fx = base.fx + (exit.fx - base.fx) * weight;
    const fz = base.fz + (exit.fz - base.fz) * weight;
    const len = Math.hypot(fx, fz) || 1;
    const nfx = fx / len;
    const nfz = fz / len;
    return {
      x: sx + (bx - sx) * weight, y, z: sz + (bz - sz) * weight,
      rx: -nfz, rz: nfx, fx: nfx, fz: nfz,
      curvature: base.curvature + (exit.curvature - base.curvature) * weight,
      branched: weight > 0.04,
    };
  }
  const path = centerline(s, null);
  const branched = ownedNoses(s).length > 0;
  const local = branched ? lat - frameAt(s).origin : lat;
  return {
    x: path.x + path.rx * local, y, z: path.z + path.rz * local,
    rx: path.rx, rz: path.rz, fx: path.fx, fz: path.fz,
    curvature: path.curvature, branched,
  };
}

function roadCurvature(s) {
  const lat = typeof G.riderLatAt === 'function' ? G.riderLatAt(s) : 0;
  const pose = embedRoad(s, lat);
  if (pose.branched) return pose.curvature * 0.08;
  return biomeRoadDDX(s);
}

function roadBiomeAtS(s) {
  const r = roadAtMeters(blendMetersAt(s));
  return r.t >= 1 ? r.b : r.a;
}

/** Наибольшее |смещение| полос биома. Нужно для масштаба разметки. */
function maxLaneOffset(cfg) {
  let maxAbs = 0;
  for (const off of cfg.offsets) maxAbs = Math.max(maxAbs, Math.abs(off));
  return maxAbs;
}

/** Во сколько раз сжать логические полосы, чтобы крайняя осталась на асфальте.
 *  И ширина, и смещения берутся из профиля дороги, а не из живого декора.
 *  Оба биома перехода смешиваются по тому же весу, что и ширина полотна:
 *  иначе на стыке масштаб скачет и вся разметка с машинами дёргается вбок. */
function laneDisplayScaleAtS(s) {
  const r = roadAtMeters(blendMetersAt(s));
  const maxAbs = mixValue(maxLaneOffset(LANE_CONFIG[r.a]), maxLaneOffset(LANE_CONFIG[r.b]), r.t);
  const half = mixValue(LANE_CONFIG[r.a].width, LANE_CONFIG[r.b].width, r.t) * 0.5 - 0.9;
  if (maxAbs <= 0.001 || half <= 0.5) return 1;
  return Math.min(1, half / (maxAbs + 1.15));
}

/** Штрихи между полосами в точке s. На стыке биомов оба набора живут
 *  одновременно и плавно перетекают: вес 1 — полный штрих, 0 — растворяется.
 *  Совпавшие штрихи сливаются, чтобы общая линия не укорачивалась. */
function laneMarksAtS(s) {
  const r = roadAtMeters(blendMetersAt(s));
  const ca = LANE_CONFIG[r.a];
  const cb = LANE_CONFIG[r.b];
  const list = [];
  const add = (lat, w) => {
    if (w <= 0) return;
    for (const m of list) {
      if (Math.abs(m.lat - lat) < 0.6) {
        const total = m.w + w;
        m.lat = (m.lat * m.w + lat * w) / total;
        m.w = total;
        return;
      }
    }
    list.push({ lat, w });
  };
  for (const lat of laneDashOffsets(ca.offsets, ca.oncomingCount)) add(lat, 1 - r.t);
  for (const lat of laneDashOffsets(cb.offsets, cb.oncomingCount)) add(lat, r.t);
  for (const m of list) if (m.w > 1) m.w = 1;
  return list;
}

/** Сторона оси: -1 слева, +1 справа, 0 пока развилка этой зоны не выбрана. */
function forkChosenSideForZone(zone) {
  if (!chosenZones.has(zone)) return chosenSideOf(0);
  const stored = chosenExit[zone];
  if (stored === 1 || stored === -1) return chosenSideOf(stored);
  const choices = splitChoices[zone];
  const next = zoneBiomes[zone + 1];
  if (!choices || next == null) return chosenSideOf(-1);
  return chosenSideOf(biomeIndex(next) === biomeIndex(choices[1]) ? 1 : -1);
}

function routeAt(s) {
  const meters = Math.max(0, blendMetersAt(s));
  const zone = Math.floor(meters / ZONE_M);
  return { meters, zone, local: meters - zone * ZONE_M };
}

function forkChosenSideAtS(s) {
  return forkChosenSideForZone(routeAt(s).zone);
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

function originBefore(zone) {
  let origin = 0;
  for (let z = 0; z < zone; z++) {
    if (chosenOrigin[z] != null) origin = chosenOrigin[z];
  }
  return origin;
}

/** Один кадр дороги в точке s. */
function frameAt(s) {
  const route = routeAt(s);
  const carried = chosenOrigin[route.zone];
  return sampleRoad({
    forkDistance: forkOffset(route.meters, ZONE_M),
    half: roadWidthAtS(s) * 0.5,
    chosen: forkChosenSideForZone(route.zone),
    baseOrigin: originBefore(route.zone),
    carriedOrigin: carried == null ? null : carried,
    endWeight: splitDecisionWeight(route.zone, route.meters),
  });
}

function localEdgesAt(s) {
  return frameAt(s).local;
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

/** Центр дороги после взятого съезда известен сразу: лента впереди уже продолжается им. */
function commitExitOrigin(zone, s) {
  if (chosenExit[zone] !== 1 || chosenOrigin[zone] != null) return;
  const phase = exitPhase(forkOffset(blendMetersAt(s), ZONE_M));
  if (phase.kind !== 'settle' && phase.kind !== 'none') return;
  chosenOrigin[zone] = exitCarryOrigin(roadWidthAtS(s) * 0.5, originBefore(zone));
}

/** Кромка живой дороги. Пока прямая на месте, справа это её край, не внешний край съезда.
 *  Когда съезд заменил прямую, кромки переходят на него. */
function roadOuterLat(s, side) {
  const frame = frameAt(s);
  return carriageEdge(frame.world, side < 0 ? -1 : 1, frame.origin);
}

function laneSpanAt(s) {
  const scale = laneDisplayScaleAtS(s);
  return Number.isFinite(scale) && scale !== 0 ? scale : 1;
}

function exitReservedAt(s) {
  return exitReserved(forkOffset(Math.max(0, blendMetersAt(s)), ZONE_M));
}

/** Единственный перевод полосы в мировые метры. riding — байк ещё на боковой ленте. */
function roadMetersAt(s, laneOffset, riding) {
  return laneMeters(laneOffset, laneSpanAt(s), roadWidthAtS(s) * 0.5, frameAt(s), riding);
}

/** Мировые метры байка. На съезде полоса считается от центра его ленты, как на прямой. */
function riderWorld(frame, span) {
  const origin = frame.origin;
  const lane = G.laneOffset * span;
  if (!exitHold) return origin + lane;
  const center = exitRibbonCenter(frame.local);
  return center == null ? origin + lane : origin + center + lane;
}

/** Захват переносит полосу на центр съезда, не сдвигая байка в мире. */
function grabExit(frame, span) {
  const center = exitRibbonCenter(frame.local);
  if (center == null) return;
  const world = frame.origin + G.laneOffset * span;
  const halfW = (frame.local.rightOuter - frame.local.rightInner) * 0.5;
  const limit = Math.max(0, (halfW - 0.7) / span);
  let lane = (world - (frame.origin + center)) / span;
  if (lane < -limit) lane = -limit;
  if (lane > limit) lane = limit;
  exitHold = true;
  G.laneOffset = lane;
}

/** Отпуск возвращает полосу к центру прямой дороги, тоже без скачка. */
function releaseExit(frame, span) {
  const world = riderWorld(frame, span);
  exitHold = false;
  G.laneOffset = (world - frame.origin) / span;
}

/** Съезд берётся с его асфальта, пока ленты соединены. Дальше это обычная дорога той же ширины. */
function updateExitHold(meters, zone) {
  commitExitOrigin(zone, G.playerS);
  const frame = frameAt(G.playerS);
  const span = laneSpanAt(G.playerS);
  if (!exitReserved(forkOffset(meters, ZONE_M))) {
    if (exitHold) releaseExit(frame, span);
    return;
  }
  if (!chosenZones.has(zone)) {
    if (!exitHold && canGrabExit(G.laneOffset * span, frame.local)) grabExit(frame, span);
    else if (exitHold) {
      const center = exitRibbonCenter(frame.local);
      const local = center == null ? G.laneOffset * span : center + G.laneOffset * span;
      if (canReleaseExit(local, frame.local)) releaseExit(frame, span);
    }
  }
  const carried = chosenExit[zone] === 1 && (frame.phase.kind === 'settle' || frame.phase.kind === 'none');
  if (exitHold && carried) exitHold = false;
}

/** Полоса машины или разметки: масштаб ширины, без съезда. */
function laneWorldOffsetAtS(s, lateralOffset) {
  return roadMetersAt(s, lateralOffset, false);
}

/** Полоса байка или камеры. На съезде — от центра его ленты, иначе от центра дороги. */
function riderLatAt(s, laneOffset) {
  const lane = typeof laneOffset === 'number' ? laneOffset : G.laneOffset;
  const span = laneSpanAt(s);
  if (!exitHold) return roadMetersAt(s, lane, false);
  const frame = frameAt(s);
  const center = exitRibbonCenter(frame.local);
  return center == null ? frame.origin + lane * span : frame.origin + center + lane * span;
}

/** Доминирующий биом в точке s (без массива весов). */
function dominantBiomeAtS(s) {
  const live = liveAtMeters(blendMetersAt(s));
  return live.t >= 1 ? live.b : live.a;
}

/** Ближайшая попутная полоса текущего биома к логическому смещению. */
function nearestRunLane(lateralOffset, cfg = null) {
  const config = cfg || LANE_CONFIG[biomeIndex(G.biomeDominant != null ? G.biomeDominant : G.currentBiome)];
  let best = config.offsets[config.oncomingCount];
  let bestDist = Infinity;
  for (let i = config.oncomingCount; i < config.count; i++) {
    const off = config.offsets[i];
    const dist = Math.abs(off - lateralOffset);
    if (dist < bestDist) { bestDist = dist; best = off; }
  }
  return best;
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

function biomeWeightsAtS(s) {
  return fillWeights(liveAtMeters(blendMetersAt(s)));
}

/* ---------- Материалы декораций ---------- */
let MAT = null;

function buildMaterials() {
  MAT = {
    hay: new THREE.MeshLambertMaterial({ color: 0xc9a34e, flatShading: true }),
    hayDark: new THREE.MeshLambertMaterial({ color: 0x9d7a34, flatShading: true }),
    wood: new THREE.MeshLambertMaterial({ color: 0x5b4129 }),
    woodLight: new THREE.MeshLambertMaterial({ color: 0x7a5a38 }),
    barnRed: new THREE.MeshLambertMaterial({ color: 0x8e3b2d }),
    barnTrim: new THREE.MeshLambertMaterial({ color: 0xd9d2c2 }),
    roof: new THREE.MeshLambertMaterial({ color: 0x3b3531 }),
    silo: new THREE.MeshLambertMaterial({ color: 0x9aa3a8 }),
    siloTop: new THREE.MeshLambertMaterial({ color: 0x767f85 }),
    pineDark: new THREE.MeshLambertMaterial({ color: 0x1d4a31, flatShading: true }),
    pineMid: new THREE.MeshLambertMaterial({ color: 0x275b3a, flatShading: true }),
    pineLight: new THREE.MeshLambertMaterial({ color: 0x336e45, flatShading: true }),
    rock: new THREE.MeshLambertMaterial({ color: 0x6d7078, flatShading: true }),
    rockDark: new THREE.MeshLambertMaterial({ color: 0x525761, flatShading: true }),
    rockLight: new THREE.MeshLambertMaterial({ color: 0x83878f, flatShading: true }),
    snow: new THREE.MeshLambertMaterial({ color: 0xe9eff7, flatShading: true }),
    moss: new THREE.MeshLambertMaterial({ color: 0x3f6b3a, flatShading: true }),
    bush: new THREE.MeshLambertMaterial({ color: 0x2f6038, flatShading: true }),
    bushDark: new THREE.MeshLambertMaterial({ color: 0x244b2d, flatShading: true }),
    mkadPanel: new THREE.MeshStandardMaterial({ color: 0x4b5665, roughness: 0.82 }),
    mkadPanelLight: new THREE.MeshStandardMaterial({ color: 0x727f8e, roughness: 0.78 }),
    mkadGlass: new THREE.MeshStandardMaterial({ color: 0x9fc4e0, emissive: 0x2d4f66, emissiveIntensity: 0.9, roughness: 0.35 }),
    mkadConcrete: new THREE.MeshStandardMaterial({ color: 0x8d939b, roughness: 0.9 }),
    mkadMetal: new THREE.MeshStandardMaterial({ color: 0x59636e, roughness: 0.55, metalness: 0.55 }),
    mkadLight: new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffb74d, emissiveIntensity: 1.8 }),
    wire: new THREE.MeshStandardMaterial({ color: 0x20262d, roughness: 0.7 })
  };
}

function addBox(parent, mat, w, h, d, x, y, z) {
  const mesh = new THREE.Mesh(box(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/* ---------- Поле ---------- */
function buildFieldVariant(variant) {
  const g = new THREE.Group();
  let lat = 26;
  let spin = null;

  if (variant === 0) {
    lat = 24;
    addBox(g, MAT.hay, 3.0, 1.3, 2.0, 0, 0.65, 0);
    addBox(g, MAT.hayDark, 2.4, 1.1, 1.7, 0.2, 1.85, 0.1);
    addBox(g, MAT.hay, 1.7, 0.9, 1.3, -0.3, 2.9, 0);
    addBox(g, MAT.hayDark, 2.2, 0.8, 1.3, 2.6, 0.4, 1.6);
  } else if (variant === 1) {
    lat = 54;
    const tower = new THREE.Mesh(cylinder(0.85, 1.55, 11.5, 8), MAT.woodLight);
    tower.position.y = 5.75;
    tower.castShadow = true;
    g.add(tower);
    addBox(g, MAT.roof, 2.6, 1.1, 2.6, 0, 11.6, 0);
    const hub = new THREE.Group();
    hub.position.set(0, 9.6, 1.05);
    for (let i = 0; i < 4; i++) {
      const blade = addBox(hub, MAT.barnTrim, 0.34, 4.6, 0.16, 0, 2.5, 0);
      blade.rotation.z = i * Math.PI * 0.5;
    }
    g.add(hub);
    spin = { mesh: hub, speed: 0.42 };
    g.rotation.y = Math.PI * 0.5;
  } else if (variant === 2) {
    lat = 46;
    addBox(g, MAT.barnRed, 8.0, 4.6, 10.0, 0, 2.3, 0);
    addBox(g, MAT.barnTrim, 8.2, 0.32, 10.2, 0, 0.16, 0);
    for (const side of [-1, 1]) {
      const roof = addBox(g, MAT.roof, 4.9, 0.42, 10.6, side * 2.1, 5.5, 0);
      roof.rotation.z = side * -0.62;
    }
    addBox(g, MAT.roof, 8.2, 0.5, 10.4, 0, 5.0, 0);
    addBox(g, MAT.barnTrim, 3.0, 3.4, 0.22, 0, 1.75, -5.06);
    addBox(g, MAT.barnRed, 1.1, 0.35, 0.3, -0.8, 2.2, -5.2);
    addBox(g, MAT.barnRed, 1.1, 0.35, 0.3, 0.8, 2.2, -5.2);
    addBox(g, MAT.barnTrim, 0.27, 2.7, 0.24, 0, 1.7, -5.24);
  } else if (variant === 3) {
    lat = 44;
    const body = new THREE.Mesh(cylinder(1.65, 1.75, 11.5, 10), MAT.silo);
    body.position.y = 5.75;
    body.castShadow = true;
    g.add(body);
    addBox(g, MAT.siloTop, 3.7, 0.5, 3.7, 0, 11.6, 0);
    addBox(g, MAT.siloTop, 2.6, 0.45, 2.6, 0, 12.05, 0);
    for (let y = 1.2; y < 11; y += 1.5) {
      addBox(g, MAT.rockDark, 0.28, 0.12, 0.7, 1.7, y, 0);
    }
    addBox(g, MAT.rockDark, 0.18, 10.4, 0.18, 1.7, 5.4, 0.42);
  } else {
    lat = 28;
    for (let i = 0; i < 7; i++) {
      addBox(g, MAT.wood, 0.24, 1.5, 0.24, 0, 0.75, (i - 3) * 2.4);
    }
    addBox(g, MAT.woodLight, 0.16, 0.22, 16.6, 0, 1.02, 0);
    addBox(g, MAT.woodLight, 0.16, 0.22, 16.6, 0, 0.46, 0);
  }

  return { group: g, lat, spin };
}

/* ---------- Лес ---------- */
function addPine(parent, x, z, h, mats) {
  const trunk = addBox(parent, MAT.wood, 0.46, h * 0.34, 0.46, x, h * 0.17, z);
  trunk.castShadow = true;
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const w = (3.3 - i * 0.72) * (h / 9);
    const y = h * 0.3 + i * h * 0.17;
    addBox(parent, mats[i % mats.length], w, h * 0.19, w, x, y, z);
  }
  addBox(parent, mats[0], 0.7 * (h / 9), h * 0.15, 0.7 * (h / 9), x, h * 0.96, z);
}

function buildForestVariant(variant) {
  const g = new THREE.Group();
  let lat = 21;

  if (variant === 0) {
    lat = 19;
    addPine(g, -2.4, -1.4, 9.5, [MAT.pineDark, MAT.pineMid, MAT.pineLight]);
    addPine(g, 1.8, 1.2, 12.0, [MAT.pineMid, MAT.pineLight, MAT.pineDark]);
    addPine(g, 4.6, -2.2, 7.4, [MAT.pineDark, MAT.pineMid]);
  } else if (variant === 1) {
    lat = 24;
    const log = addBox(g, MAT.wood, 0.95, 0.95, 10.5, 0, 0.52, 0);
    log.rotation.y = 0.32;
    log.rotation.z = 0.05;
    addBox(g, MAT.woodLight, 0.5, 0.4, 2.4, -1.8, 0.9, 2.6).rotation.y = 0.8;
    addBox(g, MAT.rock, 2.0, 1.4, 1.8, 2.0, 0.7, -1.2).rotation.y = 0.5;
    addBox(g, MAT.moss, 1.6, 0.18, 1.4, 2.0, 1.42, -1.2).rotation.y = 0.5;
  } else if (variant === 2) {
    lat = 27;
    addBox(g, MAT.rock, 3.4, 2.3, 3.0, 0, 1.1, 0).rotation.y = 0.3;
    addBox(g, MAT.rockDark, 2.2, 1.6, 2.0, 2.6, 0.75, 1.3).rotation.y = -0.4;
    addBox(g, MAT.moss, 2.8, 0.2, 2.5, 0, 2.24, 0).rotation.y = 0.3;
    addBox(g, MAT.rockLight, 1.4, 1.0, 1.2, -2.4, 0.5, 1.8).rotation.y = 0.9;
  } else if (variant === 3) {
    lat = 18;
    addBox(g, MAT.bush, 2.4, 1.5, 2.0, 0, 0.75, 0);
    addBox(g, MAT.bushDark, 1.8, 1.2, 1.6, 1.9, 0.6, 1.2);
    addBox(g, MAT.bush, 1.4, 1.0, 1.3, -1.8, 0.5, 1.4);
    addBox(g, MAT.bushDark, 1.2, 0.8, 1.1, 0.6, 0.4, -1.7);
    addBox(g, MAT.wood, 0.3, 1.4, 0.3, -2.6, 0.7, -1.6);
  } else {
    lat = 22;
    addBox(g, MAT.wood, 0.55, 7.2, 0.55, 0, 3.6, 0);
    addBox(g, MAT.wood, 0.34, 3.0, 0.34, -1.2, 5.2, 0).rotation.z = 0.75;
    addBox(g, MAT.wood, 0.3, 2.2, 0.3, 1.0, 6.0, 0.2).rotation.z = -0.6;
    addPine(g, 3.2, -1.2, 8.0, [MAT.pineDark, MAT.pineMid]);
    addPine(g, -3.6, 1.8, 6.6, [MAT.pineMid, MAT.pineDark]);
  }

  return { group: g, lat, spin: null };
}

/* ---------- Горы ---------- */
function addSnowCap(parent, w, y, z, d = null) {
  const depth = d == null ? w : d;
  return addBox(parent, MAT.snow, w, 0.42, depth, 0, y, z);
}

function buildMountainVariant(variant) {
  const g = new THREE.Group();
  let lat = 34;

  if (variant === 0) {
    lat = 36;
    addBox(g, MAT.rockDark, 7.0, 3.2, 6.0, 0, 1.6, 0).rotation.y = 0.18;
    addBox(g, MAT.rock, 5.4, 3.8, 4.6, 0.3, 4.8, -0.1).rotation.y = 0.4;
    addBox(g, MAT.rockLight, 3.8, 3.0, 3.2, -0.2, 7.8, 0.1).rotation.y = 0.1;
    addSnowCap(g, 4.1, 9.4, 0.1, 3.5);
    addBox(g, MAT.snow, 1.9, 0.8, 1.6, 0.7, 10.0, 0);
  } else if (variant === 1) {
    lat = 62;
    addBox(g, MAT.rockDark, 17, 7.5, 9, 0, 3.5, 0).rotation.y = 0.22;
    addBox(g, MAT.rock, 11, 8.0, 6.5, 3.4, 7.0, -1.2).rotation.y = 0.55;
    addBox(g, MAT.rockLight, 7.0, 5.4, 4.4, -1.6, 10.2, 0.8).rotation.y = 0.1;
    addSnowCap(g, 8.2, 12.1, 0.6, 4.8);
    addSnowCap(g, 5.0, 8.0, 3.2, 3.0);
  } else if (variant === 2) {
    lat = 25;
    const specs = [
      [2.6, 1.1, 2.2, 0, 0.55, 0],
      [1.7, 0.9, 1.5, 2.4, 0.45, 1.2],
      [1.2, 0.7, 1.1, -2.2, 0.35, 1.6],
      [0.9, 0.6, 0.8, 0.8, 0.3, -2.0],
      [1.4, 0.7, 1.2, -1.5, 0.35, -1.8]
    ];
    for (const [w, h, d, x, y, z] of specs) {
      addBox(g, MAT.rock, w, h, d, x, y, z).rotation.y = (x + z) * 0.3;
    }
  } else if (variant === 3) {
    lat = 27;
    addPine(g, 0, 0, 8.4, [MAT.pineDark, MAT.pineMid]);
    addPine(g, 3.0, 1.4, 6.2, [MAT.pineMid, MAT.pineDark]);
  } else {
    lat = 46;
    addBox(g, MAT.rockDark, 8.5, 8.0, 6.5, 0, 4.0, 0).rotation.y = 0.16;
    addBox(g, MAT.rock, 6.6, 4.4, 5.2, -0.4, 10.0, 0.2).rotation.y = 0.35;
    addBox(g, MAT.rockLight, 4.4, 2.6, 3.8, 0.1, 13.2, 0).rotation.y = 0.2;
    addSnowCap(g, 5.0, 14.6, 0, 4.2);
  }

  return { group: g, lat, spin: null };
}

/* ---------- МКАД ---------- */
function buildMkadVariant(variant) {
  const g = new THREE.Group();
  let lat = 42;

  if (variant === 0) {
    // Панельная высотка с лентами остекления.
    lat = 46;
    addBox(g, MAT.mkadPanel, 15, 46, 13, 0, 23, 0);
    for (let y = 5; y < 43; y += 5.2) {
      addBox(g, MAT.mkadGlass, 15.3, 1.0, 13.3, 0, y, 0);
    }
    addBox(g, MAT.mkadConcrete, 16.6, 1.3, 14.6, 0, 46.5, 0);
    addBox(g, MAT.mkadConcrete, 5.2, 2.2, 5.2, 2.6, 47.8, 1.4);
  } else if (variant === 1) {
    // Опора ЛЭП с проводами вдоль трассы.
    lat = 40;
    for (const x of [-3.1, 3.1]) {
      addBox(g, MAT.mkadMetal, 0.55, 29, 0.55, x, 14.5, -1.5).rotation.z = x * 0.022;
      addBox(g, MAT.mkadMetal, 0.55, 29, 0.55, x, 14.5, 1.5).rotation.z = x * 0.022;
    }
    for (let y = 9; y <= 25; y += 5.2) {
      addBox(g, MAT.mkadMetal, 15, 0.42, 0.42, 0, y, 0);
      addBox(g, MAT.mkadMetal, 0.34, 3.4, 0.34, -7.2, y + 1.7, 0);
      addBox(g, MAT.mkadMetal, 0.34, 3.4, 0.34, 7.2, y + 1.7, 0);
    }
    for (const x of [-7.2, -2.6, 2.6, 7.2]) {
      addBox(g, MAT.wire, 0.07, 0.07, 34, x, 27.6, 0);
    }
  } else if (variant === 2) {
    // Двойные мачты освещения.
    lat = 36;
    for (const x of [-3.4, 3.4]) {
      const pole = new THREE.Mesh(cylinder(0.16, 0.22, 14, 7), MAT.mkadMetal);
      pole.position.set(x, 7, 0);
      pole.castShadow = true;
      g.add(pole);
      const arm = addBox(g, MAT.mkadMetal, 2.2, 0.16, 0.16, x + (x < 0 ? 1.1 : -1.1), 13.6, 0);
      arm.rotation.z = 0;
      addBox(g, MAT.mkadLight, 0.9, 0.16, 0.34, x + (x < 0 ? 2.1 : -2.1), 13.48, 0);
    }
    addBox(g, MAT.mkadMetal, 7.2, 0.2, 0.2, 0, 12.9, 0);
  } else if (variant === 3) {
    // Офисная башня с рекламной полосой.
    lat = 52;
    addBox(g, MAT.mkadPanelLight, 20, 34, 15, 0, 17, 0);
    addBox(g, MAT.mkadGlass, 4.6, 2.4, 0.4, 0, 27.5, 7.6);
    addBox(g, MAT.mkadLight, 12.8, 0.5, 0.3, 0, 31.5, 7.66);
    addBox(g, MAT.mkadConcrete, 21.4, 0.9, 16.2, 0, 34.3, 0);
    for (let x = -7; x <= 7; x += 3.5) {
      addBox(g, MAT.mkadPanel, 0.35, 30, 0.35, x, 15, 7.7);
    }
  } else {
    // Шумозащитный экран вдоль МКАД.
    lat = 32;
    addBox(g, MAT.mkadConcrete, 0.4, 4.4, 30, 0, 2.2, 0);
    for (let z = -12; z <= 12; z += 6) {
      addBox(g, MAT.mkadMetal, 0.55, 4.8, 0.55, 0, 2.4, z);
    }
    addBox(g, MAT.mkadGlass, 0.2, 2.4, 29.4, 0.16, 2.6, 0);
  }

  return { group: g, lat, spin: null };
}

function buildVariant(biome, variant) {
  const id = BIOMES[biome] && BIOMES[biome].id;
  if (id === 'field') return buildFieldVariant(variant);
  if (id === 'forest') return buildForestVariant(variant);
  if (id === 'mountain') return buildMountainVariant(variant);
  if (id === 'mkad') return buildMkadVariant(variant);
  throw new Error(`Для биома «${id || biome}» нет пула декораций: город собирается в roadside.js`);
}

/* Профиль откоса. Те же точки рисует лента в roadSurface.js через G.shoulder. */
const SHOULDER = {
  lip: 12.7,
  berm: 22,
  far: 95,
  lipY: 0.08,
  bermY: 1.8,
  farY: -4.5,
  /** Бордюр 0.35 м + тротуар 3.2 м. Откос начинается за ними, по весу города. */
  cityEdge: 3.55
};

/** Высота земли в мировой точке lat. Профиль тот же, что у откоса этой кромки. */
function groundOffset(lat, s) {
  const frame = frameAt(s);
  const side = lat < frame.origin ? -1 : 1;
  const edge = worldEdge(frame.world, side, frame.origin);
  const fromCenter = Math.abs(edge - frame.origin);
  const cityOuter = SHOULDER.cityEdge * cityWeightAtS(s);
  const lats = shoulderLats(fromCenter, cityOuter, SHOULDER);
  return shoulderHeight(Math.abs(lat - frame.origin), lats, SHOULDER);
}

/* ---------- Состояние, баннеры и HUD ---------- */
let saveTimer = 0;
let bannerTimer = 0;
let lastRunZone = -1;
let lastHudKey = '';
let lastSplitKey = '';
const spinners = [];
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
  if (els.icon) els.icon.textContent = biome.icon;
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
  if (ico) ico.textContent = biome.icon;
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
  if (els.leftIco) els.leftIco.textContent = leftBiome.icon;
  if (els.leftName) els.leftName.textContent = leftBiome.short;
  if (els.rightIco) els.rightIco.textContent = rightBiome.icon;
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
let lastSplitZone = -1;
let lastSplitSide = -1;

function applyLaneConfig(dominant, playerS) {
  if (dominant !== lastLaneBiome) {
    const cfg = LANE_CONFIG[dominant];
    G.laneCount = cfg.count;
    G.oncomingCount = cfg.oncomingCount;
    G.LANE_OFFSETS = cfg.offsets.slice();
    G.LANE_SPEEDS = cfg.speeds.slice();
    G.ROAD_WIDTH = cfg.width;
    G.START_LANE = cfg.startLane;
    lastLaneBiome = dominant;
    // Полос стало меньше (4 → 2) или смещения другого масштаба (МКАД):
    // плавно уводим байк на валидную полосу нового биома.
    const outer = cfg.offsets[cfg.count - 1];
    if (Number.isFinite(G.laneOffset) && Math.abs(G.laneOffset) > outer + 1.2) {
      G.laneAssistTarget = nearestRunLane(G.laneOffset, cfg);
    }
    if (G.remapTrafficLanes) G.remapTrafficLanes(cfg);
  }
  const limits = logicalRoadLimits(localEdgesAt(playerS), laneDisplayScaleAtS(playerS), exitHold);
  G.roadEdgeMin = limits.min;
  G.roadEdgeMax = limits.max;
  G.ROAD_EDGE = Math.max(Math.abs(limits.min), limits.max);
}

function updateScenery() {
  if (!G.updateBiomeScenery) return;
  G.updateBiomeScenery();
}

/** Полосы биома, которым нарисована дорога в точке s. Без s — под байком. */
function lanesAtS(s) {
  const at = Number.isFinite(s) ? s : G.playerS;
  return LANE_CONFIG[biomeIndex(roadBiomeAtS(at))];
}

/** Случайная попутная полоса биома в точке s. */
function randomRunLane(s) {
  const cfg = lanesAtS(s);
  const same = Math.max(1, cfg.count - cfg.oncomingCount);
  return cfg.oncomingCount + Math.floor(Math.random() * same);
}

function commitSplit(zone, side, commitMeters) {
  if (chosenZones.has(zone)) return;
  const choices = splitChoices[zone] || getBiomeChoices(zoneBiomeAt(zone), G.visitCounts);
  const chosen = choices[side === 1 ? 1 : 0];
  chosenZones.add(zone);
  chosenExit[zone] = side === 1 ? 1 : -1;
  if (side === 1 && chosenOrigin[zone] == null) {
    chosenOrigin[zone] = exitCarryOrigin(roadWidthAtS(G.playerS) * 0.5, originBefore(zone));
  }
  if (Number.isFinite(commitMeters)) splitCommitMeters[zone] = commitMeters;
  lastSplitZone = zone;
  lastSplitSide = side === 1 ? 1 : 0;
  zoneBiomes[zone + 1] = chosen;
  // Снимаем фикс профиля следующей зоны, чтобы он совпал с фактическим выбором.
  delete roadLock[zone + 1];
  G.pendingBiome = chosen;
  G.visitCounts = G.visitCounts || ZERO_VISITS();
  G.visitCounts[chosen] = Math.min(2, (G.visitCounts[chosen] || 0) + 1);
  G.currentBiome = chosen;
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
  if (G.started && !G.ended) {
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

  const splitM = (zone + 1) * ZONE_M - SPLIT_LEAD;
  const splitD = meters - splitM;
  const choices = splitChoices[zone] || getBiomeChoices(zoneBiomeAt(zone), G.visitCounts || ZERO_VISITS());
  splitChoices[zone] = choices;

  updateExitHold(meters, zone);
  const chosenBefore = chosenZones.has(zone);
  const previewSide = chosenBefore
    ? (G.pendingBiome === choices[1] ? 1 : 0)
    : (exitHold ? 1 : 0);

  // Выбор фиксируется в конце параллельного участка. До этого следующая
  // локация не переписывается: уход со съезда обратно на прямую остаётся прямым.
  if (G.started && !G.ended && !chosenBefore && splitD >= SPLIT_AUTO_D) {
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
  G.biomeCityWeight = cityWeight;
  G.biomeMkadWeight = mkadWeight;
  G.biomeTransition = {
    active: G.started && !G.ended && live.t > 0.001 && live.t < 0.999,
    from: live.a,
    to: live.b,
    t: live.t
  };

  const chosenSide = splitPick(chosen ? (G.pendingBiome === choices[1] ? 1 : 0) : -1);
  const bannerSide = branchPick(previewSide);
  G.splitState = {
    active: G.started && !G.ended && splitD > -SPLIT_BANNER_AHEAD && splitD < SPLIT_AUTO_D + EXIT_END,
    zone,
    meters: splitM,
    splitMeters: splitM,
    s: splitM - G.biomeOffsetM,
    d: splitD,
    side: bannerSide,
    previewSide: bannerSide,
    chosen,
    chosenSide,
    choices: choices.slice(),
    chosenBiome: G.pendingBiome,
    autoAt: SPLIT_AUTO_D
  };

  updateBanner(dt);
  // currentBiome читаем после commitSplit: в кадре авто-выбора чип должен
  // сразу показать новый биом, а не обновиться следующим кадром.
  updateBiomeChip(G.currentBiome);
  applyLaneConfig(roadBiomeAtS(G.playerS), G.playerS);

  // Lane-assist после развилки: съезд должен мягко вывести байк в ближайшую
  // попутную полосу объединённой дороги, а не бросать «как поедет».
  if (G.started && !G.ended) {
    const cfg = lanesAtS(G.playerS);
    if (exitHold) G.laneAssistTarget = null;
    else if (lastSplitZone >= 0) {
      const since = meters - (lastSplitZone + 1) * ZONE_M;
      // После развилки мягко ведём байк в попутную полосу.
      if (since > -20 && since < 420) {
        const target = nearestRunLane(G.laneOffset, cfg);
        if (Math.abs(G.laneOffset - target) > 0.35) G.laneAssistTarget = target;
      } else if (since >= 420) {
        lastSplitZone = -1;
        lastSplitSide = -1;
      }
    }
    if (G.laneAssistTarget != null
      && Math.abs(G.laneOffset - G.laneAssistTarget) < 0.3) {
      G.laneAssistTarget = null;
    }
  }

  updateTerrainTint(weights);
  G.biomeTraffic = BIOMES[dominant].traffic;

  const showSplit = !!G.splitState.active;
  updateSplitBanner(showSplit ? {
    show: true,
    left: choices[0],
    right: choices[1],
    previewSide,
    chosenSide,
    chosen
  } : null);

  for (const sp of spinners) {
    sp.mesh.rotation.z += sp.speed * dt;
  }

  updateScenery();
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
  for (const key of Object.keys(chosenOrigin)) delete chosenOrigin[key];
  // План следующей зоны пересобирается под свежие счётчики посещений.
  delete splitChoices[zone];
  delete splitChoices[zone + 1];
  zoneBiomes[zone + 1] = null;
  ensureZonePlan(zone);
  ensureZonePlan(zone + 1);
  lastRunZone = zone;
  lastLaneBiome = -1;
  lastSplitZone = -1;
  lastSplitSide = -1;
  exitHold = false;
  for (const key of Object.keys(roadLock)) delete roadLock[key];
  for (const key of Object.keys(splitCommitMeters)) delete splitCommitMeters[key];
  dropRoadCache();
  clearBranchPaths();
  G.laneAssistTarget = null;
  saveTimer = 0;
  hideBiomeBanner();
  hideSplitBanner();
  G.splitState = null;
  if (G.resetBiomeScenery) G.resetBiomeScenery();
  applyLaneConfig(zoneBiomeAt(zone), G.playerS);
}

/* ---------- Меню и пауза ---------- */
function biomeDisplayInfo() {
  const meters = Math.max(0, G.biomeStoredMeters || 0);
  const zone = Math.max(0, Math.floor(meters / ZONE_M));
  ensureZonePlan(zone);
  const current = zoneBiomeAt(zone);
  const splitM = (zone + 1) * ZONE_M - SPLIT_LEAD;
  const span = ZONE_M - SPLIT_LEAD;
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
    return `<span title="посещений: ${visits[b] || 0}/2">${biome.icon} ${biome.short}</span>`;
  }).join('<i>·</i>');
  return `<div class="biome-strip">
    <span class="biome-strip-icon">${info.biome.icon}</span>
    <div class="biome-strip-main">
      <div class="biome-strip-row"><b>${info.biome.short}</b><span>развилка: ${marks} · ${(info.leftM / 1000).toFixed(1)} км</span></div>
      <div class="biome-strip-bar"><i style="width:${pct}%"></i></div>
    </div>
  </div>`;
}

function biomePauseValue() {
  const info = biomeDisplayInfo();
  return `${info.biome.icon} ${info.biome.short} · ${Math.round(info.progress * 100)}%`;
}

/* ---------- Инициализация ---------- */
export function initBiome() {
  G.biomeMetersAt = blendMetersAt;
  G.biomeRoadX = biomeRoadX;
  G.biomeRoadDX = biomeRoadDX;
  G.biomeRoadDDX = biomeRoadDDX;
  G.biomeRoadY = biomeRoadY;
  G.biomeRoadDY = biomeRoadDY;
  G.biomeRoadDDY = biomeRoadDDY;
  G.cityWeightAtS = cityWeightAtS;
  G.mkadWeightAtS = mkadWeightAtS;
  G.biomeWeightsAtS = biomeWeightsAtS;
  G.roadWidthAtS = roadWidthAtS;
  G.nominalRoadWidth = LANE_CONFIG[CITY].width;
  G.forkSpreadAtS = forkSpreadAtS;
  G.roadOriginAt = (s) => frameAt(s).origin;
  G.embedRoad = embedRoad;
  G.roadCurvature = roadCurvature;
  G.roadBlockAt = (s) => frameAt(s).block;
  G.builtBlocksAt = (s) => exitChain(forkChosenSideAtS(s));
  G.riderLatAt = riderLatAt;
  G.exitReservedAt = exitReservedAt;
  G.forkChosenSideAtS = forkChosenSideAtS;
  G.forkCloseAtS = forkCloseAtS;
  G.roadEdgesAt = roadEdgesAt;
  G.roadsideFrameAt = (s) => {
    const frame = frameAt(s);
    return { edges: frame.world, chosenSide: frame.chosen, origin: frame.origin };
  };
  G.besidePose = besidePose;
  G.medianRoom = medianRoom;
  G.medianFits = medianFits;
  G.medianPose = medianPose;
  G.roadOuterLat = roadOuterLat;
  G.roadBiomeAtS = roadBiomeAtS;
  G.splitAmountAtS = splitAmountAtS;
  G.splitCenterS = splitCenterS;
  G.shoulder = SHOULDER;
  G.groundOffset = groundOffset;
  G.laneDisplayScaleAtS = laneDisplayScaleAtS;
  G.laneMarksAtS = laneMarksAtS;
  G.laneWorldOffsetAtS = laneWorldOffsetAtS;
  G.dominantBiomeAtS = dominantBiomeAtS;
  G.nearestRunLane = nearestRunLane;
  G.biomeProfile = biomeProfile;
  G.getLaneConfig = getLaneConfig;
  G.getBiomeChoices = getBiomeChoices;
  G.forkView = 0;
  G.biomeState = null;
  G.biomeTransition = { active: false, from: 0, to: 0, t: 0 };
  G.splitState = null;
  G.biomeTraffic = BIOMES[CITY].traffic;

  G.visitCounts = ZERO_VISITS();
  G.pendingBiome = null;
  G.currentBiome = 0;
  G.laneAssistTarget = null;

  const stored = readStoredMeters();
  G.biomeStoredMeters = stored;
  G.biomeOffsetM = stored;

  const zone = Math.max(0, Math.floor(stored / ZONE_M));
  readPlan();
  const savedCurrent = readInt(CURRENT_KEY, -1);
  G.currentBiome = savedCurrent >= 0 && savedCurrent < BIOMES.length ? savedCurrent : 0;
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
  applyLaneConfig(G.currentBiome, 0);

  G.updateBiome = updateBiome;
  G.resetBiomeRun = resetBiomeRun;
  G.randomRunLane = randomRunLane;
  G.lanesAtS = lanesAtS;
  G.persistBiome = persistBiome;
  G.biomeMenuMarkup = biomeMenuMarkup;
  G.biomePauseValue = biomePauseValue;
  G.biomeDisplayInfo = biomeDisplayInfo;
  G.hideBiomeBanner = hideBiomeBanner;
  G.hideSplitBanner = hideSplitBanner;
  G.showBiomeBanner = (biomeIndexValue) => showBiomeBanner(BIOMES[biomeIndexValue] || BIOMES[0]);
  G.BIOMES = BIOMES;

  addEventListener('pagehide', persistBiome);
  addEventListener('beforeunload', persistBiome);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistBiome();
  });
}

/* ---------- Мир декораций ---------- */
export function initBiomeWorld() {
  buildMaterials();

  G.biomeScenery = [];
  G.resetBiomeScenery = () => {
    for (let i = 0; i < G.biomeScenery.length; i++) {
      G.biomeScenery[i].s = i * SCENERY_STEP;
      G.biomeScenery[i].placedS = NaN;
    }
  };

  for (let i = 0; i < SCENERY_SLOTS; i++) {
    /** @type {import('./game-state.d.ts').ScenerySlot} */
    const slot = { s: i * SCENERY_STEP, placedS: NaN, left: [], right: [] };
    for (const side of [-1, 1]) {
      const list = side < 0 ? slot.left : slot.right;
      for (let biome = 1; biome < BIOMES.length; biome++) {
        const variant = ((i * 3 + (side > 0 ? 2 : 0) + biome) % 5 + 5) % 5;
        const built = buildVariant(biome, variant);
        const meshes = [];
        built.group.traverse((obj) => {
          if (obj.isMesh) meshes.push(obj);
        });
        built.group.visible = false;
        G.scene.add(built.group);
        list.push({
          biome,
          group: built.group,
          meshes,
          lodFar: false,
          yaw: built.group.rotation.y,
          lat: built.lat + ((i + biome) % 3) * 2.2,
          ds: (((i * 7 + biome * 5 + (side > 0 ? 3 : 0)) % 9) - 4) * 1.4,
          spin: built.spin
        });
        if (built.spin) spinners.push(built.spin);
      }
    }
    G.biomeScenery.push(slot);
  }

  G.updateBiomeScenery = () => {
    for (const slot of G.biomeScenery) {
      slot.s = keepInWindow(slot.s, G.playerS, 90, Infinity, SCENERY_SPAN);
      const w = G.biomeWeightsAtS(slot.s);
      for (const side of [-1, 1]) {
        const list = side < 0 ? slot.left : slot.right;
        for (const entry of list) {
          const bw = w[entry.biome] || 0;
          const s = slot.s + entry.ds;
          const visible = bw > 0.12;
          entry.group.visible = visible;
          if (!visible) continue;
          const sceneryScale = BIOMES[entry.biome].sceneryScale || 1;
          entry.group.scale.setScalar(sceneryScale);
          const sideSign = side < 0 ? -1 : 1;
          const frame = frameAt(s);
          const edge = worldEdge(frame.world, sideSign, frame.origin);
          const gap = Math.max(8, entry.lat - Math.abs(edge - frame.origin));
          const pose = besidePose(
            { edges: frame.world, chosenSide: frame.chosen, origin: frame.origin },
            { side: sideSign, gap, inset: 0 }
          );
          if (pose.lateral == null) continue;
          const far = Math.abs(s - G.playerS) > 165;
          if (far !== entry.lodFar) {
            entry.lodFar = far;
            for (let k = 2; k < entry.meshes.length; k++) entry.meshes[k].visible = !far;
          }
          G.placeOnRoad(
            entry.group,
            s,
            pose.lateral,
            groundOffset(pose.lateral, s),
            entry.yaw
          );
        }
      }
    }
  };
}
