import * as THREE from 'three';
import { box, cylinder } from './geom.js';
import { G } from './state.js';
import { smooth01 } from './engine/profile.js';

/* =========================================================================
 * 5f. ВАНТОВЫЙ МОСТ
 * -------------------------------------------------------------------------
 * Пролёт живет внутри зоны биома: 600 м прямой дороги, четыре полосы (2+2),
 * пилоны вне проезжей части, веер вант, стальная балка под полотном, вода и
 * берега. Всё рисуется пулами InstancedMesh на общей геометрии; чанки
 * пересобираются только при переходе в следующий 50-метровый отрезок.
 * ========================================================================= */

const CHUNK_M = 50;
const VIEW_AHEAD = 900;
const VIEW_BEHIND = 200;
const LOD_DIST = 300;
const RIBBON_HALF = 9.5;
const DECK_HALF = RIBBON_HALF * 2;
const WATER_Y = -14;
const PYLON_LAT = 42;
const PYLON_H = 44;
const PYLON_STEP = 150;
const RAIL_POST_STEP = 5;
const RIB_STEP = 10;
const JOINT_STEP = 60;
const LAMP_STEP = 40;
const BANK_LAT = 165;

export function initCableBridge() {
  const BRIDGE_INDEX = (G.BIOMES || []).findIndex((b) => b.id === 'cable_bridge');

  const waterTex = G.createCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#18354d';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 240; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const len = 10 + Math.random() * 34;
      ctx.strokeStyle = `rgba(150,205,240,${0.04 + Math.random() * 0.14})`;
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y + (Math.random() - 0.5) * 3);
      ctx.stroke();
    }
  }, 5, 12);
  waterTex.wrapS = THREE.RepeatWrapping;
  waterTex.wrapT = THREE.RepeatWrapping;

  const mat = (color, opacity = 1, extra = {}) => new THREE.MeshLambertMaterial(Object.assign({
    color,
    transparent: true,
    opacity,
    depthWrite: opacity > 0.9,
  }, extra));

  const mats = {
    deck: mat(0x40505a, 0.16, { depthWrite: false }),
    joint: mat(0x161c22, 0.85),
    steel: mat(0x6b7882),
    steelDark: mat(0x3a4650),
    concrete: mat(0x9aa5ab),
    rail: mat(0xcbd5db),
    cable: mat(0x9aa8b2),
    lamp: mat(0xfff2c8, 0.9, { emissive: 0xffd98a, emissiveIntensity: 0.9 }),
    water: new THREE.MeshLambertMaterial({ map: waterTex, color: 0x2b5c84, transparent: true, opacity: 0, depthWrite: false }),
    bank: mat(0x37464b, 0.9),
  };
  G.cableBridgeLampMat = mats.lamp;

  const unitBox = box(1, 1, 1);
  const unitCyl = cylinder(1, 1, 1, 6);
  const dummy = new THREE.Object3D();
  const UP = new THREE.Vector3(0, 1, 0);
  const _from = new THREE.Vector3();
  const _to = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _q = new THREE.Quaternion();

  function pool(geo, material, count) {
    const mesh = new THREE.InstancedMesh(geo, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Инстансы ездят вместе с игроком: общий bounding sphere был бы неверен.
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = false;
    mesh.count = 0;
    G.scene.add(mesh);
    return mesh;
  }

  const pools = {
    deck: pool(unitBox, mats.deck, 64),
    joint: pool(unitBox, mats.joint, 64),
    beam: pool(unitBox, mats.steelDark, 256),
    rib: pool(unitBox, mats.steel, 320),
    curb: pool(unitBox, mats.concrete, 128),
    railPost: pool(unitBox, mats.rail, 640),
    railBar: pool(unitBox, mats.rail, 256),
    pylon: pool(unitBox, mats.concrete, 256),
    cable: pool(unitCyl, mats.cable, 1400),
    lampPole: pool(unitCyl, mats.steelDark, 160),
    lampHead: pool(unitBox, mats.lamp, 160),
    bank: pool(unitBox, mats.bank, 128),
  };

  const water = new THREE.Mesh(new THREE.PlaneGeometry(620, 1500), mats.water);
  water.rotation.order = 'YXZ';
  water.rotation.x = -Math.PI / 2;
  water.renderOrder = -1;
  water.frustumCulled = false;
  water.visible = false;
  G.scene.add(water);

  /**
   * Вес биома в точке трассы. Декор смешивается за 900 м до границы зоны,
   * поэтому мост виден задолго до въезда, а не возникает перед байком.
   * Порог отсекает хвост моста в следующей зоне: вес ещё держится, но само
   * полотно уже позади.
   */
  function presenceAt(s) {
    if (BRIDGE_INDEX < 0 || typeof G.biomeWeightsAtS !== 'function') return 0;
    const w = G.biomeWeightsAtS(s)[BRIDGE_INDEX] || 0;
    return w >= 0.4 ? w : 0;
  }

  /** Вес моста в точке трассы: только внутри одноимённой зоны. */
  function weightAt(s) {
    return presenceAt(s) > 0 && typeof G.bridgeWeightAtS === 'function' ? G.bridgeWeightAtS(s) : 0;
  }

  /** Ближайший чанк моста впереди. По нему плавно проявляется весь пролёт. */
  function bridgeAhead(playerS) {
    const last = Math.floor((playerS + VIEW_AHEAD) / CHUNK_M);
    for (let ci = Math.ceil(playerS / CHUNK_M); ci <= last; ci++) {
      const center = (ci + 0.5) * CHUNK_M;
      if (weightAt(center) >= 0.9) return Math.max(0, center - playerS);
    }
    return Infinity;
  }

  const counters = Object.create(null);
  function resetCounters() {
    for (const key of Object.keys(pools)) counters[key] = 0;
  }

  function put(key, s, lat, y, sx, sy, sz, extraYaw = 0) {
    const target = pools[key];
    const used = counters[key] || 0;
    if (used >= target.instanceMatrix.count) return;
    G.placeOnRoad(dummy, s, lat, y, extraYaw);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    target.setMatrixAt(used, dummy.matrix);
    counters[key] = used + 1;
  }

  /** Тонкий цилиндр между двумя точками: ванты и ламповые кронштейны. */
  function line(key, a, b, radius) {
    const target = pools[key];
    const used = counters[key] || 0;
    if (used >= target.instanceMatrix.count) return;
    _dir.copy(b).sub(a);
    const len = _dir.length();
    if (!(len > 0.01)) return;
    _dir.multiplyScalar(1 / len);
    _q.setFromUnitVectors(UP, _dir);
    dummy.position.copy(a).add(b).multiplyScalar(0.5);
    dummy.quaternion.copy(_q);
    dummy.scale.set(radius, len, radius);
    dummy.updateMatrix();
    target.setMatrixAt(used, dummy.matrix);
    counters[key] = used + 1;
  }

  function point(s, lat, h) {
    const p = G.embedRoad(s, lat);
    return new THREE.Vector3(p.x, (G.roadY ? G.roadY(s) : p.y) + h, p.z);
  }

  /** Один 50-метровый чанк. Всё внутри пролёта, вне его чанк пустой. */
  function buildChunk(ci, far) {
    const start = ci * CHUNK_M;
    const end = start + CHUNK_M;
    const center = (start + end) * 0.5;
    if (weightAt(center) < 0.9) return;

    put('deck', center, 0, 0.012, DECK_HALF * 2 - 0.4, 0.012, CHUNK_M);
    if (!far) {
      for (let s = Math.ceil(start / JOINT_STEP) * JOINT_STEP; s < end; s += JOINT_STEP) {
        if (weightAt(s) < 0.9) continue;
        put('joint', s, 0, 0.14, DECK_HALF * 2, 0.05, 0.36);
      }
    }

    for (const lat of [-17, -9, 0, 9, 17]) {
      put('beam', center, lat, -1.5, 0.7, 1.3, CHUNK_M);
    }
    if (!far) {
      for (let s = start + RIB_STEP * 0.5; s < end; s += RIB_STEP) {
        if (weightAt(s) < 0.9) continue;
        put('rib', s, 0, -2.1, DECK_HALF * 2, 0.7, 0.55);
      }
    }

    for (const side of [-1, 1]) {
      const edge = side * (DECK_HALF + 0.4);
      put('curb', center, edge, 0.24, 0.85, 0.48, CHUNK_M);
      put('railBar', center, edge, 1.9, 0.16, 0.16, CHUNK_M);
      if (!far) {
        put('railBar', center, edge, 1.2, 0.1, 0.1, CHUNK_M);
        for (let s = start; s < end; s += RAIL_POST_STEP) {
          if (weightAt(s) < 0.9) continue;
          put('railPost', s, edge, 1.05, 0.18, 2.1, 0.18);
        }
      }
    }

    // H-пилоны стоят вне полотна: две ноги и поперечные ригели над дорогой.
    const firstPylon = Math.ceil(start / PYLON_STEP) * PYLON_STEP;
    for (let s = firstPylon; s < end; s += PYLON_STEP) {
      if (weightAt(s) < 0.9) continue;
      for (const side of [-1, 1]) {
        put('pylon', s, side * PYLON_LAT, PYLON_H * 0.5, 2.4, PYLON_H, 2.8);
      }
      put('pylon', s, 0, PYLON_H - 1, PYLON_LAT * 2 + 2, 1.8, 2.4);
      if (!far) put('pylon', s, 0, PYLON_H * 0.62, PYLON_LAT * 2 + 2, 1.1, 1.8);

      if (far) continue;
      // Веер вант: от макушки каждой ноги к кромке полотна вперёд и назад.
      for (const side of [-1, 1]) {
        const top = point(s, side * PYLON_LAT, PYLON_H - 1.5);
        for (let k = 1; k <= 7; k++) {
          for (const dir of [-1, 1]) {
            const anchorS = s + dir * k * 12;
            if (weightAt(anchorS) < 0.9) continue;
            line('cable', top, point(anchorS, side * (DECK_HALF - 0.6), 1.85), 0.085);
          }
        }
      }
    }

    if (!far) {
      for (let s = start + LAMP_STEP * 0.5; s < end; s += LAMP_STEP) {
        if (weightAt(s) < 0.9) continue;
        const side = Math.round(s / LAMP_STEP) % 2 === 0 ? -1 : 1;
        const edge = side * (DECK_HALF + 1.1);
        const base = point(s, edge, 0.5);
        const top = point(s, edge, 6.4);
        line('lampPole', base, top, 0.12);
        put('lampHead', s, edge - side * 0.4, 6.5, 0.5, 0.32, 0.5);
      }
    }

    for (const side of [-1, 1]) {
      put('bank', center, side * BANK_LAT, -6, 90, 16, CHUNK_M);
    }
  }

  let lastChunk = NaN;
  let lastShell = '';

  function rebuild(playerS) {
    resetCounters();
    const from = Math.floor((playerS - VIEW_BEHIND) / CHUNK_M);
    const to = Math.floor((playerS + VIEW_AHEAD) / CHUNK_M);
    for (let ci = from; ci <= to; ci++) {
      const center = (ci + 0.5) * CHUNK_M;
      buildChunk(ci, center - playerS > LOD_DIST);
    }
    for (const key of Object.keys(pools)) {
      const mesh = pools[key];
      const used = counters[key] || 0;
      mesh.count = used;
      mesh.visible = used > 0;
      if (used > 0) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  function updateCableBridge(dt) {
    void dt;
    const playerS = G.playerS || 0;
    const ahead = bridgeAhead(playerS);
    // Первый чанк строится за VIEW_AHEAD. Пролёт проявляется за 300 м до него,
    // а не в момент въезда на мост; позади игрока полотно держится до выхода из вида.
    const vis = counters.deck > 0
      ? (Number.isFinite(ahead) ? smooth01((VIEW_AHEAD - ahead) / 300) : 1)
      : 0;
    const anyVisible = vis > 0.02;
    water.visible = anyVisible;
    mats.water.opacity = vis * 0.92;
    for (const key of Object.keys(mats)) {
      if (key === 'water' || key === 'lamp') continue;
      mats[key].opacity = (key === 'deck' ? 0.16 : 1) * vis;
    }
    const night = G.nightGlow || 0;
    mats.lamp.opacity = vis;
    mats.lamp.emissiveIntensity = 0.25 + 0.9 * night;

    if (anyVisible) {
      const pose = G.embedRoad(playerS, 0);
      water.position.set(pose.x, WATER_Y, pose.z);
      water.rotation.set(-Math.PI / 2, Math.atan2(-pose.fx, -pose.fz), 0);
    }

    const chunk = Math.floor(playerS / CHUNK_M);
    const shell = G.roadShellKeyAt ? G.roadShellKeyAt(playerS) : '';
    if (chunk !== lastChunk || shell !== lastShell) {
      lastChunk = chunk;
      lastShell = shell;
      rebuild(playerS);
    }
  }

  function resetCableBridge() {
    lastChunk = NaN;
    lastShell = '';
    resetCounters();
    for (const key of Object.keys(pools)) {
      pools[key].count = 0;
      pools[key].visible = false;
    }
    water.visible = false;
  }

  G.updateCableBridge = updateCableBridge;
  G.resetCableBridge = resetCableBridge;
}
