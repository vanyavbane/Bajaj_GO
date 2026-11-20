import * as THREE from 'three';
import { box, cylinder } from './geom.js';
import { worldEdge } from './engine/fork.js';
import { G } from './state.js';

/* =========================================================================
 * 5e. НАБЕРЕЖНАЯ
 * -------------------------------------------------------------------------
 * Панорамная набережная вдоль реки: слева классицистические фасады и
 * тротуар, справа брусчатая пешеходная зона, гранитный парапет, пандус к
 * воде, старинные фонари, синие знаки, тёмная река с рябью, мост и силуэты
 * противоположного берега вдали. Всё процедурно и в InstancedMesh.
 * ========================================================================= */

export const EMBANKMENT_CFG = {
  CHUNK_M: 50,
  VIEW_AHEAD: 420,
  VIEW_BEHIND: 80,
  FACADE_DEPTH: 15,
  FACADE_W: 16,
  FACADE_H_MIN: 16,
  FACADE_H_MAX: 26,
  PARAPET_DEPTH: 17,
  WATER_DEPTH: 24,
  WATER_Y: -6,
  RIVER_LAT: 136,
  LAMP_STEP: 14,
  SIGN_STEP: 30,
  PED_COUNT: 26,
  BRIDGE_EVERY: 800,
  BANK_LAT: 130,
  CAR_GAP: 1
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

export function initEmbankment() {
  const CFG = EMBANKMENT_CFG;
  const EMBANKMENT_INDEX = (G.BIOMES || []).findIndex((b) => b.id === 'embankment');

  /* ---------- Текстуры ---------- */
  function facadeTexture(base, trim, wins) {
    return G.createCanvasTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      // Рустовка: горизонтальные швы и вертикальные поля.
      ctx.strokeStyle = 'rgba(0,0,0,0.10)';
      ctx.lineWidth = 2;
      for (let y = 0; y < h; y += 22) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      for (let x = 0; x < w; x += 64) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      // Окна с белыми наличниками и карнизаками.
      const cols = 4, rows = wins;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cw = (w - 40) / cols;
          const ch = (h - 70) / rows;
          const x = 20 + c * cw + cw * 0.18;
          const y = 34 + r * ch + ch * 0.16;
          const ww = cw * 0.64;
          const wh = ch * 0.62;
          ctx.fillStyle = trim;
          ctx.fillRect(x - 6, y - 8, ww + 12, wh + 16);
          ctx.fillStyle = '#1e2c34';
          ctx.fillRect(x, y, ww, wh);
          ctx.fillStyle = 'rgba(255,255,255,0.28)';
          ctx.fillRect(x, y, ww, wh * 0.28);
          ctx.fillStyle = trim;
          ctx.fillRect(x - 6, y + wh + 8, ww + 12, 6);
        }
      }
      // Карниз и цоколь.
      ctx.fillStyle = trim;
      ctx.fillRect(0, 0, w, 16);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, h - 30, w, 30);
    }, 1, 1);
  }

  const texTurq = facadeTexture('#8fbfb2', '#e8f0ea', 5);
  const texBeige = facadeTexture('#d9c69c', '#f2e8d4', 5);
  const texYellow = facadeTexture('#e0d0a0', '#f6efdd', 4);

  const waterTex = G.createCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#1d3a5c';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const y = Math.random() * h;
      const x = Math.random() * w;
      const len = 8 + Math.random() * 30;
      ctx.strokeStyle = `rgba(150,200,240,${0.05 + Math.random() * 0.16})`;
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y + (Math.random() - 0.5) * 3); ctx.stroke();
    }
  }, 6, 6);
  waterTex.wrapS = THREE.RepeatWrapping;
  waterTex.wrapT = THREE.RepeatWrapping;

  const cobbleTex = G.createCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#8d9298';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      for (let x = 0; x < w; x += 24) {
        const off = (y / 16) % 2 === 0 ? 0 : 12;
        ctx.fillStyle = `rgb(${120 + Math.random() * 30},${124 + Math.random() * 30},${130 + Math.random() * 30})`;
        ctx.fillRect(x + off, y + 1, 22, 14);
      }
    }
  }, 4, 20);
  cobbleTex.wrapS = THREE.RepeatWrapping;
  cobbleTex.wrapT = THREE.RepeatWrapping;

  /* ---------- Материалы ---------- */
  const M = (color, extra) => new THREE.MeshLambertMaterial(Object.assign({ color, flatShading: true, transparent: true }, extra));
  const mats = {
    turq: new THREE.MeshLambertMaterial({ map: texTurq, transparent: true }),
    beige: new THREE.MeshLambertMaterial({ map: texBeige, transparent: true }),
    yellow: new THREE.MeshLambertMaterial({ map: texYellow, transparent: true }),
    granite: M(0x7d8288),
    graniteDark: M(0x5f646a),
    cobble: new THREE.MeshLambertMaterial({ map: cobbleTex, transparent: true }),
    water: new THREE.MeshLambertMaterial({ map: waterTex, color: 0x2a5a8a, transparent: true, opacity: 0.94 }),
    iron: M(0x1c2026),
    lampGlow: M(0xfff2c8, { emissive: 0xffd98a, emissiveIntensity: 0.9 }),
    sign: M(0x1565c0),
    ped: M(0xffffff),
    pedHead: M(0xe0ac69),
    boat: M(0xf2f5f7),
    boatBlue: M(0x1e5fa8),
    bridge: M(0x6a7076),
    bank: M(0x3d4650)
  };
  const fadeMats = Object.values(mats);

  /* ---------- Пулы ---------- */
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

  const unitBox = box(1, 1, 1);
  const pools = {
    turq: instance(unitBox, mats.turq, 90, true),
    beige: instance(unitBox, mats.beige, 90, true),
    yellow: instance(unitBox, mats.yellow, 60, true),
    parapet: instance(unitBox, mats.granite, 220, false),
    ramp: instance(unitBox, mats.graniteDark, 120, false),
    lampPole: instance(cylinder(0.09, 0.13, 1, 6), mats.iron, 160, true),
    lampArm: instance(unitBox, mats.iron, 160, false),
    lampHead: instance(new THREE.IcosahedronGeometry(0.28, 0), mats.lampGlow, 160, false),
    signPole: instance(cylinder(0.05, 0.06, 1, 5), mats.iron, 80, false),
    signBoard: instance(unitBox, mats.sign, 80, false),
    pedTorso: instance(unitBox, mats.ped, 60, false),
    pedHead: instance(unitBox, mats.pedHead, 60, false),
    boatHull: instance(unitBox, mats.boat, 20, false),
    boatCabin: instance(unitBox, mats.boatBlue, 20, false),
    bank: instance(unitBox, mats.bank, 220, false)
  };

  /* ---------- Река и брусчатка: два длинных полотна ---------- */
  const river = new THREE.Mesh(new THREE.PlaneGeometry(220, 1200), mats.water);
  river.rotation.x = -Math.PI / 2;
  river.position.y = CFG.WATER_Y;
  river.visible = false;
  G.scene.add(river);

  const cobble = new THREE.Mesh(new THREE.PlaneGeometry(9, 1200), mats.cobble);
  cobble.rotation.x = -Math.PI / 2;
  cobble.position.y = 0.06;
  cobble.visible = false;
  G.scene.add(cobble);

  /* ---------- Мост через реку ---------- */
  function buildBridge() {
    const g = new THREE.Group();
    const deck = new THREE.Mesh(box(150, 1.2, 9), mats.bridge);
    deck.position.set(0, -1.5, 0);
    g.add(deck);
    for (const px of [-55, 0, 55]) {
      const pier = new THREE.Mesh(box(6, 6, 8), mats.bridge);
      pier.position.set(px, -4.5, 0);
      g.add(pier);
    }
    for (const px of [-70, 70]) {
      const tower = new THREE.Mesh(box(4, 14, 10), mats.bridge);
      tower.position.set(px, 2, 0);
      g.add(tower);
      const arch = new THREE.Mesh(box(20, 1.4, 9), mats.bridge);
      arch.position.set(px * 0.5, -0.5, 0);
      g.add(arch);
    }
    g.visible = false;
    G.scene.add(g);
    return g;
  }
  const bridges = [buildBridge(), buildBridge(), buildBridge()];

  /* ---------- Вспомогательные ---------- */
  const dummy = new THREE.Object3D();
  const UP = new THREE.Vector3(0, 1, 0);
  const qYaw = new THREE.Quaternion();

  /** Плоскость, лежащая вдоль дороги: позиция от кромки, поворот по курсу. */
  function placeFlat(obj, s, lat, y) {
    const pose = G.embedRoad(s, lat);
    obj.position.set(pose.x, y, pose.z);
    obj.rotation.order = 'YXZ';
    obj.rotation.set(-Math.PI / 2, Math.atan2(-pose.fx, -pose.fz), 0);
  }

  function put(pool, s, lat, yOff, sx, sy, sz, yaw, counter) {
    if (counter.value >= pool.instanceMatrix.count) return;
    G.placeOnRoad(dummy, s, lat, yOff);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    pool.setMatrixAt(counter.value++, dummy.matrix);
  }

  function embK(s) {
    if (EMBANKMENT_INDEX < 0) return 0;
    const w = G.biomeWeightsAtS(s);
    return smooth01(((w[EMBANKMENT_INDEX] || 0) - 0.02) / 0.4);
  }

  /* ---------- Генерация чанка ---------- */
  function buildChunk(ci, counters) {
    const rng = makeRandom(((ci * 0x27d4eb2f) ^ 0x9e3779b1) >>> 0);
    const startS = ci * CFG.CHUNK_M;

    // Фасады слева: непрерывная линия классицизма с вариациями.
    for (let d = 0; d < CFG.CHUNK_M; d += CFG.FACADE_W) {
      const s = startS + d + CFG.FACADE_W * 0.5;
      const k = embK(s);
      if (k < 0.03) continue;
      const frame = G.roadsideFrameAt(s);
      const edge = worldEdge(frame.edges, -1, frame.origin);
      const lat = edge - CFG.FACADE_DEPTH;
      const h = (CFG.FACADE_H_MIN + rng() * (CFG.FACADE_H_MAX - CFG.FACADE_H_MIN)) * k;
      const w = CFG.FACADE_W * (0.96 + rng() * 0.08);
      const dep = (10 + rng() * 3) * k;
      const yaw = (rng() - 0.5) * 0.03;
      const roll = rng();
      const pool = roll < 0.4 ? pools.turq : roll < 0.75 ? pools.beige : pools.yellow;
      put(pool, s, lat, h * 0.5, w, h, dep, yaw, counters[pool === pools.turq ? 'turq' : pool === pools.beige ? 'beige' : 'yellow']);
    }

    // Парапет и пандус справа.
    for (let d = 0; d < CFG.CHUNK_M; d += 8) {
      const s = startS + d;
      const k = embK(s);
      if (k < 0.03) continue;
      const frame = G.roadsideFrameAt(s);
      const edge = worldEdge(frame.edges, 1, frame.origin);
      const lat = edge + CFG.PARAPET_DEPTH;
      put(pools.parapet, s, lat, 0.55 * k, 8, 1.1 * k, 0.7 * k, 0, counters.parapet);
    }
    for (let d = 0; d < CFG.CHUNK_M; d += 16) {
      const s = startS + d + 8;
      const k = embK(s);
      if (k < 0.03) continue;
      const frame = G.roadsideFrameAt(s);
      const edge = worldEdge(frame.edges, 1, frame.origin);
      for (let step = 0; step < 5; step++) {
        const lat = edge + CFG.PARAPET_DEPTH + 1 + step * 1.6;
        const y = -0.4 - step * 1.1;
        put(pools.ramp, s, lat, y * k, 4, 0.5, 1.6, 0, counters.ramp);
      }
    }

    // Фонари вдоль набережной.
    for (let d = 0; d < CFG.CHUNK_M; d += CFG.LAMP_STEP) {
      const s = startS + d;
      const k = embK(s);
      if (k < 0.03) continue;
      const frame = G.roadsideFrameAt(s);
      const rightEdge = worldEdge(frame.edges, 1, frame.origin);
      const leftEdge = worldEdge(frame.edges, -1, frame.origin);
      const h = 5.2 * k;
      put(pools.lampPole, s, rightEdge + 15.5 * k, h * 0.5, k, h, k, 0, counters.lampPole);
      put(pools.lampArm, s, rightEdge + 15.5 * k, h + 0.1, 1.6 * k, 0.16 * k, 0.16 * k, 0, counters.lampArm);
      put(pools.lampHead, s, rightEdge + 16.1 * k, h - 0.15, k, k, k, 0, counters.lampHead);
      if (rng() < 0.5) {
        put(pools.lampPole, s + 7, leftEdge - 12.5 * k, h * 0.5, k, h, k, 0, counters.lampPole);
        put(pools.lampArm, s + 7, leftEdge - 12.5 * k, h + 0.1, 1.6 * k, 0.16 * k, 0.16 * k, 0, counters.lampArm);
        put(pools.lampHead, s + 7, leftEdge - 13.1 * k, h - 0.15, k, k, k, 0, counters.lampHead);
      }
    }

    // Синие знаки вдоль пешеходной зоны.
    for (let d = 0; d < CFG.CHUNK_M; d += CFG.SIGN_STEP) {
      const s = startS + d;
      const k = embK(s);
      if (k < 0.03) continue;
      const frame = G.roadsideFrameAt(s);
      const edge = worldEdge(frame.edges, 1, frame.origin);
      put(pools.signPole, s, edge + 13 * k, 1.4 * k, k, 2.8 * k, k, 0, counters.signPole);
      put(pools.signBoard, s, edge + 13 * k, 2.9 * k, 1.2 * k, 0.8 * k, 0.1 * k, 0, counters.signBoard);
    }

    // Силуэты противоположного берега.
    for (let d = 0; d < CFG.CHUNK_M; d += 22) {
      const s = startS + d;
      const k = embK(s);
      if (k < 0.05) continue;
      const frame = G.roadsideFrameAt(s);
      const edge = worldEdge(frame.edges, 1, frame.origin);
      const lat = edge + CFG.BANK_LAT + rng() * 50;
      const h = (12 + rng() * 22) * k;
      put(pools.bank, s, lat, h * 0.5 - 2, 16 + rng() * 14, h, 14, 0, counters.bank);
    }
  }

  /* ---------- Пешеходы и катера: отдельные пулы на чанк ---------- */
  function buildPeople(ci, counters) {
    const rng = makeRandom(((ci * 0x1234567) ^ 0x7654321) >>> 0);
    const startS = ci * CFG.CHUNK_M;
    for (let i = 0; i < CFG.PED_COUNT; i++) {
      const s = startS + rng() * CFG.CHUNK_M;
      const k = embK(s);
      if (k < 0.05) continue;
      const frame = G.roadsideFrameAt(s);
      const left = rng() < 0.55;
      const edge = worldEdge(frame.edges, left ? -1 : 1, frame.origin);
      const lat = edge + (left ? -1 : 1) * (11 + rng() * 3.5) * k;
      const h = (1.7 + rng() * 0.25) * k;
      const yaw = rng() * Math.PI * 2;
      put(pools.pedTorso, s, lat, h * 0.62, 0.46 * k, 0.72 * k, 0.28 * k, yaw, counters.pedTorso);
      put(pools.pedHead, s, lat, h * 1.08, 0.3 * k, 0.3 * k, 0.3 * k, yaw, counters.pedHead);
    }
    for (let d = 0; d < CFG.CHUNK_M; d += 250) {
      if (rng() < 0.5) continue;
      const s = startS + d + rng() * 40;
      const k = embK(s);
      if (k < 0.05) continue;
      const frame = G.roadsideFrameAt(s);
      const edge = worldEdge(frame.edges, 1, frame.origin);
      const lat = edge + (40 + rng() * 25) * k;
      const yaw = rng() * Math.PI * 2;
      put(pools.boatHull, s, lat, CFG.WATER_Y + 0.5 * k, 7 * k, 1.2 * k, 2.6 * k, yaw, counters.boatHull);
      put(pools.boatCabin, s, lat, CFG.WATER_Y + 1.4 * k, 3.4 * k, 1.1 * k, 2.0 * k, yaw, counters.boatCabin);
    }
  }

  function rebuild() {
    const pc = Math.floor(G.playerS / CFG.CHUNK_M);
    const from = pc - Math.ceil(CFG.VIEW_BEHIND / CFG.CHUNK_M);
    const to = pc + Math.ceil(CFG.VIEW_AHEAD / CFG.CHUNK_M);
    const counters = {};
    for (const key of Object.keys(pools)) counters[key] = { value: 0 };
    for (let ci = from; ci <= to; ci++) {
      buildChunk(ci, counters);
      buildPeople(ci, counters);
    }
    for (const key of Object.keys(pools)) {
      const pool = pools[key];
      const c = counters[key].value;
      pool.count = c;
      pool.instanceMatrix.needsUpdate = true;
    }
  }

  let lastChunk = NaN;
  let lastBridgeS = NaN;
  function updateEmbankment(dt) {
    const pc = Math.floor(G.playerS / CFG.CHUNK_M);
    if (pc !== lastChunk) {
      lastChunk = pc;
      rebuild();
    }
    const w = EMBANKMENT_INDEX >= 0 ? (G.biomeWeightsAtS(G.playerS)[EMBANKMENT_INDEX] || 0) : 0;
    const op = smooth01((w - 0.02) / 0.4);
    for (const m of fadeMats) m.opacity = op;
    const visible = op > 0.02;
    for (const pool of Object.values(pools)) pool.visible = visible && pool.count > 0;
    river.visible = visible;
    cobble.visible = visible;

    // Река и брусчатка едут с игроком: бесконечная лента вдоль дороги.
    if (visible) {
      placeFlat(river, G.playerS + 260, CFG.RIVER_LAT, CFG.WATER_Y);
      placeFlat(cobble, G.playerS + 260, 13, 0.06);
      waterTex.offset.x += dt * 0.012;
      waterTex.offset.y += dt * 0.02;
    }

    // Мосты стоят через каждые 800 м абсолютного пробега.
    const baseBridge = Math.floor((G.playerS - 200) / CFG.BRIDGE_EVERY) * CFG.BRIDGE_EVERY + 400;
    if (baseBridge !== lastBridgeS) {
      lastBridgeS = baseBridge;
      for (let i = 0; i < bridges.length; i++) {
        const s = baseBridge + i * CFG.BRIDGE_EVERY;
        const g = bridges[i];
        G.placeOnRoad(g, s, 80, 0);
        g.visible = true;
      }
    }
    for (const g of bridges) g.visible = visible;
  }

  rebuild();
  G.updateEmbankment = updateEmbankment;
  G.resetEmbankment = () => {
    lastChunk = NaN;
    lastBridgeS = NaN;
    rebuild();
  };
  G.embankmentInfo = () => {
    const counts = {};
    let total = 0;
    for (const [key, pool] of Object.entries(pools)) {
      counts[key] = pool.count;
      total += pool.count;
    }
    return { total, counts };
  };
}
