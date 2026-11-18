import * as THREE from 'three';
import { box, cylinder } from './geom.js';
import { laneDashOffsets } from './engine/lanes.js';
import { keepInWindow } from './engine/stream.js';
import { FORK_LEAD, FORK_SPREAD, collapsedEdges, forkAmountAt, forkClose, forkHandoff, forkSide, forkSpreadAt, logicalRoadLimits, shoulderHeight, shoulderLats } from './engine/fork.js';
import { cos, makeProfile, mixDeriv, mixSecond, mixValue, sin } from './engine/profile.js';
import { G } from './state.js';

/* =========================================================================
 * БИОМЫ: ПЛАН ЗАЕЗДА, ПРОФИЛЬ ДОРОГИ, РАЗВИЛКИ, ДЕКОРАЦИИ И СОХРАНЕНИЕ
 * -------------------------------------------------------------------------
 * Биом — функция пройденного пути, а не кадра. Живой биом (полосы, декор,
 * небо) и закреплённый профиль дороги читают одну точку маршрута, но разные
 * индексы. Замок зоны ставится в момент выбора ветки, не раньше: до выбора
 * профиль едет за стороной байка. Полосы на асфальте читают тот же индекс.
 * Развилка — две ленты из js/engine/fork.js, не островок посреди полотна.
 * ========================================================================= */

const ZONE_M = 1500;              // длина одной локации
const FADE_M = 150;              // кросс-фейд развязки (сход выбранной ветки)
const ROAD_FADE_M = 350;         // плавный переход профиля/ширины дороги между биомами после границы зоны, метров
const SPLIT_LEAD = FORK_LEAD;
const SPLIT_AUTO_D = 30;         // авто-выбор после центра развилки
const SPLIT_BANNER_AHEAD = 260;  // баннер выбора появляется за столько метров
const STORAGE_KEY = 'bajajGO_biomeKm';
const CURRENT_KEY = 'bajajGO_currentBiome';
const VISITS_KEY = 'bajajGO_visitCounts';
const PENDING_KEY = 'bajajGO_pendingBiome';
const PLAN_KEY = 'bajajGO_biomePlan';
const SCENERY_SLOTS = 20;
const SCENERY_STEP = 28;
const SCENERY_SPAN = SCENERY_SLOTS * SCENERY_STEP;

const BIOMES = [
  {
    id: 'city', name: 'ГОРОД', icon: '🏙️',
    sub: 'МНОГОЭТАЖКИ · ВЫВЕСКИ · ПЕШЕХОДЫ',
    short: 'Город', accent: 0x4fc3f7,
    lanes: 4, oncoming: 2, laneWidth: 4.75,
    speeds: [40, 60, 70, 55],
    sceneryScale: 1,
    traffic: {
      count: 18,
      pref: ['sedan', 'taxi', 'hatchback', 'crossover', 'bus', 'qute_traffic', 'suv', 'gazelle_flatbed', 'gazelle_van', 'kamaz', 'truck']
    }
  },
  {
    id: 'field', name: 'ПОЛЯ', icon: '🌾',
    sub: 'ПШЕНИЦА · ВЕТРЯКИ · АМБАРЫ',
    short: 'Поля', accent: 0xffb300,
    lanes: 4, oncoming: 2, laneWidth: 4.75,
    speeds: [40, 55, 65, 55],
    sceneryScale: 1,
    traffic: {
      count: 12,
      pref: ['gazelle_flatbed', 'gazelle_van', 'kamaz', 'truck', 'bus', 'sedan', 'taxi', 'crossover', 'suv', 'hatchback', 'qute_traffic']
    }
  },
  {
    id: 'forest', name: 'ЛЕС', icon: '🌲',
    sub: 'ЕЛИ · ВАЛУНЫ · ЛЕСНАЯ ДОРОГА',
    short: 'Лес', accent: 0x66bb6a,
    lanes: 4, oncoming: 2, laneWidth: 4.75,
    speeds: [35, 50, 60, 50],
    sceneryScale: 1,
    traffic: {
      count: 9,
      pref: ['sedan', 'hatchback', 'crossover', 'suv', 'taxi', 'qute_traffic', 'bus', 'gazelle_van', 'gazelle_flatbed', 'kamaz', 'truck']
    }
  },
  {
    id: 'mountain', name: 'ГОРЫ', icon: '🏔️',
    sub: 'СЕРПАНТИН · СКАЛЫ · ПЕРЕВАЛ',
    short: 'Горы', accent: 0xb0bec5,
    lanes: 2, oncoming: 1, laneWidth: 4.6,
    speeds: [40, 55],
    sceneryScale: 2.15,
    traffic: {
      count: 10,
      pref: ['truck', 'kamaz', 'gazelle_flatbed', 'gazelle_van', 'bus', 'suv', 'crossover', 'sedan', 'hatchback', 'taxi', 'qute_traffic']
    }
  },
  {
    id: 'mkad', name: 'МКАД', icon: '🛣️',
    sub: '8 ПОЛОС · ЭСТАКАДЫ · РАЗВЯЗКИ',
    short: 'МКАД', accent: 0xff7043,
    lanes: 8, oncoming: 4, laneWidth: 4.3,
    speeds: [50, 65, 75, 85, 85, 75, 65, 55],
    sceneryScale: 1.45,
    traffic: {
      // Плотность вдвое выше города: 36 машин против 18.
      count: 36,
      pref: ['sedan', 'crossover', 'suv', 'taxi', 'hatchback', 'bus', 'gazelle_van', 'kamaz', 'truck', 'gazelle_flatbed', 'qute_traffic']
    }
  }
];

const CITY = BIOMES.findIndex((biome) => biome.id === 'city');
const MKAD = BIOMES.findIndex((biome) => biome.id === 'mkad');
if (CITY < 0 || MKAD < 0) throw new Error('В BIOMES нет city или mkad');

const TRANSITION_IDS = {
  city: ['mountain', 'mkad'],
  field: ['city', 'forest'],
  forest: ['field', 'mountain'],
  mountain: ['city', 'forest'],
  mkad: ['city', 'field']
};
const TRANSITIONS = BIOMES.map((biome) => {
  const next = TRANSITION_IDS[biome.id];
  if (!next || next.length !== 2) throw new Error(`Нет двух переходов из биома ${biome.id}`);
  return next.map((id) => {
    const index = BIOMES.findIndex((item) => item.id === id);
    if (index < 0) throw new Error(`Переход ${biome.id} → ${id} указывает на неизвестный биом`);
    return index;
  });
});

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

/* ---------- Конфигурация полос ---------- */
function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function biomeIndex(value) {
  return clampInt(value, 0, BIOMES.length - 1, 0);
}

function makeLaneConfig(biome) {
  const offsets = [];
  const half = (biome.lanes - 1) * 0.5;
  for (let i = 0; i < biome.lanes; i++) offsets.push((i - half) * biome.laneWidth);
  return {
    id: biome.id,
    count: biome.lanes,
    oncomingCount: biome.oncoming,
    laneWidth: biome.laneWidth,
    width: biome.lanes * biome.laneWidth,
    offsets,
    speeds: biome.speeds.slice(),
    startLane: offsets[biome.lanes - 1]
  };
}

const LANE_CONFIG = BIOMES.map(makeLaneConfig);

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
    const plan = { zones: {}, choices: {}, chosen: [] };
    for (let z = Math.max(0, zone - 2); z <= zone + 4; z++) {
      if (zoneBiomes[z] != null) plan.zones[z] = biomeIndex(zoneBiomes[z]);
      if (splitChoices[z]) plan.choices[z] = splitChoices[z].slice(0, 2);
      if (chosenZones.has(z)) plan.chosen.push(z);
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
let previewStableZone = -1;
let previewStableSide = 0;

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
  return forkSpreadAtMeters(blendMetersAt(s));
}

/** Ширина одной ветки. Зазор между ветками сюда не входит: его рисует полотно отдельно. */
function roadWidthAtS(s) {
  return baseRoadWidthAtMeters(blendMetersAt(s));
}

function splitAmountAtS(s) {
  return splitAmountAtMeters(blendMetersAt(s));
}

/** Центр развилки в координате s игрока. Единственная формула, её читает и полотно. */
function splitCenterS(playerS) {
  const offset = Number.isFinite(G.biomeOffsetM) ? G.biomeOffsetM : 0;
  const meters = Math.max(0, offset + playerS);
  const zone = Math.floor(meters / ZONE_M);
  return (zone + 1) * ZONE_M - SPLIT_LEAD - offset;
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

/** -1 слева, +1 справа, 0 пока развилка этой зоны не выбрана. */
function forkChosenSideForZone(zone) {
  if (!chosenZones.has(zone)) return 0;
  const choices = splitChoices[zone];
  const next = zoneBiomes[zone + 1];
  if (!choices || next == null) return 0;
  return biomeIndex(next) === biomeIndex(choices[1]) ? 1 : -1;
}

function routeAt(s) {
  const meters = Math.max(0, blendMetersAt(s));
  const zone = Math.floor(meters / ZONE_M);
  return { meters, zone, local: meters - zone * ZONE_M };
}

/** Сторона и остаток закрытия прошлой зоны. В новой зоне они сходят за FADE_M. */
function previousChoice(route) {
  if (route.zone <= 0) return { side: 0, close: 0 };
  const side = forkChosenSideForZone(route.zone - 1);
  if (side === 0) return { side: 0, close: 0 };
  // Вес решения фиксируем на границе зоны: собственный вклад зоны Z-1 домножен
  // на splitDecisionWeight (плавный ввод выбора). Без этого на границе зон был
  // скачок (own*weight -> prev*1), из-за чего дорога перестраивалась и декорации
  // оказывались на полотне.
  const boundaryM = route.zone * ZONE_M;
  const w = splitDecisionWeight(route.zone - 1, boundaryM);
  // Сдвиг/закрытие ветки гасим за FADE_M сразу после развязки. Дольше держать
  // их не нужно: при spread=0 дорога уже единая, а затяжной сход сдвига даёт
  // ощущение перестройки и смещает дорогу относительно расставленных объектов.
  const close = w * (1 - forkHandoff(route.local, FADE_M));
  return { side, close };
}

function forkChosenSideAtS(s) {
  const route = routeAt(s);
  const own = forkChosenSideForZone(route.zone);
  if (own !== 0) return own;
  const prev = previousChoice(route);
  return prev.close > 0 ? prev.side : 0;
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

function forkCenterShiftAtS(s) {
  const route = routeAt(s);
  const prev = previousChoice(route);
  const own = forkChosenSideForZone(route.zone);
  const ownShift = own === 0 ? 0
    : own * FORK_SPREAD * forkClose(route.meters, ZONE_M, SPLIT_LEAD)
      * splitDecisionWeight(route.zone, route.meters);
  return ownShift + prev.side * FORK_SPREAD * prev.close;
}

function forkCloseAtS(s) {
  const route = routeAt(s);
  const own = forkChosenSideForZone(route.zone);
  const ownClose = own === 0 ? 0
    : forkClose(route.meters, ZONE_M, SPLIT_LEAD)
      * splitDecisionWeight(route.zone, route.meters);
  const prev = previousChoice(route);
  return Math.max(ownClose, prev.close);
}

/** Кромки асфальта в точке s, уже со схлопыванием чужой ленты. Без сдвига оси. */
function roadEdgesAt(s) {
  return collapsedEdges(
    roadWidthAtS(s) * 0.5,
    forkSpreadAtS(s),
    forkChosenSideAtS(s),
    forkCloseAtS(s)
  );
}

function roadOuterLat(s, side) {
  const edge = roadEdgesAt(s);
  return side < 0 ? edge.leftOuter : edge.rightOuter;
}

function splitLateralShiftAtS(s, lateralOffset) {
  const spread = forkSpreadAtS(s);
  if (spread <= 0.001) return 0;
  return forkSide(lateralOffset) * spread;
}

/** Логическое смещение полосы → позиция на дороге с учётом ширины и развилки. */
function laneWorldOffsetAtS(s, lateralOffset) {
  return lateralOffset * laneDisplayScaleAtS(s) + splitLateralShiftAtS(s, lateralOffset);
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

/** Высота земли на удалении lat от оси. Линейка та же, что у ленты откоса в этой точке. */
function groundOffset(lat, s) {
  const asphalt = Math.abs(roadOuterLat(s, lat < 0 ? -1 : 1));
  const cityOuter = SHOULDER.cityEdge * cityWeightAtS(s);
  const lats = shoulderLats(asphalt, cityOuter, SHOULDER);
  return shoulderHeight(lat, lats, SHOULDER);
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

/** @returns {{root: HTMLElement, left: HTMLElement|null, right: HTMLElement|null, leftIco: HTMLElement|null, leftName: HTMLElement|null, rightIco: HTMLElement|null, rightName: HTMLElement|null}|null} */
function splitEls() {
  const root = document.getElementById('split-banner');
  if (!root) return null;
  const q = (sel) => /** @type {HTMLElement|null} */ (root.querySelector(sel));
  return {
    root,
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
  const limits = logicalRoadLimits(roadEdgesAt(playerS), laneDisplayScaleAtS(playerS), forkSpreadAtS(playerS));
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

  // Превью развилки с гистерезисом: мелкое рыскание у центра не должно
  // перекидывать дорогу/биом следующей зоны туда-сюда. Смена стороны возможна
  // только при явном смещении в другую полосу.
  if (zone !== previewStableZone) {
    previewStableZone = zone;
    previewStableSide = zoneBiomes[zone + 1] === choices[1] ? 1 : 0;
  }
  let previewSide = previewStableSide;
  if (G.laneOffset < -1.2) previewSide = 0;
  else if (G.laneOffset > 1.2) previewSide = 1;

  const chosenBefore = chosenZones.has(zone);
  // Биом следующей зоны закрепляем заранее (пока её морфинг ещё вне видимости),
  // чтобы впереди не было резкой перестройки дороги/объектов. Переключить можно
  // только один раз и только при уверенном выборе другой стороны — иначе оставляем
  // как есть до фактического коммита развилки.
  const PREVIEW_LOCK_AHEAD = 420;
  if (!chosenBefore && roadLock[zone + 1] == null && splitD > -PREVIEW_LOCK_AHEAD) {
    const desired = choices[previewSide];
    if (zoneBiomes[zone + 1] !== desired) {
      // В самом начале окна позволяем выбрать сторону один раз; дальше — только
      // при явном уходе на другую сторону, и не прямо перед развилкой.
      const early = splitD < -PREVIEW_LOCK_AHEAD + 40;
      const strongSwitch = previewSide !== previewStableSide && Math.abs(G.laneOffset) > 3.2 && splitD < -SPLIT_BANNER_AHEAD - 20;
      if (early || strongSwitch) {
        zoneBiomes[zone + 1] = desired;
        previewStableSide = previewSide;
        dropRoadCache();
      } else {
        previewSide = previewStableSide;
      }
    } else {
      previewStableSide = previewSide;
    }
  }

  // Авто-выбор, если игрок не ушёл на ветку до sSplit + 30.
  if (G.started && !G.ended && !chosenBefore && splitD >= SPLIT_AUTO_D) {
    commitSplit(zone, previewSide, meters);
  }
  // commitSplit мог выбрать биом прямо в этом кадре — HUD и баннер должны
  // увидеть решение сразу, а не следующим кадром.
  const chosen = chosenZones.has(zone);
  if (chosen) {
    previewStableSide = G.pendingBiome === choices[1] ? 1 : 0;
  }
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

  const chosenSide = chosen ? (G.pendingBiome === choices[1] ? 1 : 0) : -1;
  G.splitState = {
    active: G.started && !G.ended && splitD > -SPLIT_BANNER_AHEAD && splitD < SPLIT_LEAD + 30,
    zone,
    meters: splitM,
    splitMeters: splitM,
    s: splitM - G.biomeOffsetM,
    d: splitD,
    side: previewSide,
    previewSide,
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
    if (lastSplitZone >= 0) {
      const since = meters - (lastSplitZone + 1) * ZONE_M;
      // Сход сдвига ветки идёт ~FADE_M в начале новой зоны; ведём в попутную
      // полосу на всём участке слияния и чуть дальше для стабилизации.
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
  previewStableZone = -1;
  previewStableSide = 0;
  for (const key of Object.keys(roadLock)) delete roadLock[key];
  for (const key of Object.keys(splitCommitMeters)) delete splitCommitMeters[key];
  dropRoadCache();
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
  G.forkCenterShiftAtS = forkCenterShiftAtS;
  G.forkChosenSideAtS = forkChosenSideAtS;
  G.forkCloseAtS = forkCloseAtS;
  G.roadEdgesAt = roadEdgesAt;
  G.roadOuterLat = roadOuterLat;
  G.roadBiomeAtS = roadBiomeAtS;
  G.splitAmountAtS = splitAmountAtS;
  G.splitCenterS = splitCenterS;
  G.shoulder = SHOULDER;
  G.groundOffset = groundOffset;
  G.splitLateralShiftAtS = splitLateralShiftAtS;
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
          const visible = bw > 0.12;
          entry.group.visible = visible;
          if (!visible) continue;
          const s = slot.s + entry.ds;
          const sceneryScale = BIOMES[entry.biome].sceneryScale || 1;
          entry.group.scale.setScalar(sceneryScale);
          const lat = Math.max(entry.lat, Math.abs(roadOuterLat(s, side)) + 8);
          const far = Math.abs(s - G.playerS) > 165;
          if (far !== entry.lodFar) {
            entry.lodFar = far;
            for (let k = 2; k < entry.meshes.length; k++) entry.meshes[k].visible = !far;
          }
          G.placeOnRoad(
            entry.group,
            s,
            side * lat,
            groundOffset(lat, s),
            entry.yaw
          );
        }
      }
    }
  };
}
