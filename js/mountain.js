import * as THREE from 'three';
import { box, cylinder } from './geom.js';
import { shellEdge } from './engine/fork.js';
import { G } from './state.js';

/* =========================================================================
 * 5d. ГОРСКИЙ СЕРПАНТИН
 * -------------------------------------------------------------------------
 * Дорога в горах уже извилистая (профиль в js/biome.js). Здесь вдоль неё
 * ставятся скальные стены с внутренней стороны шпильки, подпорные стены с
 * внешней, растительность на склонах и крошечные декоративные машинки
 * для масштаба. Всё в InstancedMesh, позиции детерминированы по чанку.
 * ========================================================================= */

export const MOUNTAIN_CFG = {
  WALL_STEP: 7,
  WALL_AHEAD: 320,
  WALL_BEHIND: 60,
  ROAD_MARGIN: 4.6,
  ROCK_MIN_H: 7,
  ROCK_MAX_H: 21,
  WALL_H: 2.8,
  VEG_DENSITY: 0.42,
  VEG_DEPTH: 72,
  VEG_CELL: 4.2,
  CAR_STEP: 95,
  CHUNK_M: 50
};

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

const SIDES = /** @type {Array<-1 | 1>} */ ([-1, 1]);

export function initMountain() {
  const CFG = MOUNTAIN_CFG;
  const MOUNTAIN_INDEX = (G.BIOMES || []).findIndex((b) => b.id === 'mountain');

  const mats = {
    rock: new THREE.MeshLambertMaterial({ color: 0x6d7078, flatShading: true }),
    rockDark: new THREE.MeshLambertMaterial({ color: 0x525761, flatShading: true }),
    rockLight: new THREE.MeshLambertMaterial({ color: 0x83878f, flatShading: true }),
    wall: new THREE.MeshLambertMaterial({ color: 0x7d848d, flatShading: true }),
    wallDark: new THREE.MeshLambertMaterial({ color: 0x5d646d, flatShading: true }),
    pineTrunk: new THREE.MeshLambertMaterial({ color: 0x4b382a, flatShading: true }),
    pineCrown: new THREE.MeshLambertMaterial({ color: 0x2f6b3a, flatShading: true }),
    bush: new THREE.MeshLambertMaterial({ color: 0x3f7440, flatShading: true }),
    grass: new THREE.MeshLambertMaterial({ color: 0x4a7a3a, flatShading: true }),
    carPaint: new THREE.MeshLambertMaterial({ color: 0xb8c0c8, flatShading: true }),
    carGlass: new THREE.MeshLambertMaterial({ color: 0x2a3a4a, flatShading: true })
  };

  const rockGeo = box(1, 1, 1);
  const trunkGeo = cylinder(0.1, 0.16, 1, 6);
  const crownGeo = new THREE.ConeGeometry(1, 1, 7);
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
    rock: instance(rockGeo, mats.rock, 800, true),
    rockDark: instance(rockGeo, mats.rockDark, 500, true),
    wall: instance(rockGeo, mats.wall, 500, true),
    pineTrunk: instance(trunkGeo, mats.pineTrunk, 320, true),
    pineCrown: instance(crownGeo, mats.pineCrown, 700, true),
    bush: instance(bushGeo, mats.bush, 600, false),
    grass: instance(bushGeo, mats.grass, 500, false),
    carPaint: instance(rockGeo, mats.carPaint, 80, false),
    carGlass: instance(rockGeo, mats.carGlass, 80, false)
  };
  const dummy = new THREE.Object3D();
  const base = new THREE.Vector3();
  const up = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const qYaw = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);

  function put(pool, s, lat, yOff, sx, sy, sz, yaw, k, counter) {
    if (counter.value >= pool.instanceMatrix.count) return;
    G.placeOnRoad(dummy, s, lat, G.groundOffset(lat, s) + yOff * k);
    base.copy(dummy.position);
    qYaw.setFromAxisAngle(UP, yaw);
    q.copy(dummy.quaternion).multiply(qYaw);
    dummy.position.copy(base);
    dummy.quaternion.copy(q);
    dummy.scale.set(sx * k, sy * k, sz * k);
    dummy.updateMatrix();
    pool.setMatrixAt(counter.value++, dummy.matrix);
  }

  function mountainK(s) {
    if (MOUNTAIN_INDEX < 0) return 0;
    const w = G.biomeWeightsAtS(s);
    return smooth01(((w[MOUNTAIN_INDEX] || 0) - 0.03) / 0.45);
  }

  /** Скала/стена вдоль дороги. inside — сторона, куда поворачивает дорога. */
  function buildWalls(ci, counters) {
    const rng = makeRandom(((ci * 0x85ebca6b) ^ 0x27d4eb2f) >>> 0);
    const startS = ci * CFG.CHUNK_M;
    for (let d = 0; d < CFG.CHUNK_M; d += CFG.WALL_STEP) {
      const s = startS + d;
      const k = mountainK(s);
      if (k < 0.03) continue;
      const frame = G.roadsideFrameAt(s);
      const curv = G.roadCurvature(s);
      const inside = curv > 0.0006 ? 1 : curv < -0.0006 ? -1 : 0;
      for (const side of SIDES) {
        const edge = shellEdge(frame.edges, side);
        const isInside = inside !== 0 && side === inside;
        if (isInside) {
          // Скальная стена: 2–3 блока наращиваются вверх и вглубь.
          const depth = CFG.ROAD_MARGIN + 1.2 + rng() * 3.5;
          const lat = edge + side * depth;
          const h = (CFG.ROCK_MIN_H + rng() * (CFG.ROCK_MAX_H - CFG.ROCK_MIN_H)) * k;
          const w = (5 + rng() * 5) * k;
          const dep = (4 + rng() * 4) * k;
          const yaw = rng() * Math.PI;
          put(pools.rock, s, lat, h * 0.5, w, h, dep, yaw, 1, counters.rock);
          if (rng() < 0.6) {
            const h2 = h * (0.4 + rng() * 0.4);
            put(pools.rockDark, s + 2.5, lat + side * 1.5, h2 * 0.5, w * 0.7, h2, dep * 0.8, yaw + 0.4, 1, counters.rockDark);
          }
        } else {
          // Внешняя сторона: массивная подпорная стена и обрыв за ней.
          const depth = CFG.ROAD_MARGIN + 0.4 + rng() * 1.2;
          const lat = edge + side * depth;
          const h = CFG.WALL_H * (0.8 + rng() * 0.5) * k;
          const w = CFG.WALL_STEP * (0.9 + rng() * 0.3);
          put(pools.wall, s, lat, h * 0.5, w, h, 1.6, 0, 1, counters.wall);
          if (rng() < 0.35) {
            const h2 = h * 1.6;
            put(pools.rockDark, s + 3, lat + side * 6, h2 * 0.5, 6 * k, h2, 5 * k, rng() * Math.PI, 1, counters.rockDark);
          }
        }
      }
    }
  }

  /** Растительность на склонах: ели, кусты и трава, не на проезжей части. */
  function buildVeg(ci, counters) {
    const rng = makeRandom(((ci * 0xc2b2ae35) ^ 0x7654321) >>> 0);
    const startS = ci * CFG.CHUNK_M;
    const cellsS = Math.ceil(CFG.CHUNK_M / CFG.VEG_CELL);
    const cellsD = Math.ceil(CFG.VEG_DEPTH / CFG.VEG_CELL);
    const p = CFG.VEG_DENSITY * CFG.VEG_CELL * CFG.VEG_CELL / CFG.VEG_DEPTH;
    for (const side of SIDES) {
      for (let i = 0; i < cellsS; i++) {
        for (let j = 0; j < cellsD; j++) {
          if (rng() > p) continue;
          const s = startS + (i + 0.5) * CFG.VEG_CELL + (rng() - 0.5) * 2.5;
          const k = mountainK(s);
          if (k < 0.04) continue;
          const frame = G.roadsideFrameAt(s);
          const edge = shellEdge(frame.edges, side);
          const depth = CFG.ROAD_MARGIN + 2 + (j + 0.5) * CFG.VEG_CELL + (rng() - 0.5) * 2.5;
          const lat = edge + side * depth;
          const roll = rng();
          if (roll < 0.38) {
            const h = (7 + rng() * 7) * k;
            put(pools.pineTrunk, s, lat, h * 0.5, k, h, k, rng() * Math.PI, 1, counters.pineTrunk);
            const cr = (2.4 + rng() * 1.4) * k;
            put(pools.pineCrown, s, lat, h * 0.86, cr, h * 0.5, cr, rng() * Math.PI, 1, counters.pineCrown);
            if (rng() < 0.5) {
              put(pools.pineCrown, s, lat, h * 1.02, cr * 0.7, h * 0.35, cr * 0.7, rng() * Math.PI, 1, counters.pineCrown);
            }
          } else if (roll < 0.68) {
            const sc = (0.8 + rng() * 1.2) * k;
            put(pools.bush, s, lat, sc * 0.5, sc * 1.4, sc, sc * 1.4, rng() * Math.PI, 1, counters.bush);
          } else {
            const sc = (1.4 + rng() * 2.2) * k;
            put(pools.grass, s, lat, sc * 0.25, sc * 2.4, sc * 0.4, sc * 2.4, rng() * Math.PI, 1, counters.grass);
          }
        }
      }
    }
  }

  /** Крошечные машинки у дороги подчёркивают масштаб гор. */
  function buildCars(ci, counters) {
    const rng = makeRandom(((ci * 0x27d4eb2f) ^ 0x1234567) >>> 0);
    const startS = ci * CFG.CHUNK_M;
    for (let d = 0; d < CFG.CHUNK_M; d += CFG.CAR_STEP) {
      if (rng() < 0.45) continue;
      const s = startS + d + rng() * 20;
      const k = mountainK(s);
      if (k < 0.05) continue;
      const frame = G.roadsideFrameAt(s);
      const side = /** @type {-1 | 1} */ (rng() < 0.5 ? -1 : 1);
      const edge = shellEdge(frame.edges, side);
      const lat = edge + side * (CFG.ROAD_MARGIN + 1.6 + rng() * 2.5);
      const sc = 0.75 * k;
      const yaw = (rng() - 0.5) * 0.6 + (side > 0 ? 0 : Math.PI);
      put(pools.carPaint, s, lat, 0.45 * sc, 3.6 * sc, 0.7 * sc, 1.7 * sc, yaw, 1, counters.carPaint);
      put(pools.carGlass, s, lat, 1.05 * sc, 2.0 * sc, 0.55 * sc, 1.5 * sc, yaw, 1, counters.carGlass);
    }
  }

  function rebuild() {
    const pc = Math.floor(G.playerS / CFG.CHUNK_M);
    const from = pc - Math.ceil(CFG.WALL_BEHIND / CFG.CHUNK_M);
    const to = pc + Math.ceil(CFG.WALL_AHEAD / CFG.CHUNK_M);
    const counters = {
      rock: { value: 0 }, rockDark: { value: 0 }, wall: { value: 0 },
      pineTrunk: { value: 0 }, pineCrown: { value: 0 }, bush: { value: 0 },
      grass: { value: 0 }, carPaint: { value: 0 }, carGlass: { value: 0 }
    };
    for (let ci = from; ci <= to; ci++) {
      buildWalls(ci, counters);
      buildVeg(ci, counters);
      buildCars(ci, counters);
    }
    for (const key of Object.keys(pools)) {
      const pool = pools[key];
      const c = counters[key].value;
      pool.count = c;
      pool.instanceMatrix.needsUpdate = true;
      pool.visible = c > 0;
    }
  }

  let lastChunk = NaN;
  function updateMountain() {
    const pc = Math.floor(G.playerS / CFG.CHUNK_M);
    if (pc !== lastChunk) {
      lastChunk = pc;
      rebuild();
    }
  }

  rebuild();
  G.updateMountain = updateMountain;
  G.resetMountain = () => {
    lastChunk = NaN;
    rebuild();
  };
}
