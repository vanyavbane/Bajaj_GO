import * as THREE from 'three';
import { box, cylinder } from './geom.js';
import { keepInWindow } from './engine/stream.js';
import { G } from './state.js';

/* =========================================================================
 * БИОМЫ: КАЛЕНДАРЬ, ПРОФИЛЬ ДОРОГИ, ДЕКОРАЦИИ, БАННЕР И СОХРАНЕНИЕ
 * -------------------------------------------------------------------------
 * Биом — функция пройденного пути, а не кадра. Поэтому профиль дороги,
 * небо и декорации читают одну и ту же точку `biomeMetersAt(s)`, и смена
 * всегда получается бесшовной: старые объекты гаснут, новые проявляются.
 * ========================================================================= */

const ZONE_M = 1500;        // длина одной локации
const FADE_M = 150;         // кросс-фейд, метров
const STORAGE_KEY = 'bajajGO_biomeKm';
const SCENERY_SLOTS = 20;   // пул декораций на биом
const SCENERY_STEP = 28;
const SCENERY_SPAN = SCENERY_SLOTS * SCENERY_STEP;

const BIOMES = [
  {
    id: 'city', name: 'ГОРОД', icon: '🏙️',
    sub: 'МНОГОЭТАЖКИ · ВЫВЕСКИ · ПЕШЕХОДЫ',
    short: 'Город',
    traffic: {
      count: 18,
      pref: ['sedan', 'taxi', 'hatchback', 'crossover', 'bus', 'qute_traffic', 'suv', 'gazelle_flatbed', 'gazelle_van', 'kamaz', 'truck']
    }
  },
  {
    id: 'field', name: 'ПОЛЯ', icon: '🌾',
    sub: 'ПШЕНИЦА · ВЕТРЯКИ · АМБАРЫ',
    short: 'Поля',
    traffic: {
      count: 12,
      pref: ['gazelle_flatbed', 'gazelle_van', 'kamaz', 'truck', 'bus', 'sedan', 'taxi', 'crossover', 'suv', 'hatchback', 'qute_traffic']
    }
  },
  {
    id: 'forest', name: 'ЛЕС', icon: '🌲',
    sub: 'ЕЛИ · ВАЛУНЫ · ЛЕСНАЯ ДОРОГА',
    short: 'Лес',
    traffic: {
      count: 9,
      pref: ['sedan', 'hatchback', 'crossover', 'suv', 'taxi', 'qute_traffic', 'bus', 'gazelle_van', 'gazelle_flatbed', 'kamaz', 'truck']
    }
  },
  {
    id: 'mountain', name: 'ГОРЫ', icon: '🏔️',
    sub: 'СЕРПАНТИН · СКАЛЫ · ПЕРЕВАЛ',
    short: 'Горы',
    traffic: {
      count: 10,
      pref: ['truck', 'kamaz', 'gazelle_flatbed', 'gazelle_van', 'bus', 'suv', 'crossover', 'sedan', 'hatchback', 'taxi', 'qute_traffic']
    }
  }
];

const LANE_SPEEDS_BY_BIOME = [
  [40, 60, 70, 55], // city
  [38, 58, 68, 52], // field
  [35, 55, 65, 50], // forest
  [30, 45, 55, 40]  // mountain
];

/* -------------------------------------------------------------------------
 * Профили дороги. Каждый биом — своя пара синусоид.
 * Производные аналитические, чтобы `roadDDX` не шумел и не давал NaN.
 * ---------------------------------------------------------------------- */
const PROFILES = [
  {
    x: (s) => Math.sin(s * 0.0042) * 34 + Math.cos(s * 0.0021) * 48,
    dx: (s) => Math.cos(s * 0.0042) * 34 * 0.0042 - Math.sin(s * 0.0021) * 48 * 0.0021,
    ddx: (s) => -Math.sin(s * 0.0042) * 34 * 0.0042 * 0.0042
      - Math.cos(s * 0.0021) * 48 * 0.0021 * 0.0021,
    y: (s) => Math.sin(s * 0.055) * 1.65 + Math.cos(s * 0.029) * 1.15,
    dy: (s) => Math.cos(s * 0.055) * 1.65 * 0.055 - Math.sin(s * 0.029) * 1.15 * 0.029
  },
  {
    // Поля: почти прямая, длинные мягкие волны и подъёмы до метра.
    x: (s) => Math.sin(s * 0.0035) * 14 + Math.cos(s * 0.0014) * 7,
    dx: (s) => Math.cos(s * 0.0035) * 14 * 0.0035 - Math.sin(s * 0.0014) * 7 * 0.0014,
    ddx: (s) => -Math.sin(s * 0.0035) * 14 * 0.0035 * 0.0035
      - Math.cos(s * 0.0014) * 7 * 0.0014 * 0.0014,
    y: (s) => Math.sin(s * 0.0062) * 0.55 + Math.cos(s * 0.0031) * 0.35,
    dy: (s) => Math.cos(s * 0.0062) * 0.55 * 0.0062 - Math.sin(s * 0.0031) * 0.35 * 0.0031
  },
  {
    // Лес: плавные изгибы и лёгкие «змейки».
    x: (s) => Math.sin(s * 0.006) * 18 + Math.cos(s * 0.0027) * 10 + Math.sin(s * 0.0011) * 6,
    dx: (s) => Math.cos(s * 0.006) * 18 * 0.006 - Math.sin(s * 0.0027) * 10 * 0.0027
      + Math.cos(s * 0.0011) * 6 * 0.0011,
    ddx: (s) => -Math.sin(s * 0.006) * 18 * 0.006 * 0.006
      - Math.cos(s * 0.0027) * 10 * 0.0027 * 0.0027
      - Math.sin(s * 0.0011) * 6 * 0.0011 * 0.0011,
    y: (s) => Math.sin(s * 0.008) * 1.2 + Math.cos(s * 0.0042) * 0.7,
    dy: (s) => Math.cos(s * 0.008) * 1.2 * 0.008 - Math.sin(s * 0.0042) * 0.7 * 0.0042
  },
  {
    // Горы: серпантин с радиусом дуг около 90–180 м, подъёмы до 3.5 м.
    x: (s) => Math.sin(s * 0.019) * 30 + Math.sin(s * 0.0081) * 16 + Math.cos(s * 0.0023) * 7,
    dx: (s) => Math.cos(s * 0.019) * 30 * 0.019
      + Math.cos(s * 0.0081) * 16 * 0.0081
      - Math.sin(s * 0.0023) * 7 * 0.0023,
    ddx: (s) => -Math.sin(s * 0.019) * 30 * 0.019 * 0.019
      - Math.sin(s * 0.0081) * 16 * 0.0081 * 0.0081
      - Math.cos(s * 0.0023) * 7 * 0.0023 * 0.0023,
    y: (s) => Math.sin(s * 0.0125) * 2.2 + Math.cos(s * 0.0071) * 1.35,
    dy: (s) => Math.cos(s * 0.0125) * 2.2 * 0.0125 - Math.sin(s * 0.0071) * 1.35 * 0.0071
  }
];

const TERRAIN_COLORS = [
  new THREE.Color(0x2a4d31), // city
  new THREE.Color(0x6f6a36), // field
  new THREE.Color(0x1e3d29), // forest
  new THREE.Color(0x5a6066)  // mountain
];

/* ---------- Детерминированный календарь биомов ---------- */
const groupCache = new Map();

function mulberry32(seed) {
  let a = seed | 0;
  return function rand() {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledGroup(group) {
  let order = groupCache.get(group);
  if (order) return order;
  if (group <= 0) {
    order = [0, 1, 2, 3];
  } else {
    const rand = mulberry32((0x9E3779B9 ^ Math.imul(group, 0x85EBCA6B)) >>> 0);
    order = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }
  }
  groupCache.set(group, order);
  return order;
}

/** Биом зоны. Каждые четыре зоны содержат все локации по одному разу. */
function biomeForZone(zone) {
  if (!Number.isFinite(zone) || zone <= 0) return 0;
  const g = Math.floor(zone / 4);
  return shuffledGroup(g)[zone % 4];
}

/* ---------- Смешивание профилей ---------- */
let blendA = 0;
let blendB = 0;
let blendT = 0;
let blendT1 = 0;
let blendT2 = 0;
let blendZone = 0;
let blendLocal = 0;

function smooth01(v) {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
}

function fillBlend(meters) {
  const m = Number.isFinite(meters) ? Math.max(0, meters) : 0;
  const zone = Math.floor(m / ZONE_M);
  const local = m - zone * ZONE_M;
  const start = ZONE_M - FADE_M;
  let t = 0;
  let t1 = 0;
  let t2 = 0;
  if (local > start) {
    const u = Math.min(1, (local - start) / FADE_M);
    t = u * u * (3 - 2 * u);
    t1 = (6 * u * (1 - u)) / FADE_M;
    t2 = (6 - 12 * u) / (FADE_M * FADE_M);
  }
  blendZone = zone;
  blendLocal = local;
  blendA = biomeForZone(zone);
  blendB = biomeForZone(zone + 1);
  blendT = t;
  blendT1 = t1;
  blendT2 = t2;
}

function blendMetersAt(s) {
  return G.biomeOffsetM + s;
}

/* -------------------------------------------------------------------------
 * Публичные функции профиля. Их читают road.js, разметка, камера и трафик.
 * ---------------------------------------------------------------------- */
function biomeRoadX(s) {
  fillBlend(blendMetersAt(s));
  const a = PROFILES[blendA];
  const b = PROFILES[blendB];
  const pa = a.x(s);
  const pb = b.x(s);
  return pa + blendT * (pb - pa);
}

function biomeRoadDX(s) {
  fillBlend(blendMetersAt(s));
  const a = PROFILES[blendA];
  const b = PROFILES[blendB];
  const pa = a.x(s);
  const pb = b.x(s);
  return a.dx(s) + blendT1 * (pb - pa) + blendT * (b.dx(s) - a.dx(s));
}

function biomeRoadDDX(s) {
  fillBlend(blendMetersAt(s));
  const a = PROFILES[blendA];
  const b = PROFILES[blendB];
  const pa = a.x(s);
  const pb = b.x(s);
  return a.ddx(s)
    + blendT2 * (pb - pa)
    + 2 * blendT1 * (b.dx(s) - a.dx(s))
    + blendT * (b.ddx(s) - a.ddx(s));
}

function biomeRoadY(s) {
  fillBlend(blendMetersAt(s));
  const a = PROFILES[blendA];
  const b = PROFILES[blendB];
  const pa = a.y(s);
  const pb = b.y(s);
  return pa + blendT * (pb - pa);
}

function biomeRoadDY(s) {
  fillBlend(blendMetersAt(s));
  const a = PROFILES[blendA];
  const b = PROFILES[blendB];
  const pa = a.y(s);
  const pb = b.y(s);
  return a.dy(s) + blendT1 * (pb - pa) + blendT * (b.dy(s) - a.dy(s));
}

/** Доля города в точке s: 1 — город, 0 — другой биом. */
function cityWeightAtS(s) {
  fillBlend(blendMetersAt(s));
  let w = 0;
  if (blendA === 0) w += 1 - blendT;
  if (blendB === 0) w += blendT;
  return w;
}

const _weights = [0, 0, 0, 0];
const _stateWeights = [0, 0, 0, 0];
/** Веса биомов в точке s. Массив общий, его нельзя сохранять надолго. */
function biomeWeightsAtS(s) {
  fillBlend(blendMetersAt(s));
  _weights[0] = 0; _weights[1] = 0; _weights[2] = 0; _weights[3] = 0;
  _weights[blendA] += 1 - blendT;
  _weights[blendB] += blendT;
  return _weights;
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
    bushDark: new THREE.MeshLambertMaterial({ color: 0x244b2d, flatShading: true })
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
    // Стога сена: несколько voxel-тюков.
    lat = 24;
    addBox(g, MAT.hay, 3.0, 1.3, 2.0, 0, 0.65, 0);
    addBox(g, MAT.hayDark, 2.4, 1.1, 1.7, 0.2, 1.85, 0.1);
    addBox(g, MAT.hay, 1.7, 0.9, 1.3, -0.3, 2.9, 0);
    addBox(g, MAT.hayDark, 2.2, 0.8, 1.3, 2.6, 0.4, 1.6);
  } else if (variant === 1) {
    // Ветряная мельница: башня и медленно вращающиеся лопасти.
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
    // Амбар с двускатной крышей и воротами.
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
    // Силосная башня с лестницей.
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
    // Деревянный забор вдоль поля.
    lat = 28;
    for (let i = 0; i < 7; i++) {
      addBox(g, MAT.wood, 0.24, 1.5, 0.24, 0, 0.75, (i - 3) * 2.4);
    }
    addBox(g, MAT.woodLight, 0.16, 0.22, 16.6, 0, 1.02, 0);
    addBox(g, MAT.woodLight, 0.16, 0.22, 16.6, 0, 0.46, 0);
    g.rotation.y = 0;
  }

  return { group: g, lat, spin };
}

/* ---------- Лес ---------- */
function addPine(parent, x, z, h, mats) {
  const trunk = addBox(parent, MAT.wood, 0.46, h * 0.34, 0.46, x, h * 0.17, z);
  trunk.castShadow = true;
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
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
    // Густая ель-роща вплотную к обочине.
    lat = 19;
    addPine(g, -2.4, -1.4, 9.5, [MAT.pineDark, MAT.pineMid, MAT.pineLight]);
    addPine(g, 1.8, 1.2, 12.0, [MAT.pineMid, MAT.pineLight, MAT.pineDark]);
    addPine(g, 4.6, -2.2, 7.4, [MAT.pineDark, MAT.pineMid]);
  } else if (variant === 1) {
    // Поваленный ствол и пара камней.
    lat = 24;
    const log = addBox(g, MAT.wood, 0.95, 0.95, 10.5, 0, 0.52, 0);
    log.rotation.y = 0.32;
    log.rotation.z = 0.05;
    addBox(g, MAT.woodLight, 0.5, 0.4, 2.4, -1.8, 0.9, 2.6).rotation.y = 0.8;
    addBox(g, MAT.rock, 2.0, 1.4, 1.8, 2.0, 0.7, -1.2).rotation.y = 0.5;
    addBox(g, MAT.moss, 1.6, 0.18, 1.4, 2.0, 1.42, -1.2).rotation.y = 0.5;
  } else if (variant === 2) {
    // Валуны, поросшие мхом.
    lat = 27;
    addBox(g, MAT.rock, 3.4, 2.3, 3.0, 0, 1.1, 0).rotation.y = 0.3;
    addBox(g, MAT.rockDark, 2.2, 1.6, 2.0, 2.6, 0.75, 1.3).rotation.y = -0.4;
    addBox(g, MAT.moss, 2.8, 0.2, 2.5, 0, 2.24, 0).rotation.y = 0.3;
    addBox(g, MAT.rockLight, 1.4, 1.0, 1.2, -2.4, 0.5, 1.8).rotation.y = 0.9;
  } else if (variant === 3) {
    // Кустарник и низкая поросль.
    lat = 18;
    addBox(g, MAT.bush, 2.4, 1.5, 2.0, 0, 0.75, 0);
    addBox(g, MAT.bushDark, 1.8, 1.2, 1.6, 1.9, 0.6, 1.2);
    addBox(g, MAT.bush, 1.4, 1.0, 1.3, -1.8, 0.5, 1.4);
    addBox(g, MAT.bushDark, 1.2, 0.8, 1.1, 0.6, 0.4, -1.7);
    addBox(g, MAT.wood, 0.3, 1.4, 0.3, -2.6, 0.7, -1.6);
  } else {
    // Сухостой и просвет между деревьями.
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
    // Скальный шпиль со снежной шапкой.
    lat = 36;
    addBox(g, MAT.rockDark, 7.0, 3.2, 6.0, 0, 1.6, 0).rotation.y = 0.18;
    addBox(g, MAT.rock, 5.4, 3.8, 4.6, 0.3, 4.8, -0.1).rotation.y = 0.4;
    addBox(g, MAT.rockLight, 3.8, 3.0, 3.2, -0.2, 7.8, 0.1).rotation.y = 0.1;
    addSnowCap(g, 4.1, 9.4, 0.1, 3.5);
    addBox(g, MAT.snow, 1.9, 0.8, 1.6, 0.7, 10.0, 0);
  } else if (variant === 1) {
    // Хребет на дальнем плане.
    lat = 62;
    addBox(g, MAT.rockDark, 17, 7.5, 9, 0, 3.5, 0).rotation.y = 0.22;
    addBox(g, MAT.rock, 11, 8.0, 6.5, 3.4, 7.0, -1.2).rotation.y = 0.55;
    addBox(g, MAT.rockLight, 7.0, 5.4, 4.4, -1.6, 10.2, 0.8).rotation.y = 0.1;
    addSnowCap(g, 8.2, 12.1, 0.6, 4.8);
    addSnowCap(g, 5.0, 8.0, 3.2, 3.0);
  } else if (variant === 2) {
    // Осыпь из мелких камней.
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
    // Редкие сосны на склоне.
    lat = 27;
    addPine(g, 0, 0, 8.4, [MAT.pineDark, MAT.pineMid]);
    addPine(g, 3.0, 1.4, 6.2, [MAT.pineMid, MAT.pineDark]);
  } else {
    // Отвесная скала у дороги.
    lat = 46;
    addBox(g, MAT.rockDark, 8.5, 8.0, 6.5, 0, 4.0, 0).rotation.y = 0.16;
    addBox(g, MAT.rock, 6.6, 4.4, 5.2, -0.4, 10.0, 0.2).rotation.y = 0.35;
    addBox(g, MAT.rockLight, 4.4, 2.6, 3.8, 0.1, 13.2, 0).rotation.y = 0.2;
    addSnowCap(g, 5.0, 14.6, 0, 4.2);
  }

  return { group: g, lat, spin: null };
}

function buildVariant(biome, variant) {
  if (biome === 1) return buildFieldVariant(variant);
  if (biome === 2) return buildForestVariant(variant);
  return buildMountainVariant(variant);
}

/** Приблизительная высота откоса: объекты не висят в воздухе и не тонут. */
function groundOffset(lat) {
  const a = Math.abs(lat);
  if (a <= 12.7) return 0.08;
  if (a <= 22) return 0.08 + ((a - 12.7) / 9.3) * (1.8 - 0.08);
  if (a <= 95) return 1.8 + ((a - 22) / 73) * (-4.5 - 1.8);
  return -4.5;
}

/* ---------- Состояние и сохранение ---------- */
let saveTimer = 0;
let bannerTimer = 0;
let lastZone = -1;
let lastMenuZone = -1;
const spinners = [];
const _terrain = new THREE.Color();
const _terrainTmp = new THREE.Color();

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

function persistBiome() {
  try {
    const km = Math.max(0, Number.isFinite(G.biomeStoredMeters) ? G.biomeStoredMeters : 0) / 1000;
    localStorage.setItem(STORAGE_KEY, km.toFixed(3));
  } catch {
    /* сохранение недоступно — игра продолжает работать */
  }
}

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
  els.root.classList.add('show');
  bannerTimer = 2.1;
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

function updateTerrainTint(weights) {
  const grass = G.M && G.M.grass;
  if (!grass) return;
  _terrain.setRGB(0, 0, 0);
  for (let i = 0; i < 4; i++) {
    const w = weights[i];
    if (w <= 0.0001) continue;
    _terrainTmp.copy(TERRAIN_COLORS[i]).multiplyScalar(w);
    _terrain.add(_terrainTmp);
  }
  grass.color.copy(_terrain);
}

function updateLaneSpeeds(weights) {
  for (let lane = 0; lane < 4; lane++) {
    let speed = 0;
    for (let i = 0; i < 4; i++) speed += LANE_SPEEDS_BY_BIOME[i][lane] * weights[i];
    G.LANE_SPEEDS[lane] = Math.round(speed);
  }
}

function updateScenery() {
  if (!G.updateBiomeScenery) return;
  G.updateBiomeScenery();
}

/* ---------- Публичный апдейт ---------- */
function updateBiome(dt) {
  const meters = G.biomeOffsetM + G.playerS;
  if (G.started && !G.ended) {
    G.biomeStoredMeters = meters;
    saveTimer += dt;
    if (saveTimer >= 2.5) {
      saveTimer = 0;
      persistBiome();
    }
  }

  fillBlend(meters);
  // В G.biomeState кладём отдельную копию: _weights переиспользуется всеми
  // читателями профиля в том же кадре и не должен менять публичное состояние.
  const weights = _stateWeights;
  weights[0] = 0; weights[1] = 0; weights[2] = 0; weights[3] = 0;
  weights[blendA] += 1 - blendT;
  weights[blendB] += blendT;

  const dominant = blendT < 0.5 ? blendA : blendB;
  const zone = blendZone;
  const cityWeight = weights[0];

  G.biomeState = {
    meters,
    zone,
    current: blendA,
    next: blendB,
    t: blendT,
    dominant,
    weights,
    cityWeight,
    id: BIOMES[dominant].id
  };
  G.biomeDominant = dominant;
  G.biomeCityWeight = cityWeight;
  G.biomeTransition = {
    active: G.started && !G.ended && blendT > 0.001,
    from: blendA,
    to: blendB,
    t: blendT
  };

  if (G.started && !G.ended) {
    if (lastZone < 0) lastZone = zone;
    else if (zone !== lastZone) {
      lastZone = zone;
      showBiomeBanner(BIOMES[dominant]);
    }
  } else {
    lastZone = zone;
  }

  updateBanner(dt);
  updateTerrainTint(weights);
  updateLaneSpeeds(weights);
  G.biomeTraffic = BIOMES[dominant].traffic;

  for (const sp of spinners) {
    sp.mesh.rotation.z += sp.speed * dt;
  }

  updateScenery();
}

/** Сброс мира на старте заезда: биом продолжается с сохранённого места. */
function resetBiomeRun() {
  G.biomeOffsetM = G.biomeStoredMeters;
  fillBlend(G.biomeOffsetM + G.playerS);
  lastZone = blendZone;
  saveTimer = 0;
  hideBiomeBanner();
  if (G.resetBiomeScenery) G.resetBiomeScenery();
}

/* ---------- Меню и пауза ---------- */
function biomeDisplayInfo() {
  // В меню берём сохранённую точку, а не демо-пробег.
  const meters = Math.max(0, G.biomeStoredMeters || 0);
  fillBlend(meters);
  const progress = (meters % ZONE_M) / ZONE_M;
  const current = blendT < 0.5 ? blendA : blendB;
  const next = biomeForZone(blendZone + 1);
  return {
    biome: BIOMES[current],
    next: BIOMES[next],
    progress,
    leftM: Math.max(0, ZONE_M - (meters % ZONE_M)),
    zone: blendZone
  };
}

function biomeMenuMarkup() {
  const info = biomeDisplayInfo();
  const pct = Math.round(info.progress * 100);
  return `<div class="biome-strip">
    <span class="biome-strip-icon">${info.biome.icon}</span>
    <div class="biome-strip-main">
      <div class="biome-strip-row"><b>${info.biome.short}</b><span>далее: ${info.next.short} · ${(info.leftM / 1000).toFixed(1)} км</span></div>
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
  G.cityWeightAtS = cityWeightAtS;
  G.biomeWeightsAtS = biomeWeightsAtS;
  G.biomeState = null;
  G.biomeTransition = { active: false, from: 0, to: 0, t: 0 };
  G.biomeTraffic = BIOMES[0].traffic;

  G.biomeStoredMeters = readStoredMeters();
  G.biomeOffsetM = G.biomeStoredMeters;
  G.updateBiome = updateBiome;
  G.resetBiomeRun = resetBiomeRun;
  G.persistBiome = persistBiome;
  G.biomeMenuMarkup = biomeMenuMarkup;
  G.biomePauseValue = biomePauseValue;
  G.biomeDisplayInfo = biomeDisplayInfo;
  G.hideBiomeBanner = hideBiomeBanner;
  G.showBiomeBanner = (biomeIndex) => showBiomeBanner(BIOMES[biomeIndex] || BIOMES[0]);
  G.biomeZoneLength = ZONE_M;
  G.biomeFadeLength = FADE_M;
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
      for (let biome = 1; biome < 4; biome++) {
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

  // Горы выше остальных декораций: хребты должны перекрывать низкие облака.
  const BIOME_SCENERY_SCALE = [1, 1, 1, 2.15];

  G.updateBiomeScenery = () => {
    for (const slot of G.biomeScenery) {
      slot.s = keepInWindow(slot.s, G.playerS, 42, Infinity, SCENERY_SPAN);
      // Веса обоих биомов перехода: старые декорации уменьшаются, новые растут.
      const w = G.biomeWeightsAtS(slot.s);
      const w1 = w[1], w2 = w[2], w3 = w[3];
      for (const side of [-1, 1]) {
        const list = side < 0 ? slot.left : slot.right;
        for (const entry of list) {
          const bw = entry.biome === 1 ? w1 : (entry.biome === 2 ? w2 : w3);
          const visible = bw > 0.02;
          entry.group.visible = visible;
          if (!visible) continue;
          const s = slot.s + entry.ds;
          const scale = 0.02 + 0.98 * bw;
          entry.group.scale.setScalar(scale * BIOME_SCENERY_SCALE[entry.biome]);
          // LOD: вдалеке оставляем 1–2 блока, ближние объекты — целиком.
          const far = Math.abs(s - G.playerS) > 165;
          if (far !== entry.lodFar) {
            entry.lodFar = far;
            for (let k = 2; k < entry.meshes.length; k++) entry.meshes[k].visible = !far;
          }
          G.placeOnRoad(
            entry.group,
            s,
            side * entry.lat,
            groundOffset(entry.lat),
            entry.yaw
          );
        }
      }
    }
  };
}
