import * as THREE from 'three';
import { box, cylinder } from './geom.js';
import { playerHalfWidth } from './engine/motion.js';
import { G } from './state.js';

/**
 * Ремонт дороги: один активный участок на попутной полосе города или МКАД.
 * Счётчик копится только там. Провал лежит на полотне: лента дороги сплошная,
 * поэтому яма читается тёмным пятном и обломками, а не дыркой в меше.
 */
export function initRepair() {
  const POOL = 2;
  G.REPAIR_MIN_DIST = 3500;
  G.REPAIR_SPREAD = 500;
  G.REPAIR_ALLOWED_BIOMES = ['city', 'mkad'];
  G.repairProgress = 0;
  G.repairNextS = nextMark();
  G.repairEvent = emptyEvent();
  G.repairPool = [];

  const stripeTex = G.createCanvasTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#d32f2f';
    ctx.lineWidth = 14;
    for (let x = -h; x < w + h; x += 22) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + h, 0);
      ctx.stroke();
    }
  });
  const workTex = G.createCanvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#f5c400';
    ctx.beginPath();
    ctx.moveTo(w * 0.5, 10);
    ctx.lineTo(w - 10, h - 10);
    ctx.lineTo(10, h - 10);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#c62828';
    ctx.stroke();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(w * 0.5, 48, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(w * 0.5 - 7, 56, 14, 34);
    ctx.fillRect(w * 0.5 + 4, 70, 26, 5);
  });

  const mat = {
    red: new THREE.MeshLambertMaterial({ color: 0xd32f2f, emissive: 0xb71c1c, emissiveIntensity: 0.35 }),
    white: new THREE.MeshLambertMaterial({ color: 0xf5f5f5, emissive: 0x888888, emissiveIntensity: 0.3 }),
    stripe: new THREE.MeshLambertMaterial({ map: stripeTex, emissive: 0x442222, emissiveIntensity: 0.35 }),
    work: new THREE.MeshBasicMaterial({ map: workTex, transparent: true }),
    cone: new THREE.MeshLambertMaterial({ color: 0xff6d00, emissive: 0xe65100, emissiveIntensity: 0.4 }),
    asphalt: new THREE.MeshLambertMaterial({ color: 0x2a2e33 }),
    gravel: new THREE.MeshLambertMaterial({ color: 0xc4a36a }),
    soil: new THREE.MeshLambertMaterial({ color: 0x4e342e }),
    vest: new THREE.MeshLambertMaterial({ color: 0xff6d00, emissive: 0xff6d00, emissiveIntensity: 0.45 }),
    cloth: new THREE.MeshLambertMaterial({ color: 0x37474f }),
    skin: new THREE.MeshLambertMaterial({ color: 0xd7a57a }),
    helm: new THREE.MeshLambertMaterial({ color: 0xff8f00, emissive: 0xff8f00, emissiveIntensity: 0.35 }),
    excav: new THREE.MeshLambertMaterial({ color: 0xf9a825 }),
    glass: new THREE.MeshLambertMaterial({ color: 0x263238 }),
    light: new THREE.MeshLambertMaterial({ color: 0xffee58, emissive: 0xffee58, emissiveIntensity: 0.8 })
  };
  const coneGeo = new THREE.ConeGeometry(0.18, 0.48, 6);
  const tri = new THREE.Shape();
  tri.moveTo(0, 0.42);
  tri.lineTo(-0.38, -0.28);
  tri.lineTo(0.38, -0.28);
  tri.closePath();
  const triGeo = new THREE.ShapeGeometry(tri);

  function add(parent, geometry, material, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function makeCone(parent, x, z) {
    const c = add(parent, coneGeo, mat.cone, x, 0.3, z);
    c.receiveShadow = true;
    add(parent, cylinder(0.2, 0.2, 0.06, 6), mat.white, x, 0.04, z);
    add(parent, box(0.28, 0.06, 0.04), mat.white, x, 0.34, z);
    return c;
  }

  function makeSign(parent, x, z) {
    add(parent, cylinder(0.04, 0.04, 1.7, 6), mat.cloth, x, 0.85, z);
    const disc = add(parent, cylinder(0.34, 0.34, 0.06, 8), mat.red, x, 1.55, z);
    disc.rotation.x = Math.PI / 2;
    const band = add(parent, box(0.46, 0.08, 0.08), mat.white, x, 1.55, z);
    band.castShadow = true;
    const board = add(parent, triGeo, mat.work, x + 0.55, 1.55, z);
    board.castShadow = false;
  }

  function makeWorker(parent, x, z, yaw) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    add(g, box(0.16, 0.7, 0.16), mat.cloth, -0.1, 0.35, 0);
    add(g, box(0.16, 0.7, 0.16), mat.cloth, 0.1, 0.35, 0);
    add(g, box(0.42, 0.5, 0.26), mat.cloth, 0, 1.05, 0);
    add(g, box(0.46, 0.16, 0.28), mat.vest, 0, 1.18, 0);
    const head = add(g, box(0.22, 0.22, 0.22), mat.skin, 0, 1.48, 0);
    add(g, cylinder(0.16, 0.18, 0.12, 6), mat.helm, 0, 1.64, 0);
    const arm = new THREE.Group();
    arm.position.set(0.28, 1.25, 0);
    add(arm, box(0.1, 0.42, 0.1), mat.cloth, 0, -0.15, 0);
    add(arm, box(0.06, 0.06, 0.55), mat.cloth, 0.1, -0.4, 0.15);
    g.add(arm);
    parent.add(g);
    return { head, arm };
  }

  function makeExcavator(parent) {
    const g = new THREE.Group();
    add(g, box(0.28, 0.22, 1.3), mat.cloth, -0.38, 0.18, 0);
    add(g, box(0.28, 0.22, 1.3), mat.cloth, 0.38, 0.18, 0);
    add(g, box(0.7, 0.35, 1.1), mat.excav, 0, 0.48, 0.1);
    add(g, box(0.62, 0.42, 0.55), mat.excav, 0, 0.85, -0.15);
    add(g, box(0.5, 0.28, 0.08), mat.glass, 0, 0.88, -0.42);
    add(g, box(0.08, 0.08, 0.08), mat.light, 0.32, 0.7, 0.55);
    add(g, box(0.08, 0.08, 0.08), mat.light, -0.32, 0.7, 0.55);
    const boom = new THREE.Group();
    boom.position.set(0, 0.7, 0.45);
    add(boom, box(0.12, 0.12, 0.9), mat.excav, 0, 0.15, 0.4);
    const bucket = add(boom, box(0.36, 0.22, 0.28), mat.cloth, 0, -0.05, 0.9);
    g.add(boom);
    parent.add(g);
    g.position.set(0.15, 0, -1.6);
    return { boom, bucket };
  }

  function buildSlot() {
    const group = new THREE.Group();
    const far = new THREE.Group();
    const near = new THREE.Group();
    group.add(far, near);

    makeSign(far, -0.9, 3.2);
    makeSign(far, 0.9, 3.2);
    for (let i = 0; i < 5; i++) makeCone(far, -1.1 + i * 0.55, 4.1 - i * 0.15);

    for (let i = 0; i < 3; i++) {
      const shield = add(near, box(1.15, 0.7, 0.06), mat.stripe, -1.05 + i * 1.05, 0.7, 2.2);
      add(near, cylinder(0.04, 0.04, 0.7, 6), mat.cloth, shield.position.x - 0.4, 0.35, 2.2);
      add(near, cylinder(0.04, 0.04, 0.7, 6), mat.cloth, shield.position.x + 0.4, 0.35, 2.2);
    }
    for (const side of [-1, 1]) {
      makeCone(near, side * 1.15, 1.2);
      makeCone(near, side * 1.15, -0.6);
    }

    add(near, box(2.4, 0.08, 3.2), mat.soil, 0, 0.05, -0.2);
    add(near, box(1.7, 0.1, 2.2), mat.gravel, 0, 0.1, -0.15);
    add(near, box(1.1, 0.12, 1.4), mat.asphalt, 0, 0.16, -0.1);
    add(near, cylinder(0.08, 0.08, 0.9, 6), mat.cloth, 0.2, 0.22, -0.3).rotation.z = 0.6;
    for (let i = 0; i < 4; i++) {
      const chunk = add(near, box(0.35, 0.12, 0.28), mat.asphalt, -1.1 + i * 0.7, 0.2, 1.15);
      chunk.rotation.y = i * 0.4;
      chunk.rotation.z = 0.15 * (i % 2 ? 1 : -1);
    }

    const workers = [
      makeWorker(near, -0.7, 0.4, 0.4),
      makeWorker(near, 0.75, 0.15, -0.8)
    ];
    const digger = makeExcavator(near);
    group.visible = false;
    G.scene.add(group);
    return {
      group, far, near, workers, digger,
      active: false, s: 0, laneIdx: 0, lateralOffset: 0, length: 8
    };
  }

  for (let i = 0; i < POOL; i++) G.repairPool.push(buildSlot());

  function emptyEvent() {
    return { active: false, s: 0, laneIdx: 0, length: 0, laneOffset: 0, biome: '' };
  }

  function nextMark() {
    return G.REPAIR_MIN_DIST + (Math.random() * 2 - 1) * G.REPAIR_SPREAD;
  }

  function biomeId() {
    const index = Number.isInteger(G.biomeDominant) ? G.biomeDominant : G.currentBiome;
    const biome = G.BIOMES && G.BIOMES[index];
    return biome ? biome.id : '';
  }

  function biomeIdAt(s) {
    const biome = G.BIOMES[G.dominantBiomeAtS(s)];
    return biome ? biome.id : '';
  }

  function allowedHere() {
    return G.REPAIR_ALLOWED_BIOMES.includes(biomeId());
  }

  function allowedAt(s) {
    return G.REPAIR_ALLOWED_BIOMES.includes(biomeIdAt(s));
  }

  function siteBlocked(s) {
    const split = G.splitAmountAtS;
    if (split && (split(s) > 0.05 || split(s - 100) > 0.05 || split(s + 100) > 0.05)) return true;
    if (!allowedAt(s)) return true;
    for (const ms of G.megaStructures || []) {
      if (ms.visible && Math.abs(ms.userData.s - s) < 80) return true;
    }
    for (const ramp of G.rampsPool || []) {
      if (Math.abs(ramp.s - s) < 45) return true;
    }
    for (const exit of G.exitPool || []) {
      if (Math.abs(exit.s - s) < 55) return true;
    }
    for (const other of G.repairPool) {
      if (other.active && Math.abs(other.s - s) < 120) return true;
    }
    return false;
  }

  function spawnRepair() {
    if (G.repairEvent.active || !allowedHere()) return false;
    if (G.jumpState && G.jumpState.airborne) return false;
    let s = G.playerS + 200;
    for (let attempt = 0; attempt < 6 && siteBlocked(s); attempt++) s += 90;
    if (siteBlocked(s)) return false;
    const cfg = G.drivenLanesAt(s);
    const laneIdx = G.randomRunLane(s);
    const length = 6 + Math.random() * 4;
    const slot = G.repairPool.find((item) => !item.active);
    if (!slot) return false;
    slot.active = true;
    slot.s = s;
    slot.laneIdx = laneIdx;
    slot.lateralOffset = cfg.offsets[laneIdx];
    slot.length = length;
    slot.group.visible = true;
    slot.group.scale.set(1, 1, length / 8);
    G.repairEvent = {
      active: true,
      s,
      laneIdx,
      length,
      laneOffset: slot.lateralOffset,
      biome: biomeIdAt(s)
    };
    if (G.pushFeed) G.pushFeed('ВПЕРЕДИ РЕМОНТ ДОРОГИ', 'combo', 1, 'center');
    return true;
  }
  G.spawnRepair = spawnRepair;

/** Попадание в яму в мировых метрах поперёк дороги, как и сама отрисовка. */
function checkRepairCollision(playerS, playerWorldLat, halfW = 1.7) {
  const ev = G.repairEvent;
  if (!ev.active) return false;
  const siteLat = G.drivenLaneAt(ev.s, G.holdDrivenLane(ev.s, ev.laneOffset));
  const along = Math.abs(playerS - ev.s) < ev.length * 0.5 + 1;
  return along && Math.abs(playerWorldLat - siteLat) < halfW;
}
  G.checkRepairCollision = checkRepairCollision;

  function updateRepair(dt, now) {
    if (G.started && !G.ended && allowedHere()) {
      G.repairProgress += G.speed * dt / 3.6;
    }
    if (G.started && !G.ended && !G.repairEvent.active && allowedHere() && G.repairProgress >= G.repairNextS) {
      if (spawnRepair()) {
        G.repairProgress = 0;
        G.repairNextS = nextMark();
      }
    }

    const ev = G.repairEvent;
    const slot = ev.active ? G.repairPool.find((item) => item.active && item.s === ev.s) : null;
    if (!slot) return;

    if (slot.s < G.playerS - 100) {
      slot.active = false;
      slot.group.visible = false;
      G.repairEvent = emptyEvent();
      return;
    }

    const worldLat = G.drivenLaneAt(slot.s, G.holdDrivenLane(slot.s, slot.lateralOffset));
    G.placeOnRoad(slot.group, slot.s, worldLat, 0);
    const dist = Math.abs(slot.s - G.playerS);
    slot.near.visible = dist < 150;
    const wave = Math.sin(now * 0.001);
    for (const worker of slot.workers) {
      worker.head.rotation.y = wave * 0.35;
      worker.arm.rotation.x = wave * 0.5;
    }
    slot.digger.boom.rotation.x = Math.sin(now * 0.0005) * 0.18;

    if (!G.started || G.ended || (G.jumpState && G.jumpState.airborne)) return;
    if (G.speed <= 8 || G.accidentCooldown > 0 || G.uiModal) return;
    const bikeLat = G.riderLatAt(G.playerS);
    const half = playerHalfWidth(!!(G.frameStats && G.frameStats.isQute));
    if (!checkRepairCollision(G.playerS, bikeLat, 1.7 + half)) return;
    G.accidentCooldown = 2.5;
    if (G.handleAccident) G.handleAccident(null);
  }
  G.updateRepair = updateRepair;

  G.resetRepair = () => {
    for (const slot of G.repairPool) {
      slot.active = false;
      slot.group.visible = false;
    }
    G.repairEvent = emptyEvent();
    G.repairProgress = 0;
    G.repairNextS = nextMark();
  };
}
