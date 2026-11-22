import * as THREE from 'three';
import { G } from './state.js';

/**
 * Детализированная модель райдера: шлем, куртка, руки, ноги, ботинки.
 * Используется и в предпросмотре экипировки, и в игре (3-е лицо).
 * Возвращает { group, update, joints }.
 */
export function buildDetailedRider(mode = 'stand') {
  const outfitParts = G.outfitParts || (G.outfitParts = {});
  const helmetMat = outfitParts.helmetMat || (outfitParts.helmetMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.32, metalness: 0.18 }));
  const visorMat = outfitParts.visorMat || (outfitParts.visorMat = new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.05, metalness: 0.25, transparent: true, opacity: 0.72, envMapIntensity: 1.2 }));
  const jacketMat = outfitParts.jacketMat || (outfitParts.jacketMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.72, metalness: 0.06 }));
  const stripeMat = outfitParts.stripeMat || (outfitParts.stripeMat = new THREE.MeshStandardMaterial({ color: 0xd9363e, roughness: 0.45, metalness: 0.15 }));
  const pantsMat = outfitParts.pantsMat || (outfitParts.pantsMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.78, metalness: 0.05 }));
  const bootsMat = outfitParts.bootsMat || (outfitParts.bootsMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.62, metalness: 0.08 }));
  const gloveMat = outfitParts.gloveMat || (outfitParts.gloveMat = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.85, metalness: 0.04 }));
  const soleMat = outfitParts.soleMat || (outfitParts.soleMat = new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.95, metalness: 0.02 }));
  const skinMat = outfitParts.skinMat || (outfitParts.skinMat = new THREE.MeshStandardMaterial({ color: 0xc49a7c, roughness: 0.8, metalness: 0.02 }));
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.85, metalness: 0.1 });
  const padMat = new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.6, metalness: 0.25 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xb8c0c8, roughness: 0.22, metalness: 0.9, envMapIntensity: 1.2 });

  const g = new THREE.Group();
  const mesh = (parent, mat, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  };
  const box = (parent, mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) =>
    mesh(parent, mat, new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
  const sph = (parent, mat, r, x, y, z, rx = 0, ry = 0, rz = 0, w = 12, h = 10) =>
    mesh(parent, mat, new THREE.SphereGeometry(r, w, h), x, y, z, rx, ry, rz);
  const cap = (parent, mat, r, len, x, y, z, rx = 0, ry = 0, rz = 0) =>
    mesh(parent, mat, new THREE.CapsuleGeometry(r, Math.max(0.001, len), 4, 8), x, y, z, rx, ry, rz);
  const cyl = (parent, mat, rt, rb, h, x, y, z, rx = 0, ry = 0, rz = 0, seg = 12) =>
    mesh(parent, mat, new THREE.CylinderGeometry(rt, rb, h, seg), x, y, z, rx, ry, rz);
  const torus = (parent, mat, r, t, x, y, z, rx = 0, ry = 0, rz = 0, arc = Math.PI * 2) =>
    mesh(parent, mat, new THREE.TorusGeometry(r, t, 8, 20, arc), x, y, z, rx, ry, rz);

  const hips = new THREE.Group();
  hips.position.set(0, 0.98, 0);
  g.add(hips);
  const torso = new THREE.Group();
  hips.add(torso);

  // Таз/пояс
  box(torso, pantsMat, 0.4, 0.16, 0.28, 0, 0.06, 0.01);
  box(torso, darkMat, 0.42, 0.04, 0.3, 0, 0.145, 0.01); // ремень
  box(torso, chromeMat, 0.06, 0.05, 0.02, 0, 0.145, 0.165); // пряжка

  // Куртка: корпус + грудные панели + рёбра
  const chest = box(torso, jacketMat, 0.48, 0.52, 0.32, 0, 0.34, 0);
  chest.geometry = new THREE.BoxGeometry(0.48, 0.52, 0.32, 2, 2, 2);
  box(torso, jacketMat, 0.5, 0.18, 0.34, 0, 0.56, -0.01); // плечи/наплечники
  box(torso, padMat, 0.16, 0.2, 0.06, -0.15, 0.58, -0.16); // наплечник L
  box(torso, padMat, 0.16, 0.2, 0.06, 0.15, 0.58, -0.16); // наплечник R
  box(torso, jacketMat, 0.26, 0.1, 0.26, 0, 0.66, -0.02); // воротник
  box(torso, darkMat, 0.28, 0.05, 0.28, 0, 0.705, -0.02); // внутренний воротник
  // центральная молния и швы
  box(torso, darkMat, 0.02, 0.5, 0.005, 0, 0.34, 0.163);
  box(torso, stripeMat, 0.52, 0.09, 0.35, 0, 0.38, 0); // полоса
  box(torso, stripeMat, 0.52, 0.05, 0.35, 0, 0.24, 0); // нижняя полоса
  // карманы
  box(torso, darkMat, 0.12, 0.14, 0.02, -0.12, 0.22, 0.16);
  box(torso, darkMat, 0.12, 0.14, 0.02, 0.12, 0.22, 0.16);
  // спина: вставка
  box(torso, jacketMat, 0.44, 0.44, 0.02, 0, 0.36, -0.165);

  // Шея
  cap(torso, skinMat, 0.065, 0.08, 0, 0.72, -0.02, 0);

  // Голова/шлем
  const head = new THREE.Group();
  head.position.set(0, 0.86, 0);
  torso.add(head);
  const helmet = new THREE.Group();
  head.add(helmet);
  // купол
  const dome = mesh(helmet, helmetMat, new THREE.SphereGeometry(0.25, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.62), 0, 0, 0);
  dome.scale.set(1, 1.06, 1.02);
  const shell = mesh(helmet, helmetMat, new THREE.SphereGeometry(0.246, 24, 12, 0, Math.PI * 2, Math.PI * 0.58, Math.PI * 0.3), 0, 0, 0);
  shell.scale.set(1, 1.05, 1.02);
  // кромка
  const rim = torus(helmet, darkMat, 0.208, 0.022, 0, -0.115, 0, Math.PI / 2);
  rim.scale.set(1, 1.05, 1);
  // подбородочная планка
  const chinBar = box(helmet, helmetMat, 0.3, 0.14, 0.16, 0, -0.14, -0.13, 0.16);
  // визор: рама + стекло
  box(helmet, darkMat, 0.36, 0.15, 0.02, 0, -0.02, -0.19, -0.1);
  box(helmet, visorMat, 0.32, 0.12, 0.02, 0, -0.02, -0.2, -0.1);
  // отверстия под визор
  box(helmet, darkMat, 0.1, 0.05, 0.04, -0.13, -0.09, -0.2);
  box(helmet, darkMat, 0.1, 0.05, 0.04, 0.13, -0.09, -0.2);
  // вентиляция
  box(helmet, darkMat, 0.08, 0.03, 0.03, -0.09, 0.22, -0.16, 0.2);
  box(helmet, darkMat, 0.08, 0.03, 0.03, 0.09, 0.22, -0.16, 0.2);
  // полоса по куполу
  box(helmet, stripeMat, 0.03, 0.02, 0.3, 0, 0.26, 0.0);
  // спойлер сзади
  box(helmet, helmetMat, 0.16, 0.04, 0.1, 0, 0.18, 0.24, 0.25);
  // зеркала/боковые крылья
  box(helmet, helmetMat, 0.04, 0.08, 0.14, -0.24, 0.02, -0.04, 0, 0, 0.12);
  box(helmet, helmetMat, 0.04, 0.08, 0.14, 0.24, 0.02, -0.04, 0, 0, -0.12);
  // подбородочная сетка
  box(helmet, darkMat, 0.18, 0.05, 0.02, 0, -0.2, -0.19, 0.2);

  const sides = {};
  for (const side of [-1, 1]) {
    const k = side < 0 ? 'L' : 'R';
    const sgn = side;

    // --- Рука ---
    const shoulder = new THREE.Group();
    shoulder.position.set(sgn * 0.30, 0.52, 0);
    torso.add(shoulder);
    // плечо: шапка + дельта
    sph(shoulder, jacketMat, 0.105, 0, 0, 0);
    cap(shoulder, jacketMat, 0.082, 0.2, 0, -0.14, 0.01, sgn * 0.08);
    // наплечник/ protector
    sph(shoulder, padMat, 0.1, 0, 0.01, 0);
    // бицепс
    cap(shoulder, jacketMat, 0.072, 0.16, 0, -0.26, 0.02, 0.12);
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.38, 0);
    shoulder.add(elbow);
    // локтевой протектор
    sph(elbow, padMat, 0.08, 0, 0, 0);
    // предплечье
    cap(elbow, jacketMat, 0.062, 0.2, 0, -0.14, 0.01, 0.1);
    // манжета
    cyl(elbow, darkMat, 0.072, 0.068, 0.05, 0, -0.28, 0.02, 0.1);
    // перчатка: кисть + пальцы + костяшки
    const hand = new THREE.Group();
    hand.position.set(0, -0.34, 0.02);
    elbow.add(hand);
    box(hand, gloveMat, 0.11, 0.12, 0.15, 0, -0.05, 0.02, 0.08);
    box(hand, gloveMat, 0.1, 0.04, 0.14, 0, -0.09, 0.06, 0.25); // ладонь
    box(hand, padMat, 0.12, 0.05, 0.03, 0, -0.02, 0.1); // костяшки
    for (let f = 0; f < 3; f++) {
      box(hand, gloveMat, 0.026, 0.05, 0.026, -0.03 + f * 0.03, -0.11, 0.07, 0.35);
    }
    box(hand, gloveMat, 0.03, 0.05, 0.03, 0.06, -0.08, 0.05, 0.5); // большой

    // --- Нога ---
    const hip = new THREE.Group();
    hip.position.set(sgn * 0.13, -0.02, 0);
    hips.add(hip);
    // бедро
    cap(hip, pantsMat, 0.105, 0.22, 0, -0.18, 0, 0);
    // наколенник
    const knee = new THREE.Group();
    knee.position.set(0, -0.4, 0);
    hip.add(knee);
    sph(knee, padMat, 0.1, 0, 0, 0);
    box(knee, padMat, 0.16, 0.12, 0.06, 0, -0.02, 0.08);
    // голень
    cap(knee, pantsMat, 0.09, 0.26, 0, -0.2, 0, 0);
    // икра
    sph(knee, pantsMat, 0.09, 0, -0.24, -0.03);
    // ботинок
    const boot = new THREE.Group();
    boot.position.set(0, -0.42, 0);
    knee.add(boot);
    box(boot, bootsMat, 0.17, 0.15, 0.3, 0, -0.05, 0.04);
    box(boot, bootsMat, 0.18, 0.1, 0.16, 0, -0.02, -0.12); // пятка
    box(boot, bootsMat, 0.18, 0.08, 0.14, 0, -0.09, 0.12); // носок
    box(boot, soleMat, 0.19, 0.05, 0.32, 0, -0.135, 0.04); // подошва
    box(boot, soleMat, 0.19, 0.02, 0.1, 0, -0.16, 0.16); // протектор
    // голенищный ремень
    box(boot, darkMat, 0.19, 0.04, 0.31, 0, 0.02, 0.04);
    box(boot, chromeMat, 0.03, 0.03, 0.02, 0, 0.02, 0.2);
    // протектор голеностопа
    sph(boot, padMat, 0.07, 0, 0.06, -0.06);
    sides[k] = { shoulder, elbow, hand, hip, knee, boot };
  }

  // --- Анимации ---
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const ease = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const pose = () => ({
    hipsY: 0, hipsRotX: 0, hipsRotZ: 0,
    torsoRotX: 0, torsoRotY: 0, torsoRotZ: 0,
    headRotX: 0, headRotY: 0, headRotZ: 0,
    L: { sX: 0, sY: 0, sZ: 0.08, eX: 0.08, hX: 0, kX: 0 },
    R: { sX: 0, sY: 0, sZ: -0.08, eX: 0.08, hX: 0, kX: 0 },
  });
  const copyPose = (p2) => { const o = pose(); Object.assign(o, p2, { L: { ...p2.L }, R: { ...p2.R } }); return o; };
  const blendPose = (a, b, t) => {
    const o = pose();
    for (const k of ['hipsY', 'hipsRotX', 'hipsRotZ', 'torsoRotX', 'torsoRotY', 'torsoRotZ', 'headRotX', 'headRotY', 'headRotZ']) o[k] = lerp(a[k], b[k], t);
    for (const s of ['L', 'R']) for (const k of ['sX', 'sY', 'sZ', 'eX', 'hX', 'kX']) o[s][k] = lerp(a[s][k], b[s][k], t);
    return o;
  };
  const applyPose = (o) => {
    hips.position.y = 0.98 + o.hipsY;
    hips.rotation.set(o.hipsRotX, 0, o.hipsRotZ);
    torso.rotation.set(o.torsoRotX, o.torsoRotY, o.torsoRotZ);
    head.rotation.set(o.headRotX, o.headRotY, o.headRotZ);
    for (const k of ['L', 'R']) {
      const s = sides[k]; const a = o[k];
      s.shoulder.rotation.set(a.sX, a.sY, a.sZ);
      s.elbow.rotation.set(a.eX, 0, 0);
      s.hip.rotation.x = a.hX;
      s.knee.rotation.x = a.kX;
    }
  };

  const idlePose = (t) => {
    const o = pose();
    const b = Math.sin(t * 1.4) * 0.5 + 0.5;
    o.hipsY = Math.sin(t * 1.2) * 0.004;
    o.torsoRotY = Math.sin(t * 0.7) * 0.03;
    o.torsoRotX = Math.sin(t * 1.1) * 0.008;
    o.headRotY = Math.sin(t * 0.6 + 0.5) * 0.04;
    o.headRotX = Math.sin(t * 0.9) * 0.015;
    o.L.sX = 0.05 + b * 0.02; o.R.sX = 0.05 + (1 - b) * 0.02;
    o.L.sZ = 0.10; o.R.sZ = -0.10;
    o.L.eX = 0.10; o.R.eX = 0.10;
    return o;
  };
  const walkPose = (t) => {
    const o = pose();
    const c = Math.sin(t * 5.2);
    const s = Math.sin(t * 10.4);
    o.hipsY = Math.abs(s) * 0.018;
    o.hipsRotZ = c * 0.02;
    o.torsoRotY = -c * 0.05;
    o.torsoRotX = 0.03;
    o.headRotY = c * 0.03;
    o.headRotX = 0.02;
    o.L.hX = c * 0.45; o.R.hX = -c * 0.45;
    o.L.kX = Math.max(0, -c) * 0.55; o.R.kX = Math.max(0, c) * 0.55;
    o.L.sX = -c * 0.35 + 0.08; o.R.sX = c * 0.35 + 0.08;
    o.L.sZ = 0.12; o.R.sZ = -0.12;
    o.L.eX = 0.18 + Math.max(0, c) * 0.25; o.R.eX = 0.18 + Math.max(0, -c) * 0.25;
    return o;
  };
  const helmetPose = (t) => {
    const o = pose();
    const p1 = clamp01(t / 0.7);
    const p2 = clamp01((t - 0.7) / 1.8);
    const p3 = clamp01((t - 2.5) / 0.7);
    const up = ease(p1) * (1 - ease(p3));
    const wiggle = Math.sin(p2 * Math.PI * 6) * ease(p2) * (1 - ease(clamp01((t - 2.2) / 0.4)));
    o.torsoRotX = -0.03 * up;
    o.headRotX = -0.08 * up + wiggle * 0.03;
    o.headRotZ = wiggle * 0.04;
    for (const k of ['L', 'R']) {
      const sign = k === 'L' ? 1 : -1;
      o[k].sX = lerp(0.05, -2.35, up);
      o[k].sY = lerp(0, sign * 0.35, up);
      o[k].sZ = lerp(sign * 0.10, sign * 0.55, up);
      o[k].eX = lerp(0.10, 1.65, up);
      o[k].sX += wiggle * 0.05;
    }
    o.hipsY = -0.005 * up;
    return o;
  };
  const scratchPose = (t) => {
    const o = pose();
    const p1 = clamp01(t / 0.6);
    const p2 = clamp01((t - 0.6) / 1.8);
    const p3 = clamp01((t - 2.4) / 0.6);
    const up = ease(p1) * (1 - ease(p3));
    const scratch = Math.sin(p2 * Math.PI * 8) * ease(p2) * (1 - ease(clamp01((t - 2.1) / 0.4)));
    o.torsoRotX = 0.04 * up;
    o.torsoRotY = -0.05 * up;
    o.headRotX = 0.08 * up;
    o.headRotY = 0.08 * up;
    o.R.sX = lerp(0.05, -0.55, up);
    o.R.sY = lerp(0, -0.35, up);
    o.R.sZ = lerp(-0.10, -0.25, up);
    o.R.eX = lerp(0.10, 1.35, up);
    o.R.sY += scratch * 0.08;
    o.R.eX += scratch * 0.08;
    o.L.sX = 0.06 + up * 0.08;
    o.L.sZ = 0.14 + up * 0.05;
    o.L.eX = 0.12;
    return o;
  };
  const anims = [
    { name: 'idle', dur: () => 2.2 + Math.random() * 1.8, pose: idlePose },
    { name: 'walk', dur: () => 2.8 + Math.random() * 1.8, pose: walkPose },
    { name: 'helmet', dur: () => 3.2, pose: helmetPose },
    { name: 'scratch', dur: () => 3.0, pose: scratchPose },
  ];
  let cur = 0, next = 0, t = 0, local = 0, dur = anims[cur].dur(), blend = 1;
  let fromPose = pose();
  let curPoseNow = pose();
  const pickNext = () => {
    const bag = [0, 1, 1, 2, 3];
    let n = bag[Math.floor(Math.random() * bag.length)];
    if (n === cur) n = (cur + 1) % anims.length;
    next = n; fromPose = copyPose(curPoseNow); blend = 0; local = 0; dur = anims[next].dur(); cur = next;
  };
  applyPose(curPoseNow);
  const update = (dt) => {
    t += dt; local += dt;
    const target = anims[cur].pose(local, t);
    if (blend < 1) { blend = Math.min(1, blend + dt / 0.7); curPoseNow = blendPose(fromPose, target, ease(blend)); }
    else curPoseNow = target;
    applyPose(curPoseNow);
    if (local >= dur && blend >= 1) pickNext();
  };

  return { group: g, update, joints: { hips, torso, head, helmet, sides } };
}
