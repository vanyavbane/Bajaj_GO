import * as THREE from 'three';
import { G } from '../state.js';
import { box, cylinder } from '../geom.js';

function mesh(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}

export function buildQuteExterior() {
  G.quteExteriorGroup = new THREE.Group();
  G.bikeRoot.add(G.quteExteriorGroup);

  G.quteWheels = [];
  G.quteFrontPivots = [];
  G.yuraTuningGroup = new THREE.Group();
  G.yuraFlames = [];
  const quteSmokedDeflectorExt = new THREE.Group();

  const lowerBody = mesh(box(1.44, 0.72, 2.84), G.tankMat, 0, 0.62, -0.35);
  lowerBody.castShadow = true;
  lowerBody.receiveShadow = true;

  const frontHood = mesh(box(1.38, 0.52, 0.65), G.tankMat, 0, 0.72, -1.52);
  frontHood.rotation.x = 0.18;

  const roofTop = mesh(box(1.36, 0.10, 1.98), G.tankMat, 0, 1.66, -0.18);
  roofTop.castShadow = true;
  for (const rx of [-0.42, 0, 0.42]) {
    G.quteExteriorGroup.add(mesh(box(0.08, 0.04, 1.82), G.accentMat, rx, 1.72, -0.18));
  }

  for (const side of [-1, 1]) {
    const pillarF = mesh(box(0.09, 0.72, 0.10), G.tankMat, side * 0.65, 1.30, -1.08);
    pillarF.rotation.x = -0.14;
    const pillarM = mesh(box(0.09, 0.70, 0.12), G.M.mattePlastic, side * 0.66, 1.30, -0.15);
    const pillarR = mesh(box(0.10, 0.70, 0.18), G.tankMat, side * 0.65, 1.30, 0.72);

    const handle1 = mesh(box(0.05, 0.06, 0.18), G.M.mattePlastic, side * 0.74, 0.88, -0.35);
    const handle2 = handle1.clone();
    handle2.position.z = 0.35;

    const mirrorArm = mesh(box(0.18, 0.05, 0.05), G.M.mattePlastic, side * 0.78, 1.12, -1.02);
    const mirrorHead = mesh(box(0.16, 0.14, 0.08), G.M.mattePlastic, side * 0.88, 1.14, -1.02);
    const sideGlass = mesh(box(0.04, 0.56, 1.62), G.M.glassWindow, side * 0.67, 1.30, -0.16);

    G.quteExteriorGroup.add(pillarF, pillarM, pillarR, handle1, handle2, mirrorArm, mirrorHead, sideGlass);

    // Стекло и шарнир зеркала, повторитель.
    G.quteExteriorGroup.add(mesh(box(0.02, 0.1, 0.06), G.M.glass, side * 0.965, 1.14, -1.03));
    G.quteExteriorGroup.add(mesh(box(0.05, 0.05, 0.05), G.M.metalDark, side * 0.78, 1.09, -1.0));
    G.quteExteriorGroup.add(mesh(box(0.02, 0.03, 0.05), G.M.amberMat, side * 0.955, 1.08, -1.02));

    // Дверь: полотно, контур, петли, молдинг, замок.
    const doorZ = side < 0 ? -0.36 : 0.34;
    const doorX = side * 0.735;
    G.quteExteriorGroup.add(mesh(box(0.04, 0.58, 0.76), G.tankMat, doorX, 0.66, doorZ));
    G.quteExteriorGroup.add(mesh(box(0.02, 0.025, 0.76), G.M.mattePlastic, doorX + side * 0.025, 0.95, doorZ));
    G.quteExteriorGroup.add(mesh(box(0.02, 0.025, 0.76), G.M.mattePlastic, doorX + side * 0.025, 0.37, doorZ));
    G.quteExteriorGroup.add(mesh(box(0.02, 0.58, 0.025), G.M.mattePlastic, doorX + side * 0.025, 0.66, doorZ - 0.38));
    G.quteExteriorGroup.add(mesh(box(0.02, 0.58, 0.025), G.M.mattePlastic, doorX + side * 0.025, 0.66, doorZ + 0.38));
    G.quteExteriorGroup.add(mesh(box(0.03, 0.03, 0.08), G.M.chrome, doorX + side * 0.03, 0.9, doorZ - 0.32));
    G.quteExteriorGroup.add(mesh(box(0.03, 0.03, 0.08), G.M.chrome, doorX + side * 0.03, 0.42, doorZ - 0.32));
    G.quteExteriorGroup.add(mesh(box(0.02, 0.03, 0.7), G.M.chrome, doorX + side * 0.03, 0.5, doorZ));
    G.quteExteriorGroup.add(mesh(box(0.02, 0.03, 0.03), G.M.metalDark, doorX + side * 0.03, 0.87, doorZ + 0.3));
    G.quteExteriorGroup.add(mesh(box(0.02, 0.05, 0.14), G.M.chrome, doorX + side * 0.03, 0.87, doorZ + 0.2));

    // Рамки бокового стекла и накладка стойки.
    G.quteExteriorGroup.add(mesh(box(0.03, 0.025, 1.64), G.M.mattePlastic, side * 0.685, 1.59, -0.16));
    G.quteExteriorGroup.add(mesh(box(0.03, 0.025, 1.64), G.M.mattePlastic, side * 0.685, 1.01, -0.16));
    G.quteExteriorGroup.add(mesh(box(0.03, 0.58, 0.025), G.M.mattePlastic, side * 0.685, 1.3, -0.98));
    G.quteExteriorGroup.add(mesh(box(0.03, 0.58, 0.025), G.M.mattePlastic, side * 0.685, 1.3, 0.66));
    G.quteExteriorGroup.add(mesh(box(0.025, 0.5, 0.04), G.M.mattePlastic, side * 0.655, 1.28, -1.04));
  }

  const quteWindshieldExtMesh = mesh(box(1.26, 0.64, 0.05), G.M.glassWindow, 0, 1.30, -1.12);
  quteWindshieldExtMesh.rotation.x = -0.14;
  // Тонировка, дворники и омыватели.
  G.quteExteriorGroup.add(mesh(box(1.18, 0.10, 0.02), G.M.smokedGlass, 0, 1.58, -1.16, -0.14));
  G.quteExteriorGroup.add(mesh(box(0.5, 0.014, 0.025), G.M.mattePlastic, -0.2, 0.99, -1.16, -0.14));
  G.quteExteriorGroup.add(mesh(box(0.44, 0.014, 0.025), G.M.mattePlastic, 0.24, 0.99, -1.16, -0.14));
  G.quteExteriorGroup.add(mesh(box(0.04, 0.02, 0.03), G.M.mattePlastic, -0.5, 0.99, -1.17));
  G.quteExteriorGroup.add(mesh(box(0.04, 0.02, 0.03), G.M.mattePlastic, 0.5, 0.99, -1.17));

  const visorShield = mesh(box(1.34, 0.22, 0.14), G.M.smokedGlass, 0, 1.56, -1.16);
  visorShield.rotation.x = -0.28;
  quteSmokedDeflectorExt.add(visorShield);
  G.quteExteriorGroup.add(quteSmokedDeflectorExt);

  const rearGlassExt = mesh(box(1.18, 0.54, 0.05), G.M.glassWindow, 0, 1.30, 0.80);
  const bumperF = mesh(box(1.48, 0.26, 0.22), G.M.mattePlastic, 0, 0.42, -1.78);
  const grille = mesh(box(0.86, 0.22, 0.06), G.M.metalDark, 0, 0.66, -1.79);
  const bumperR = mesh(box(1.48, 0.28, 0.22), G.M.mattePlastic, 0, 0.42, 1.06);

  // Решётка: вертикальные ламели, эмблема, воздухозаборник.
  for (let i = -2; i <= 2; i += 1) {
    G.quteExteriorGroup.add(mesh(box(0.055, 0.18, 0.02), G.M.mattePlastic, i * 0.13, 0.66, -1.825));
  }
  G.quteExteriorGroup.add(mesh(box(0.11, 0.07, 0.02), G.M.chrome, 0, 0.66, -1.835));
  G.quteExteriorGroup.add(mesh(box(0.5, 0.1, 0.03), G.M.metalDark, 0, 0.5, -1.86));
  G.quteExteriorGroup.add(mesh(box(1.24, 0.035, 0.04), G.M.chrome, 0, 0.72, -1.86));

  // Корпуса фар, стёкла, отражатели, DRL и противотуманки.
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff8e1, emissive: 0xffe082, emissiveIntensity: 1.8 });
  for (const lx of [-0.5, 0.5]) {
    G.quteExteriorGroup.add(mesh(box(0.36, 0.26, 0.05), G.M.mattePlastic, lx, 0.78, -1.8));
    G.quteExteriorGroup.add(mesh(box(0.3, 0.18, 0.015), G.M.glass, lx, 0.78, -1.83));
    G.quteExteriorGroup.add(mesh(box(0.2, 0.06, 0.02), G.M.headlightMat, lx, 0.78, -1.84));
    G.quteExteriorGroup.add(mesh(box(0.26, 0.02, 0.02), G.M.drlMat, lx, 0.69, -1.84));
    G.quteExteriorGroup.add(mesh(box(0.08, 0.05, 0.02), G.M.headlightMat, lx * 1.1, 0.45, -1.9));
    // Поворотники на хром-ножках.
    G.quteExteriorGroup.add(mesh(box(0.02, 0.02, 0.08), G.M.chrome, lx * 1.36, 0.62, -1.78));
    G.quteExteriorGroup.add(mesh(box(0.03, 0.05, 0.06), G.M.amberMat, lx * 1.42, 0.62, -1.74));
  }

  for (const lx of [-0.5, 0.5]) {
    G.quteExteriorGroup.add(mesh(box(0.36, 0.26, 0.05), G.M.mattePlastic, lx, 0.82, 1.1));
    G.quteExteriorGroup.add(mesh(box(0.3, 0.18, 0.015), G.M.glass, lx, 0.82, 1.13));
    G.quteExteriorGroup.add(mesh(box(0.26, 0.28, 0.08), G.tailLightBrakeMat, lx, 0.82, 1.08));
    // Задние поворотники.
    G.quteExteriorGroup.add(mesh(box(0.02, 0.02, 0.08), G.M.chrome, lx * 1.36, 0.72, 1.08));
    G.quteExteriorGroup.add(mesh(box(0.03, 0.05, 0.06), G.M.amberMat, lx * 1.42, 0.72, 1.04));
    // Катафоты в бампере.
    G.quteExteriorGroup.add(mesh(box(0.1, 0.04, 0.02), G.M.filterRed, lx * 0.62, 0.4, 1.18));
  }
  // Центральный стоп-сигнал над задним стеклом.
  G.quteExteriorGroup.add(mesh(box(0.52, 0.035, 0.025), G.tailLightBrakeMat, 0, 1.6, 0.83));
  // Задние фонари: корпуса и стекло.
  G.quteExteriorGroup.add(mesh(box(0.9, 0.05, 0.02), G.M.chrome, 0, 0.6, 1.19));

  // Номера и подсветка.
  G.quteExteriorGroup.add(mesh(box(0.4, 0.13, 0.02), G.getPlateMat('qute'), 0, 0.42, -1.9));
  G.quteExteriorGroup.add(mesh(box(0.4, 0.13, 0.02), G.getPlateMat('qute'), 0, 0.42, 1.18));
  for (const lx of [-0.14, 0.14]) {
    G.quteExteriorGroup.add(mesh(box(0.05, 0.02, 0.02), G.M.drlMat, lx, 0.5, -1.9));
    G.quteExteriorGroup.add(mesh(box(0.05, 0.02, 0.02), G.M.drlMat, lx, 0.5, 1.18));
  }

  // Боковые повторители на передних дверях.
  for (const side of [-1, 1]) {
    G.quteExteriorGroup.add(mesh(box(0.02, 0.03, 0.06), G.M.amberMat, side * 0.76, 0.78, -0.12));
    // Порог и хром-полоса.
    G.quteExteriorGroup.add(mesh(box(0.03, 0.09, 2.3), G.M.mattePlastic, side * 0.735, 0.3, -0.35));
    G.quteExteriorGroup.add(mesh(box(0.02, 0.02, 2.2), G.M.chrome, side * 0.755, 0.35, -0.35));
  }

  // Скругления крыши, водостоки, антенна и рейлинги.
  G.quteExteriorGroup.add(mesh(box(1.24, 0.05, 0.18), G.tankMat, 0, 1.68, -1.14, -0.12));
  G.quteExteriorGroup.add(mesh(box(1.24, 0.05, 0.18), G.tankMat, 0, 1.68, 0.78, 0.12));
  for (const side of [-1, 1]) {
    G.quteExteriorGroup.add(mesh(box(0.03, 0.03, 1.9), G.M.mattePlastic, side * 0.62, 1.73, -0.18));
    G.quteExteriorGroup.add(mesh(box(0.03, 0.035, 1.86), G.M.chrome, side * 0.5, 1.74, -0.18));
  }
  G.quteExteriorGroup.add(mesh(cylinder(0.01, 0.01, 0.34, 6), G.M.metalDark, 0.56, 1.82, 0.62));

  // Клыки, сплиттер, диффузор.
  for (const side of [-1, 1]) {
    G.quteExteriorGroup.add(mesh(box(0.28, 0.2, 0.06), G.tankMat, side * 0.6, 0.45, -1.88));
    G.quteExteriorGroup.add(mesh(box(0.06, 0.14, 0.06), G.M.metalDark, side * 0.6, 0.4, 1.16));
  }
  G.quteExteriorGroup.add(mesh(box(1.6, 0.04, 0.2), G.M.mattePlastic, 0, 0.28, -1.9));
  G.quteExteriorGroup.add(mesh(box(1.4, 0.08, 0.2), G.M.metalDark, 0, 0.28, 1.16));
  for (let i = -2; i <= 2; i += 1) {
    G.quteExteriorGroup.add(mesh(box(0.04, 0.02, 0.16), G.M.metalDark, i * 0.22, 0.24, 1.16));
  }

  // Арки колёс: тёмный свод, наружная накладка, брызговик.
  for (const { wx, wz, front } of [
    { wx: -0.70, wz: -1.24, front: true },
    { wx: 0.70, wz: -1.24, front: true },
    { wx: -0.70, wz: 0.62, front: false },
    { wx: 0.70, wz: 0.62, front: false }
  ]) {
    G.quteExteriorGroup.add(mesh(box(0.2, 0.62, 0.78), G.M.mattePlastic, wx * 0.98, 0.5, wz));
    G.quteExteriorGroup.add(mesh(box(0.06, 0.08, 0.72), G.tankMat, wx * 1.035, 0.63, wz));
    G.quteExteriorGroup.add(mesh(box(0.06, 0.28, 0.08), G.tankMat, wx * 1.035, 0.5, wz - 0.36));
    G.quteExteriorGroup.add(mesh(box(0.06, 0.28, 0.08), G.tankMat, wx * 1.035, 0.5, wz + 0.36));
    G.quteExteriorGroup.add(mesh(box(0.07, 0.18, 0.06), G.M.rubber, wx * 1.03, 0.22, wz + 0.4));
    if (front) {
      G.quteExteriorGroup.add(mesh(box(0.08, 0.03, 0.08), G.M.amberMat, wx * 1.05, 0.7, wz - 0.3));
    }
  }

  for (const { wx, wz, front } of [
    { wx: -0.70, wz: -1.24, front: true },
    { wx: 0.70, wz: -1.24, front: true },
    { wx: -0.70, wz: 0.62, front: false },
    { wx: 0.70, wz: 0.62, front: false }
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.31, wz);
    const wMesh = new THREE.Group();
    const tire = new THREE.Mesh(cylinder(0.31, 0.31, 0.20, 14), G.M.rubber);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    const rim = new THREE.Mesh(cylinder(0.19, 0.19, 0.21, 8), G.accentMat);
    rim.rotation.z = Math.PI / 2;
    wMesh.add(tire, rim);

    // Боковины, спицы, втулка, болты и суппорт.
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(cylinder(0.285, 0.285, 0.025, 14), G.M.rubberDark);
      wall.rotation.z = Math.PI / 2;
      wall.position.x = side * 0.1;
      wMesh.add(wall);
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2;
        const spoke = new THREE.Mesh(box(0.04, 0.3, 0.05), G.M.chrome);
        spoke.position.set(side * 0.105, Math.cos(a) * 0.11, Math.sin(a) * 0.11);
        spoke.rotation.x = a;
        wMesh.add(spoke);
      }
    }
    const hub = new THREE.Mesh(cylinder(0.06, 0.06, 0.24, 10), G.M.chrome);
    hub.rotation.z = Math.PI / 2;
    wMesh.add(hub);
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2;
      const bolt = new THREE.Mesh(box(0.03, 0.03, 0.03), G.M.metalDark);
      bolt.position.set(0.115, Math.cos(a) * 0.085, Math.sin(a) * 0.085);
      wMesh.add(bolt);
    }
    if (front) {
      const caliper = new THREE.Mesh(box(0.05, 0.1, 0.08), G.M.filterRed);
      caliper.position.set(-0.12, 0.12, 0);
      wMesh.add(caliper);
    }

    pivot.add(wMesh);
    G.quteExteriorGroup.add(pivot);
    G.quteWheels.push(wMesh);
    if (front) G.quteFrontPivots.push(pivot);
  }

  G.quteExteriorGroup.add(lowerBody, frontHood, roofTop, quteWindshieldExtMesh, rearGlassExt, bumperF, grille, bumperR);

  const splitter = mesh(box(1.66, 0.10, 0.38), G.M.neonCyan, 0, 0.26, -1.86);
  const diffuser = mesh(box(1.64, 0.12, 0.26), G.M.neonMagenta, 0, 0.26, 1.12);

  for (const side of [-1, 1]) {
    const skirt = mesh(box(0.12, 0.10, 2.55), G.M.neonCyan, side * 0.79, 0.26, -0.32);
    const fenderArch = mesh(box(0.14, 0.42, 2.75), G.M.mattePlastic, side * 0.76, 0.52, -0.32);
    const stripeTop = mesh(box(0.18, 0.02, 1.96), G.M.neonMagenta, side * 0.24, 1.725, -0.18);
    G.yuraTuningGroup.add(skirt, fenderArch, stripeTop);
    // Неоновые акценты на крыльях.
    G.yuraTuningGroup.add(mesh(box(0.1, 0.03, 0.18), G.M.neonCyan, side * 0.72, 0.74, -1.5));
    G.yuraTuningGroup.add(mesh(box(0.1, 0.03, 0.18), G.M.neonMagenta, side * 0.72, 0.72, 0.9));
  }

  for (const sx of [-0.52, 0.52]) {
    const wingStrut = mesh(box(0.08, 0.46, 0.24), G.M.metalDark, sx, 1.84, 0.72);
    wingStrut.rotation.x = -0.25;
    G.yuraTuningGroup.add(wingStrut);
  }
  const wingBlade = mesh(box(1.78, 0.08, 0.42), G.M.neonMagenta, 0, 2.06, 0.84);
  wingBlade.rotation.x = 0.16;

  const lightBar = mesh(box(1.12, 0.12, 0.16), G.M.neonCyan, 0, 1.76, -1.04);

  for (const ex of [-0.36, 0.36]) {
    const pipe = new THREE.Mesh(cylinder(0.08, 0.08, 0.36, 10), G.M.chrome);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(ex, 0.34, 1.18);
    const flame = mesh(box(0.14, 0.14, 0.45), G.M.neonYellow, ex, 0.34, 1.48);
    G.yuraTuningGroup.add(pipe, flame);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 4, 14), G.M.neonCyan);
    ring.position.set(ex, 0.34, 1.0);
    G.yuraTuningGroup.add(ring);
    G.yuraFlames.push(flame);
  }

  G.yuraTuningGroup.add(splitter, diffuser, wingBlade, lightBar);
  G.quteExteriorGroup.add(G.yuraTuningGroup);

  return { quteWindshieldExtMesh, quteSmokedDeflectorExt };
}
