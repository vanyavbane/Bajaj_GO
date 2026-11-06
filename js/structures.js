import * as THREE from 'three';
import { keepInWindow, placeIfMoved } from './stream.js';
import { G } from './state.js';

export function initStructures() {
  /* =========================================================================
   * 7. МОСТЫ, ЭСТАКАДЫ, ТОННЕЛИ И ТРАМПЛИНЫ (VOXEL-РАМПЫ ДЛЯ ПРЫЖКОВ)
   * ========================================================================= */
  G.megaStructures = [];

  function createOverpassStructure() {
    const g = new THREE.Group();
    for (const px of [-14.2, -10.3, 10.3, 14.2]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(1.4, 8.8, 2.6), G.M.concrete);
      pier.position.set(px, 4.4, 0);
      pier.castShadow = true;
      pier.receiveShadow = true;
      g.add(pier);
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(44, 1.35, 10.5), G.M.concrete);
    deck.position.set(0, 9.2, 0);
    deck.castShadow = true;
    deck.receiveShadow = true;
    g.add(deck);

    const steelBeam = new THREE.Mesh(new THREE.BoxGeometry(44, 0.65, 11.1), G.M.bridgeSteel);
    steelBeam.position.set(0, 8.35, 0);
    g.add(steelBeam);

    for (const side of [-1, 1]) {
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.45, 28), G.M.concrete);
      ramp.position.set(side * 16.5, 4.4, side * 8);
      ramp.rotation.x = side * 0.28;
      ramp.rotation.y = side * 0.35;
      g.add(ramp);
    }

    const decoCars = [];
    for (let c = 0; c < 2; c++) {
      const dc = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(3.8, 1.2, 1.9),
        new THREE.MeshStandardMaterial({ color: c === 0 ? 0xffb300 : 0x29b6f6, roughness: 0.35, metalness: 0.4 })
      );
      body.position.y = 0.7;
      dc.add(body);
      dc.position.set((c === 0 ? -12 : 12), 9.9, (c === 0 ? -2.2 : 2.2));
      g.add(dc);
      decoCars.push({ mesh: dc, dir: c === 0 ? 1 : -1 });
    }
    g.userData = { type: 'bridge', decoCars };
    return g;
  }

  function createShortTunnelStructure() {
    const g = new THREE.Group();
    const len = 36;
    const wallL = new THREE.Mesh(new THREE.BoxGeometry(1.6, 8.6, len), G.M.concrete);
    wallL.position.set(-13.4, 4.3, 0);
    wallL.castShadow = true;
    const wallR = new THREE.Mesh(new THREE.BoxGeometry(1.6, 8.6, len), G.M.concrete);
    wallR.position.set(13.4, 4.3, 0);
    wallR.castShadow = true;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(28.4, 1.5, len), G.M.concrete);
    roof.position.set(0, 8.9, 0);
    roof.castShadow = true;
    roof.receiveShadow = true;
    g.add(wallL, wallR, roof);

    const tunnelBulbMat = new THREE.MeshStandardMaterial({ color: 0xffe57f, emissive: 0xffab00, emissiveIntensity: 2.2 });
    for (let z = -len / 2 + 4; z <= len / 2 - 4; z += 7) {
      for (const lx of [-4.5, 4.5]) {
        const lightBox = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 1.8), tunnelBulbMat);
        lightBox.position.set(lx, 8.05, z);
        g.add(lightBox);
      }
    }
    g.userData = { type: 'tunnel', length: len };
    return g;
  }

  for (let i = 0; i < 4; i++) {
    const mesh = (i === 2) ? createShortTunnelStructure() : createOverpassStructure();
    mesh.userData.s = 220 + i * 320;
    G.scene.add(mesh);
    G.megaStructures.push(mesh);
  }

  // ПУЛ VOXEL-ТРАМПЛИНОВ НА ПОПУТНЫХ ПОЛОСАХ (3 и 4)
  const rampStripeTex = G.createCanvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#263238';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#37474f';
    for (let y = 0; y < h; y += 16) ctx.fillRect(0, y, w, 8);
    ctx.strokeStyle = '#ffca28';
    ctx.lineWidth = 10;
    for (let y = 28; y < h; y += 52) {
      ctx.beginPath();
      ctx.moveTo(22, y + 22);
      ctx.lineTo(w / 2, y);
      ctx.lineTo(w - 22, y + 22);
      ctx.stroke();
    }
  });
  const rampDeckMat = new THREE.MeshStandardMaterial({ map: rampStripeTex, roughness: 0.45, metalness: 0.55 });
  const rampWoodMat = new THREE.MeshStandardMaterial({ color: 0x6d4c41, roughness: 0.8 });

  G.rampsPool = [];
  function createVoxelRampMesh() {
    const g = new THREE.Group();
    const width = 3.55;
    const length = 6.8;
    const height = 1.08;

    const steps = 7;
    for (let i = 0; i < steps; i++) {
      const frac = (i + 1) / steps;
      const sh = height * frac;
      const sd = length / steps;
      const sz = (length * 0.5) - (i + 0.5) * sd;
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(width - 0.16, sh, sd + 0.04),
        i % 2 === 0 ? G.M.bridgeSteel : rampWoodMat
      );
      block.position.set(0, sh * 0.5, sz);
      block.castShadow = true;
      block.receiveShadow = true;
      g.add(block);
    }

    const slopeLen = Math.hypot(length, height);
    const slopeAngle = Math.atan2(height, length);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(width, 0.1, slopeLen), rampDeckMat);
    deck.position.set(0, height * 0.5 + 0.04, 0);
    deck.rotation.x = slopeAngle;
    deck.castShadow = true;
    deck.receiveShadow = true;
    g.add(deck);

    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, slopeLen), G.M.neonCyan);
      rail.position.set(side * (width * 0.5 + 0.04), height * 0.5 + 0.12, 0);
      rail.rotation.x = slopeAngle;
      g.add(rail);

      const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.36, 0.24), G.M.neonYellow);
      beacon.position.set(side * (width * 0.5), height + 0.18, -length * 0.46);
      g.add(beacon);
    }

    return { group: g, width, length, height };
  }

  function findSafeRampS(candidateS) {
    let s = candidateS;
    for (let attempt = 0; attempt < 6; attempt++) {
      let conflict = false;
      for (const ms of G.megaStructures) {
        if (Math.abs(s - ms.userData.s) < 55) {
          conflict = true;
          s = ms.userData.s + 68;
          break;
        }
      }
      if (!conflict) break;
    }
    return s;
  }
  G.findSafeRampS = findSafeRampS;

  for (let i = 0; i < 3; i++) {
    const r = createVoxelRampMesh();
    const laneIdx = (i % 2 === 0) ? 2 : 3;
    const safeS = findSafeRampS(155 + i * 285);
    G.scene.add(r.group);
    G.rampsPool.push({
      mesh: r.group,
      width: r.width,
      length: r.length,
      height: r.height,
      s: safeS,
      laneIdx,
      lateralOffset: G.LANE_OFFSETS[laneIdx],
      triggeredThisPass: false
    });
  }

  function recycleRamps() {
    for (const ramp of G.rampsPool) {
      if (ramp.s < G.playerS - 32) {
        let maxRampS = G.playerS;
        for (const other of G.rampsPool) if (other.s > maxRampS) maxRampS = other.s;
        const nextInterval = 240 + Math.random() * 200;
        ramp.laneIdx = Math.random() < 0.5 ? 2 : 3;
        ramp.lateralOffset = G.LANE_OFFSETS[ramp.laneIdx];
        ramp.s = findSafeRampS(maxRampS + nextInterval);
        ramp.triggeredThisPass = false;
        ramp.placedS = NaN;
      }
      ramp.placedS = placeIfMoved(ramp.placedS, ramp.s, () => {
        G.placeOnRoad(ramp.mesh, ramp.s, ramp.lateralOffset, 0);
      });
    }
  }
  G.recycleRamps = recycleRamps;

  function updateMegaStructures(dt) {
    const span = G.megaStructures.length * 320;
    for (const ms of G.megaStructures) {
      ms.userData.s = keepInWindow(ms.userData.s, G.playerS, 65, Infinity, span);
      ms.userData.placedS = placeIfMoved(ms.userData.placedS, ms.userData.s, () => {
        G.placeOnRoad(ms, ms.userData.s, 0, 0);
      });
      if (ms.userData.decoCars) {
        for (const dc of ms.userData.decoCars) {
          dc.mesh.position.x += dc.dir * 14 * dt;
          if (dc.mesh.position.x > 20) dc.mesh.position.x = -20;
          if (dc.mesh.position.x < -20) dc.mesh.position.x = 20;
        }
      }
    }
  }
  G.updateMegaStructures = updateMegaStructures;
}
