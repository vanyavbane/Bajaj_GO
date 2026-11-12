import * as THREE from 'three';
import { G } from '../state.js';
import { box, cylinder } from '../geom.js';

/* =========================================================================
 * МОДЕЛИ ТРАФИКА
 * -------------------------------------------------------------------------
 * Все машины собраны из воксельных блоков. hiDetail — близкий вид (кабина,
 * двери, арки, диски, оптика, номера), loDetail — силуэт для дальнего LOD.
 * Материалы и геометрии общие: цвет кузова детерминирован по индексу пула,
 * поэтому после recycling машина сохраняет окрас.
 * ========================================================================= */

const TAU = Math.PI * 2;
const PLATE_TEXT = ['А123ВС 77', 'В456ЕК 50', 'Е789МН 99', 'К321ОР 47', 'М654СТ 78', 'Н987УХ 23', 'О147АВ 116', 'Р258ВЕ 61', 'С369КМ 36', 'Т741НР 52'];
const HEAVY_TYPES = new Set(['kamaz', 'truck', 'bus']);

/* ---------- материалы ---------- */

const paints = new Map();
function paint(color) {
  let mat = paints.get(color);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.34,
      metalness: 0.35,
      envMapIntensity: 1.15
    });
    paints.set(color, mat);
  }
  return mat;
}

const headMat = new THREE.MeshStandardMaterial({ color: 0xfff8e1, emissive: 0xffe082, emissiveIntensity: 1.7, roughness: 0.18 });
const tailMat = new THREE.MeshStandardMaterial({ color: 0xff1744, emissive: 0xd50000, emissiveIntensity: 1.15, roughness: 0.3 });
const brakeMat = new THREE.MeshStandardMaterial({ color: 0xff5252, emissive: 0xff1744, emissiveIntensity: 1.4, roughness: 0.3 });
const reverseMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff7e0, emissiveIntensity: 1.0, roughness: 0.25 });
const amberMat = new THREE.MeshStandardMaterial({ color: 0xffb300, emissive: 0xff8f00, emissiveIntensity: 1.25, roughness: 0.35 });
const drlMat = new THREE.MeshStandardMaterial({ color: 0xf4f8ff, emissive: 0xdfe9ff, emissiveIntensity: 1.5, roughness: 0.2 });
const redReflectorMat = new THREE.MeshStandardMaterial({ color: 0xb71c1c, emissive: 0x7f0000, emissiveIntensity: 0.45, roughness: 0.4 });
const bedMat = new THREE.MeshStandardMaterial({ color: 0x5d646e, roughness: 0.72, metalness: 0.2 });
const crateMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.9 });
const tentMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.92 });
const rubberDark = new THREE.MeshStandardMaterial({ color: 0x0b0e12, roughness: 0.95, metalness: 0.02 });
const carGlassMat = new THREE.MeshStandardMaterial({
  color: 0x1a2a3a,
  roughness: 0.06,
  metalness: 0.55,
  envMapIntensity: 1.35,
  transparent: true,
  opacity: 0.62
});
const alertMat = new THREE.MeshBasicMaterial({ color: 0xffab00 });
const taxiSignMat = new THREE.MeshStandardMaterial({ color: 0xffeb3b, emissive: 0xffa000, emissiveIntensity: 1.0, roughness: 0.3 });
const busSignMat = new THREE.MeshStandardMaterial({ color: 0xfff3c0, emissive: 0xffd54f, emissiveIntensity: 0.9, roughness: 0.35 });

// Блик фары встречной машины: additive-спрайт, а не постобработка.
let headGlowMat = null;
function getHeadGlowMat() {
  if (!headGlowMat) {
    headGlowMat = new THREE.SpriteMaterial({
      map: G.glowTex,
      color: 0xffe6b0,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
  }
  return headGlowMat;
}

const plateMats = new Map();
function plateMaterial(idx, yellow) {
  const key = (yellow ? 'y' : 'w') + (idx % PLATE_TEXT.length);
  let mat = plateMats.get(key);
  if (!mat) {
    const text = PLATE_TEXT[idx % PLATE_TEXT.length];
    const tex = G.createCanvasTexture(256, 64, (ctx, w, h) => {
      ctx.fillStyle = yellow ? '#f2c200' : '#f5f5f5';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = yellow ? '#3a2c00' : '#181818';
      ctx.lineWidth = 6;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      ctx.fillStyle = '#111111';
      ctx.font = 'bold 38px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2 + 2);
    });
    mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.1 });
    plateMats.set(key, mat);
  }
  return mat;
}

/* ---------- геометрия ---------- */

function add(parent, geo, mat, x, y, z, castShadow = false) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  if (castShadow) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  parent.add(mesh);
  return mesh;
}

function b(parent, w, h, d, mat, x, y, z, castShadow = false) {
  return add(parent, box(w, h, d), mat, x, y, z, castShadow);
}

function cylX(parent, radius, width, mat, x, y, z, seg = 12) {
  const mesh = new THREE.Mesh(cylinder(radius, radius, width, seg), mat);
  mesh.rotation.z = Math.PI / 2;
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function cylY(parent, radius, height, mat, x, y, z, seg = 10) {
  const mesh = new THREE.Mesh(cylinder(radius, radius, height, seg), mat);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function addWheel(hiDetail, wheels, frontPivots, x, z, radius, width, isFront, opts = {}) {
  const pivot = new THREE.Group();
  pivot.position.set(x, radius, z);
  const spin = new THREE.Group();
  pivot.add(spin);

  const tire = new THREE.Mesh(cylinder(radius, radius, width, opts.heavy ? 14 : 12), G.M.rubber);
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  spin.add(tire);

  // Боковины шины: два тёмных кольца по краям — визуальный протектор.
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(cylinder(radius * 0.93, radius * 0.93, 0.035, 14), rubberDark);
    side.rotation.z = Math.PI / 2;
    side.position.x = sx * (width / 2 - 0.005);
    spin.add(side);
  }

  cylX(spin, radius * 0.58, width + 0.02, opts.heavy ? G.M.metalDark : G.M.chrome, 0, 0, 0, 10);
  const sideSign = x >= 0 ? 1 : -1;
  const faceX = sideSign * (width / 2 + 0.025);

  const spokeCount = opts.heavy ? 6 : 5;
  if (opts.spokes !== false) {
    for (let i = 0; i < spokeCount; i += 1) {
      const spoke = b(spin, 0.035, radius * 0.95, opts.heavy ? 0.1 : 0.07, G.M.chrome, faceX, 0, 0);
      spoke.rotation.x = (i / spokeCount) * Math.PI;
    }
  }
  cylX(spin, radius * 0.2, width + 0.09, G.M.chrome, 0, 0, 0, 10);

  // Болты вокруг втулки.
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * TAU;
    b(spin, 0.03, 0.04, 0.04, G.M.metalDark, faceX, Math.cos(a) * radius * 0.32, Math.sin(a) * radius * 0.32);
  }
  if (opts.caliper) {
    b(spin, 0.06, radius * 0.32, radius * 0.24, G.M.filterRed, -sideSign * (width * 0.18), radius * 0.12, 0);
  }

  hiDetail.add(pivot);
  wheels.push(spin);
  if (isFront) frontPivots.push(pivot);
}

function addWheelSet(hiDetail, wheels, frontPivots, halfW, zF, zR, radius, width, opts = {}) {
  const x = halfW - 0.02;
  if (zF != null) {
    addWheel(hiDetail, wheels, frontPivots, -x, zF, radius, width, true, { ...opts, caliper: true });
    addWheel(hiDetail, wheels, frontPivots, x, zF, radius, width, true, { ...opts, caliper: true });
  }
  const rearZ = Array.isArray(zR) ? zR : [zR];
  for (const z of rearZ) {
    if (opts.dualRear) {
      addWheel(hiDetail, wheels, frontPivots, -x, z, radius, width, false, opts);
      addWheel(hiDetail, wheels, frontPivots, x, z, radius, width, false, opts);
      addWheel(hiDetail, wheels, frontPivots, -(x - width - 0.06), z, radius, width, false, opts);
      addWheel(hiDetail, wheels, frontPivots, (x - width - 0.06), z, radius, width, false, opts);
    } else {
      addWheel(hiDetail, wheels, frontPivots, -x, z, radius, width, false, opts);
      addWheel(hiDetail, wheels, frontPivots, x, z, radius, width, false, opts);
    }
  }
}

function addArch(parent, side, halfW, z, radius, bodyMat, blackPlastic = false) {
  const x = side * (halfW + 0.005);
  const trim = blackPlastic ? G.M.mattePlastic : bodyMat;
  // Внутренняя арка: тёмный свод, чтобы из-под крыла не просвечивал фон.
  b(parent, 0.07, radius * 1.45, radius * 2.05, G.M.mattePlastic, side * (halfW - 0.12), radius, z);
  // Внешняя накладка по контуру арки.
  b(parent, 0.07, 0.08, radius * 2.12, trim, x, radius * 1.5, z);
  b(parent, 0.07, radius * 0.9, 0.09, trim, x, radius * 1.3, z - radius * 0.98);
  b(parent, 0.07, radius * 0.9, 0.09, trim, x, radius * 1.3, z + radius * 0.98);
  // Брызговик за аркой.
  b(parent, 0.06, 0.24, 0.1, G.M.mattePlastic, x, radius * 0.85, z + radius + 0.08);
}

function addDoor(parent, side, halfW, z, len, height, y, bodyMat, opts = {}) {
  const x = side * (halfW + 0.025);
  const dk = G.M.mattePlastic;
  b(parent, 0.05, height, len, bodyMat, x, y, z);
  // Контур двери: 4 тонких блока по периметру.
  const cx = x + side * 0.035;
  b(parent, 0.02, 0.03, len, dk, cx, y + height / 2, z);
  b(parent, 0.02, 0.03, len, dk, cx, y - height / 2, z);
  b(parent, 0.02, height, 0.03, dk, cx, y, z - len / 2);
  b(parent, 0.02, height, 0.03, dk, cx, y, z + len / 2);
  // Ручка у задней кромки, линия остекления, молдинг, замок.
  if (opts.verticalHandle) {
    b(parent, 0.04, 0.18, 0.05, G.M.chrome, cx, y + height * 0.18, z + len * 0.32);
  } else {
    b(parent, 0.04, 0.035, 0.1, G.M.chrome, cx, y + height * 0.3, z + len * 0.3);
  }
  b(parent, 0.02, 0.025, len * 0.86, G.M.chrome, cx, y + height * 0.45, z);
  b(parent, 0.025, 0.04, len * 0.9, dk, cx, y - height * 0.34, z);
  if (opts.lock !== false) b(parent, 0.02, 0.03, 0.03, G.M.chrome, cx, y + height * 0.15, z - len * 0.34);
  if (opts.step) {
    b(parent, 0.5, 0.07, 0.55, G.M.metalDark, side * (halfW - 0.18), y - height / 2 - 0.16, z);
    b(parent, 0.06, 0.16, 0.6, G.M.metalDark, side * (halfW - 0.42), y - height / 2 - 0.05, z);
  }
}

function addMirror(parent, side, x, y, z, bodyMat, big = false) {
  const s = side;
  const scale = big ? 1.55 : 1;
  b(parent, 0.18 * scale, 0.035, 0.035, G.M.mattePlastic, x + s * 0.1 * scale, y + 0.03, z);
  b(parent, 0.18 * scale, 0.035, 0.035, G.M.mattePlastic, x + s * 0.1 * scale, y - 0.03, z);
  b(parent, 0.11 * scale, 0.13 * scale, 0.22 * scale, bodyMat, x + s * 0.2 * scale, y, z);
  b(parent, 0.012, 0.09 * scale, 0.16 * scale, carGlassMat, x + s * 0.26 * scale, y, z);
  b(parent, 0.02, 0.035, 0.06, amberMat, x + s * 0.2 * scale, y - 0.045 * scale, z - 0.1 * scale);
  if (big) {
    b(parent, 0.08, 0.16, 0.1, G.M.mattePlastic, x + s * 0.22, y - 0.16, z);
    b(parent, 0.012, 0.1, 0.07, carGlassMat, x + s * 0.27, y - 0.16, z);
  }
}

function addHeadlight(parent, x, y, z, w, h) {
  b(parent, w + 0.06, h + 0.06, 0.05, G.M.chrome, x, y, z + 0.02);
  b(parent, w, h, 0.07, headMat, x, y, z);
  b(parent, w * 0.84, h * 0.28, 0.025, drlMat, x, y + h * 0.26, z - 0.035);
  const glare = new THREE.Sprite(getHeadGlowMat());
  glare.position.set(x, y, z - 0.07);
  glare.scale.set(0.95, 0.95, 1);
  parent.add(glare);
}

function addTaillight(parent, x, y, z, w, h) {
  b(parent, w + 0.04, h + 0.04, 0.045, G.M.mattePlastic, x, y, z - 0.01);
  b(parent, w, h, 0.05, tailMat, x, y, z);
  b(parent, w * 0.42, h * 0.32, 0.02, reverseMat, x - w * 0.22, y - h * 0.18, z + 0.03);
  b(parent, w * 0.34, h * 0.28, 0.02, brakeMat, x + w * 0.28, y + h * 0.2, z + 0.03);
}

function addBlinker(parent, blinkers, x, y, z, w = 0.12, h = 0.09) {
  const mesh = b(parent, w, h, 0.05, amberMat, x, y, z);
  mesh.visible = false;
  blinkers.push(mesh);
}

function addPlate(parent, idx, x, y, z, yellow = false) {
  const mesh = b(parent, 0.52, 0.13, 0.02, plateMaterial(idx, yellow), x, y, z);
  return mesh;
}

function addPlateLight(parent, x, y, z) {
  b(parent, 0.05, 0.025, 0.02, reverseMat, x - 0.2, y, z);
  b(parent, 0.05, 0.025, 0.02, reverseMat, x + 0.2, y, z);
}

function roundedRoof(parent, w, roofY, len, z, mat, steps = 2) {
  for (let i = 0; i < steps; i += 1) {
    const inset = (i + 1) * 0.06;
    const ww = w - inset * 2;
    if (ww <= 0) break;
    b(parent, ww, 0.055, len - inset * 2, mat, 0, roofY + 0.035 - i * 0.045, z);
  }
}

/* ---------- легковые ---------- */

const PASSENGER_SPECS = {
  sedan: { w: 1.82, L: 4.52, roof: 1.65, r: 0.4, ww: 0.26, zF: -1.38, zR: 1.36, cabH: 0.58, cabLen: 2.05, cabZ: -0.1, style: 'sedan' },
  hatchback: { w: 1.76, L: 4.0, roof: 1.55, r: 0.38, ww: 0.24, zF: -1.22, zR: 1.18, cabH: 0.52, cabLen: 2.1, cabZ: 0.05, style: 'hatch' },
  crossover: { w: 1.92, L: 4.68, roof: 1.78, r: 0.46, ww: 0.28, zF: -1.44, zR: 1.4, cabH: 0.62, cabLen: 2.4, cabZ: 0.0, style: 'crossover' },
  taxi: { w: 1.82, L: 4.52, roof: 1.7, r: 0.4, ww: 0.26, zF: -1.38, zR: 1.36, cabH: 0.6, cabLen: 2.05, cabZ: -0.08, style: 'taxi' },
  suv: { w: 2.08, L: 4.7, roof: 1.95, r: 0.48, ww: 0.32, zF: -1.46, zR: 1.42, cabH: 0.68, cabLen: 2.45, cabZ: 0.0, style: 'suv' }
};

function buildPassenger(hiDetail, loDetail, bodyMat, wheels, frontPivots, blinkers, type, idx, spec) {
  const { w, L, roof, r, ww, zF, zR, cabH, cabLen, cabZ, style } = spec;
  const halfW = w / 2;
  const halfL = L / 2;
  const belt = roof - cabH - 0.1;
  const lowerBottom = 0.3;
  const bodyH = belt - lowerBottom;
  const bodyY = lowerBottom + bodyH / 2;
  const blackPlastic = style === 'suv' || style === 'crossover';

  // Нижняя часть кузова и капот/багажник.
  b(hiDetail, w, bodyH, L * 0.98, bodyMat, 0, bodyY, 0, true);

  const cabinFront = cabZ - cabLen / 2;
  const cabinRear = cabZ + cabLen / 2;
  const hoodLen = Math.max(0.45, cabinFront + halfL);
  const hoodZ = (-halfL + cabinFront) / 2;
  b(hiDetail, w * 0.94, 0.12, hoodLen, bodyMat, 0, belt + 0.03, hoodZ, true);

  if (style === 'sedan' || style === 'taxi' || style === 'crossover' || style === 'suv') {
    const trunkLen = Math.max(0.3, halfL - cabinRear);
    b(hiDetail, w * 0.94, 0.11, trunkLen, bodyMat, 0, belt + 0.03, (cabinRear + halfL) / 2, true);
  }

  // Кабина из стекла + крыша и стойки.
  b(hiDetail, w * 0.84, cabH, cabLen, carGlassMat, 0, belt + cabH / 2, cabZ);
  b(hiDetail, w * 0.86, 0.1, cabLen * 0.98, bodyMat, 0, roof - 0.05, cabZ, true);
  roundedRoof(hiDetail, w * 0.86, roof - 0.1, cabLen * 0.94, cabZ, bodyMat, 2);

  for (const side of [-1, 1]) {
    const px = side * w * 0.42;
    // A-, B-, C-стойки.
    b(hiDetail, 0.07, cabH, 0.11, bodyMat, px, belt + cabH / 2, cabinFront + 0.05);
    b(hiDetail, 0.07, cabH, 0.09, G.M.mattePlastic, px, belt + cabH / 2, cabZ);
    b(hiDetail, 0.07, cabH * 0.92, 0.11, bodyMat, px, belt + cabH / 2, cabinRear - 0.04);
    // Двери: передняя и задняя.
    const doorLen = cabLen * 0.39;
    addDoor(hiDetail, side, halfW, cabZ - cabLen * 0.22, doorLen, belt - 0.42, (0.38 + belt) / 2, bodyMat);
    addDoor(hiDetail, side, halfW, cabZ + cabLen * 0.22, doorLen, belt - 0.42, (0.38 + belt) / 2, bodyMat);
    // Зеркало у передней стойки.
    addMirror(hiDetail, side, halfW + 0.05, belt + cabH * 0.62, cabinFront + 0.05, bodyMat, false);
    // Порог с накладкой и хром-полосой.
    b(hiDetail, 0.08, 0.12, cabLen * 0.9, G.M.mattePlastic, side * (halfW + 0.01), 0.4, cabZ);
    b(hiDetail, 0.02, 0.035, cabLen * 0.8, G.M.chrome, side * (halfW + 0.06), 0.5, cabZ);
  }

  // Арки и колёса.
  addArch(hiDetail, -1, halfW, zF, r, bodyMat, blackPlastic);
  addArch(hiDetail, 1, halfW, zF, r, bodyMat, blackPlastic);
  addArch(hiDetail, -1, halfW, zR, r, bodyMat, blackPlastic);
  addArch(hiDetail, 1, halfW, zR, r, bodyMat, blackPlastic);
  addWheelSet(hiDetail, wheels, frontPivots, halfW, zF, zR, r, ww, { caliper: true });

  // Бамперы, решётка, оптика и номера.
  b(hiDetail, w * 1.01, 0.22, 0.18, G.M.mattePlastic, 0, 0.48, -halfL, true);
  b(hiDetail, w * 1.01, 0.22, 0.18, G.M.mattePlastic, 0, 0.48, halfL, true);
  b(hiDetail, w * 0.4, 0.13, 0.05, G.M.metalDark, 0, 0.72, -halfL - 0.03);
  for (let i = -2; i <= 2; i += 1) {
    b(hiDetail, w * 0.065, 0.05, 0.02, G.M.chrome, i * w * 0.075, 0.72, -halfL - 0.06);
  }

  const hy = belt - 0.26;
  const ty = belt - 0.22;
  for (const side of [-1, 1]) {
    addHeadlight(hiDetail, side * w * 0.32, hy, -halfL - 0.02, 0.34, 0.17);
    addTaillight(hiDetail, side * w * 0.34, ty, halfL + 0.02, 0.3, 0.18);
    addBlinker(hiDetail, blinkers, side * w * 0.46, hy - 0.02, -halfL - 0.04, 0.11, 0.08);
    addBlinker(hiDetail, blinkers, side * w * 0.47, ty, halfL + 0.04, 0.1, 0.08);
    // Боковой повторитель.
    addBlinker(hiDetail, blinkers, side * (halfW + 0.06), belt - 0.08, zF + 0.32, 0.1, 0.055);
  }
  addPlate(hiDetail, idx, 0, 0.48, -halfL - 0.12);
  addPlate(hiDetail, idx, 0, 0.5, halfL + 0.12);
  addPlateLight(hiDetail, 0, 0.58, halfL + 0.1);

  // Крыша: водостоки, антенна, рейлинги, спойлер.
  for (const side of [-1, 1]) {
    b(hiDetail, 0.03, 0.03, cabLen * 0.82, G.M.mattePlastic, side * w * 0.38, roof + 0.01, cabZ);
  }
  if (style === 'crossover' || style === 'suv') {
    for (const side of [-1, 1]) {
      b(hiDetail, 0.06, 0.06, cabLen * 0.9, G.M.mattePlastic, side * w * 0.32, roof + 0.07, cabZ);
      b(hiDetail, 0.05, 0.05, 0.35, G.M.mattePlastic, side * w * 0.32, roof + 0.04, cabinFront - 0.05);
      b(hiDetail, 0.05, 0.05, 0.35, G.M.mattePlastic, side * w * 0.32, roof + 0.04, cabinRear + 0.05);
    }
  }
  if (style === 'suv' || style === 'crossover') {
    b(hiDetail, w * 0.7, 0.05, 0.14, G.M.mattePlastic, 0, roof + 0.03, cabinRear + 0.08);
  } else if (style === 'hatch') {
    b(hiDetail, w * 0.62, 0.06, 0.16, bodyMat, 0, roof - 0.01, cabinRear + 0.05);
  } else {
    b(hiDetail, w * 0.64, 0.04, 0.1, bodyMat, 0, belt + 0.11, halfL - 0.18);
  }
  cylY(hiDetail, 0.012, 0.32, G.M.metalDark, w * 0.24, roof + 0.16, cabinRear - 0.15, 6);

  // Тёмный пластик по низу у кроссоверов и SUV.
  if (blackPlastic) {
    for (const side of [-1, 1]) {
      b(hiDetail, 0.045, 0.22, L * 0.78, G.M.mattePlastic, side * (halfW + 0.02), 0.42, 0);
      b(hiDetail, w * 1.0, 0.1, 0.3, G.M.mattePlastic, 0, 0.38, -halfL - 0.05);
      b(hiDetail, w * 1.0, 0.1, 0.3, G.M.mattePlastic, 0, 0.38, halfL + 0.05);
    }
    addHeadlight(hiDetail, -w * 0.28, 0.6, -halfL - 0.04, 0.16, 0.1);
    addHeadlight(hiDetail, w * 0.28, 0.6, -halfL - 0.04, 0.16, 0.1);
  }

  if (style === 'taxi') {
    // Шашечки по борту.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i += 1) {
        b(hiDetail, 0.02, 0.11, 0.11, i % 2 ? G.M.mattePlastic : bodyMat, side * (halfW + 0.055), 0.62, -0.9 + i * 0.24);
      }
      b(hiDetail, 0.02, 0.05, 0.7, G.M.mattePlastic, side * (halfW + 0.055), 0.5, 0.5);
    }
    // Фонарь «TAXI» и табличка.
    b(hiDetail, 0.62, 0.2, 0.24, taxiSignMat, 0, roof + 0.14, cabZ);
    b(hiDetail, 0.6, 0.035, 0.035, G.M.mattePlastic, 0, roof + 0.02, cabZ - 0.08);
    b(hiDetail, 0.6, 0.035, 0.035, G.M.mattePlastic, 0, roof + 0.02, cabZ + 0.08);
  }

  // Простой силуэт для дальнего LOD.
  b(loDetail, w, roof - 0.22, L * 0.98, bodyMat, 0, (roof - 0.22) / 2 + 0.05, 0);
  b(loDetail, w * 0.84, cabH + 0.08, cabLen, carGlassMat, 0, belt + cabH / 2, cabZ);

  return { halfWidth: halfW, halfLength: halfL, roofHeight: roof + (style === 'taxi' ? 0.24 : 0) };
}

/* ---------- Газель ---------- */

function buildGazelleCab(hiDetail, bodyMat, blinkers, idx, w, cabFront, cabHeight) {
  const cabLen = 1.9;
  const cabZ = cabFront + cabLen / 2;
  const cabBottom = 0.78;
  const cabCenterY = cabBottom + cabHeight / 2;

  b(hiDetail, w * 0.96, cabHeight, cabLen, bodyMat, 0, cabCenterY, cabZ, true);
  b(hiDetail, w * 0.86, 0.66, 0.07, carGlassMat, 0, cabBottom + cabHeight * 0.66, cabFront - 0.01);
  b(hiDetail, w * 0.72, 0.05, 0.05, G.M.chrome, 0, cabBottom + cabHeight * 0.33, cabFront - 0.04);
  b(hiDetail, w * 0.9, 0.14, 0.22, G.M.mattePlastic, 0, 0.62, cabFront - 0.04, true);

  // Решётка из горизонтальных блоков.
  for (let i = 0; i < 5; i += 1) {
    b(hiDetail, w * 0.52, 0.04, 0.03, G.M.chrome, 0, 0.86 + i * 0.07, cabFront - 0.12);
  }
  b(hiDetail, w * 0.58, 0.05, 0.04, G.M.chrome, 0, 1.2, cabFront - 0.12);

  for (const side of [-1, 1]) {
    b(hiDetail, 0.05, 0.58, 0.95, carGlassMat, side * (w * 0.48 + 0.01), cabBottom + cabHeight * 0.68, cabZ + 0.15);
    b(hiDetail, 0.07, cabHeight * 0.82, 0.11, bodyMat, side * w * 0.47, cabCenterY, cabZ - 0.45);
    b(hiDetail, 0.07, cabHeight * 0.82, 0.11, bodyMat, side * w * 0.47, cabCenterY, cabZ + 0.45);
    addDoor(hiDetail, side, w / 2, cabZ + 0.05, 1.5, cabHeight * 0.72, cabCenterY - 0.08, bodyMat, { verticalHandle: true, step: true });
    addMirror(hiDetail, side, w / 2 + 0.06, cabBottom + cabHeight * 0.72, cabFront + 0.55, bodyMat, true);
    addHeadlight(hiDetail, side * w * 0.32, 0.98, cabFront - 0.12, 0.46, 0.24);
    addBlinker(hiDetail, blinkers, side * w * 0.43, 1.24, cabFront - 0.13, 0.16, 0.1);
    addHeadlight(hiDetail, side * w * 0.18, 0.66, cabFront - 0.13, 0.18, 0.12);
  }
  addPlate(hiDetail, idx, 0, 0.72, cabFront - 0.15);

  // Козырёк и зеркала-лопухи.
  b(hiDetail, w * 0.94, 0.08, 0.34, bodyMat, 0, cabBottom + cabHeight * 0.92, cabFront + 0.06);
  return { cabZ, cabLen, cabTop: cabBottom + cabHeight };
}

function buildGazelle(hiDetail, loDetail, bodyMat, wheels, frontPivots, blinkers, idx, isVan) {
  const w = 3.84;
  const halfW = w / 2;
  const L = 6.1;
  const halfL = L / 2;
  const cabFront = -halfL;
  const roof = isVan ? 2.9 : 2.45;

  b(hiDetail, w * 0.78, 0.22, L, G.M.metalDark, 0, 0.62, 0, true);
  const cab = buildGazelleCab(hiDetail, bodyMat, blinkers, idx, w, cabFront, isVan ? 2.05 : 1.7);

  if (isVan) {
    // Цельнометаллический фургон.
    b(hiDetail, w, 1.92, 4.0, bodyMat, 0, 1.94, 1.0, true);
    roundedRoof(hiDetail, w, roof, 4.0, 1.0, bodyMat, 3);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i += 1) {
        b(hiDetail, 0.03, 1.5, 0.04, G.M.mattePlastic, side * (halfW + 0.02), 1.95, -0.75 + i * 1.15);
      }
      b(hiDetail, 0.02, 0.05, 3.8, G.M.chrome, side * (halfW + 0.035), 1.3, 1.0);
      b(hiDetail, 0.02, 0.25, 3.9, bodyMat, side * (halfW + 0.03), 2.55, 1.0);
    }
    // Задние створки.
    for (const side of [-1, 1]) {
      b(hiDetail, w * 0.47, 1.75, 0.07, bodyMat, side * w * 0.235, 1.92, 3.01);
      b(hiDetail, 0.05, 0.22, 0.05, G.M.chrome, side * w * 0.06, 1.55, 3.07);
      b(hiDetail, 0.03, 0.5, 0.04, G.M.mattePlastic, side * w * 0.43, 1.9, 3.05);
      b(hiDetail, 0.12, 0.1, 0.04, redReflectorMat, side * w * 0.3, 1.0, 3.06);
    }
    addTaillight(hiDetail, -w * 0.36, 1.05, 3.06, 0.26, 0.2);
    addTaillight(hiDetail, w * 0.36, 1.05, 3.06, 0.26, 0.2);
    addPlate(hiDetail, idx, 0, 0.78, 3.08);
    b(hiDetail, w * 0.92, 0.18, 0.16, G.M.mattePlastic, 0, 0.5, 3.02, true);
    // Фонарь на крыше.
    b(hiDetail, 0.5, 0.12, 0.18, amberMat, 0, roof + 0.1, 2.6);
  } else {
    // Бортовая платформа.
    b(hiDetail, w, 0.17, 3.9, bedMat, 0, 1.02, 1.05, true);
    b(hiDetail, w, 0.55, 0.1, bodyMat, 0, 1.36, -0.85);
    b(hiDetail, w, 0.52, 0.1, bodyMat, 0, 1.34, 2.98);
    for (const side of [-1, 1]) {
      b(hiDetail, 0.09, 0.46, 3.82, bodyMat, side * (halfW - 0.03), 1.33, 1.05);
      b(hiDetail, 0.03, 0.06, 3.8, G.M.chrome, side * (halfW + 0.025), 1.56, 1.05);
      for (let i = 0; i < 4; i += 1) {
        b(hiDetail, 0.05, 0.5, 0.06, G.M.metalDark, side * (halfW + 0.02), 1.33, -0.75 + i * 1.2);
      }
    }
    // Груз: пара ящиков и тент.
    b(hiDetail, 1.6, 0.7, 1.2, crateMat, -0.8, 1.45, 0.4, true);
    b(hiDetail, 0.9, 0.95, 1.1, crateMat, 0.9, 1.58, 1.4, true);
    b(hiDetail, 1.5, 0.06, 1.0, tentMat, -0.8, 1.83, 0.4);
  }

  // Задние фонари и номер бортовой.
  addTaillight(hiDetail, -w * 0.36, 0.88, halfL + 0.02, 0.28, 0.22);
  addTaillight(hiDetail, w * 0.36, 0.88, halfL + 0.02, 0.28, 0.22);
  addPlate(hiDetail, idx, 0, 0.72, halfL + 0.06);
  addBlinker(hiDetail, blinkers, -w * 0.46, 0.92, halfL + 0.03, 0.16, 0.1);
  addBlinker(hiDetail, blinkers, w * 0.46, 0.92, halfL + 0.03, 0.16, 0.1);

  addWheelSet(hiDetail, wheels, frontPivots, halfW, -2.0, 1.65, 0.46, 0.3, { heavy: true, dualRear: true, caliper: true });

  // Маркеры на крыше кабины.
  for (let i = -2; i <= 2; i += 1) {
    b(hiDetail, 0.12, 0.07, 0.08, amberMat, i * 0.42, cab.cabTop + 0.03, cabFront + 0.45);
  }

  // LOD.
  b(loDetail, w, 2.4, L * 0.96, bodyMat, 0, 1.4, 0);
  b(loDetail, w * 0.96, 0.8, 1.9, bodyMat, 0, 1.9, cabFront + 0.95);

  return { halfWidth: halfW, halfLength: halfL, roofHeight: roof };
}

/* ---------- КАМАЗ ---------- */

function buildKamaz(hiDetail, loDetail, bodyMat, wheels, frontPivots, blinkers, idx) {
  const w = 3.9;
  const halfW = w / 2;
  const L = 7.2;
  const halfL = L / 2;
  const roof = 3.1;
  const cabFront = -3.55;
  const cabLen = 2.4;
  const cabZ = cabFront + cabLen / 2;
  const cabBottom = 0.95;
  const cabH = 2.0;

  b(hiDetail, w * 0.76, 0.26, L, G.M.metalDark, 0, 0.82, 0, true);
  b(hiDetail, w * 0.98, cabH, cabLen, bodyMat, 0, cabBottom + cabH / 2, cabZ, true);

  // Лобовое стекло и обтекатель.
  b(hiDetail, w * 0.86, 0.72, 0.08, carGlassMat, 0, 2.25, cabFront - 0.01);
  b(hiDetail, w * 0.98, 0.2, 1.05, bodyMat, 0, roof - 0.12, cabZ + 0.1, true);
  const deflector = b(hiDetail, w * 0.9, 0.1, 0.6, bodyMat, 0, roof - 0.02, cabFront + 0.45);
  deflector.rotation.x = -0.22;

  for (const side of [-1, 1]) {
    b(hiDetail, 0.06, 0.62, 0.85, carGlassMat, side * (w * 0.49), 2.15, cabZ + 0.2);
    addDoor(hiDetail, side, halfW, cabZ + 0.1, 1.7, 1.35, 1.68, bodyMat, { verticalHandle: true, step: true });
    addMirror(hiDetail, side, halfW + 0.08, 2.3, cabFront + 0.7, bodyMat, true);
    addHeadlight(hiDetail, side * w * 0.3, 1.05, cabFront - 0.12, 0.5, 0.26);
    addBlinker(hiDetail, blinkers, side * w * 0.42, 1.32, cabFront - 0.13, 0.18, 0.11);
    addHeadlight(hiDetail, side * w * 0.16, 0.7, cabFront - 0.13, 0.2, 0.14);
  }

  // Большая решётка и двухуровневый бампер.
  for (let i = 0; i < 8; i += 1) {
    b(hiDetail, w * 0.6, 0.05, 0.04, G.M.chrome, 0, 1.48 + i * 0.06, cabFront - 0.12);
  }
  b(hiDetail, w * 0.7, 0.08, 0.05, G.M.chrome, 0, 1.95, cabFront - 0.12);
  b(hiDetail, w * 1.01, 0.3, 0.24, G.M.mattePlastic, 0, 0.72, cabFront - 0.07, true);
  b(hiDetail, w * 0.9, 0.18, 0.18, G.M.metalDark, 0, 0.5, cabFront - 0.05, true);
  addPlate(hiDetail, idx, 0, 0.78, cabFront - 0.2, true);

  // Самосвальная платформа.
  const bedLen = 4.2;
  const bedZ = 1.15;
  b(hiDetail, w, 1.55, bedLen, bodyMat, 0, 2.1, bedZ, true);
  b(hiDetail, w * 1.01, 0.1, bedLen, G.M.metalDark, 0, 1.3, bedZ);
  b(hiDetail, w * 0.94, 0.62, 0.12, G.M.metalDark, 0, 1.72, bedZ + bedLen / 2 + 0.02);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i += 1) {
      b(hiDetail, 0.06, 1.5, 0.07, G.M.metalDark, side * (halfW + 0.01), 2.1, bedZ - 1.8 + i * 0.6);
    }
    b(hiDetail, 0.05, 0.05, bedLen * 0.95, G.M.chrome, side * (halfW + 0.04), 2.85, bedZ);
  }
  b(hiDetail, w * 0.9, 0.12, 0.12, G.M.metalDark, 0, 2.9, bedZ - bedLen / 2);
  addTaillight(hiDetail, -w * 0.36, 1.05, halfL + 0.02, 0.3, 0.24);
  addTaillight(hiDetail, w * 0.36, 1.05, halfL + 0.02, 0.3, 0.24);
  addBlinker(hiDetail, blinkers, -w * 0.46, 0.82, halfL + 0.03, 0.16, 0.1);
  addBlinker(hiDetail, blinkers, w * 0.46, 0.82, halfL + 0.03, 0.16, 0.1);
  addPlate(hiDetail, idx, 0, 0.72, halfL + 0.1, true);

  // Выхлопная труба и воздухозаборник за кабиной.
  cylY(hiDetail, 0.1, 1.6, G.M.metalDark, -halfW + 0.3, 1.9, cabZ + 1.35, 8);
  cylY(hiDetail, 0.09, 1.3, G.M.metalDark, halfW - 0.3, 2.0, cabZ + 1.35, 8);
  b(hiDetail, 0.22, 0.25, 0.22, G.M.chrome, -halfW + 0.3, 2.78, cabZ + 1.35);

  // Маркеры крыши.
  for (let i = -2; i <= 2; i += 1) {
    b(hiDetail, 0.13, 0.07, 0.09, amberMat, i * 0.36, roof + 0.02, cabFront + 0.35);
  }

  addWheelSet(hiDetail, wheels, frontPivots, halfW, -2.5, [0.9, 2.1], 0.5, 0.34, { heavy: true, caliper: true });

  // LOD.
  b(loDetail, w, 2.5, L * 0.98, bodyMat, 0, 1.55, 0.2);

  return { halfWidth: halfW, halfLength: halfL, roofHeight: roof };
}

/* ---------- Фура ---------- */

function buildTruck(hiDetail, loDetail, bodyMat, wheels, frontPivots, blinkers, idx, trailerMat) {
  const w = 3.9;
  const halfW = w / 2;
  const L = 9.2;
  const halfL = L / 2;
  const cabRoof = 3.4;
  const cabFront = -halfL;
  const cabLen = 2.5;
  const cabZ = cabFront + cabLen / 2;
  const cabBottom = 0.95;
  const cabH = 2.25;

  b(hiDetail, w * 0.76, 0.26, L, G.M.metalDark, 0, 0.85, 0, true);
  b(hiDetail, w * 0.98, cabH, cabLen, bodyMat, 0, cabBottom + cabH / 2, cabZ, true);

  // Обтекатель крыши.
  b(hiDetail, w * 0.98, 0.2, 1.0, bodyMat, 0, 3.2, cabZ + 0.2, true);
  const deflector = b(hiDetail, w * 0.9, 0.1, 0.7, bodyMat, 0, 3.32, cabFront + 0.42);
  deflector.rotation.x = -0.28;

  b(hiDetail, w * 0.86, 0.78, 0.08, carGlassMat, 0, 2.45, cabFront - 0.01);
  for (const side of [-1, 1]) {
    b(hiDetail, 0.06, 0.64, 0.9, carGlassMat, side * (w * 0.49), 2.35, cabZ + 0.25);
    addDoor(hiDetail, side, halfW, cabZ + 0.15, 1.8, 1.45, 1.8, bodyMat, { verticalHandle: true, step: true });
    addMirror(hiDetail, side, halfW + 0.08, 2.5, cabFront + 0.75, bodyMat, true);
    addHeadlight(hiDetail, side * w * 0.3, 1.1, cabFront - 0.12, 0.5, 0.26);
    addBlinker(hiDetail, blinkers, side * w * 0.42, 1.38, cabFront - 0.13, 0.18, 0.11);
    addHeadlight(hiDetail, side * w * 0.16, 0.74, cabFront - 0.13, 0.2, 0.14);
    addBlinker(hiDetail, blinkers, side * (halfW + 0.06), 2.15, cabZ - 0.6, 0.12, 0.07);
  }
  for (let i = 0; i < 9; i += 1) {
    b(hiDetail, w * 0.62, 0.05, 0.04, G.M.chrome, 0, 1.5 + i * 0.06, cabFront - 0.12);
  }
  b(hiDetail, w * 1.01, 0.32, 0.26, G.M.mattePlastic, 0, 0.72, cabFront - 0.07, true);
  b(hiDetail, w * 0.9, 0.2, 0.2, G.M.metalDark, 0, 0.5, cabFront - 0.05, true);
  addPlate(hiDetail, idx, 0, 0.78, cabFront - 0.22, true);

  // Прицеп.
  const trailerLen = 5.7;
  const trailerZ = halfL - trailerLen / 2;
  const trailerBottom = 0.9;
  const trailerTop = 3.0;
  const trailerH = trailerTop - trailerBottom;
  b(hiDetail, w, trailerH, trailerLen, trailerMat, 0, trailerBottom + trailerH / 2, trailerZ, true);
  roundedRoof(hiDetail, w, trailerTop, trailerLen, trailerZ, trailerMat, 3);
  for (const side of [-1, 1]) {
    b(hiDetail, 0.03, 0.26, trailerLen * 0.96, G.M.filterRed, side * (halfW + 0.02), 1.55, trailerZ);
    for (let i = 0; i < 7; i += 1) {
      b(hiDetail, 0.05, trailerH * 0.88, 0.06, G.M.mattePlastic, side * (halfW + 0.01), trailerBottom + trailerH / 2, trailerZ - 2.4 + i * 0.8);
    }
    // Боковые юбки.
    b(hiDetail, 0.06, 0.3, trailerLen * 0.9, G.M.metalDark, side * (halfW - 0.1), 0.85, trailerZ);
  }
  // Задние двери прицепа.
  for (const side of [-1, 1]) {
    b(hiDetail, w * 0.47, trailerH * 0.92, 0.07, trailerMat, side * w * 0.235, trailerBottom + trailerH * 0.48, halfL + 0.02);
    b(hiDetail, 0.05, 0.22, 0.05, G.M.chrome, side * w * 0.06, 1.55, halfL + 0.07);
    for (let i = 0; i < 3; i += 1) {
      b(hiDetail, 0.04, 0.16, 0.04, G.M.chrome, side * w * 0.4, 1.3 + i * 0.55, halfL + 0.06);
    }
  }
  addTaillight(hiDetail, -w * 0.36, 1.05, halfL + 0.06, 0.3, 0.22);
  addTaillight(hiDetail, w * 0.36, 1.05, halfL + 0.06, 0.3, 0.22);
  addBlinker(hiDetail, blinkers, -w * 0.46, 0.84, halfL + 0.07, 0.16, 0.1);
  addBlinker(hiDetail, blinkers, w * 0.46, 0.84, halfL + 0.07, 0.16, 0.1);
  addPlate(hiDetail, idx, 0, 0.72, halfL + 0.12, true);
  b(hiDetail, w * 0.94, 0.18, 0.16, G.M.mattePlastic, 0, 0.52, halfL + 0.05, true);

  // Сцепка и выхлопные трубы.
  cylX(hiDetail, 0.13, 0.7, G.M.metalDark, 0, 0.75, cabZ + 1.55, 8);
  cylY(hiDetail, 0.09, 1.95, G.M.chrome, -halfW + 0.1, 2.2, cabZ + 1.15, 8);
  cylY(hiDetail, 0.09, 1.95, G.M.chrome, halfW - 0.1, 2.2, cabZ + 1.15, 8);
  b(hiDetail, 0.18, 0.22, 0.18, G.M.metalDark, -halfW + 0.1, 3.2, cabZ + 1.15);
  b(hiDetail, 0.18, 0.22, 0.18, G.M.metalDark, halfW - 0.1, 3.2, cabZ + 1.15);
  for (let i = -2; i <= 2; i += 1) {
    b(hiDetail, 0.13, 0.07, 0.09, amberMat, i * 0.36, cabRoof + 0.02, cabFront + 0.35);
  }

  // Оси: передняя, задняя тягача (сдвоенная) и две оси прицепа.
  addWheelSet(hiDetail, wheels, frontPivots, halfW, -3.6, [-1.9], 0.5, 0.34, { heavy: true, dualRear: true, caliper: true });
  for (const z of [1.3, 2.5]) {
    addWheelSet(hiDetail, wheels, frontPivots, halfW, null, [z], 0.5, 0.34, { heavy: true });
  }

  // LOD.
  b(loDetail, w, 2.4, L * 0.98, bodyMat, 0, 2.0, 0);

  return { halfWidth: halfW, halfLength: halfL, roofHeight: cabRoof };
}

/* ---------- Автобус ---------- */

function buildBus(hiDetail, loDetail, bodyMat, wheels, frontPivots, blinkers, idx) {
  const w = 3.7;
  const halfW = w / 2;
  const L = 8.2;
  const halfL = L / 2;
  const roof = 3.0;
  const bodyBottom = 0.75;

  b(hiDetail, w, roof - bodyBottom - 0.14, L, bodyMat, 0, bodyBottom + (roof - bodyBottom - 0.14) / 2, 0, true);
  roundedRoof(hiDetail, w, roof, L, 0, bodyMat, 3);

  // Окна салона: по 5 с каждой стороны.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i += 1) {
      b(hiDetail, 0.05, 0.95, 1.06, carGlassMat, side * (halfW + 0.02), 2.38, -2.65 + i * 1.25);
      b(hiDetail, 0.06, 1.0, 0.12, bodyMat, side * (halfW + 0.02), 2.35, -3.25 + i * 1.25);
    }
    // Двери.
    for (const z of [-2.5, 1.1]) {
      b(hiDetail, 0.06, 2.1, 0.95, bodyMat, side * (halfW + 0.03), 1.82, z);
      b(hiDetail, 0.02, 0.95, 0.82, carGlassMat, side * (halfW + 0.06), 2.4, z);
      b(hiDetail, 0.03, 0.05, 0.82, G.M.mattePlastic, side * (halfW + 0.065), 2.95, z);
      b(hiDetail, 0.05, 0.2, 0.28, G.M.mattePlastic, side * (halfW - 0.18), 0.52, z);
    }
    // Полоса по борту и молдинг.
    b(hiDetail, 0.03, 0.22, L * 0.94, G.M.chrome, side * (halfW + 0.03), 1.15, 0);
    b(hiDetail, 0.02, 0.05, L * 0.9, G.M.mattePlastic, side * (halfW + 0.045), 0.72, 0);
    addMirror(hiDetail, side, halfW + 0.06, 2.55, -3.35, bodyMat, true);
  }

  // Лобовое, заднее стекло и маршрутная табличка.
  b(hiDetail, w * 0.9, 1.0, 0.08, carGlassMat, 0, 2.4, -halfL - 0.02);
  b(hiDetail, w * 0.86, 0.9, 0.08, carGlassMat, 0, 2.35, halfL + 0.02);
  b(hiDetail, 1.9, 0.32, 0.06, busSignMat, 0, 2.92, -halfL - 0.04);

  // Бамперы и оптика.
  b(hiDetail, w * 1.01, 0.3, 0.24, G.M.mattePlastic, 0, 0.6, -halfL - 0.04, true);
  b(hiDetail, w * 1.01, 0.26, 0.2, G.M.mattePlastic, 0, 0.6, halfL + 0.04, true);
  for (const side of [-1, 1]) {
    addHeadlight(hiDetail, side * w * 0.33, 1.05, -halfL - 0.05, 0.5, 0.26);
    addBlinker(hiDetail, blinkers, side * w * 0.45, 1.3, -halfL - 0.06, 0.16, 0.1);
    addTaillight(hiDetail, side * w * 0.34, 1.1, halfL + 0.06, 0.34, 0.32);
    addBlinker(hiDetail, blinkers, side * w * 0.46, 0.85, halfL + 0.07, 0.16, 0.1);
  }
  addPlate(hiDetail, idx, 0, 0.65, -halfL - 0.14);
  addPlate(hiDetail, idx, 0, 0.68, halfL + 0.14);
  addPlateLight(hiDetail, 0, 0.78, halfL + 0.12);

  // Крыша: кондиционер и антенна.
  b(hiDetail, 1.6, 0.22, 2.0, G.M.mattePlastic, 0, roof + 0.08, 0.2);
  for (let i = -2; i <= 2; i += 1) {
    b(hiDetail, 0.13, 0.07, 0.09, amberMat, i * 0.34, roof + 0.01, -halfL + 0.35);
  }

  addWheelSet(hiDetail, wheels, frontPivots, halfW, -2.55, 2.4, 0.5, 0.34, { heavy: true, caliper: true });

  // LOD.
  b(loDetail, w, roof - 0.2, L, bodyMat, 0, (roof - 0.2) / 2 + 0.1, 0);

  return { halfWidth: halfW, halfLength: halfL, roofHeight: roof };
}

/* ---------- Qute ---------- */

function buildQute(hiDetail, loDetail, bodyMat, wheels, frontPivots, blinkers, idx) {
  const w = 1.44;
  const halfW = w / 2;
  const L = 2.75;
  const halfL = L / 2;
  const roof = 1.68;

  b(hiDetail, w, 0.68, L, bodyMat, 0, 0.66, 0, true);
  b(hiDetail, w * 0.94, 0.06, L * 0.96, bodyMat, 0, 1.01, 0);
  b(hiDetail, w * 0.93, 0.58, 1.95, carGlassMat, 0, 1.3, 0.12);
  b(hiDetail, w * 0.96, 0.1, 2.0, bodyMat, 0, 1.63, 0.12, true);
  roundedRoof(hiDetail, w * 0.96, roof, 1.95, 0.12, bodyMat, 2);

  for (const side of [-1, 1]) {
    addDoor(hiDetail, side, halfW, 0.35, 0.95, 0.72, 0.68, bodyMat);
    addDoor(hiDetail, side, halfW, -0.55, 0.8, 0.72, 0.68, bodyMat);
    addMirror(hiDetail, side, halfW + 0.04, 1.12, -0.75, bodyMat, false);
  }
  addArch(hiDetail, -1, halfW, -0.95, 0.3, bodyMat);
  addArch(hiDetail, 1, halfW, -0.95, 0.3, bodyMat);
  addArch(hiDetail, -1, halfW, 0.95, 0.3, bodyMat);
  addArch(hiDetail, 1, halfW, 0.95, 0.3, bodyMat);
  addWheelSet(hiDetail, wheels, frontPivots, halfW, -0.95, 0.95, 0.3, 0.2, { caliper: true });

  b(hiDetail, w * 1.01, 0.18, 0.18, G.M.mattePlastic, 0, 0.42, -halfL, true);
  b(hiDetail, w * 1.01, 0.18, 0.18, G.M.mattePlastic, 0, 0.42, halfL, true);
  for (const side of [-1, 1]) {
    addHeadlight(hiDetail, side * 0.45, 0.72, -halfL - 0.02, 0.26, 0.16);
    addTaillight(hiDetail, side * 0.45, 0.76, halfL + 0.02, 0.22, 0.18);
    addBlinker(hiDetail, blinkers, side * 0.62, 0.62, -halfL - 0.04, 0.1, 0.08);
    addBlinker(hiDetail, blinkers, side * 0.63, 0.62, halfL + 0.04, 0.1, 0.08);
  }
  addPlate(hiDetail, idx, 0, 0.45, -halfL - 0.12);
  addPlate(hiDetail, idx, 0, 0.48, halfL + 0.12);
  addPlateLight(hiDetail, 0, 0.56, halfL + 0.1);
  cylY(hiDetail, 0.012, 0.25, G.M.metalDark, 0.3, roof + 0.12, 0.9, 6);

  b(loDetail, w, roof - 0.2, L, bodyMat, 0, (roof - 0.2) / 2 + 0.05, 0);

  return { halfWidth: halfW, halfLength: halfL, roofHeight: roof };
}

/* ---------- цвета и сборка ---------- */

function pickColor(type, fallbackHex, variant) {
  const v = Math.abs(variant | 0);
  switch (type) {
    case 'taxi':
    case 'qute_traffic':
      return 0xffca28;
    case 'suv':
      return [0x1a1a1a, 0xe8e8e8, 0x6e7a86, 0x3a5a3a][v % 4];
    case 'crossover':
      return [0x8a8f98, 0x2f3a4a, 0xc7c2b6, 0x3d5a4a][v % 4];
    case 'hatchback':
      return [0xf0d000, 0x2e6b3a, 0x8a8f98, 0xa02020][v % 4];
    case 'gazelle_flatbed':
    case 'gazelle_van':
      return [0xf0f0f0, 0x8a8f98, 0x2a4a7a][v % 3];
    case 'kamaz':
      return [0xe65100, 0x1e4d8c, 0x2e6b3a][v % 3];
    case 'truck':
      return [0xf5f5f5, 0xb71c1c, 0x1565c0, 0x455a64][v % 4];
    case 'bus':
      return [0x1565c0, 0xd8dee9, 0x2e7d32][v % 3];
    default:
      return fallbackHex;
  }
}

function trailerColor(variant) {
  return [0xe8e8e8, 0xd8dee0, 0xf0efe8][Math.abs(variant | 0) % 3];
}

export function createVehicleModel(type, colorHex, variant = 0) {
  const known = ['sedan', 'hatchback', 'crossover', 'taxi', 'suv', 'gazelle_flatbed', 'gazelle_van', 'kamaz', 'truck', 'bus', 'qute_traffic'];
  if (!known.includes(type)) {
    console.warn('bajaj GO: неизвестный тип трафика «' + type + '», показан седан');
    type = 'sedan';
  }

  const root = new THREE.Group();
  const hiDetail = new THREE.Group();
  const loDetail = new THREE.Group();
  root.add(hiDetail, loDetail);

  const paintColor = pickColor(type, colorHex, variant);
  const bodyMat = paint(paintColor);
  const wheels = [];
  const frontPivots = [];
  const blinkers = [];
  const idx = Math.abs(variant | 0);

  let bounds;
  if (type === 'qute_traffic') bounds = buildQute(hiDetail, loDetail, bodyMat, wheels, frontPivots, blinkers, idx);
  else if (type === 'gazelle_flatbed' || type === 'gazelle_van') bounds = buildGazelle(hiDetail, loDetail, bodyMat, wheels, frontPivots, blinkers, idx, type === 'gazelle_van');
  else if (type === 'kamaz') bounds = buildKamaz(hiDetail, loDetail, bodyMat, wheels, frontPivots, blinkers, idx);
  else if (type === 'truck') bounds = buildTruck(hiDetail, loDetail, bodyMat, wheels, frontPivots, blinkers, idx, paint(trailerColor(variant)));
  else if (type === 'bus') bounds = buildBus(hiDetail, loDetail, bodyMat, wheels, frontPivots, blinkers, idx);
  else bounds = buildPassenger(hiDetail, loDetail, bodyMat, wheels, frontPivots, blinkers, type, idx, PASSENGER_SPECS[type]);

  const alertSprite = b(root, 0.9, 0.28, 0.12, alertMat, 0, bounds.roofHeight + 0.24, 0);
  alertSprite.visible = false;

  return {
    root,
    hiDetail,
    loDetail,
    wheels,
    frontPivots,
    alertSprite,
    blinkers,
    halfWidth: bounds.halfWidth,
    halfLength: bounds.halfLength,
    roofHeight: bounds.roofHeight,
    type
  };
}
