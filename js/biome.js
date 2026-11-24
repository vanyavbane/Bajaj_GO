import * as THREE from 'three';
import { box, cylinder } from './geom.js';
import { BIOMES, biomeIndexOf, laneLayoutOf, storedBiomeIndex, storedVisits, transitionIndexes } from './engine/biomes.js';
import { carriageAt, carriageLat, laneMarks, riderCarriage, roadsAt, sideRibbon, solidMarks } from './engine/carriage.js';
import { laneIndexByRoll, nearestLaneOffset } from './engine/lanes.js';
import { rescaleSeat, seatAxis, seatOnFrame, seatWorld, stepSeat } from './engine/seat.js';
import { keepInWindow } from './engine/stream.js';
import { arrivalTrail, carryLane, readExit, riddenCenter } from './engine/exit.js';
import { EXIT_LANE_HALF, asphaltSpan, besidePoint, branchPick, exitClock, forkOccupancy, forkOffset, forkSpreadAt, groundAt, groundEdge, laneAnchor, laneMeters, logicalRoadLimits, onExitRibbon, reachedExit, roadCenter, sampleRoad, shoulderHeight, shoulderLats, splitPick, stayOnAsphalt, vergeAt } from './engine/fork.js';
import { decideZone } from './engine/route.js';
import { EXIT_RIGHT, RIGHT_FORK, courseLayoutOf, createVectorField, openCourse, vectorSpawnOf, zoneAt, zoneNose } from './engine/vectors.js';
import { makeProfile, mixDeriv, mixSecond, mixValue } from './engine/profile.js';
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
 * ========================================================================= */

const ZONE_M = 1500;              // длина одной локации
const ROAD_FADE_M = 350;         // плавный переход профиля/ширины дороги между биомами после границы зоны, метров
const SPLIT_BANNER_AHEAD = 260;  // баннер выбора появляется за столько метров
const STORAGE_KEY = 'bajajGO_biomeKm';
const CURRENT_KEY = 'bajajGO_currentBiome';
const VISITS_KEY = 'bajajGO_visitCounts';
const PENDING_KEY = 'bajajGO_pendingBiome';
const PLAN_KEY = 'bajajGO_biomePlan';
const SCENERY_SLOTS = 20;
const SCENERY_STEP = 28;
const SCENERY_SPAN = SCENERY_SLOTS * SCENERY_STEP;
// Половина окна смены декора: новый биом виден за SCENERY_PREVIEW_M до границы,
// старый держится ещё SCENERY_PREVIEW_M после неё и уходит только за кадром.
const SCENERY_PREVIEW_M = 900;

const CITY = biomeIndexOf('city');
const MKAD = biomeIndexOf('mkad');
const EMBANKMENT = biomeIndexOf('embankment');
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

/** Биом, который уже можно показывать за развилкой. До выбора смотрим на сторону байка. */
function previewBiomeAt(zone) {
  const z = Math.max(0, Math.round(zone));
  if (chosenZones.has(z) || G.pendingBiome != null) return zoneBiomeAt(z + 1);
  const choices = splitChoices[z] || getBiomeChoices(zoneBiomeAt(z), G.visitCounts || ZERO_VISITS());
  const side = G.splitState && G.splitState.zone === z ? G.splitState.side : 0;
  return biomeIndex(choices[side === 1 ? 1 : 0]);
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

/** Центр развилки в координате s игрока. Единственная формула, её читает и полотно. */
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

/** Масштаб разметки: живая полуширина кадра и смещения его полос. */
function laneDisplayScaleAtS(s) {
  return roadCarriageAt(s).scale;
}

/** Штрихи шоссе. Это промежутки его полос, на его оси. */
function laneMarksAtS(s) {
  return laneMarks(roadCarriageAt(s));
}

/** Штрихи съезда, пока он ещё боковая лента. */
function ribbonHere(s) {
  return sideRibbon(roadCarriageAt(s), frameAt(s));
}

function ribbonMarksAtS(s) {
  const ribbon = ribbonHere(s);
  return ribbon ? laneMarks(ribbon) : [];
}

/** Двойная сплошная проезжей части. Лента въезда рисует свою отдельно. */
function solidMarksAtS(s) {
  return solidMarks(roadCarriageAt(s));
}

/** Двойная сплошная взятого въезда, пока он ещё лента. */
function ribbonSolidMarksAtS(s) {
  const frame = frameAt(s);
  if (frame.chosen !== 1) return [];
  const ribbon = ribbonHere(s);
  return ribbon ? solidMarks(ribbon) : [];
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
  const frame = frameAt(s);
  const lats = [];
  if (carriageBiomeAt(s, frame) === MKAD) {
    const at = markAxis(solidMarksAtS(s));
    if (at != null) lats.push(at);
  }
  if (frame.chosen === 1 && entranceBiome(s) === MKAD) {
    const at = markAxis(ribbonSolidMarksAtS(s));
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

function frameAt(s) {
  if (s === frameKey && frameHit) return frameHit;
  const route = routeAt(s);
  const side = decisionAt(route.zone).side;
  frameKey = s;
  frameHit = sampleRoad({
    forkDistance: forkOffset(route.meters, ZONE_M, EXIT_CLOCK.lead),
    half: catalogHalfAt(s),
    chosen: side,
    baseOrigin: 0,
    endWeight: splitDecisionWeight(route.zone, route.meters),
    arriveHalf: side === 1 ? arriveHalfAt(route.zone) : undefined,
  });
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

/**
 * Проезжая часть байка.
 * Пока байк не переехал на ленту съезда, декор и портал остаются на его текущей дороге.
 * После прихода въезда в новую дорогу лента исчезает, и проезжей частью становится новая дорога.
 */
function drivenCarriageAt(s) {
  return roadCarriageAt(s);
}

/** Портал и мост накрывают эту проезжую часть, не обе ленты. */
function drivenSpanAt(s) {
  const road = drivenCarriageAt(s);
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
  if (riderSeat.kind !== 'exit') return false;
  return roadCarriageAt(s).spot.ribbon != null;
}

/** Полоса этой проезжей части в мировых метрах. */
function drivenLaneAt(s, offset) {
  const road = drivenCarriageAt(s);
  const lane = Number.isFinite(offset) ? offset : 0;
  return carriageLat(road.axis, road.scale, lane);
}

function drivenLanesAt(s) {
  const at = Number.isFinite(s) ? s : G.playerS;
  return drivenCarriageAt(at).lanes;
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

function laneSpanAt(s) {
  const scale = laneDisplayScaleAtS(s);
  return Number.isFinite(scale) && scale !== 0 ? scale : 1;
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
  const frame = frameAt(s);
  const dom = carriageBiomeAt(s, frame);
  return carriageAt({
    frame,
    biome: LANE_CONFIG[dom] || LANE_CONFIG[0],
  });
}

/** Ширина живой проезжей части. В кадр уходит ширина каталога, без второго смешивания. */
function roadWidthAtS(s) {
  return roadCarriageAt(s).half * 2;
}

/** Полосы под байком. На боковой ленте это съезд, иначе проезжая часть точки. */
function playerLive(s) {
  const frame = frameAt(s);
  return riderCarriage(roadCarriageAt(s), frame, riderFrameSeat(s, G.laneOffset).kind);
}

/** Единственный перевод полосы в мировые метры. riding — байк ещё на боковой ленте. */
function roadMetersAt(s, laneOffset, riding) {
  return laneMeters(laneOffset, laneSpanAt(s), frameAt(s), riding);
}

/** Байк на дороге или на ленте съезда. В клине между ними его нет. */
function updateExitHold() {
  const frame = frameAt(G.playerS);
  const ridden = riderCarriage(roadCarriageAt(G.playerS), frame, riderSeat.kind);
  const scale = Number.isFinite(ridden.scale) && ridden.scale !== 0 ? ridden.scale : 1;
  const axis = seatAxis(frame, riderSeat.kind);
  const jumped = Number.isFinite(riderWorld) && Number.isFinite(riderAxis) && Math.abs(axis - riderAxis) > 0.05;
  const lane = jumped
    ? carryLane(riderWorld, axis, scale, G.laneOffset)
    : rescaleSeat({ kind: riderSeat.kind, lane: G.laneOffset }, riderSpan, scale, axis).lane;
  if (G.forkLabActive && Number.isFinite(G.forkLabLateral)) {
    const stick = riderSeat.kind === 'exit' ? 'exit' : 'road';
    const held = stayOnAsphalt(frame.local, G.forkLabLateral, stick);
    const kind = onExitRibbon(held, frame.local) ? 'exit' : 'road';
    riderSeat = { kind, lane: (frame.origin + held - axis) / scale };
    riderSpan = scale;
    riderAxis = axis;
    riderWorld = seatWorld(frame, riderSeat, scale);
    G.laneOffset = riderSeat.lane;
    return;
  }
  const seated = { kind: riderSeat.kind, lane };
  const world = seatWorld(frame, seated, scale) - frame.origin;
  const stick = seated.kind === 'exit' ? 'exit' : 'road';
  const held = stayOnAsphalt(frame.local, world, stick);
  const adjusted = {
    kind: seated.kind,
    lane: (frame.origin + held - axis) / scale,
  };
  riderSeat = stepSeat(frame, adjusted, scale);
  riderSpan = scale;
  riderAxis = axis;
  riderWorld = seatWorld(frame, riderSeat, scale);
  G.laneOffset = riderSeat.lane;
}

function riderFrameSeat(s, lane) {
  const frame = frameAt(s);
  const home = frameAt(G.playerS).origin;
  return seatOnFrame(frame, { kind: riderSeat.kind, lane }, home);
}

/** Полоса машины или разметки: масштаб ширины, без съезда. */
function laneWorldOffsetAtS(s, lateralOffset) {
  return roadMetersAt(s, lateralOffset, false);
}

/** Дороги в точке s: основная и боковой съезд, если он ещё отдельный. */
function roadsHere(s) {
  const frame = frameAt(s);
  return roadsAt(roadCarriageAt(s), frame);
}

/** Мир машины. Смещение — от оси одной дороги, съезд в том числе. */
function trafficLatAt(s, offset, _onExit) {
  const road = roadsHere(s).main;
  return carriageLat(road.axis, road.scale, Number.isFinite(offset) ? offset : 0);
}

/** Полоса байка или камеры. Съезд — смещение правой полосы от оси этой дороги. */
function riderLatAt(s, laneOffset) {
  const lane = typeof laneOffset === 'number' ? laneOffset : G.laneOffset;
  const frame = frameAt(s);
  const seat = riderFrameSeat(s, lane);
  const scale = laneSpanAt(s);
  const span = Number.isFinite(scale) && scale !== 0 ? scale : 1;
  const here = seatWorld(frame, seat, span);
  if (s === G.playerS) return here;
  const player = frameAt(G.playerS);
  const trail = arrivalTrail(
    readExit(player).life,
    readExit(frame).ribbon != null,
    laneAnchor(player),
    laneAnchor(frame),
    seat.lane,
    span,
  );
  return trail == null ? here : trail;
}

/** Середина дороги байка в смещении полосы. Камера тянется к ней. */
function riddenCenterAt(s) {
  const frame = frameAt(s);
  const road = roadCarriageAt(s);
  const onRibbon = riderFrameSeat(s, G.laneOffset).kind === 'exit' && road.spot.ribbon != null;
  return riddenCenter(road.spot, onRibbon, road.scale);
}

/** Байк реально сидит на полосе съезда, а не просто едет рядом с ней. */
function onExitLane() {
  return riderSeat.kind === 'exit';
}

/** Центр живой +1 полосы в тех же полосных единицах, что и G.laneOffset. */
function exitLaneCenterOffset() {
  const frame = frameAt(G.playerS);
  const spot = readExit(frame);
  if (spot.ribbon == null) return G.laneOffset;
  return riddenCenter(spot, true, laneSpanAt(G.playerS));
}

/**
 * Боковая точка следа камеры в абсолютных метрах курса.
 * Сзади и спереди держимся оси той ленты, по которой едет байк: пока есть
 * съезд — его середины, а когда он стал новой дорогой — её оси. Так взгляд не
 * прыгает на 30 м в сторону на стыке полосы и биома.
 */
function followLatAt(s, factor = 1, extra = 0) {
  const frame = frameAt(s);
  const f = Number.isFinite(factor) ? Math.max(0, Math.min(1.5, factor)) : 1;
  const add = Number.isFinite(extra) ? extra : 0;
  const span = laneSpanAt(G.playerS);
  const scale = Number.isFinite(span) && span !== 0 ? span : 1;
  const spot = readExit(frame);
  const ribbon = spot.ribbon?.center ?? null;
  const taken = riderSeat.kind === 'exit' || (frame.chosen === 1 && !!G.splitState && G.splitState.chosenSide === 1);
  let relative;
  if (riderSeat.kind === 'exit') {
    const homeFrame = frameAt(G.playerS);
    const homeSpot = readExit(homeFrame);
    const homeRibbon = homeSpot.ribbon?.center ?? null;
    const homeAxis = homeRibbon != null ? homeFrame.origin + homeRibbon : laneAnchor(homeFrame);
    relative = (G.riderLatAt(G.playerS) - homeAxis) * f;
  } else {
    relative = G.laneOffset * scale * f;
  }
  const axis = ribbon != null && taken ? frame.origin + ribbon : laneAnchor(frame);
  return axis + relative + add;
}

/** Доминирующий биом в точке s (без массива весов). */
function dominantBiomeAtS(s) {
  const live = liveAtMeters(blendMetersAt(s));
  return live.t >= 1 ? live.b : live.a;
}

/** Ближайшая попутная полоса к логическому смещению. */
function nearestRunLane(lateralOffset, cfg = null) {
  const config = cfg || playerLive(G.playerS).lanes;
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

/**
 * Веса декора. В отличие от профиля дороги, смена идёт симметрично вокруг
 * границы зоны: новый биом виден издалека, а старый не пропадает сразу за
 * границей — он живёт, пока не уйдёт из поля зрения.
 */
function sceneryMixAtMeters(meters) {
  const m = Math.max(0, meters);
  const zone = Math.floor(m / ZONE_M);
  const local = m - zone * ZONE_M;
  const half = Math.max(1, SCENERY_PREVIEW_M);
  const span = half * 2;
  // До первой границы нечего смешивать: в начале зоны всегда её собственный биом.
  if (zone === 0 && local <= ZONE_M - half) return { a: zoneBiomeAt(0), b: zoneBiomeAt(0), t: 0 };
  if (local > ZONE_M - half) {
    return {
      a: zoneBiomeAt(zone),
      b: previewBiomeAt(zone),
      t: smooth01((local - (ZONE_M - half)) / span),
    };
  }
  if (local < half) {
    return {
      a: zoneBiomeAt(zone - 1),
      b: zoneBiomeAt(zone),
      t: smooth01((local + half) / span),
    };
  }
  return { a: zoneBiomeAt(zone), b: zoneBiomeAt(zone), t: 0 };
}

function biomeWeightsAtS(s) {
  const live = sceneryMixAtMeters(blendMetersAt(s));
  const weights = new Array(BIOMES.length);
  for (let i = 0; i < weights.length; i++) weights[i] = 0;
  if (live.a === live.b) {
    weights[live.a] = 1;
    return weights;
  }
  weights[live.a] = 1 - live.t;
  weights[live.b] = live.t;
  return weights;
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
    rockDark: new THREE.MeshLambertMaterial({ color: 0x525761, flatShading: true }),
    mkadPanel: new THREE.MeshStandardMaterial({ color: 0x4b5665, roughness: 0.82 }),
    mkadPanelLight: new THREE.MeshStandardMaterial({ color: 0x727f8e, roughness: 0.78 }),
    mkadGlass: new THREE.MeshStandardMaterial({ color: 0x9fc4e0, emissive: 0x2d4f66, emissiveIntensity: 0.9, roughness: 0.35 }),
    mkadConcrete: new THREE.MeshStandardMaterial({ color: 0x8d939b, roughness: 0.9 }),
    mkadMetal: new THREE.MeshStandardMaterial({ color: 0x59636e, roughness: 0.55, metalness: 0.55 }),
    mkadLight: new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffb74d, emissiveIntensity: 1.8 }),
    wire: new THREE.MeshStandardMaterial({ color: 0x20262d, roughness: 0.7 })
  };
  G.mkadLightMat = MAT.mkadLight;
  G.mkadGlassMat = MAT.mkadGlass;
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
  if (id === 'mkad') return buildMkadVariant(variant);
  throw new Error(`Для биома «${id || biome}» нет слота: лес, горы и набережная строятся своими модулями, город — в roadside.js`);
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
function smooth01(v) {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
}

function groundOffset(lat, s) {
  const frame = frameAt(s);
  const at = groundAt(frame.world, lat);
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

function riderAxisAt(s) {
  const frame = frameAt(s);
  return seatAxis(frame, riderFrameSeat(s, G.laneOffset).kind);
}

function applyLaneConfig(playerS) {
  const live = playerLive(playerS);
  const cfg = live.lanes;
  const isExit = riderSeat.kind === 'exit';
  const carriageBiome = biomeIndexOf(cfg.id);
  const worldBefore = riderLatAt(playerS, G.laneOffset);
  const modeChanged = isExit !== lastExitLaneMode;
  const biomeChanged = carriageBiome !== lastLaneBiome;

  G.laneCount = cfg.count;
  G.oncomingCount = cfg.oncomingCount;
  G.LANE_OFFSETS = cfg.offsets.slice();
  G.LANE_SPEEDS = cfg.speeds.slice();
  G.START_LANE = cfg.startLane;

  if (biomeChanged || modeChanged) {
    // Сохраняем мировую позицию байка при смене конфига/режима полос.
    const newSpan = Number.isFinite(live.scale) && live.scale !== 0 ? live.scale : 1;
    const axis = riderAxisAt(playerS);
    if (Number.isFinite(worldBefore) && newSpan > 0.001) {
      G.laneOffset = (worldBefore - axis) / newSpan;
    }
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
  const limits = logicalRoadLimits(frame.local, live.scale, riderSeat.kind === 'exit', frame.chosen !== -1);
  G.roadEdgeMin = limits.min;
  G.roadEdgeMax = limits.max;
  G.ROAD_EDGE = Math.max(Math.abs(limits.min), limits.max);
}

function updateScenery() {
  if (!G.updateBiomeScenery) return;
  G.updateBiomeScenery();
}

/** Полосы дороги в точке s. Без s — под байком. Сиденье байка полосы дороги не меняет.
 *  @returns {import('./engine/lanes.js').CarriageLayout} */
function lanesAtS(s) {
  const at = Number.isFinite(s) ? s : G.playerS;
  return roadCarriageAt(at).lanes;
}

/** Полосы той дороги, на которой сидит байк. На въезде это уже новая дорога. */
function riderLanesAt(s) {
  const at = Number.isFinite(s) ? s : G.playerS;
  return playerLive(at).lanes;
}

function riderLaneScaleAt(s) {
  const at = Number.isFinite(s) ? s : G.playerS;
  const scale = playerLive(at).scale;
  return Number.isFinite(scale) && scale !== 0 ? scale : 1;
}

/** Случайная попутная полоса дороги байка в точке s. */
function randomRunLane(s) {
  return laneIndexByRoll(drivenLanesAt(s), 'with', Math.random());
}

/** Смещение остаётся, если это попутная полоса дороги байка. Иначе ближайшая такая полоса. */
function holdDrivenLane(s, offset) {
  const road = drivenLanesAt(s);
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
  if (chosenZones.has(zone)) return;
  const choices = splitChoices[zone] || getBiomeChoices(zoneBiomeAt(zone), G.visitCounts);
  const chosen = choices[side === 1 ? 1 : 0];
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
    active: G.started && !G.ended && splitD > -SPLIT_BANNER_AHEAD && splitD < layout.ownAfter,
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

  if (G.started && !G.ended && riderSeat.kind === 'exit') G.laneAssistTarget = null;

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

  for (const sp of spinners) {
    sp.mesh.rotation.z += sp.speed * dt;
  }

  updateScenery();
  if (G.updateForest) G.updateForest();
  if (G.updateMountain) G.updateMountain();
  if (G.updateEmbankment) G.updateEmbankment(dt);
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
  if (G.resetForest) G.resetForest();
  if (G.resetMountain) G.resetMountain();
  if (G.resetEmbankment) G.resetEmbankment();
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
  G.embankmentWeightAtS = (s) => weightOf(liveAtMeters(blendMetersAt(s)), EMBANKMENT);
  G.biomeWeightsAtS = biomeWeightsAtS;
  G.roadWidthAtS = roadWidthAtS;
  G.sideRibbonAt = (s) => ribbonHere(s);
  G.roadsAt = roadsHere;
  G.trafficLatAt = trafficLatAt;
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
  G.exitLaneCenterOffset = exitLaneCenterOffset;
  G.followLatAt = followLatAt;
  G.riddenCenterAt = riddenCenterAt;
  G.forkCloseAtS = forkCloseAtS;
  G.roadEdgesAt = roadEdgesAt;
  G.roadsideFrameAt = (s) => {
    const frame = frameAt(s);
    return { edges: frame.world, origin: frame.origin };
  };
  G.besidePose = besidePose;
  G.asphaltSpan = asphaltSpanAt;
  G.drivenSpanAt = drivenSpanAt;
  G.drivenIsExitAt = drivenIsExitAt;
  G.drivenFrameAt = drivenFrameAt;
  G.drivenLanesAt = drivenLanesAt;
  G.drivenLaneAt = drivenLaneAt;
  G.holdDrivenLane = holdDrivenLane;
  G.flankAt = flankAt;
  G.roadBiomeAtS = roadBiomeAtS;
  G.splitAmountAtS = splitAmountAtS;
  G.splitCenterS = splitCenterS;
  G.shoulder = SHOULDER;
  G.groundOffset = groundOffset;
  G.laneDisplayScaleAtS = laneDisplayScaleAtS;
  G.laneMarksAtS = laneMarksAtS;
  G.ribbonMarksAtS = ribbonMarksAtS;
  G.solidMarksAtS = solidMarksAtS;
  G.ribbonSolidMarksAtS = ribbonSolidMarksAtS;
  G.medianLatsAt = medianLatsAt;
  G.riderLanesAt = riderLanesAt;
  G.riderLaneScaleAt = riderLaneScaleAt;
  G.laneWorldOffsetAtS = laneWorldOffsetAtS;
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
        if (BIOMES[biome].decor !== 'slots') continue;
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
          const fullEdges = roadEdgesAt(s);
          const origin = frameAt(s).origin;
          const fullEdge = sideSign < 0 ? fullEdges.leftOuter : fullEdges.rightOuter;
          const fullMid = (fullEdges.leftOuter + fullEdges.rightOuter) * 0.5;
          const gap = Math.max(8, entry.lat - Math.abs(fullEdge - fullMid));
          const pose = besidePose({ edges: fullEdges, origin }, { side: sideSign, gap, inset: 0 });
          const far = Math.abs(s - G.playerS) > 165;
          if (far !== entry.lodFar) {
            entry.lodFar = far;
            for (let k = 2; k < entry.meshes.length; k++) entry.meshes[k].visible = !far;
          }
          G.placeBeside(
            entry.group,
            s,
            fullEdge,
            pose.lateral,
            groundOffset(pose.lateral, s),
            entry.yaw
          );
        }
      }
    }
  };
}
