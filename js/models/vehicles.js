import * as THREE from 'three';
import { G } from '../state.js';
import { box, cylinder } from '../geom.js';

const headMat = new THREE.MeshStandardMaterial({ color: 0xfff8e1, emissive: 0xffe082, emissiveIntensity: 1.5 });
const tailMat = new THREE.MeshStandardMaterial({ color: 0xff1744, emissive: 0xd50000, emissiveIntensity: 1.1 });
const alertMat = new THREE.MeshBasicMaterial({ color: 0xffab00 });
const taxiSignMat = new THREE.MeshStandardMaterial({ color: 0xffeb3b, emissive: 0xffa000, emissiveIntensity: 0.9 });
const bedMat = new THREE.MeshStandardMaterial({ color: 0x5d646e, roughness: 0.7 });
const crateMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.85 });
const paints = new Map();

// Блик фары встречной машины. Это отдельный additive-спрайт, а не God Rays:
// лучи постобработки теперь остаются только у солнца, а фары светят сами.
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

function paint(color) {
  let mat = paints.get(color);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.3,
      metalness: 0.4,
      envMapIntensity: 1.2
    });
    paints.set(color, mat);
  }
  return mat;
}

function add(parent, geo, mat, x, y, z) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function addWheel(hiDetail, wheels, frontPivots, x, y, z, radius, width, isFront) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const wheelMesh = new THREE.Group();
  const tire = new THREE.Mesh(cylinder(radius, radius, width, 12), G.M.rubber);
  tire.rotation.z = Math.PI / 2;
  const rim = new THREE.Mesh(cylinder(radius * 0.58, radius * 0.58, width + 0.02, 8), G.M.chrome);
  rim.rotation.z = Math.PI / 2;
  wheelMesh.add(tire, rim);
  pivot.add(wheelMesh);
  hiDetail.add(pivot);
  wheels.push(wheelMesh);
  if (isFront) frontPivots.push(pivot);
}

function addLights(hiDetail, xs, head, tail) {
  for (const x of xs) {
    add(hiDetail, box(head.w, head.h, head.d), headMat, x, head.y, head.z);
    add(hiDetail, box(tail.w, tail.h, tail.d), tailMat, x, tail.y, tail.z);

    // Мягкий ореол вокруг фары: виден у встречных машин, сзади его закрывает кузов.
    const glare = new THREE.Sprite(getHeadGlowMat());
    glare.position.set(x, head.y, head.z - 0.08);
    glare.scale.set(1.05, 1.05, 1);
    hiDetail.add(glare);
  }
}

function buildQute(hiDetail, loDetail, bodyMat, wheels, frontPivots) {
  const lower = add(hiDetail, box(1.36, 0.72, 2.75), bodyMat, 0, 0.62, 0);
  lower.castShadow = true;
  add(hiDetail, box(1.30, 0.72, 1.95), bodyMat, 0, 1.30, 0.12);
  add(hiDetail, box(1.33, 0.56, 1.82), G.M.glass, 0, 1.30, 0.12);
  const bumperF = add(hiDetail, box(1.40, 0.24, 0.2), G.M.mattePlastic, 0, 0.42, -1.36);
  const bumperR = bumperF.clone();
  bumperR.position.z = 1.36;
  hiDetail.add(bumperR);

  for (const wx of [-0.66, 0.66]) {
    addWheel(hiDetail, wheels, frontPivots, wx, 0.3, -0.95, 0.3, 0.18, true);
    addWheel(hiDetail, wheels, frontPivots, wx, 0.3, 0.95, 0.3, 0.18, false);
  }
  addLights(
    hiDetail,
    [-0.46, 0.46],
    { w: 0.28, h: 0.18, d: 0.08, y: 0.72, z: -1.38 },
    { w: 0.24, h: 0.22, d: 0.08, y: 0.76, z: 1.38 }
  );

  add(loDetail, box(1.36, 1.45, 2.75), bodyMat, 0, 0.9, 0);
  return { halfWidth: 0.72, halfLength: 1.45, roofHeight: 1.68 };
}

function buildSedan(hiDetail, loDetail, bodyMat, wheels, frontPivots, isTaxi) {
  const chassis = add(hiDetail, box(2.24, 0.76, 4.45), bodyMat, 0, 0.72, 0);
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  const cabin = add(hiDetail, box(1.88, 0.66, 2.2), bodyMat, 0, 1.38, -0.15);
  cabin.castShadow = true;
  add(hiDetail, box(1.92, 0.56, 2.26), G.M.glass, 0, 1.38, -0.15);
  const bumpF = add(hiDetail, box(2.3, 0.24, 0.22), G.M.mattePlastic, 0, 0.5, -2.24);
  const bumpR = bumpF.clone();
  bumpR.position.z = 2.24;
  hiDetail.add(bumpR);

  if (isTaxi) add(hiDetail, box(0.65, 0.22, 0.28), taxiSignMat, 0, 1.82, -0.1);

  for (const wx of [-1.08, 1.08]) {
    addWheel(hiDetail, wheels, frontPivots, wx, 0.4, -1.38, 0.4, 0.26, true);
    addWheel(hiDetail, wheels, frontPivots, wx, 0.4, 1.38, 0.4, 0.26, false);
  }
  addLights(
    hiDetail,
    [-0.76, 0.76],
    { w: 0.42, h: 0.2, d: 0.08, y: 0.78, z: -2.25 },
    { w: 0.42, h: 0.2, d: 0.08, y: 0.78, z: 2.25 }
  );

  add(loDetail, box(2.24, 1.35, 4.45), bodyMat, 0, 0.85, 0);
  return { halfWidth: 1.12, halfLength: 2.25, roofHeight: 1.65 };
}

function buildGazelle(hiDetail, loDetail, bodyMat, wheels, frontPivots, isVan) {
  const w = 3.82;
  const cab = add(hiDetail, box(w * 0.92, 1.45, 2.1), bodyMat, 0, 1.15, -1.95);
  cab.castShadow = true;
  add(hiDetail, box(w * 0.84, 0.75, 0.12), G.M.glass, 0, 1.48, -3.02);
  add(hiDetail, box(w * 0.88, 0.26, 6.1), G.M.metalDark, 0, 0.58, 0);

  if (!isVan) {
    const bed = add(hiDetail, box(w, 0.75, 3.95), bedMat, 0, 1.08, 1.1);
    bed.castShadow = true;
    add(hiDetail, box(w * 0.7, 0.95, 2.4), crateMat, 0, 1.65, 1.1);
  } else {
    const vanBox = add(hiDetail, box(w, 2.25, 4.05), bodyMat, 0, 1.82, 1.1);
    vanBox.castShadow = true;
  }

  for (const wx of [-w * 0.45, w * 0.45]) {
    addWheel(hiDetail, wheels, frontPivots, wx, 0.46, -1.95, 0.46, 0.32, true);
    addWheel(hiDetail, wheels, frontPivots, wx, 0.46, 1.85, 0.46, 0.32, false);
  }
  addLights(
    hiDetail,
    [-w * 0.34, w * 0.34],
    { w: 0.48, h: 0.24, d: 0.1, y: 0.88, z: -3.02 },
    { w: 0.48, h: 0.22, d: 0.1, y: 0.72, z: 3.12 }
  );

  add(loDetail, box(w, 2.5, 6.1), bodyMat, 0, 1.45, 0);
  return { halfWidth: w * 0.5, halfLength: 3.15, roofHeight: 2.65 };
}

function buildBus(hiDetail, loDetail, bodyMat, wheels, frontPivots) {
  const w = 3.55;
  const body = add(hiDetail, box(w, 2.55, 8.2), bodyMat, 0, 1.72, 0);
  body.castShadow = true;
  add(hiDetail, box(w + 0.05, 0.92, 7.6), G.M.glass, 0, 2.15, 0);

  for (const wx of [-w * 0.46, w * 0.46]) {
    addWheel(hiDetail, wheels, frontPivots, wx, 0.5, -2.55, 0.5, 0.34, true);
    addWheel(hiDetail, wheels, frontPivots, wx, 0.5, 2.55, 0.5, 0.34, false);
  }
  addLights(
    hiDetail,
    [-w * 0.36, w * 0.36],
    { w: 0.5, h: 0.26, d: 0.1, y: 0.92, z: -4.12 },
    { w: 0.5, h: 0.26, d: 0.1, y: 0.92, z: 4.12 }
  );

  add(loDetail, box(w, 2.6, 8.2), bodyMat, 0, 1.72, 0);
  return { halfWidth: w * 0.5, halfLength: 4.1, roofHeight: 2.85 };
}

export function createVehicleModel(type, colorHex) {
  const root = new THREE.Group();
  const hiDetail = new THREE.Group();
  const loDetail = new THREE.Group();
  root.add(hiDetail, loDetail);

  const known = ['qute_traffic', 'sedan', 'taxi', 'gazelle_flatbed', 'gazelle_van', 'bus'];
  if (!known.includes(type)) {
    console.warn('bajaj GO: неизвестный тип трафика «' + type + '», показан седан');
    type = 'sedan';
  }

  const paintColor = (type === 'taxi' || type === 'qute_traffic') ? 0xffca28 : colorHex;
  const bodyMat = paint(paintColor);
  const wheels = [];
  const frontPivots = [];

  let bounds;
  if (type === 'qute_traffic') bounds = buildQute(hiDetail, loDetail, bodyMat, wheels, frontPivots);
  else if (type === 'sedan' || type === 'taxi') bounds = buildSedan(hiDetail, loDetail, bodyMat, wheels, frontPivots, type === 'taxi');
  else if (type === 'gazelle_flatbed' || type === 'gazelle_van') bounds = buildGazelle(hiDetail, loDetail, bodyMat, wheels, frontPivots, type === 'gazelle_van');
  else bounds = buildBus(hiDetail, loDetail, bodyMat, wheels, frontPivots);

  const alertSprite = add(root, box(0.9, 0.28, 0.12), alertMat, 0, 2.9, 0);
  alertSprite.visible = false;

  return {
    root,
    hiDetail,
    loDetail,
    wheels,
    frontPivots,
    alertSprite,
    halfWidth: bounds.halfWidth,
    halfLength: bounds.halfLength,
    roofHeight: bounds.roofHeight,
    type
  };
}
