import * as THREE from 'three';
import { G } from '../state.js';
import { box, cylinder } from '../geom.js';

function mesh(geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
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
  }

  const quteWindshieldExtMesh = mesh(box(1.26, 0.64, 0.05), G.M.glassWindow, 0, 1.30, -1.12);
  quteWindshieldExtMesh.rotation.x = -0.14;

  const visorShield = mesh(box(1.34, 0.22, 0.14), G.M.smokedGlass, 0, 1.56, -1.16);
  visorShield.rotation.x = -0.28;
  quteSmokedDeflectorExt.add(visorShield);
  G.quteExteriorGroup.add(quteSmokedDeflectorExt);

  const rearGlassExt = mesh(box(1.18, 0.54, 0.05), G.M.glassWindow, 0, 1.30, 0.80);
  const bumperF = mesh(box(1.48, 0.26, 0.22), G.M.mattePlastic, 0, 0.42, -1.78);
  const grille = mesh(box(0.86, 0.22, 0.06), G.M.metalDark, 0, 0.66, -1.79);
  const bumperR = mesh(box(1.48, 0.28, 0.22), G.M.mattePlastic, 0, 0.42, 1.06);

  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff8e1, emissive: 0xffe082, emissiveIntensity: 1.8 });
  for (const lx of [-0.50, 0.50]) {
    G.quteExteriorGroup.add(
      mesh(box(0.30, 0.20, 0.08), headMat, lx, 0.78, -1.77),
      mesh(box(0.26, 0.28, 0.08), G.tailLightBrakeMat, lx, 0.82, 1.08)
    );
  }

  for (const [wx, wz, isFront] of [
    [-0.70, -1.24, true],
    [0.70, -1.24, true],
    [-0.70, 0.62, false],
    [0.70, 0.62, false]
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
    pivot.add(wMesh);
    G.quteExteriorGroup.add(pivot);
    G.quteWheels.push(wMesh);
    if (isFront) G.quteFrontPivots.push(pivot);
  }

  G.quteExteriorGroup.add(lowerBody, frontHood, roofTop, quteWindshieldExtMesh, rearGlassExt, bumperF, grille, bumperR);

  const splitter = mesh(box(1.66, 0.10, 0.38), G.M.neonCyan, 0, 0.26, -1.86);
  const diffuser = mesh(box(1.64, 0.12, 0.26), G.M.neonMagenta, 0, 0.26, 1.12);

  for (const side of [-1, 1]) {
    const skirt = mesh(box(0.12, 0.10, 2.55), G.M.neonCyan, side * 0.79, 0.26, -0.32);
    const fenderArch = mesh(box(0.14, 0.42, 2.75), G.M.mattePlastic, side * 0.76, 0.52, -0.32);
    const stripeTop = mesh(box(0.18, 0.02, 1.96), G.M.neonMagenta, side * 0.24, 1.725, -0.18);
    G.yuraTuningGroup.add(skirt, fenderArch, stripeTop);
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
    G.yuraFlames.push(flame);
  }

  G.yuraTuningGroup.add(splitter, diffuser, wingBlade, lightBar);
  G.quteExteriorGroup.add(G.yuraTuningGroup);

  return { quteWindshieldExtMesh, quteSmokedDeflectorExt };
}
