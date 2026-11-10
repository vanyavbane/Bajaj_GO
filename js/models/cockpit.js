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

export function buildCockpits() {
  G.riderPivot = new THREE.Group();
  G.riderPivot.position.set(0, 1.56, 0.35);
  G.bikeRoot.add(G.riderPivot);
  G.riderPivot.add(G.camera);

  G.bikeCockpitGroup = new THREE.Group();
  G.quteCockpitGroup = new THREE.Group();
  G.camera.add(G.bikeCockpitGroup);
  G.camera.add(G.quteCockpitGroup);

  const bikeDashMat = new THREE.MeshBasicMaterial({
    map: G.dashTex,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  const quteDashMat = new THREE.MeshBasicMaterial({ map: G.dashTex });
  const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });

  addBox(G.bikeCockpitGroup, 0.92, 0.34, 0.95, G.tankMat, 0, -0.78, -0.82, -0.15, 0, 0);
  addBox(G.bikeCockpitGroup, 0.72, 0.22, 0.52, G.tankMat, 0, -0.66, -1.16, -0.25, 0, 0);
  for (const side of [-1, 1]) {
    addBox(G.bikeCockpitGroup, 0.14, 0.26, 0.82, G.M.mattePlastic, side * 0.46, -0.76, -0.86, -0.12, 0, side * 0.16);
    addBox(G.bikeCockpitGroup, 0.04, 0.10, 0.48, G.accentMat, side * 0.535, -0.72, -0.94, -0.12, 0, side * 0.16);
    addCyl(G.bikeCockpitGroup, 0.038, 0.038, 0.95, G.M.chrome, side * 0.22, -0.62, -1.12, 0.32, 0);
  }
  addCyl(G.bikeCockpitGroup, 0.14, 0.14, 0.035, G.M.chrome, 0, -0.59, -0.82, Math.PI / 2, 0);
  addCyl(G.bikeCockpitGroup, 0.09, 0.09, 0.04, G.M.mattePlastic, 0, -0.58, -0.82, Math.PI / 2, 0);
  // Обтекатель и панель сдвинуты к рукам и ниже руля, иначе спидометр прячется за хромированной планкой.
  addBox(G.bikeCockpitGroup, 0.56, 0.34, 0.28, G.tankMat, 0, -0.66, -1.28, -0.18, 0, 0);
  addBox(G.bikeCockpitGroup, 0.42, 0.06, 0.04, G.accentMat, 0, -0.50, -1.38, -0.22, 0, 0);

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

  addBox(G.bikeCockpitGroup, 1.12, 0.055, 0.06, G.M.chrome, 0, -0.24, -0.92);
  // Руль и зеркала вынесены в отдельную группу: у Avenger своя чоппер-посадка.
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
    addBox(G.bikeCockpitGroup, 0.22, 0.24, 0.68, sleeveMat, side * 0.68, -0.34, -0.24, 0.15, 0, -side * 0.14);
    addBox(G.bikeCockpitGroup, 0.18, 0.14, 0.22, G.M.mattePlastic, side * 0.77, -0.19, -0.64, 0, 0, -side * 0.08);
  }

  // Avenger: руль выше и ближе к камере, длинная вилка и зеркала на высоких ножках.
  G.avengerCockpitGroup = new THREE.Group();
  {
    addBox(G.avengerCockpitGroup, 1.3, 0.06, 0.07, G.M.chrome, 0, -0.08, -0.7, -0.08, 0, 0);
    for (const side of [-1, 1]) {
      addBox(G.avengerCockpitGroup, 0.26, 0.1, 0.36, G.M.mattePlastic, side * 0.86, -0.02, -0.6, 0, 0, side * 0.1);
      addCyl(G.avengerCockpitGroup, 0.016, 0.022, 0.66, G.M.chrome, side * 0.9, 0.28, -0.56, 0, -side * 0.44);
      addBox(G.avengerCockpitGroup, 0.36, 0.2, 0.05, G.M.mattePlastic, side * 1.02, 0.6, -0.42, 0, -side * 0.22, side * 0.14);
      addBox(G.avengerCockpitGroup, 0.31, 0.16, 0.015, G.M.glass, side * 1.02, 0.6, -0.39, 0, -side * 0.22, side * 0.14);
      addCyl(G.avengerCockpitGroup, 0.036, 0.03, 1.05, G.M.chrome, side * 0.3, -0.62, -1.24, 0.46, 0);
    }
  }
  G.bikeCockpitGroup.add(G.avengerCockpitGroup);

  // Хром-ободки круглых приборов (видны только при hudStyle === 'round').
  G.roundDashBezelGroup = new THREE.Group();
  {
    const bezelSpeed = new THREE.Mesh(new THREE.TorusGeometry(0.119, 0.009, 6, 22), G.M.chrome);
    bezelSpeed.position.set(-0.145, -0.375, -0.807);
    bezelSpeed.rotation.x = -0.22;
    const bezelOdo = new THREE.Mesh(new THREE.TorusGeometry(0.102, 0.009, 6, 22), G.M.chrome);
    bezelOdo.position.set(0.119, -0.375, -0.807);
    bezelOdo.rotation.x = -0.22;
    G.roundDashBezelGroup.add(bezelSpeed, bezelOdo);
    G.bikeCockpitGroup.add(G.roundDashBezelGroup);
  }

  G.quteSteeringWheelPivot = new THREE.Group();
  G.quteYuraInteriorNeon = new THREE.Group();
  {
    const cabinRoofMat = new THREE.MeshStandardMaterial({ color: 0x1e2634, roughness: 0.85 });
    addBox(G.quteCockpitGroup, 1.56, 0.08, 1.38, cabinRoofMat, 0, 0.43, -0.52, 0.05, 0, 0);
    for (const side of [-1, 1]) {
      addBox(G.quteCockpitGroup, 0.42, 0.11, 0.03, G.M.mattePlastic, side * 0.34, 0.33, -0.94, 0.18, 0, 0);
      addBox(G.quteCockpitGroup, 0.095, 0.88, 0.11, G.tankMat, side * 0.68, 0.02, -0.96, -0.22, 0, -side * 0.06);
      addBox(G.quteCockpitGroup, 0.03, 0.68, 0.92, G.M.glassWindow, side * 0.73, 0.02, -0.52);
      addBox(G.quteCockpitGroup, 0.24, 0.15, 0.05, G.M.mattePlastic, side * 0.86, -0.08, -0.88, 0, -side * 0.26, 0);
      addBox(G.quteCockpitGroup, 0.20, 0.12, 0.02, G.M.glass, side * 0.85, -0.08, -0.85, 0, -side * 0.26, 0);
    }
    addBox(G.quteCockpitGroup, 0.28, 0.08, 0.04, G.M.mattePlastic, 0, 0.28, -0.88);
    addBox(G.quteCockpitGroup, 0.25, 0.06, 0.015, G.M.glass, 0, 0.28, -0.86);
    addBox(G.quteCockpitGroup, 0.16, 0.03, 0.10, G.windowLitMat, 0, 0.38, -0.62);

    const quteCockpitWindshieldMesh = addBox(G.quteCockpitGroup, 1.32, 0.72, 0.015, G.M.glassWindow, 0, 0.04, -1.04, -0.20, 0, 0);
    addBox(G.quteCockpitGroup, 0.56, 0.025, 0.03, G.M.mattePlastic, 0.12, -0.24, -1.05, 0, 0, 0.14);

    addBox(G.quteCockpitGroup, 1.48, 0.34, 0.48, G.M.mattePlastic, 0, -0.44, -0.96, -0.08, 0, 0);
    addBox(G.quteCockpitGroup, 0.62, 0.28, 0.22, G.M.metalDark, 0, -0.30, -0.96, -0.22, 0, 0);

    const quteDashScreen = new THREE.Mesh(plane(0.52, 0.23), quteDashMat);
    quteDashScreen.position.set(0, -0.295, -0.845);
    quteDashScreen.rotation.x = -0.22;
    G.quteCockpitGroup.add(quteDashScreen);

    const neonStrip1 = new THREE.Mesh(box(1.36, 0.022, 0.025), G.M.neonCyan);
    neonStrip1.position.set(0, -0.27, -0.74);
    const neonStrip2 = new THREE.Mesh(box(1.36, 0.02, 0.025), G.M.neonMagenta);
    neonStrip2.position.set(0, 0.37, -0.92);
    G.quteYuraInteriorNeon.add(neonStrip1, neonStrip2);
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
    const hub = new THREE.Mesh(cylinder(0.068, 0.068, 0.048, 10), G.M.metalDark);
    hub.rotation.x = Math.PI / 2;
    const hubLogo = new THREE.Mesh(box(0.065, 0.028, 0.055), G.accentMat);
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
    }

    G.quteSteeringWheelPivot.add(hub, hubLogo, spokeL, spokeR, spokeB);
    G.quteCockpitGroup.add(G.quteSteeringWheelPivot);

    return { tuneBikeWindshieldCockpit, tuneBikeMasterCylCockpit, quteCockpitWindshieldMesh };
  }
}
