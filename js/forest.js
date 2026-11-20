import * as THREE from 'three';
import { cylinder } from './geom.js';
import { asphaltSpan, worldEdge } from './engine/fork.js';
import { G } from './state.js';

/* =========================================================================
 * 5c. ПЛОТНЫЙ ЛЕС
 * -------------------------------------------------------------------------
 * Биом «Лес» собирается из InstancedMesh: берёзы, ели, сосны и кусты.
 * Деревья идут стеной по обе стороны трассы, но не заходят на асфальт и в
 * коридор развилки — точка берётся от внешней кромки живой дороги.
 *
 * Позиции детерминированы по чанку 50 м, поэтому лес не «скачет» при
 * смене биома: чанк генерируется один раз и переживает переезд. Плотность,
 * типы, высота и разброс вынесены в конфиг ниже.
 * ========================================================================= */

export const FOREST_CFG = {
  FOREST_TREE_DENSITY: 0.72,      // деревьев на метр трассы с каждой стороны
  FOREST_BUSH_DENSITY: 1.45,      // кустов на метр трассы с каждой стороны
  TREE_TYPE_RATIO: { birch: 0.35, spruce: 0.35, pine: 0.30 },
  TREE_SCALE_MIN: 0.55,
  TREE_SCALE_MAX: 1.70,
  BUSH_SCALE_MIN: 0.50,
  BUSH_SCALE_MAX: 1.70,
  TREE_MIN_SPACING: 3.4,          // минимальная дистанция между стволами
  JITTER_AMOUNT: 2.0,             // случайное смещение внутри ячейки
  TILT_MAX: 0.09,                 // максимальный наклон, радианы
  CHUNK_M: 50,
  VIEW_AHEAD: 380,
  VIEW_BEHIND: 90,
  ROAD_MARGIN: 3.6,               // зазор от кромки асфальта
  TREE_DEPTH: 120,                // насколько глубоко сажаем лес
  BUSH_DEPTH: 46,
  BUSH_CELL: 2.4,
  CORRIDOR_MARGIN: 1.2
};

/** Детерминированный ГПСЧ: один и тот же чанк даёт один и тот же лес. */
function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smooth01(v) {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
}

export function initForest() {
  const CFG = FOREST_CFG;
  const FOREST_INDEX = (G.BIOMES || []).findIndex((b) => b.id === 'forest');

  /* ---------- Материалы ---------- */
  const texRandom = makeRandom(0x1b2c3d4e);
  const birchTex = G.createCanvasTexture(64, 128, (ctx, w, h) => {
    ctx.fillStyle = '#e9e6dd';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2c2a26';
    for (let i = 0; i < 30; i++) {
      const y = texRandom() * h;
      const wide = 5 + texRandom() * 22;
      ctx.fillRect(texRandom() * w, y, wide, 2 + texRandom() * 4);
    }
  }, 1, 2);

  const mats = {
    birchTrunk: new THREE.MeshLambertMaterial({ map: birchTex }),
    birchCrown: new THREE.MeshLambertMaterial({ color: 0x6fae4e, flatShading: true }),
    spruceTrunk: new THREE.MeshLambertMaterial({ color: 0x4b382a, flatShading: true }),
    spruceCone: new THREE.MeshLambertMaterial({ color: 0x28593a, flatShading: true }),
    pineTrunk: new THREE.MeshLambertMaterial({ color: 0x5a4632, flatShading: true }),
    pineCrown: new THREE.MeshLambertMaterial({ color: 0x2f6b3a, flatShading: true }),
    bushTall: new THREE.MeshLambertMaterial({ color: 0x3f7440, flatShading: true }),
    bushLow: new THREE.MeshLambertMaterial({ color: 0x2c5a34, flatShading: true })
  };

  /* ---------- Геометрия: все деревья собраны из примитивов ---------- */
  const trunkGeo = cylinder(0.1, 0.16, 1, 6);
  const crownGeo = new THREE.IcosahedronGeometry(1, 0);
  const coneGeo = new THREE.ConeGeometry(1, 1, 7);
  const bushGeo = new THREE.IcosahedronGeometry(1, 0);

  function instance(geo, mat, count, shadows) {
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = !!shadows;
    mesh.receiveShadow = false;
    mesh.visible = false;
    mesh.count = 0;
    G.scene.add(mesh);
    return mesh;
  }

  const pools = {
    birchTrunk: instance(trunkGeo, mats.birchTrunk, 340, true),
    birchCrown: instance(crownGeo, mats.birchCrown, 1020, true),
    spruceTrunk: instance(trunkGeo, mats.spruceTrunk, 340, true),
    spruceCone: instance(coneGeo, mats.spruceCone, 1020, true),
    pineTrunk: instance(trunkGeo, mats.pineTrunk, 300, true),
    pineCrown: instance(crownGeo, mats.pineCrown, 700, true),
    bushTall: instance(bushGeo, mats.bushTall, 850, false),
    bushLow: instance(bushGeo, mats.bushLow, 850, false)
  };
  const allMeshes = Object.values(pools);

  /* ---------- Генерация чанка ---------- */
  const chunkCache = new Map();

  function genChunk(ci, side) {
    const key = ci * 2 + (side > 0 ? 1 : 0);
    const cached = chunkCache.get(key);
    if (cached) return cached;

    const rng = makeRandom(((ci * 0x9e3779b1) ^ (side > 0 ? 0x1234567 : 0x7654321)) >>> 0);
    const list = [];
    const startS = ci * CFG.CHUNK_M;

    // Дерево: одна ячейка — не больше одного ствола, поэтому стволы не сливаются.
    const cellsS = Math.ceil(CFG.CHUNK_M / CFG.TREE_MIN_SPACING);
    const cellsD = Math.ceil(CFG.TREE_DEPTH / CFG.TREE_MIN_SPACING);
    const pTree = CFG.FOREST_TREE_DENSITY * CFG.TREE_MIN_SPACING * CFG.TREE_MIN_SPACING / CFG.TREE_DEPTH;
    for (let i = 0; i < cellsS; i++) {
      for (let j = 0; j < cellsD; j++) {
        if (rng() > pTree) continue;
        const s = startS + (i + 0.5) * CFG.TREE_MIN_SPACING + (rng() - 0.5) * CFG.JITTER_AMOUNT;
        const depth = CFG.ROAD_MARGIN + (j + 0.5) * CFG.TREE_MIN_SPACING + (rng() - 0.5) * CFG.JITTER_AMOUNT;
        const tr = rng();
        const type = tr < CFG.TREE_TYPE_RATIO.birch ? 'birch' : tr < CFG.TREE_TYPE_RATIO.birch + CFG.TREE_TYPE_RATIO.spruce ? 'spruce' : 'pine';
        const scale = CFG.TREE_SCALE_MIN + rng() * (CFG.TREE_SCALE_MAX - CFG.TREE_SCALE_MIN);
        const yaw = rng() * Math.PI * 2;
        const tiltX = (rng() - 0.5) * 2 * CFG.TILT_MAX;
        const tiltZ = (rng() - 0.5) * 2 * CFG.TILT_MAX;
        list.push(makePlacement(s, depth, side, type, scale, yaw, tiltX, tiltZ));
      }
    }

    // Кусты: мельче и чаще, заполняют просветки между деревьями и у дороги.
    const bCellsS = Math.ceil(CFG.CHUNK_M / CFG.BUSH_CELL);
    const bCellsD = Math.ceil(CFG.BUSH_DEPTH / CFG.BUSH_CELL);
    const pBush = CFG.FOREST_BUSH_DENSITY * CFG.BUSH_CELL * CFG.BUSH_CELL / CFG.BUSH_DEPTH;
    for (let i = 0; i < bCellsS; i++) {
      for (let j = 0; j < bCellsD; j++) {
        if (rng() > pBush) continue;
        const s = startS + (i + 0.5) * CFG.BUSH_CELL + (rng() - 0.5) * CFG.JITTER_AMOUNT * 0.8;
        const depth = CFG.ROAD_MARGIN * 0.7 + (j + 0.5) * CFG.BUSH_CELL + (rng() - 0.5) * CFG.JITTER_AMOUNT * 0.8;
        const tall = rng() < 0.5;
        const scale = CFG.BUSH_SCALE_MIN + rng() * (CFG.BUSH_SCALE_MAX - CFG.BUSH_SCALE_MIN);
        const yaw = rng() * Math.PI * 2;
        list.push(makePlacement(s, depth, side, tall ? 'bushTall' : 'bushLow', scale, yaw, 0, 0));
      }
    }

    chunkCache.set(key, list);
    return list;
  }

  /** Общая часть постановки: кромка → смещение → проверка коридора → вес биома. */
  function makePlacement(s, depth, side, type, scale, yaw, tiltX, tiltZ) {
    const frame = G.roadsideFrameAt(s);
    const edge = worldEdge(frame.edges, side, frame.origin);
    const lat = edge + side * depth;
    const span = asphaltSpan(frame.edges, frame.origin);
    if (lat > span.left - CFG.CORRIDOR_MARGIN && lat < span.right + CFG.CORRIDOR_MARGIN) {
      return null;
    }
    let k = 1;
    if (FOREST_INDEX >= 0) {
      const w = G.biomeWeightsAtS(s);
      k = smooth01(((w[FOREST_INDEX] || 0) - 0.03) / 0.45);
      if (k < 0.02) return null;
    }
    return { s, lat, type, scale: scale * k, yaw, tiltX, tiltZ };
  }

  /* ---------- Заполнение InstancedMesh ---------- */
  const dummy = new THREE.Object3D();
  const base = new THREE.Vector3();
  const up = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const qYaw = new THREE.Quaternion();
  const qTilt = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const UP = new THREE.Vector3(0, 1, 0);

  function put(pool, x, y, z, quat, sx, sy, sz, counter) {
    if (counter.value >= pool.instanceMatrix.count) return;
    dummy.position.set(x, y, z);
    dummy.quaternion.copy(quat);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    pool.setMatrixAt(counter.value++, dummy.matrix);
  }

  function fillTree(p, counters) {
    G.placeOnRoad(dummy, p.s, p.lat, G.groundOffset(p.lat, p.s));
    base.copy(dummy.position);
    qYaw.setFromAxisAngle(UP, p.yaw);
    eul.set(p.tiltX, 0, p.tiltZ);
    qTilt.setFromEuler(eul);
    q.copy(dummy.quaternion).multiply(qYaw).multiply(qTilt);
    up.copy(UP).applyQuaternion(q);
    const sc = p.scale;

    switch (p.type) {
      case 'birch': {
        const H = 9.0 * sc;
        put(pools.birchTrunk, base.x, base.y + H * 0.5, base.z, q, sc, H, sc, counters.birchTrunk);
        const blobs = [
          [0, 0.80, 0, 2.7, 2.2, 2.7],
          [1.0, 0.98, 0.5, 2.0, 1.7, 2.0],
          [-0.8, 1.10, -0.4, 1.5, 1.3, 1.5]
        ];
        for (const b of blobs) {
          put(pools.birchCrown,
            base.x + up.x * H * b[1] + b[0] * sc,
            base.y + up.y * H * b[1],
            base.z + up.z * H * b[1] + b[2] * sc,
            q, b[3] * sc, b[4] * sc, b[5] * sc, counters.birchCrown);
        }
        break;
      }
      case 'spruce': {
        const H = 11.0 * sc;
        const trunkH = H * 0.35;
        put(pools.spruceTrunk, base.x, base.y + trunkH * 0.5, base.z, q, sc, trunkH, sc, counters.spruceTrunk);
        let y = trunkH;
        const hs = [0.42, 0.34, 0.24];
        const rs = [3.0, 2.2, 1.3];
        for (let k = 0; k < 3; k++) {
          const h = H * hs[k];
          const r = rs[k] * sc;
          y += h * 0.5;
          put(pools.spruceCone, base.x, base.y + y, base.z, q, r, h, r, counters.spruceCone);
          y += h * 0.55;
        }
        break;
      }
      case 'pine': {
        const H = 12.0 * sc;
        const trunkH = H * 0.75;
        put(pools.pineTrunk, base.x, base.y + trunkH * 0.5, base.z, q, sc, trunkH, sc, counters.pineTrunk);
        const blobs = [
          [0.86, 3.6, 2.0, 3.6],
          [1.02, 2.4, 1.5, 2.4]
        ];
        for (const b of blobs) {
          put(pools.pineCrown, base.x, base.y + H * b[0], base.z, q, b[1] * sc, b[2] * sc, b[3] * sc, counters.pineCrown);
        }
        break;
      }
      case 'bushTall': {
        put(pools.bushTall, base.x, base.y + 0.55 * sc, base.z, q, 1.5 * sc, 1.15 * sc, 1.5 * sc, counters.bushTall);
        break;
      }
      case 'bushLow': {
        put(pools.bushLow, base.x, base.y + 0.28 * sc, base.z, q, 1.7 * sc, 0.65 * sc, 1.7 * sc, counters.bushLow);
        break;
      }
      default:
        break;
    }
  }

  function rebuild() {
    const pc = Math.floor(G.playerS / CFG.CHUNK_M);
    const from = pc - Math.ceil(CFG.VIEW_BEHIND / CFG.CHUNK_M);
    const to = pc + Math.ceil(CFG.VIEW_AHEAD / CFG.CHUNK_M);
    const placements = [];
    for (let ci = from; ci <= to; ci++) {
      for (const side of [-1, 1]) {
        const list = genChunk(ci, side);
        for (const p of list) if (p) placements.push(p);
      }
    }
    // Кэш чанков живёт только в окне: иначе долгий заезд копил бы лес в памяти.
    for (const key of [...chunkCache.keys()]) {
      const ci = key >> 1;
      if (ci < from || ci > to) chunkCache.delete(key);
    }
    const counters = {
      birchTrunk: { value: 0 }, birchCrown: { value: 0 },
      spruceTrunk: { value: 0 }, spruceCone: { value: 0 },
      pineTrunk: { value: 0 }, pineCrown: { value: 0 },
      bushTall: { value: 0 }, bushLow: { value: 0 }
    };
    for (const p of placements) fillTree(p, counters);
    for (const key of Object.keys(pools)) {
      const pool = pools[key];
      const c = counters[key].value;
      pool.count = c;
      pool.instanceMatrix.needsUpdate = true;
      pool.visible = c > 0;
    }
  }

  let lastChunk = NaN;
  function updateForest() {
    const pc = Math.floor(G.playerS / CFG.CHUNK_M);
    if (pc !== lastChunk) {
      lastChunk = pc;
      rebuild();
    }
  }

  rebuild();
  G.updateForest = updateForest;
  G.resetForest = () => {
    chunkCache.clear();
    lastChunk = NaN;
    rebuild();
  };
  G.forestInfo = () => {
    const counts = {};
    let total = 0;
    for (const [key, pool] of Object.entries(pools)) {
      counts[key] = pool.count;
      total += pool.count;
    }
    return { total, chunks: chunkCache.size, counts };
  };
}
