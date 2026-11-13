import * as THREE from 'three';
import { G } from '../state.js';
import { box, cylinder, plane } from '../geom.js';

function addBox(target, w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(box(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  target.add(m);
  return m;
}

function addCyl(target, rt, rb, h, mat, x, y, z, rx = 0, rz = 0) {
  const m = new THREE.Mesh(cylinder(rt, rb, h, 10), mat);
  m.position.set(x, y, z);
  m.rotation.x = rx;
  m.rotation.z = rz;
  target.add(m);
  return m;
}

function addTorus(target, radius, tube, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 5, 20), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  target.add(m);
  return m;
}

export function buildCockpits() {
  G.riderPivot = new THREE.Group();
  G.riderPivot.position.set(0, 1.56, 0.35);
  G.bikeRoot.add(G.riderPivot);
  G.riderPivot.add(G.camera);

  G.bikeCockpitGroup = new THREE.Group();
  G.quteCockpitGroup = new THREE.Group();
  // Кокпит крепится к мотоциклу, а не к камере: настройка высоты камеры
  // двигает только камеру, а бак, руль и приборка остаются на месте.
  G.riderPivot.add(G.bikeCockpitGroup, G.quteCockpitGroup);

  const bikeDashMat = new THREE.MeshBasicMaterial({
    map: G.dashTex,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  const quteDashMat = new THREE.MeshBasicMaterial({ map: G.dashTex });
  const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });

  /* ---------- базовый кокпит Pulsar ---------- */

  G.bikeCockpitTankGroup = new THREE.Group();
  G.bikeCockpitGroup.add(G.bikeCockpitTankGroup);
  addBox(G.bikeCockpitTankGroup, 0.92, 0.34, 0.95, G.tankMat, 0, -0.78, -0.82, -0.15, 0, 0);
  addBox(G.bikeCockpitTankGroup, 0.72, 0.22, 0.52, G.tankMat, 0, -0.66, -1.16, -0.25, 0, 0);
  for (const side of [-1, 1]) {
    addBox(G.bikeCockpitTankGroup, 0.04, 0.10, 0.48, G.accentMat, side * 0.465, -0.74, -0.94, -0.12, 0, side * 0.16);
    addBox(G.bikeCockpitTankGroup, 0.02, 0.06, 0.3, G.M.mattePlastic, side * 0.47, -0.78, -0.78, -0.12, 0, side * 0.16);
  }
  addCyl(G.bikeCockpitTankGroup, 0.07, 0.07, 0.035, G.M.chrome, 0, -0.605, -0.9, Math.PI / 2, 0);

  // Наколенники и обтекатель — только для семейства Pulsar: у Boxer/Avenger/Dominar
  // своя посадка, иначе базовая облицовка торчит сквозь их бак и руль.
  G.pulsarCockpitGroup = new THREE.Group();
  G.bikeCockpitGroup.add(G.pulsarCockpitGroup);
  for (const side of [-1, 1]) {
    addBox(G.pulsarCockpitGroup, 0.14, 0.26, 0.82, G.M.mattePlastic, side * 0.46, -0.76, -0.86, -0.12, 0, side * 0.16);
    addCyl(G.pulsarCockpitGroup, 0.038, 0.038, 0.95, G.M.chrome, side * 0.22, -0.62, -1.12, 0.32, 0);
  }

  // Обтекатель и панель сдвинуты к рукам и ниже руля, иначе спидометр прячется за хромированной планкой.
  addBox(G.pulsarCockpitGroup, 0.56, 0.34, 0.28, G.tankMat, 0, -0.66, -1.28, -0.18, 0, 0);
  addBox(G.pulsarCockpitGroup, 0.42, 0.06, 0.04, G.accentMat, 0, -0.50, -1.38, -0.22, 0, 0);

  const tuneBikeWindshieldCockpit = new THREE.Group();
  {
    const glassPanel = new THREE.Mesh(box(0.64, 0.46, 0.025), G.M.smokedGlass);
    glassPanel.position.set(0, -0.02, -1.26);
    glassPanel.rotation.x = -0.36;
    const topDeflector = new THREE.Mesh(box(0.48, 0.12, 0.028), G.M.smokedGlass);
    topDeflector.position.set(0, 0.20, -1.18);
    topDeflector.rotation.x = -0.20;
    const mountL = new THREE.Mesh(box(0.035, 0.22, 0.035), G.M.metalDark);
    mountL.position.set(-0.24, -0.12, -1.26);
    mountL.rotation.x = -0.36;
    const mountR = mountL.clone();
    mountR.position.x = 0.24;
    tuneBikeWindshieldCockpit.add(glassPanel, topDeflector, mountL, mountR);
  }
  G.bikeCockpitGroup.add(tuneBikeWindshieldCockpit);

  const tuneBikeMasterCylCockpit = new THREE.Mesh(cylinder(0.045, 0.045, 0.09, 10), G.M.goldMetal);
  tuneBikeMasterCylCockpit.position.set(0.56, -0.11, -0.86);
  G.bikeCockpitGroup.add(tuneBikeMasterCylCockpit);

  addBox(G.bikeCockpitGroup, 0.68, 0.34, 0.08, G.M.mattePlastic, 0, -0.39, -0.96, -0.22, 0, 0);
  const bikeDashScreen = new THREE.Mesh(plane(0.58, 0.30), bikeDashMat);
  bikeDashScreen.position.set(0, -0.375, -0.82);
  bikeDashScreen.rotation.x = -0.22;
  bikeDashScreen.renderOrder = 2;
  G.bikeCockpitGroup.add(bikeDashScreen);
  G.bikeCockpitDashScreen = bikeDashScreen;

  addBox(G.bikeCockpitGroup, 1.12, 0.055, 0.06, G.M.chrome, 0, -0.24, -0.92);
  // Руль и зеркала вынесены в отдельную группу: у Boxer/Avenger своя посадка.
  G.bikeCockpitHandlebarGroup = new THREE.Group();
  G.bikeCockpitGroup.add(G.bikeCockpitHandlebarGroup);
  const handlebars = G.bikeCockpitHandlebarGroup;
  for (const side of [-1, 1]) {
    addCyl(handlebars, 0.04, 0.048, 0.28, G.M.chrome, side * 0.32, -0.28, -0.94, 0, side * 0.12);
    addBox(handlebars, 0.22, 0.09, 0.34, G.M.mattePlastic, side * 0.78, -0.18, -0.82, 0, 0, side * 0.08);
    addBox(handlebars, 0.16, 0.12, 0.18, G.M.metalDark, side * 0.58, -0.19, -0.86);
    addBox(handlebars, 0.18, 0.025, 0.04, G.M.chrome, side * 0.74, -0.18, -0.97, 0, -side * 0.18, 0);
    addCyl(handlebars, 0.018, 0.024, 0.55, G.M.mattePlastic, side * 0.82, 0.02, -0.78, 0, -side * 0.48);
    addBox(handlebars, 0.34, 0.19, 0.045, G.M.mattePlastic, side * 1.05, 0.21, -0.72, 0, -side * 0.2, side * 0.12);
    addBox(handlebars, 0.29, 0.15, 0.015, G.M.glass, side * 1.05, 0.21, -0.695, 0, -side * 0.2, side * 0.12);
    addBox(G.pulsarCockpitGroup, 0.22, 0.24, 0.68, sleeveMat, side * 0.68, -0.34, -0.24, 0.15, 0, -side * 0.14);
    addBox(G.pulsarCockpitGroup, 0.18, 0.14, 0.22, G.M.mattePlastic, side * 0.77, -0.19, -0.64, 0, 0, -side * 0.08);
  }

  /* ---------- Boxer: высокий руль, простой бак, круглая фара ---------- */

  G.boxerCockpitGroup = new THREE.Group();
  G.bikeCockpitGroup.add(G.boxerCockpitGroup);
  G.boxerCockpitTankGroup = new THREE.Group();
  G.boxerCockpitGroup.add(G.boxerCockpitTankGroup);
  addBox(G.boxerCockpitTankGroup, 0.84, 0.3, 0.86, G.tankMat, 0, -0.8, -0.82, -0.12, 0, 0);
  addBox(G.boxerCockpitTankGroup, 0.7, 0.16, 0.34, G.tankMat, 0, -0.69, -1.18, -0.22, 0, 0);
  addCyl(G.boxerCockpitTankGroup, 0.07, 0.07, 0.035, G.M.chrome, 0, -0.62, -0.88, Math.PI / 2, 0);
  for (const side of [-1, 1]) {
    addBox(G.boxerCockpitTankGroup, 0.025, 0.06, 0.5, G.accentMat, side * 0.425, -0.76, -0.9, -0.12, 0, 0);
    addBox(G.boxerCockpitTankGroup, 0.015, 0.025, 0.5, G.M.chrome, side * 0.447, -0.7, -0.9, -0.12, 0, 0);
  }
  {
    addBox(G.boxerCockpitGroup, 1.22, 0.05, 0.06, G.M.chrome, 0, -0.1, -0.74);
    for (const side of [-1, 1]) {
      addBox(G.boxerCockpitGroup, 0.05, 0.11, 0.07, G.M.chrome, side * 0.22, -0.16, -0.77, 0, 0, side * 0.18);
      addBox(G.boxerCockpitGroup, 0.2, 0.075, 0.32, G.M.rubber, side * 0.62, -0.06, -0.74, 0, 0, side * 0.14);
      addBox(G.boxerCockpitGroup, 0.18, 0.02, 0.035, G.M.chrome, side * 0.57, -0.06, -0.9, 0, -side * 0.2, 0);
      addCyl(G.boxerCockpitGroup, 0.015, 0.02, 0.48, G.M.chrome, side * 0.66, 0.12, -0.7, 0, -side * 0.4);
      const mirror = new THREE.Mesh(cylinder(0.075, 0.075, 0.03, 12), G.M.chrome);
      mirror.rotation.x = Math.PI / 2;
      mirror.position.set(side * 0.72, 0.3, -0.64);
      G.boxerCockpitGroup.add(mirror);
      const glass = new THREE.Mesh(cylinder(0.062, 0.062, 0.018, 12), G.M.glass);
      glass.rotation.x = Math.PI / 2;
      glass.position.set(side * 0.72, 0.3, -0.655);
      G.boxerCockpitGroup.add(glass);
    }
    // Крупная круглая фара впереди.
    addCyl(G.boxerCockpitGroup, 0.16, 0.15, 0.18, G.M.chrome, 0, -0.34, -1.5, Math.PI / 2, 0);
    addCyl(G.boxerCockpitGroup, 0.135, 0.135, 0.03, G.M.headlightMat, 0, -0.34, -1.59, Math.PI / 2, 0);
    addTorus(G.boxerCockpitGroup, 0.14, 0.012, G.M.chrome, 0, -0.34, -1.6, 0, 0, 0);
  }

  /* ---------- Dominar: массивный бак, LED-облицовка ---------- */

  G.dominarCockpitGroup = new THREE.Group();
  G.bikeCockpitGroup.add(G.dominarCockpitGroup);
  G.dominarCockpitTankGroup = new THREE.Group();
  G.dominarCockpitGroup.add(G.dominarCockpitTankGroup);
  addBox(G.dominarCockpitTankGroup, 1.0, 0.42, 0.98, G.tankMat, 0, -0.8, -0.82, -0.14, 0, 0);
  addBox(G.dominarCockpitTankGroup, 0.78, 0.2, 0.5, G.tankMat, 0, -0.66, -1.18, -0.26, 0, 0);
  for (const side of [-1, 1]) {
    addBox(G.dominarCockpitTankGroup, 0.09, 0.34, 0.76, G.tankMat, side * 0.5, -0.78, -0.86, -0.14, side * 0.1, 0);
    addBox(G.dominarCockpitTankGroup, 0.035, 0.07, 0.56, G.accentMat, side * 0.545, -0.7, -0.9, -0.14, side * 0.1, 0);
    addBox(G.dominarCockpitTankGroup, 0.03, 0.16, 0.3, G.M.mattePlastic, side * 0.52, -0.82, -0.82, -0.14, 0, 0);
  }
  addCyl(G.dominarCockpitTankGroup, 0.075, 0.075, 0.04, G.M.chrome, 0, -0.575, -0.9, Math.PI / 2, 0);
  {
    addBox(G.dominarCockpitGroup, 0.7, 0.26, 0.24, G.tankMat, 0, -0.58, -1.34, -0.22, 0, 0);
    addBox(G.dominarCockpitGroup, 0.56, 0.05, 0.03, G.M.drlMat, 0, -0.46, -1.45, -0.22, 0, 0);
    addBox(G.dominarCockpitGroup, 0.72, 0.05, 0.3, G.M.mattePlastic, 0, -0.3, -0.95, -0.2, 0, 0);
    addBox(G.dominarCockpitGroup, 0.46, 0.03, 0.02, G.M.chrome, 0, -0.48, -1.09, -0.2, 0, 0);
  }

  /* ---------- Avenger: круизерный кокпит ---------- */

  G.avengerCockpitGroup = new THREE.Group();
  G.bikeCockpitGroup.add(G.avengerCockpitGroup);
  G.avengerCockpitTankGroup = new THREE.Group();
  G.avengerCockpitGroup.add(G.avengerCockpitTankGroup);
  addBox(G.avengerCockpitTankGroup, 0.9, 0.36, 0.72, G.tankMat, 0, -0.78, -0.92, -0.14, 0, 0);
  addBox(G.avengerCockpitTankGroup, 0.78, 0.26, 0.44, G.tankMat, 0, -0.69, -1.18, -0.24, 0, 0);
  addBox(G.avengerCockpitTankGroup, 0.6, 0.12, 0.26, G.tankMat, 0, -0.62, -1.35, -0.3, 0, 0);
  addCyl(G.avengerCockpitTankGroup, 0.085, 0.085, 0.04, G.M.chrome, 0, -0.59, -0.95, Math.PI / 2, 0);
  addBox(G.avengerCockpitTankGroup, 0.03, 0.03, 0.84, G.M.chrome, 0, -0.59, -0.95, -0.14, 0, 0);
  for (const side of [-1, 1]) {
    addBox(G.avengerCockpitTankGroup, 0.025, 0.08, 0.72, G.accentMat, side * 0.46, -0.74, -0.98, -0.14, 0, 0);
    addBox(G.avengerCockpitTankGroup, 0.02, 0.025, 0.6, G.M.chrome, side * 0.475, -0.67, -0.98, -0.14, 0, 0);
  }
  {
    // Широкий хром-руль, поднятый вверх-назад.
    addBox(G.avengerCockpitGroup, 0.5, 0.05, 0.06, G.M.chrome, 0, -0.1, -0.66);
    for (const side of [-1, 1]) {
      addBox(G.avengerCockpitGroup, 0.26, 0.045, 0.05, G.M.chrome, side * 0.35, -0.04, -0.62, 0, side * 0.2, side * 0.24);
      addBox(G.avengerCockpitGroup, 0.05, 0.2, 0.05, G.M.chrome, side * 0.48, 0.06, -0.57, -0.2);
      addBox(G.avengerCockpitGroup, 0.24, 0.1, 0.36, G.M.mattePlastic, side * 0.86, 0.02, -0.6, 0, 0, side * 0.1);
      addBox(G.avengerCockpitGroup, 0.19, 0.08, 0.32, G.M.rubber, side * 0.92, 0.05, -0.58, 0, 0, side * 0.12);
      addCyl(G.avengerCockpitGroup, 0.016, 0.022, 0.66, G.M.chrome, side * 0.9, 0.28, -0.56, 0, -side * 0.44);
      const mirror = new THREE.Mesh(cylinder(0.085, 0.085, 0.035, 12), G.M.chrome);
      mirror.rotation.x = Math.PI / 2;
      mirror.position.set(side * 0.98, 0.6, -0.42);
      G.avengerCockpitGroup.add(mirror);
      const glass = new THREE.Mesh(cylinder(0.07, 0.07, 0.02, 12), G.M.glass);
      glass.rotation.x = Math.PI / 2;
      glass.position.set(side * 0.98, 0.6, -0.44);
      G.avengerCockpitGroup.add(glass);
      addCyl(G.avengerCockpitGroup, 0.036, 0.03, 1.05, G.M.chrome, side * 0.3, -0.62, -1.24, 0.46, 0);
    }
    // Круглая фара с козырьком.
    addCyl(G.avengerCockpitGroup, 0.17, 0.16, 0.2, G.M.chrome, 0, -0.36, -1.52, Math.PI / 2, 0);
    addCyl(G.avengerCockpitGroup, 0.145, 0.145, 0.03, G.M.headlightMat, 0, -0.36, -1.62, Math.PI / 2, 0);
    addTorus(G.avengerCockpitGroup, 0.15, 0.013, G.M.chrome, 0, -0.36, -1.63, 0, 0, 0);
    addBox(G.avengerCockpitGroup, 0.3, 0.035, 0.16, G.M.chrome, 0, -0.16, -1.56, 0.3);
  }

  // Хром-ободки круглых приборов (видны только при hudStyle === 'round').
  G.roundDashBezelGroup = new THREE.Group();
  {
    const bezelSpeed = new THREE.Mesh(new THREE.TorusGeometry(0.119, 0.009, 6, 22), G.M.chrome);
    bezelSpeed.position.set(-0.145, -0.375, -0.807);
    bezelSpeed.rotation.x = -0.22;
    const bezelOdo = new THREE.Mesh(new THREE.TorusGeometry(0.104, 0.009, 6, 22), G.M.chrome);
    bezelOdo.position.set(0.131, -0.375, -0.807);
    bezelOdo.rotation.x = -0.22;
    G.roundDashBezelGroup.add(bezelSpeed, bezelOdo);
    G.roundDashBezelGroup.userData.odoBezel = bezelOdo;
    G.roundDashBezelGroup.visible = false;
    G.bikeCockpitGroup.add(G.roundDashBezelGroup);
  }

  /* ---------- Qute ---------- */

  G.quteSteeringWheelPivot = new THREE.Group();
  G.quteYuraInteriorNeon = new THREE.Group();
  let quteCockpitWindshieldMesh = null;
  {
    const cabinRoofMat = new THREE.MeshStandardMaterial({ color: 0x1e2634, roughness: 0.85 });
    addBox(G.quteCockpitGroup, 1.56, 0.08, 1.38, cabinRoofMat, 0, 0.43, -0.52, 0.05, 0, 0);
    // Коврик и пороги.
    addBox(G.quteCockpitGroup, 1.4, 0.02, 1.2, G.M.rubber, 0, 0.475, -0.56, 0.05, 0, 0);
    for (const side of [-1, 1]) {
      addBox(G.quteCockpitGroup, 0.42, 0.11, 0.03, G.M.mattePlastic, side * 0.34, 0.33, -0.94, 0.18, 0, 0);
      addBox(G.quteCockpitGroup, 0.095, 0.88, 0.11, G.tankMat, side * 0.68, 0.02, -0.96, -0.22, 0, -side * 0.06);
      addBox(G.quteCockpitGroup, 0.03, 0.68, 0.92, G.M.glassWindow, side * 0.73, 0.02, -0.52);
      addBox(G.quteCockpitGroup, 0.24, 0.15, 0.05, G.M.mattePlastic, side * 0.86, -0.08, -0.88, 0, -side * 0.26, 0);
      addBox(G.quteCockpitGroup, 0.20, 0.12, 0.02, G.M.glass, side * 0.85, -0.08, -0.85, 0, -side * 0.26, 0);
      // Внутренняя ручка, подлокотник, карман и динамик.
      addBox(G.quteCockpitGroup, 0.12, 0.03, 0.03, G.M.chrome, side * 0.69, -0.02, -0.74);
      addBox(G.quteCockpitGroup, 0.1, 0.035, 0.3, G.M.mattePlastic, side * 0.66, -0.16, -0.4);
      addBox(G.quteCockpitGroup, 0.02, 0.1, 0.24, G.M.mattePlastic, side * 0.71, -0.3, -0.68);
      const speaker = addCyl(G.quteCockpitGroup, 0.045, 0.045, 0.02, G.M.metalDark, side * 0.72, -0.26, -0.8, 0, Math.PI / 2);
      speaker.rotation.y = side * 0.2;
      addTorus(G.quteCockpitGroup, 0.045, 0.008, G.M.chrome, side * 0.725, -0.26, -0.8, 0, Math.PI / 2, 0);
      // Накладка на порог пола.
      addBox(G.quteCockpitGroup, 0.03, 0.02, 1.1, G.M.chrome, side * 0.55, 0.49, -0.56);
      // Неон вдоль порогов (только Yura).
      addBox(G.quteYuraInteriorNeon, 0.018, 0.015, 1.0, G.M.neonMagenta, side * 0.5, 0.5, -0.56);
    }
    addBox(G.quteCockpitGroup, 0.28, 0.08, 0.04, G.M.mattePlastic, 0, 0.28, -0.88);
    addBox(G.quteCockpitGroup, 0.25, 0.06, 0.015, G.M.glass, 0, 0.28, -0.86);
    const startButton = addBox(G.quteCockpitGroup, 0.16, 0.03, 0.10, G.windowLitMat, 0, 0.38, -0.62);
    addTorus(G.quteCockpitGroup, 0.06, 0.008, G.M.chrome, 0, 0.38, -0.625, 0, 0, 0);

    quteCockpitWindshieldMesh = addBox(G.quteCockpitGroup, 1.32, 0.72, 0.015, G.M.glassWindow, 0, 0.04, -1.04, -0.20, 0, 0);
    // Тонировка сверху лобового и дворники.
    addBox(G.quteCockpitGroup, 1.18, 0.08, 0.01, G.M.smokedGlass, 0, 0.3, -1.03, -0.2);
    addBox(G.quteCockpitGroup, 0.36, 0.012, 0.02, G.M.mattePlastic, -0.2, -0.27, -1.0, -0.2);
    addBox(G.quteCockpitGroup, 0.3, 0.012, 0.02, G.M.mattePlastic, 0.22, -0.27, -1.0, -0.2);
    addBox(G.quteCockpitGroup, 0.56, 0.025, 0.03, G.M.mattePlastic, 0.12, -0.24, -1.05, 0, 0, 0.14);

    addBox(G.quteCockpitGroup, 1.48, 0.34, 0.48, G.M.mattePlastic, 0, -0.44, -0.96, -0.08, 0, 0);
    addBox(G.quteCockpitGroup, 0.62, 0.28, 0.22, G.M.metalDark, 0, -0.30, -0.96, -0.22, 0, 0);
    // Козырёк приборки и дефлекторы.
    addBox(G.quteCockpitGroup, 0.66, 0.04, 0.26, G.M.mattePlastic, 0, -0.245, -0.9, -0.34);
    for (const vx of [-0.24, 0, 0.24]) {
      addCyl(G.quteCockpitGroup, 0.032, 0.032, 0.02, G.M.metalDark, vx, -0.34, -0.88, 0, Math.PI / 2);
      addTorus(G.quteCockpitGroup, 0.034, 0.006, G.M.chrome, vx, -0.34, -0.89, 0, Math.PI / 2, 0);
      addTorus(G.quteYuraInteriorNeon, 0.042, 0.005, G.M.neonCyan, vx, -0.34, -0.9, 0, Math.PI / 2, 0);
    }
    // Бардачок пассажира.
    addBox(G.quteCockpitGroup, 0.36, 0.16, 0.04, G.M.mattePlastic, 0.42, -0.42, -0.8, 0, -0.2, 0);
    addBox(G.quteCockpitGroup, 0.33, 0.016, 0.015, G.M.metalDark, 0.42, -0.35, -0.79, 0, -0.2, 0);
    addBox(G.quteCockpitGroup, 0.33, 0.016, 0.015, G.M.metalDark, 0.42, -0.49, -0.79, 0, -0.2, 0);
    addBox(G.quteCockpitGroup, 0.05, 0.02, 0.02, G.M.chrome, 0.42, -0.4, -0.78, 0, -0.2, 0);

    // Педали — ниже руля и ближе к камере, чтобы читались от первого лица.
    const pedals = [
      { x: 0.32, w: 0.12, mat: G.M.mattePlastic },
      { x: 0.12, w: 0.1, mat: G.M.mattePlastic },
      { x: -0.22, w: 0.1, mat: G.M.mattePlastic }
    ];
    for (const p of pedals) {
      addBox(G.quteCockpitGroup, p.w, 0.01, 0.05, G.M.metalDark, p.x, -0.34, -0.94, 0.5);
      addBox(G.quteCockpitGroup, p.w, 0.08, 0.035, p.mat, p.x, -0.29, -0.92, 0.42);
      addBox(G.quteCockpitGroup, p.w * 0.86, 0.05, 0.018, G.M.rubber, p.x, -0.28, -0.9, 0.42);
    }

    const quteDashScreen = new THREE.Mesh(plane(0.52, 0.23), quteDashMat);
    quteDashScreen.position.set(0, -0.295, -0.845);
    quteDashScreen.rotation.x = -0.22;
    G.quteCockpitGroup.add(quteDashScreen);

    const neonStrip1 = new THREE.Mesh(box(1.36, 0.022, 0.025), G.M.neonCyan);
    neonStrip1.position.set(0, -0.27, -0.74);
    const neonStrip2 = new THREE.Mesh(box(1.36, 0.02, 0.025), G.M.neonMagenta);
    neonStrip2.position.set(0, 0.37, -0.92);
    G.quteYuraInteriorNeon.add(neonStrip1, neonStrip2);
    addBox(G.quteYuraInteriorNeon, 0.9, 0.012, 0.02, G.M.neonCyan, 0, -0.245, -0.95, -0.34);
    G.quteCockpitGroup.add(G.quteYuraInteriorNeon);

    addCyl(G.quteCockpitGroup, 0.055, 0.065, 0.32, G.M.metalDark, 0, -0.34, -0.72, 1.22, 0);

    G.quteSteeringWheelPivot.position.set(0, -0.28, -0.58);
    G.quteSteeringWheelPivot.rotation.x = -0.32;

    const wheelRadius = 0.215;
    const segCount = 12;
    const segGeo = box(0.125, 0.042, 0.042);
    for (let i = 0; i < segCount; i++) {
      const a = (i / segCount) * Math.PI * 2;
      const segMat = (i === 3) ? G.accentMat : G.M.mattePlastic;
      const seg = new THREE.Mesh(segGeo, segMat);
      seg.position.set(Math.cos(a) * wheelRadius, Math.sin(a) * wheelRadius, 0);
      seg.rotation.z = a + Math.PI / 2;
      G.quteSteeringWheelPivot.add(seg);
    }
    // Цельный обод и эмблема.
    const rimRing = new THREE.Mesh(new THREE.TorusGeometry(wheelRadius, 0.013, 4, 24), G.M.rubber);
    rimRing.position.z = 0.006;
    G.quteSteeringWheelPivot.add(rimRing);
    const hub = new THREE.Mesh(cylinder(0.068, 0.068, 0.048, 10), G.M.metalDark);
    hub.rotation.x = Math.PI / 2;
    const hubLogo = new THREE.Mesh(box(0.065, 0.028, 0.055), G.accentMat);
    const hubChrome = new THREE.Mesh(box(0.03, 0.014, 0.06), G.M.chrome);
    hubChrome.position.z = 0.01;
    const spokeL = new THREE.Mesh(box(0.18, 0.036, 0.032), G.M.chrome);
    spokeL.position.set(-0.10, -0.02, 0);
    spokeL.rotation.z = 0.18;
    const spokeR = spokeL.clone();
    spokeR.position.x = 0.10;
    spokeR.rotation.z = -0.18;
    const spokeB = new THREE.Mesh(box(0.042, 0.16, 0.032), G.M.chrome);
    spokeB.position.set(0, -0.11, 0);

    for (const side of [-1, 1]) {
      const glove = new THREE.Mesh(box(0.075, 0.085, 0.09), G.M.mattePlastic);
      glove.position.set(side * wheelRadius, 0.02, 0.02);
      G.quteSteeringWheelPivot.add(glove);
      addBox(G.quteYuraInteriorNeon, 0.03, 0.02, 0.03, G.M.neonCyan, side * 0.12, 0.04, -0.6);
    }

    // Рамка экрана консоли, кнопки и рычаг КПП.
    addBox(G.quteCockpitGroup, 0.22, 0.16, 0.015, G.M.chrome, 0.38, -0.3, -0.85, -0.2);
    addBox(G.quteCockpitGroup, 0.18, 0.12, 0.01, G.M.glass, 0.38, -0.3, -0.842, -0.2);
    for (let i = 0; i < 3; i += 1) {
      addBox(G.quteCockpitGroup, 0.04, 0.025, 0.02, G.M.mattePlastic, 0.32 + i * 0.06, -0.44, -0.86);
    }
    addCyl(G.quteCockpitGroup, 0.012, 0.012, 0.16, G.M.chrome, 0.46, -0.48, -0.78, 0.4, 0);
    addBox(G.quteCockpitGroup, 0.05, 0.05, 0.06, G.M.mattePlastic, 0.46, -0.42, -0.73, 0.4);

    G.quteSteeringWheelPivot.add(hub, hubLogo, hubChrome, spokeL, spokeR, spokeB);
    G.quteCockpitGroup.add(G.quteSteeringWheelPivot);
  }

  return { tuneBikeWindshieldCockpit, tuneBikeMasterCylCockpit, quteCockpitWindshieldMesh };
}
