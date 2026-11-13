import * as THREE from 'three';
import { G } from '../state.js';
import { box, cylinder } from '../geom.js';

/* =========================================================================
 * МОТОЦИКЛЫ ИГРОКА (ТЗ v20)
 * -------------------------------------------------------------------------
 * Одна общая рама/колёса/тюнинг и 12 визуальных версий внутри трёх публичных
 * семейств: pulsar, boxer, avenger. Версии переключаются в bike.js через
 * G.bikeVersionGroups[id] — публичные имена и слоты тюнинга сохранены.
 * ========================================================================= */

const FRONT_Z = -1.42;
const REAR_Z = 0.68;

/* ---------- мелкие хелперы ---------- */

function put(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, shadow = false) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  if (shadow) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  parent.add(m);
  return m;
}

function bx(parent, mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0, shadow = false) {
  return put(parent, box(w, h, d), mat, x, y, z, rx, ry, rz, shadow);
}

// axis: 'x' — вдоль оси колеса, 'y' — вертикально, 'z' — вдоль мотоцикла.
function cl(parent, mat, rt, rb, h, x, y, z, axis = 'y', seg = 10, shadow = false) {
  const geo = cylinder(rt, rb, h, seg);
  const rx = axis === 'z' ? Math.PI / 2 : 0;
  const rz = axis === 'x' ? Math.PI / 2 : 0;
  return put(parent, geo, mat, x, y, z, rx, 0, rz, shadow);
}

function torus(parent, mat, radius, tube, x, y, z, axis = 'x') {
  const m = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 4, 18), mat);
  m.position.set(x, y, z);
  if (axis === 'x') m.rotation.y = Math.PI / 2;
  if (axis === 'y') m.rotation.x = Math.PI / 2;
  parent.add(m);
  return m;
}

/* ---------- колёса ---------- */

function buildWheelStyle(radius, width, opts) {
  const group = new THREE.Group();
  const face = width / 2 + 0.012;
  const faces = [-1, 1];
  const spokeCount = opts.spokes || 5;
  const spokeW = opts.spokeW || 0.05;
  const spokeD = opts.spokeD || 0.08;
  const spokeMat = opts.spokeMat || G.M.chrome;

  for (const side of faces) {
    // Обод.
    torus(group, G.M.chrome, radius * 0.73, 0.014, side * face, 0, 0);
    for (let i = 0; i < spokeCount; i += 1) {
      const a = (i / spokeCount) * Math.PI * 2;
      const spoke = bx(
        group, spokeMat, spokeW, radius * 0.66, spokeD,
        side * face, Math.cos(a) * radius * 0.37, Math.sin(a) * radius * 0.37
      );
      spoke.rotation.x = a;
    }
    // Втулка и болты.
    cl(group, G.M.chrome, radius * 0.2, radius * 0.2, width + 0.08, 0, 0, 0, 'x', 10);
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2;
      bx(group, G.M.metalDark, 0.03, 0.035, 0.035, side * (face + 0.012), Math.cos(a) * radius * 0.28, Math.sin(a) * radius * 0.28);
    }
    if (opts.whitewall) {
      torus(group, G.M.plateMat, radius * 0.84, 0.012, side * (face - 0.004), 0, 0);
    }
    if (opts.disc) {
      cl(group, G.M.chrome, radius * 0.74, radius * 0.74, 0.022, side * (face + 0.018), 0, 0, 'x', 16);
      if (opts.perf) {
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2;
          bx(group, G.M.metalDark, 0.05, 0.05, 0.03, side * (face + 0.032), Math.cos(a) * radius * 0.53, Math.sin(a) * radius * 0.53);
        }
      }
    }
    if (opts.drum) {
      cl(group, G.M.metalDark, radius * 0.42, radius * 0.42, 0.05, side * face, 0, 0, 'x', 12);
      cl(group, G.M.chrome, radius * 0.16, radius * 0.16, 0.065, side * (face + 0.03), 0, 0, 'x', 8);
    }
  }
  return group;
}

/* ---------- общие узлы ---------- */

function buildFrame(v, spec) {
  const tube = G.M.metalDark;
  for (const side of [-1, 1]) {
    bx(v, tube, 0.05, 0.06, 0.62, side * 0.115, 0.83, -0.78, 0.24, 0, 0);
    bx(v, tube, 0.05, 0.06, 0.58, side * 0.13, 0.68, -0.3, 0.12, 0, 0);
    bx(v, tube, 0.055, 0.075, 0.66, side * 0.17, 0.45, 0.4, -0.13, 0, 0);
    // Задние амортизаторы с пружинами.
    const shockMat = spec.goldShocks ? G.M.goldMetal : G.M.chrome;
    const shock = cl(v, shockMat, 0.028, 0.032, 0.52, side * 0.25, 0.56, 0.46, 'y', 8);
    shock.rotation.x = -0.22;
    for (let i = 0; i < 3; i += 1) {
      const ring = torus(v, shockMat, 0.045, 0.011, side * 0.25, 0.42 + i * 0.1, 0.38 + i * 0.025, 'y');
      ring.rotation.x = -0.22;
    }
  }
  bx(v, tube, 0.36, 0.055, 0.07, 0, 0.92, -1.06);
  bx(v, tube, 0.42, 0.05, 0.07, 0, 0.63, -0.28);
  bx(v, tube, 0.3, 0.05, 0.06, 0, 0.5, 0.24);
  cl(v, G.M.metalDark, 0.07, 0.07, 0.3, 0, 1.0, -1.13, 'y', 8);

  const pegZ = spec.forwardControls ? -0.98 : 0.02;
  for (const side of [-1, 1]) {
    if (spec.forwardControls) {
      bx(v, G.M.chrome, 0.05, 0.05, 0.46, side * 0.3, 0.33, -0.82, 0.05, 0, 0);
      bx(v, G.M.chrome, 0.028, 0.03, 0.42, side * 0.24, 0.3, -0.74, 0.25, 0, 0);
    }
    bx(v, G.M.metalDark, 0.2, 0.045, 0.07, side * 0.32, 0.34, pegZ);
    bx(v, G.M.rubber, 0.13, 0.035, 0.075, side * 0.38, 0.34, pegZ);
    bx(v, G.M.metalDark, 0.16, 0.04, 0.06, side * 0.31, 0.44, 0.42);
    bx(v, G.M.rubber, 0.1, 0.03, 0.065, side * 0.36, 0.44, 0.42);
  }

  // Цепь и кожух.
  for (let i = 0; i < 3; i += 1) {
    bx(v, G.M.metalDark, 0.025, 0.025, 0.5, -0.15, 0.43 + i * 0.012, 0.26 + i * 0.08);
  }
  if (spec.chainGuard) bx(v, G.M.chrome, 0.035, 0.055, 0.82, -0.18, 0.5, 0.3);
}

function buildEngine(v, spec) {
  const metal = G.M.metalDark;
  const crank = bx(v, metal, 0.44, 0.3, 0.52, 0, 0.42, -0.42, 0, 0, 0, true);
  crank.castShadow = true;
  cl(v, G.M.chrome, 0.115, 0.115, 0.05, 0.245, 0.42, -0.42, 'x', 12);
  cl(v, G.M.metalDark, 0.1, 0.1, 0.04, -0.245, 0.42, -0.42, 'x', 10);

  if (spec.liquid) {
    bx(v, metal, 0.34, 0.42, 0.34, 0, 0.72, -0.5, 0, 0, 0, true);
    bx(v, G.M.chrome, 0.36, 0.06, 0.36, 0, 0.94, -0.5);
  } else {
    bx(v, metal, 0.31, 0.36, 0.32, 0, 0.7, -0.5, 0, 0, 0, true);
    const fins = spec.fins || 4;
    for (let i = 0; i < fins; i += 1) {
      bx(v, metal, 0.36, 0.018, 0.36, 0, 0.55 + i * 0.075, -0.5);
    }
    bx(v, G.M.chrome, 0.32, 0.06, 0.34, 0, 0.9, -0.5);
  }
  bx(v, metal, 0.28, 0.12, 0.3, 0, 0.88, -0.5);
  cl(v, G.M.metalDark, 0.035, 0.035, 0.1, 0.1, 0.95, -0.5, 'y', 8);

  // Радиатор / масляный радиатор.
  if (spec.radiator) {
    bx(v, metal, 0.38, 0.36, 0.06, 0, 0.7, -0.83, 0, 0, 0, true);
    for (let i = 0; i < 5; i += 1) {
      bx(v, G.M.chrome, 0.34, 0.012, 0.03, 0, 0.56 + i * 0.07, -0.87);
    }
  }
  if (spec.oilCooler) {
    bx(v, metal, 0.3, 0.15, 0.05, 0, 0.61, -0.86);
    bx(v, G.M.chrome, 0.28, 0.012, 0.03, 0, 0.57, -0.89);
    bx(v, G.M.chrome, 0.28, 0.012, 0.03, 0, 0.63, -0.89);
  }

  // Впуск и карбюратор.
  bx(v, G.M.mattePlastic, 0.17, 0.19, 0.3, -0.29, 0.62, -0.25);
  bx(v, G.M.metalDark, 0.14, 0.13, 0.18, -0.2, 0.62, -0.42);
  bx(v, G.M.chrome, 0.15, 0.11, 0.02, -0.2, 0.62, -0.52);

  // Выхлоп.
  const pipeMat = spec.darkExhaust ? G.M.metalDark : G.M.chrome;
  const pipe = cl(v, pipeMat, 0.036, 0.03, 0.74, 0.2, 0.53, -0.28, 'z', 8);
  pipe.rotation.x = -0.22;
  const muffler = cl(v, pipeMat, 0.075, 0.06, 0.94, 0.29, 0.36, 0.24, 'z', 10, true);
  muffler.rotation.x = 0.02;
  for (let i = 0; i < 3; i += 1) {
    bx(v, G.M.metalDark, 0.02, 0.06, 0.22, 0.345, 0.42, -0.02 + i * 0.22);
  }
  cl(v, G.M.metalDark, 0.055, 0.045, 0.16, 0.29, 0.36, 0.78, 'z', 8);
  if (spec.dualExhaust) {
    const pipe2 = cl(v, pipeMat, 0.033, 0.028, 0.7, -0.2, 0.52, -0.3, 'z', 8);
    pipe2.rotation.x = -0.22;
    const muffler2 = cl(v, pipeMat, 0.07, 0.055, 0.88, -0.29, 0.37, 0.22, 'z', 10, true);
    muffler2.rotation.x = 0.02;
    bx(v, G.M.metalDark, 0.02, 0.05, 0.2, -0.345, 0.43, 0.0);
    bx(v, G.M.metalDark, 0.02, 0.05, 0.2, -0.345, 0.43, 0.3);
  }

  // Боковые панели.
  for (const side of [-1, 1]) {
    bx(v, G.tankMat, 0.06, 0.22, 0.34, side * 0.3, 0.66, -0.02, 0, 0, 0, true);
    bx(v, G.M.metalDark, 0.02, 0.06, 0.16, side * 0.335, 0.7, -0.04);
    if (spec.sideVents) {
      bx(v, G.M.mattePlastic, 0.025, 0.1, 0.02, side * 0.336, 0.66, -0.14);
      bx(v, G.M.mattePlastic, 0.025, 0.1, 0.02, side * 0.336, 0.66, -0.06);
    }
  }
}

function buildFork(v, spec, fenderGroup) {
  const zAxle = spec.zAxle || FRONT_Z;
  const zTop = spec.zHead || -1.14;
  const yTop = 1.05;
  const dy = yTop - 0.34;
  const dz = zTop - zAxle;
  const len = Math.hypot(dy, dz);
  const angle = Math.asin(dz / len);
  const midY = (yTop + 0.34) / 2;
  const midZ = (zTop + zAxle) / 2;
  const forkMat = spec.darkFork ? G.M.metalDark : G.M.chrome;

  for (const side of [-1, 1]) {
    const leg = cl(v, forkMat, 0.032, 0.036, len, side * 0.11, midY, midZ, 'y', 8);
    leg.rotation.x = angle;
    bx(v, G.M.rubber, 0.075, 0.1, 0.08, side * 0.11, 0.43, zAxle + 0.07);
    if (spec.forkGaiters) {
      for (let i = 0; i < 3; i += 1) {
        bx(v, G.M.rubber, 0.07, 0.05, 0.07, side * 0.11, 0.5 + i * 0.1, midZ + (0.5 + i * 0.1 - midY) * (dz / dy));
      }
    }
  }
  bx(v, G.M.metalDark, 0.32, 0.055, 0.1, 0, yTop - 0.02, zTop - 0.01);
  bx(v, G.M.chrome, 0.28, 0.035, 0.08, 0, 1.0, zTop);

  buildHeadlight(v, spec, zAxle);

  // Переднее крыло — отдельная группа, чтобы работал тюнинг широких шин.
  const zF = zAxle;
  const wing = spec.fenderKind || 'plain';
  bx(fenderGroup, G.tankMat, 0.25, 0.09, 0.52, 0, 0.66, zF, 0.14, 0, 0, true);
  bx(fenderGroup, G.tankMat, 0.21, 0.06, 0.24, 0, 0.59, zF - 0.24, 0.3);
  if (wing === 'chrome') {
    bx(fenderGroup, G.M.chrome, 0.05, 0.025, 0.38, 0, 0.715, zF, 0.14);
  } else if (wing === 'accent') {
    bx(fenderGroup, G.accentMat, 0.2, 0.02, 0.3, 0, 0.705, zF, 0.14);
    bx(fenderGroup, G.M.mattePlastic, 0.27, 0.02, 0.08, 0, 0.63, zF + 0.18, 0.14);
  } else if (wing === 'cruiser') {
    bx(fenderGroup, G.tankMat, 0.26, 0.08, 0.34, 0, 0.61, zF + 0.24, 0.2);
    bx(fenderGroup, G.M.chrome, 0.045, 0.025, 0.62, 0, 0.695, zF + 0.02, 0.12);
  } else {
    bx(fenderGroup, G.M.chrome, 0.04, 0.02, 0.3, 0, 0.7, zF, 0.14);
  }

  // Тормозные суппорты не вращаются вместе с колесом.
  bx(v, spec.caliperGold ? G.M.goldMetal : G.M.filterRed, 0.06, 0.12, 0.12, 0.135, 0.41, zAxle + 0.12);
  bx(v, spec.caliperGold ? G.M.goldMetal : G.M.metalDark, 0.055, 0.1, 0.1, -0.135, 0.41, zAxle + 0.12);
  bx(v, G.M.metalDark, 0.055, 0.1, 0.1, 0.135, 0.42, 0.56);
}

function buildHeadlight(v, spec, zAxle) {
  const kind = spec.headlight || 'round';
  if (kind === 'round' || kind === 'cruiser') {
    const big = kind === 'cruiser';
    const r = big ? 0.16 : 0.135;
    cl(v, G.M.chrome, r, r * 0.9, big ? 0.2 : 0.16, 0, 0.93, zAxle - 0.04, 'z', 16, true);
    cl(v, G.M.headlightMat, r * 0.86, r * 0.86, 0.03, 0, 0.93, zAxle - 0.14, 'z', 16);
    torus(v, G.M.chrome, r * 0.9, 0.012, 0, 0.93, zAxle - 0.15, 'z');
    bx(v, G.M.chrome, big ? 0.3 : 0.24, 0.035, 0.16, 0, big ? 1.11 : 1.05, zAxle - 0.06, 0.28);
  } else if (kind === 'claw' || kind === 'led') {
    const sport = kind === 'led' && spec.sportFairing;
    for (const side of [-1, 1]) {
      const fair = bx(v, G.tankMat, 0.2, 0.24, sport ? 0.26 : 0.2, side * 0.15, 0.98, zAxle + 0.02, sport ? 0.22 : 0.12, side * 0.24, side * 0.14, true);
      fair.rotation.z = side * 0.12;
      bx(v, G.accentMat, 0.02, 0.1, 0.13, side * 0.255, 0.99, zAxle - 0.04, 0.12, side * 0.24, side * 0.12);
    }
    bx(v, G.M.mattePlastic, 0.3, 0.16, 0.09, 0, 0.9, zAxle - 0.05, 0.1);
    bx(v, G.M.headlightMat, kind === 'led' ? 0.24 : 0.2, kind === 'led' ? 0.09 : 0.13, 0.04, 0, 0.9, zAxle - 0.11);
    bx(v, G.M.drlMat, 0.22, 0.018, 0.03, 0, kind === 'led' ? 0.97 : 0.99, zAxle - 0.12);
    if (kind === 'led') {
      bx(v, G.M.tankMat, 0.36, 0.1, 0.2, 0, 1.12, zAxle + 0.05, 0.2);
      if (spec.windscreen) {
        bx(v, G.M.smokedGlass, 0.4, 0.28, 0.02, 0, 1.26, zAxle + 0.12, -0.42);
      }
    } else {
      bx(v, G.M.tankMat, 0.3, 0.05, 0.24, 0, 1.11, zAxle + 0.06, 0.16);
    }
  }
  for (const side of [-1, 1]) {
    bx(v, G.M.chrome, 0.02, 0.02, 0.2, side * 0.29, 0.91, zAxle - 0.02);
    bx(v, G.M.amberMat, 0.055, 0.05, 0.07, side * 0.33, 0.91, zAxle - 0.1);
  }
}

/* ---------- бак, сиденье, хвост ---------- */

function buildTank(tp, spec) {
  const t = spec.tank || {};
  const kind = t.kind || 'plain';
  const w = t.w || 0.52;
  const h = t.h || 0.36;
  const len = t.len || 0.68;
  const y = t.y || 0.95;
  const z = t.z || -0.52;

  if (kind === 'plain') {
    bx(tp, G.tankMat, w, h, len, 0, y, z, 0, 0, 0, true);
    bx(tp, G.tankMat, w * 0.82, 0.08, len * 0.9, 0, y + h / 2 + 0.03, z, 0.04);
    cl(tp, G.M.chrome, 0.06, 0.06, 0.035, 0, y + h / 2 + 0.09, z - len * 0.18, 'y', 10);
    if (t.stripe !== false) {
      for (const side of [-1, 1]) {
        bx(tp, G.accentMat, 0.018, 0.06, len * 0.7, side * (w / 2 + 0.012), y - 0.02, z);
      }
    }
    if (t.goldMold) {
      for (const side of [-1, 1]) {
        bx(tp, G.M.goldMetal, 0.02, 0.025, len * 0.72, side * (w / 2 + 0.02), y + 0.08, z);
      }
    }
  } else if (kind === 'clinch') {
    bx(tp, G.tankMat, w, h, len * 0.68, 0, y + 0.02, z - 0.05, 0.08, 0, 0, true);
    bx(tp, G.tankMat, w * 0.8, h * 0.66, len * 0.45, 0, y - 0.06, z + len * 0.46, 0.14);
    bx(tp, G.tankMat, w * 0.9, h * 0.5, len * 0.3, 0, y + 0.11, z - len * 0.5, 0.22);
    cl(tp, G.M.chrome, 0.06, 0.06, 0.035, 0, y + h / 2 + 0.13, z - 0.08, 'y', 10);
    for (const side of [-1, 1]) {
      bx(tp, G.accentMat, 0.02, 0.08, len * 0.55, side * (w / 2 + 0.012), y + 0.02, z, 0.1);
      if (t.pads) {
        bx(tp, G.M.mattePlastic, 0.06, 0.19, 0.3, side * (w / 2 + 0.035), y - 0.04, z + 0.02);
      }
    }
  } else if (kind === 'muscular') {
    bx(tp, G.tankMat, w, h, len, 0, y + 0.02, z, 0, 0, 0, true);
    bx(tp, G.tankMat, w * 0.86, 0.12, len * 0.8, 0, y + h / 2 + 0.05, z);
    for (const side of [-1, 1]) {
      bx(tp, G.tankMat, 0.08, h * 0.78, len * 0.7, side * (w / 2 + 0.03), y - 0.03, z, 0, side * 0.12, 0, true);
      bx(tp, G.M.mattePlastic, 0.03, 0.1, len * 0.5, side * (w / 2 + 0.075), y - 0.06, z);
      bx(tp, G.accentMat, 0.018, 0.05, len * 0.62, side * (w / 2 + 0.045), y + 0.1, z);
    }
    cl(tp, G.M.chrome, 0.065, 0.065, 0.04, 0, y + h / 2 + 0.13, z - 0.12, 'y', 10);
  } else if (kind === 'sport') {
    bx(tp, G.tankMat, w, h, len * 0.7, 0, y + 0.08, z - 0.02, 0.3, 0, 0, true);
    bx(tp, G.tankMat, w * 0.82, h * 0.7, len * 0.48, 0, y - 0.08, z + len * 0.4, 0.12);
    bx(tp, G.tankMat, w * 0.88, 0.1, len * 0.5, 0, y + h / 2 + 0.1, z - 0.06, 0.3);
    for (const side of [-1, 1]) {
      bx(tp, G.M.mattePlastic, 0.06, 0.18, len * 0.5, side * (w / 2 + 0.03), y - 0.02, z + 0.04, 0.2);
      bx(tp, G.accentMat, 0.02, 0.06, len * 0.5, side * (w / 2 + 0.04), y + 0.1, z, 0.2);
    }
    cl(tp, G.M.chrome, 0.055, 0.055, 0.035, 0, y + h / 2 + 0.18, z - 0.12, 'y', 10);
  } else if (kind === 'teardrop') {
    bx(tp, G.tankMat, w, h, len * 0.55, 0, y + 0.02, z - 0.14, 0, 0, 0, true);
    bx(tp, G.tankMat, w * 1.04, h * 0.84, len * 0.5, 0, y - 0.03, z + 0.22);
    bx(tp, G.tankMat, w * 0.74, h * 0.5, len * 0.44, 0, y - 0.08, z + 0.55);
    cl(tp, G.M.chrome, 0.07, 0.07, 0.045, 0, y + h / 2 + 0.13, z - 0.18, 'y', 10);
    for (const side of [-1, 1]) {
      bx(tp, G.accentMat, 0.02, 0.07, len * 0.95, side * (w / 2 + 0.025), y - 0.02, z + 0.12);
      bx(tp, G.M.chrome, 0.02, 0.025, len * 0.8, side * (w / 2 + 0.04), y + 0.1, z + 0.1);
    }
    bx(tp, G.M.chrome, 0.025, 0.03, len * 1.02, 0, y + h / 2 + 0.15, z + 0.12);
    bx(tp, G.M.chrome, 0.09, 0.055, 0.12, 0, y + 0.04, z - 0.62);
  }

  // Логотип на баке.
  for (const side of [-1, 1]) {
    bx(tp, G.accentMat, 0.015, 0.045, 0.14, side * (w / 2 + 0.05), y + 0.04, z - 0.1);
  }
}

function buildSeatTail(tp, spec) {
  const seat = spec.seat || {};
  const kind = seat.kind || 'step';
  const leather = seat.leather ? G.M.leather : G.M.mattePlastic;

  if (kind === 'flat') {
    bx(tp, leather, 0.42, 0.13, 0.94, 0, 0.88, 0.2, 0, 0, 0, true);
    bx(tp, G.M.chrome, 0.3, 0.014, 0.82, 0, 0.95, 0.2);
    bx(tp, G.M.chrome, 0.04, 0.03, 0.3, 0.22, 0.92, 0.38);
    if (seat.leather) {
      bx(tp, G.M.goldMetal, 0.012, 0.014, 0.8, 0.085, 0.948, 0.18);
      bx(tp, G.M.goldMetal, 0.012, 0.014, 0.8, -0.085, 0.948, 0.18);
    }
  } else if (kind === 'cruiser') {
    bx(tp, leather, 0.44, 0.14, 0.54, 0, 0.78, 0.06, 0, 0, 0, true);
    bx(tp, leather, 0.42, 0.16, 0.42, 0, 0.86, 0.45, 0, 0, 0, true);
    bx(tp, G.M.chrome, 0.3, 0.014, 0.72, 0, 0.855, 0.24);
    for (const side of [-1, 1]) {
      bx(tp, G.M.chrome, 0.035, 0.44, 0.05, side * 0.28, 1.08, 0.73);
      bx(tp, G.M.chrome, 0.035, 0.05, 0.32, side * 0.2, 1.28, 0.66, -0.4);
    }
    bx(tp, G.M.mattePlastic, 0.32, 0.16, 0.12, 0, 1.24, 0.79);
    bx(tp, G.M.chrome, 0.33, 0.04, 0.13, 0, 1.33, 0.79);
  } else {
    bx(tp, leather, 0.4, 0.12, 0.5, 0, 0.9, 0.02, 0, 0, 0, true);
    bx(tp, leather, 0.36, 0.13, 0.36, 0, 0.98, 0.38, 0, 0, 0, true);
    bx(tp, G.M.chrome, 0.26, 0.012, 0.72, 0, 0.955, 0.2);
    if (seat.stripe) bx(tp, G.accentMat, 0.22, 0.014, 0.5, 0, 0.965, 0.05);
    for (const side of [-1, 1]) {
      bx(tp, G.M.metalDark, 0.05, 0.045, 0.28, side * 0.22, 0.94, 0.44);
    }
  }

  // Заднее крыло.
  const tailKind = spec.tail || 'flat';
  if (tailKind === 'long') {
    bx(tp, G.tankMat, 0.3, 0.09, 0.56, 0, 0.68, 0.72, -0.08, 0, 0, true);
    bx(tp, G.tankMat, 0.28, 0.08, 0.4, 0, 0.62, 0.94, -0.28);
    bx(tp, G.M.chrome, 0.04, 0.022, 0.5, 0, 0.735, 0.74, -0.08);
  } else {
    bx(tp, G.tankMat, 0.3, 0.09, 0.46, 0, 0.72, 0.7, -0.06, 0, 0, true);
  }

  if (tailKind === 'flat') {
    bx(tp, G.tankMat, 0.32, 0.12, 0.34, 0, 0.84, 0.7, 0.1);
    bx(tp, G.tailLightBrakeMat, 0.24, 0.09, 0.06, 0, 0.86, 0.9);
    bx(tp, G.M.chrome, 0.27, 0.02, 0.07, 0, 0.92, 0.9);
  } else if (tailKind === 'sharp') {
    bx(tp, G.tankMat, 0.34, 0.16, 0.46, 0, 0.94, 0.62, 0.2, 0, 0, true);
    bx(tp, G.tankMat, 0.24, 0.1, 0.3, 0, 1.04, 0.87, 0.26);
    bx(tp, G.accentMat, 0.04, 0.13, 0.24, 0.18, 0.97, 0.66, 0.2);
    bx(tp, G.accentMat, 0.04, 0.13, 0.24, -0.18, 0.97, 0.66, 0.2);
    bx(tp, G.tailLightBrakeMat, 0.26, 0.055, 0.03, 0, 0.99, 1.0);
    bx(tp, G.tailLightBrakeMat, 0.07, 0.1, 0.03, 0.15, 0.93, 0.99);
    bx(tp, G.tailLightBrakeMat, 0.07, 0.1, 0.03, -0.15, 0.93, 0.99);
    bx(tp, G.M.mattePlastic, 0.24, 0.07, 0.06, 0, 0.84, 1.02, -0.3);
  } else if (tailKind === 'x') {
    bx(tp, G.tankMat, 0.36, 0.17, 0.48, 0, 0.96, 0.62, 0.18, 0, 0, true);
    bx(tp, G.tankMat, 0.26, 0.1, 0.28, 0, 1.05, 0.88, 0.24);
    const l1 = bx(tp, G.tailLightBrakeMat, 0.05, 0.22, 0.03, 0, 0.97, 1.0, 0, 0, 0.6);
    const l2 = bx(tp, G.tailLightBrakeMat, 0.05, 0.22, 0.03, 0, 0.97, 1.005, 0, 0, -0.6);
    l1.renderOrder = 1;
    l2.renderOrder = 1;
    bx(tp, G.M.mattePlastic, 0.28, 0.08, 0.06, 0, 0.84, 1.02, -0.32);
    if (spec.spoiler) bx(tp, G.tankMat, 0.4, 0.04, 0.24, 0, 1.14, 0.92, 0.4);
  } else if (tailKind === 'long') {
    bx(tp, G.tankMat, 0.32, 0.16, 0.42, 0, 0.82, 0.98, -0.34, 0, 0, true);
    bx(tp, G.tankMat, 0.26, 0.12, 0.3, 0, 0.92, 1.16, -0.3);
    cl(tp, G.M.chrome, 0.075, 0.075, 0.07, 0, 0.9, 1.2, 'z', 12);
    cl(tp, G.tailLightBrakeMat, 0.06, 0.06, 0.04, 0, 0.9, 1.24, 'z', 12);
    bx(tp, G.M.chrome, 0.34, 0.02, 0.06, 0, 0.75, 1.12, -0.22);
  }

  // Номер и подсветка.
  bx(tp, G.getPlateMat(spec.id), 0.2, 0.1, 0.018, 0, 0.75, 1.04, -0.18);
  bx(tp, G.M.drlMat, 0.035, 0.016, 0.02, 0.08, 0.81, 1.03);
  bx(tp, G.M.drlMat, 0.035, 0.016, 0.02, -0.08, 0.81, 1.03);

  for (const side of [-1, 1]) {
    bx(tp, G.M.chrome, 0.015, 0.015, 0.16, side * 0.287, 0.94, 0.92);
    bx(tp, G.M.amberMat, 0.055, 0.05, 0.06, side * 0.305, 0.94, 0.98);
  }

  // Брызговик.
  bx(tp, G.M.rubber, 0.24, 0.16, 0.05, 0, 0.52, 0.94);
}

function buildBars(tp, spec) {
  const kind = spec.bars || 'flat';
  const barMat = G.M.chrome;
  if (kind === 'high') {
    bx(tp, barMat, 0.72, 0.045, 0.055, 0, 1.1, -1.02);
    for (const side of [-1, 1]) {
      bx(tp, barMat, 0.05, 0.08, 0.12, side * 0.15, 1.03, -1.02, 0.2);
      bx(tp, G.M.rubber, 0.13, 0.055, 0.06, side * 0.37, 1.1, -1.02);
      bx(tp, G.M.chrome, 0.14, 0.015, 0.025, side * 0.32, 1.11, -1.08);
      bx(tp, barMat, 0.02, 0.02, 0.03, side * 0.3, 1.1, -1.02);
      bx(tp, G.M.chrome, 0.02, 0.16, 0.025, side * 0.34, 1.2, -1.0, 0, 0, -side * 0.2);
      cl(tp, G.M.chrome, 0.065, 0.065, 0.03, side * 0.38, 1.3, -0.98, 'z', 10);
      cl(tp, G.M.glass, 0.055, 0.055, 0.02, side * 0.38, 1.3, -1.0, 'z', 10);
    }
  } else if (kind === 'cruiser') {
    bx(tp, barMat, 0.5, 0.045, 0.055, 0, 1.04, -1.0);
    for (const side of [-1, 1]) {
      const horn = bx(tp, barMat, 0.22, 0.04, 0.05, side * 0.36, 1.09, -0.97, 0, side * 0.25, side * 0.34);
      horn.rotation.z = side * 0.34;
      bx(tp, barMat, 0.04, 0.22, 0.05, side * 0.48, 1.18, -0.92, -0.2);
      bx(tp, G.M.rubber, 0.09, 0.05, 0.11, side * 0.5, 1.25, -0.9, 0, 0, side * 0.2);
      bx(tp, G.M.chrome, 0.02, 0.02, 0.04, side * 0.45, 1.16, -0.95);
      bx(tp, G.M.chrome, 0.015, 0.2, 0.02, side * 0.48, 1.33, -0.95, 0, 0, -side * 0.3);
      cl(tp, G.M.chrome, 0.075, 0.075, 0.035, side * 0.52, 1.43, -0.94, 'z', 12);
      cl(tp, G.M.glass, 0.062, 0.062, 0.02, side * 0.52, 1.43, -0.96, 'z', 12);
    }
  } else {
    bx(tp, barMat, 0.62, 0.04, 0.05, 0, 1.05, -1.03);
    for (const side of [-1, 1]) {
      bx(tp, G.M.metalDark, 0.04, 0.08, 0.1, side * 0.18, 1.0, -1.04);
      bx(tp, G.M.rubber, 0.12, 0.05, 0.055, side * 0.34, 1.05, -1.03);
      bx(tp, G.M.chrome, 0.12, 0.014, 0.022, side * 0.3, 1.06, -1.08);
      bx(tp, G.M.chrome, 0.018, 0.14, 0.02, side * 0.31, 1.14, -1.02, 0, 0, -side * 0.24);
      cl(tp, G.M.chrome, 0.055, 0.055, 0.028, side * 0.36, 1.22, -1.0, 'z', 10);
      cl(tp, G.M.glass, 0.047, 0.047, 0.018, side * 0.36, 1.22, -1.02, 'z', 10);
    }
  }

  // Приборка на руле (для третьего лица).
  if (spec.roundDash) {
    bx(tp, G.M.mattePlastic, 0.18, 0.11, 0.1, 0, 1.12, -1.12);
    cl(tp, G.M.chrome, 0.07, 0.07, 0.03, 0, 1.14, -1.06, 'z', 12);
    if (spec.twinGauges) cl(tp, G.M.chrome, 0.05, 0.05, 0.025, 0.14, 1.12, -1.08, 'z', 10);
  }
}

/* ---------- спецификации 12 версий ---------- */

const BIKE_SPECS = {
  boxer100es: {
    family: 'boxer', style: 'spokedDrum', darkFork: true, darkExhaust: true,
    tank: { kind: 'plain', w: 0.5, h: 0.34, len: 0.64 },
    seat: { kind: 'flat', leather: true }, tail: 'flat', headlight: 'round',
    bars: 'high', fenderKind: 'plain', roundDash: true, caliperGold: false
  },
  boxer125: {
    family: 'boxer', style: 'spokedDisc', darkFork: true, darkExhaust: true,
    tank: { kind: 'plain', w: 0.53, h: 0.35, len: 0.68 },
    seat: { kind: 'flat' }, tail: 'flat', headlight: 'round',
    bars: 'high', fenderKind: 'plain', roundDash: true
  },
  boxer150: {
    family: 'boxer', style: 'spokedDisc', darkFork: true, darkExhaust: true,
    tank: { kind: 'plain', w: 0.56, h: 0.36, len: 0.72, goldMold: true },
    seat: { kind: 'flat' }, tail: 'flat', headlight: 'round',
    bars: 'high', fenderKind: 'chrome', roundDash: true, twinGauges: true,
    oilCooler: true,
    extras: 'grabRail'
  },
  ns125: {
    family: 'pulsar', style: 'alloy5', tank: { kind: 'clinch', w: 0.54, h: 0.36, len: 0.72 },
    seat: { kind: 'step' }, tail: 'sharp', headlight: 'claw', bars: 'flat',
    fenderKind: 'accent', sideVents: true
  },
  ns200: {
    family: 'pulsar', style: 'alloyPerf', tank: { kind: 'clinch', w: 0.56, h: 0.38, len: 0.74, pads: true },
    seat: { kind: 'step', stripe: true }, tail: 'sharp', headlight: 'claw', bars: 'flat',
    fenderKind: 'accent', sideVents: true, oilCooler: true, aluPegs: true
  },
  n250: {
    family: 'pulsar', style: 'alloyPerf', tank: { kind: 'muscular', w: 0.58, h: 0.4, len: 0.76 },
    seat: { kind: 'step', stripe: true }, tail: 'sharp', headlight: 'claw', bars: 'flat',
    fenderKind: 'accent', sideVents: true, liquid: true, radiator: true, aluPegs: true
  },
  pulsar150ns: {
    family: 'pulsar', style: 'alloy5', tank: { kind: 'clinch', w: 0.53, h: 0.36, len: 0.72 },
    seat: { kind: 'step' }, tail: 'sharp', headlight: 'claw', bars: 'flat',
    fenderKind: 'accent', sideVents: true
  },
  pulsar180: {
    family: 'pulsar', style: 'alloyPerf', tank: { kind: 'clinch', w: 0.55, h: 0.37, len: 0.73, pads: true },
    seat: { kind: 'step', stripe: true }, tail: 'sharp', headlight: 'claw', bars: 'flat',
    fenderKind: 'accent', sideVents: true, oilCooler: true
  },
  dominar400: {
    family: 'pulsar', style: 'alloyPerf', tank: { kind: 'muscular', w: 0.62, h: 0.42, len: 0.78 },
    seat: { kind: 'step', stripe: true }, tail: 'x', headlight: 'led', bars: 'flat',
    fenderKind: 'plain', sideVents: true, liquid: true, radiator: true,
    caliperGold: true, goldShocks: true, aluPegs: true
  },
  dominar250: {
    family: 'pulsar', style: 'alloyPerf', tank: { kind: 'muscular', w: 0.6, h: 0.4, len: 0.76 },
    seat: { kind: 'step', stripe: true }, tail: 'x', headlight: 'led', bars: 'flat',
    fenderKind: 'plain', sideVents: true, liquid: true, radiator: true,
    caliperGold: true, goldShocks: true, aluPegs: true
  },
  dominar1000: {
    family: 'pulsar', style: 'alloyPerf', tank: { kind: 'sport', w: 0.6, h: 0.4, len: 0.8 },
    seat: { kind: 'step', stripe: true }, tail: 'x', headlight: 'led', bars: 'flat',
    fenderKind: 'plain', sideVents: true, liquid: true, radiator: true,
    caliperGold: true, goldShocks: true, dualExhaust: true, sportFairing: true,
    windscreen: true, spoiler: true, aluPegs: true, fins: 6
  },
  avenger220: {
    family: 'avenger', style: 'cruiser5', tank: { kind: 'teardrop', w: 0.56, h: 0.4, len: 1.0 },
    seat: { kind: 'cruiser', leather: true }, tail: 'long', headlight: 'cruiser',
    bars: 'cruiser', fenderKind: 'cruiser', roundDash: true, zAxle: -1.78,
    zHead: -1.42, forkGaiters: true, chainGuard: true, forwardControls: true
  }
};

/* ---------- сборка ---------- */

export function buildMotorcycle() {
  G.bikeChassisGroup = new THREE.Group();
  G.bikeRoot.add(G.bikeChassisGroup);

  G.frontWheelGroup = new THREE.Group();
  G.frontWheelGroup.position.set(0, 0.34, FRONT_Z);
  const fTire = new THREE.Mesh(cylinder(0.33, 0.33, 0.16, 16), G.M.rubber);
  fTire.rotation.z = Math.PI / 2;
  fTire.castShadow = true;
  const fRim = new THREE.Mesh(cylinder(0.19, 0.19, 0.17, 12), G.M.metalDark);
  fRim.rotation.z = Math.PI / 2;
  G.frontWheelGroup.add(fTire, fRim);
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(cylinder(0.305, 0.305, 0.028, 16), G.M.rubberDark);
    wall.rotation.z = Math.PI / 2;
    wall.position.x = side * 0.072;
    G.frontWheelGroup.add(wall);
  }
  G.bikeChassisGroup.add(G.frontWheelGroup);

  G.rearWheelGroup = new THREE.Group();
  G.rearWheelGroup.position.set(0, 0.34, REAR_Z);
  const rTire = new THREE.Mesh(cylinder(0.34, 0.34, 0.22, 16), G.M.rubber);
  rTire.rotation.z = Math.PI / 2;
  rTire.castShadow = true;
  const rRim = new THREE.Mesh(cylinder(0.2, 0.2, 0.23, 12), G.M.metalDark);
  rRim.rotation.z = Math.PI / 2;
  G.rearWheelGroup.add(rTire, rRim);
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(cylinder(0.315, 0.315, 0.032, 16), G.M.rubberDark);
    wall.rotation.z = Math.PI / 2;
    wall.position.x = side * 0.1;
    G.rearWheelGroup.add(wall);
  }
  G.bikeChassisGroup.add(G.rearWheelGroup);

  // Стили колёс: спицы у Boxer, литые у Pulsar/Dominar, круизерные у Avenger.
  const wheelDefs = {
    spokedDrum: { spokes: 6, spokeW: 0.032, spokeD: 0.045, drum: true },
    spokedDisc: { spokes: 6, spokeW: 0.032, spokeD: 0.045, disc: true, drum: true },
    alloy5: { spokes: 5, spokeW: 0.055, spokeD: 0.12, disc: true },
    alloyPerf: { spokes: 5, spokeW: 0.058, spokeD: 0.13, disc: true, perf: true },
    cruiser5: { spokes: 5, spokeW: 0.075, spokeD: 0.15, disc: true, perf: true, whitewall: true }
  };
  G.bikeWheelStyles = {};
  const wheelDetailGroups = [];
  for (const [key, opts] of Object.entries(wheelDefs)) {
    const front = buildWheelStyle(0.33, 0.16, opts);
    const rear = buildWheelStyle(0.34, 0.22, opts);
    G.frontWheelGroup.add(front);
    G.rearWheelGroup.add(rear);
    G.bikeWheelStyles[key] = { front, rear };
    wheelDetailGroups.push(front, rear);
  }

  /* Семейные контейнеры: публичные имена сохранены. */
  G.bikeVariantGroups = { boxer: new THREE.Group(), avenger: new THREE.Group() };
  G.bikeChassisGroup.add(G.bikeVariantGroups.boxer, G.bikeVariantGroups.avenger);

  G.bikeThirdPersonBody = new THREE.Group();
  G.bikeChassisGroup.add(G.bikeThirdPersonBody);

  const pulsarTp = new THREE.Group();
  const boxerTp = new THREE.Group();
  const avengerTp = new THREE.Group();
  G.bikeThirdPersonBody.add(pulsarTp, boxerTp, avengerTp);
  G.bikeThirdPersonVariants = { pulsar: pulsarTp, boxer: boxerTp, avenger: avengerTp };

  // Прокси-группы крыльев, чтобы сохранить bikeParts.frontFenders[variant].
  const fenderPulsar = new THREE.Group();
  const fenderBoxer = new THREE.Group();
  const fenderAvenger = new THREE.Group();
  G.bikeChassisGroup.add(fenderPulsar);
  G.bikeVariantGroups.boxer.add(fenderBoxer);
  G.bikeVariantGroups.avenger.add(fenderAvenger);
  const frontFenders = { pulsar: fenderPulsar, boxer: fenderBoxer, avenger: fenderAvenger };

  G.bikeVersionGroups = {};
  const versionFenders = [];
  const versionChassis = [];

  for (const [id, spec] of Object.entries(BIKE_SPECS)) {
    spec.id = id;
    const family = spec.family;
    const chassisParent = family === 'pulsar' ? G.bikeChassisGroup : G.bikeVariantGroups[family];
    const tpParent = family === 'pulsar' ? pulsarTp : family === 'boxer' ? boxerTp : avengerTp;

    const chassis = new THREE.Group();
    chassisParent.add(chassis);
    const tp = new THREE.Group();
    tpParent.add(tp);
    const fender = new THREE.Group();
    frontFenders[family].add(fender);

    buildFrame(chassis, spec);
    buildEngine(chassis, spec);
    buildFork(chassis, spec, fender);
    buildTank(tp, spec);
    buildSeatTail(tp, spec);
    buildBars(tp, spec);

    G.bikeVersionGroups[id] = { chassis, tp, fender, family, style: spec.style };
    versionFenders.push(fender);
    versionChassis.push(chassis);
  }

  /* ---------- гонщик ---------- */
  const jacketMat = new THREE.MeshStandardMaterial({ color: 0x182232, roughness: 0.7 });
  const riderGroup = new THREE.Group();
  {
    const torso = bx(riderGroup, jacketMat, 0.52, 0.64, 0.32, 0, 1.38, 0.05, -0.34, 0, 0, true);
    torso.castShadow = true;
    bx(riderGroup, G.accentMat, 0.54, 0.12, 0.34, 0, 1.42, 0.06, -0.34);
    bx(riderGroup, G.tankMat, 0.36, 0.38, 0.4, 0, 1.78, -0.14, 0, 0, 0, true);
    bx(riderGroup, G.M.glass, 0.38, 0.16, 0.22, 0, 1.79, -0.26);
    for (const side of [-1, 1]) {
      bx(riderGroup, jacketMat, 0.16, 0.16, 0.62, side * 0.34, 1.36, -0.34, 0.22, -side * 0.15, 0);
      bx(riderGroup, G.M.mattePlastic, 0.18, 0.56, 0.22, side * 0.28, 0.72, 0.02, 0.35);
    }
  }
  G.bikeThirdPersonBody.add(riderGroup);
  G.bikeThirdPersonRider = riderGroup;

  /* ---------- тюнинг ---------- */
  const tuneUpgradedBrakesGroup = new THREE.Group();
  {
    const bigDiscL = new THREE.Mesh(cylinder(0.245, 0.245, 0.026, 14), G.M.chrome);
    bigDiscL.rotation.z = Math.PI / 2;
    bigDiscL.position.x = -0.105;
    const bigDiscR = bigDiscL.clone();
    bigDiscR.position.x = 0.105;
    const innerRingL = new THREE.Mesh(cylinder(0.16, 0.16, 0.03, 10), G.M.goldMetal);
    innerRingL.rotation.z = Math.PI / 2;
    innerRingL.position.x = -0.105;
    const innerRingR = innerRingL.clone();
    innerRingR.position.x = 0.105;
    G.frontWheelGroup.add(bigDiscL, bigDiscR, innerRingL, innerRingR);

    const rearDisc = new THREE.Mesh(cylinder(0.21, 0.21, 0.025, 12), G.M.chrome);
    rearDisc.rotation.z = Math.PI / 2;
    rearDisc.position.x = 0.135;
    G.rearWheelGroup.add(rearDisc);

    const calL = bx(tuneUpgradedBrakesGroup, G.M.goldMetal, 0.08, 0.15, 0.14, -0.125, 0.43, -1.30);
    const calR = calL.clone();
    calR.position.x = 0.125;
    const calRear = bx(tuneUpgradedBrakesGroup, G.M.goldMetal, 0.075, 0.12, 0.12, 0.15, 0.44, 0.58);
    tuneUpgradedBrakesGroup.add(calL, calR, calRear);
    tuneUpgradedBrakesGroup.userData = { discs: [bigDiscL, bigDiscR, innerRingL, innerRingR, rearDisc] };
  }
  G.bikeChassisGroup.add(tuneUpgradedBrakesGroup);

  const tuneZeroFilterGroup = new THREE.Group();
  {
    const intakePipe = new THREE.Mesh(cylinder(0.045, 0.045, 0.18, 10), G.M.chrome);
    intakePipe.rotation.z = Math.PI / 2;
    intakePipe.position.set(0.26, 0.62, -0.46);
    const filterCone = new THREE.Mesh(cylinder(0.062, 0.092, 0.18, 12), G.M.filterRed);
    filterCone.rotation.x = Math.PI / 2;
    filterCone.position.set(0.35, 0.62, -0.39);
    const filterCap = new THREE.Mesh(cylinder(0.064, 0.064, 0.025, 12), G.M.chrome);
    filterCap.rotation.x = Math.PI / 2;
    filterCap.position.set(0.35, 0.62, -0.29);
    tuneZeroFilterGroup.add(intakePipe, filterCone, filterCap);
  }
  G.bikeChassisGroup.add(tuneZeroFilterGroup);

  const tuneCarbReplaceGroup = new THREE.Group();
  {
    const carbBody = bx(tuneCarbReplaceGroup, G.M.chrome, 0.18, 0.18, 0.16, -0.26, 0.62, -0.50);
    bx(tuneCarbReplaceGroup, G.M.copperMetal, 0.15, 0.10, 0.14, -0.26, 0.50, -0.50);
    const bellmouth = new THREE.Mesh(cylinder(0.065, 0.045, 0.10, 10), G.M.goldMetal);
    bellmouth.rotation.z = Math.PI / 2;
    bellmouth.position.set(-0.37, 0.62, -0.50);
    tuneCarbReplaceGroup.add(carbBody, bellmouth);
  }
  G.bikeChassisGroup.add(tuneCarbReplaceGroup);

  const tuneCarbScrewMesh = new THREE.Mesh(cylinder(0.032, 0.032, 0.09, 8), G.M.goldMetal);
  tuneCarbScrewMesh.rotation.z = Math.PI / 2;
  tuneCarbScrewMesh.position.set(-0.27, 0.68, -0.38);
  G.bikeChassisGroup.add(tuneCarbScrewMesh);

  const tuneIridiumPlugGroup = new THREE.Group();
  {
    bx(tuneIridiumPlugGroup, G.M.iridiumBlue, 0.08, 0.14, 0.08, 0.25, 0.73, -0.68);
    cl(tuneIridiumPlugGroup, G.M.iridiumBlue, 0.018, 0.018, 0.24, 0.25, 0.84, -0.68);
  }
  G.bikeChassisGroup.add(tuneIridiumPlugGroup);

  const tuneSprocketMesh = new THREE.Group();
  {
    const mainPlate = new THREE.Mesh(cylinder(0.24, 0.24, 0.032, 16), G.M.goldMetal);
    mainPlate.rotation.z = Math.PI / 2;
    mainPlate.position.x = -0.14;
    const innerCut = new THREE.Mesh(cylinder(0.14, 0.14, 0.036, 10), G.M.metalDark);
    innerCut.rotation.z = Math.PI / 2;
    innerCut.position.x = -0.14;
    tuneSprocketMesh.add(mainPlate, innerCut);
  }
  G.rearWheelGroup.add(tuneSprocketMesh);

  const tuneChainGuard = bx(G.bikeChassisGroup, G.M.goldMetal, 0.035, 0.09, 0.88, -0.16, 0.44, 0.22);

  const tuneBikeWindshieldExt = new THREE.Group();
  {
    bx(tuneBikeWindshieldExt, G.M.smokedGlass, 0.48, 0.44, 0.035, 0, 1.32, -1.04, -0.44);
    bx(tuneBikeWindshieldExt, G.M.smokedGlass, 0.38, 0.14, 0.032, 0, 1.50, -0.95, -0.30);
    bx(tuneBikeWindshieldExt, G.M.metalDark, 0.035, 0.24, 0.04, -0.18, 1.22, -1.02, -0.44);
    bx(tuneBikeWindshieldExt, G.M.metalDark, 0.035, 0.24, 0.04, 0.18, 1.22, -1.02, -0.44);
  }
  G.bikeChassisGroup.add(tuneBikeWindshieldExt);

  // По умолчанию показываем стартовый Boxer 100 ES.
  for (const [id, data] of Object.entries(G.bikeVersionGroups)) {
    const on = id === 'boxer100es';
    data.chassis.visible = on;
    data.tp.visible = on;
    data.fender.visible = on;
  }
  for (const [key, style] of Object.entries(G.bikeWheelStyles)) {
    const on = key === 'spokedDrum';
    style.front.visible = on;
    style.rear.visible = on;
  }
  G.bikeVariantGroups.boxer.visible = true;
  G.bikeVariantGroups.avenger.visible = false;
  pulsarTp.visible = false;
  boxerTp.visible = true;
  avengerTp.visible = false;

  return {
    fTire,
    fRim,
    rTire,
    rRim,
    frontFender: versionFenders[0],
    frontFenders,
    allFenders: versionFenders,
    versionFenders,
    versionGroups: G.bikeVersionGroups,
    wheelStyles: G.bikeWheelStyles,
    wheelDetailGroups,
    versionChassis,
    tuneUpgradedBrakesGroup,
    tuneZeroFilterGroup,
    tuneCarbReplaceGroup,
    tuneCarbScrewMesh,
    tuneIridiumPlugGroup,
    tuneSprocketMesh,
    tuneChainGuard,
    tuneBikeWindshieldExt
  };
}
