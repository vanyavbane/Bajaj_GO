import * as THREE from 'three';
import { G } from './state.js';

export function initRoadSurface() {
  const $ = G.$;
  const clamp = G.clamp;
  const lerp = G.lerp;

  /* =========================================================================
   * 5. ДОРОЖНОЕ ПОЛОТНО, РАЗМЕТКА, ТРОТУАРЫ И ОТКОСЫ
   * ========================================================================= */
  const RIBBON_LEN = 350;
  const RIBBON_SEGS = 84;
  const RIBBON_BEHIND = 30;
  const ROW = RIBBON_SEGS + 1;
  const sampleX = new Float32Array(ROW);
  const sampleY = new Float32Array(ROW);
  const sampleZ = new Float32Array(ROW);
  const rightX = new Float32Array(ROW);
  const rightZ = new Float32Array(ROW);

  function sampleCenterline(playerS) {
    for (let r = 0; r < ROW; r++) {
      const frac = r / RIBBON_SEGS;
      const s = playerS - RIBBON_BEHIND + (1 - frac) * RIBBON_LEN;
      const dx = G.roadDX(s);
      const lh = Math.hypot(dx, 1) || 1;
      sampleX[r] = G.roadX(s);
      sampleY[r] = G.roadY(s);
      sampleZ[r] = -s;
      rightX[r] = 1 / lh;
      rightZ[r] = dx / lh;
    }
  }

  function shadeStrip(geo) {
    const norm = geo.attributes.normal.array;
    for (let r = 0; r < ROW; r++) {
      const ahead = r < ROW - 1;
      const r2 = ahead ? r + 1 : r - 1;
      const sign = ahead ? 1 : -1;
      const ax = (sampleX[r2] - sampleX[r]) * sign;
      const ay = (sampleY[r2] - sampleY[r]) * sign;
      const az = (sampleZ[r2] - sampleZ[r]) * sign;
      const bx = rightX[r];
      const bz = rightZ[r];
      let nx = ay * bz;
      let ny = az * bx - ax * bz;
      let nz = -ay * bx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const o = r * 6;
      norm[o] = nx; norm[o + 1] = ny; norm[o + 2] = nz;
      norm[o + 3] = nx; norm[o + 4] = ny; norm[o + 5] = nz;
    }
    geo.attributes.normal.needsUpdate = true;
  }

  function makeRibbon(width, mat) {
    const geo = new THREE.PlaneGeometry(width, RIBBON_LEN, 1, RIBBON_SEGS);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    G.scene.add(mesh);
    return mesh;
  }

  const roadMesh = makeRibbon(G.ROAD_WIDTH, G.M.road);
  const sidewalkLeftMesh = makeRibbon(3.2, G.M.sidewalk);
  const sidewalkRightMesh = makeRibbon(3.2, G.M.sidewalk);
  const curbLeftMesh = makeRibbon(0.35, G.M.curbWhite);
  const curbRightMesh = makeRibbon(0.35, G.M.curbWhite);
  const centerDoubleLine1 = makeRibbon(0.14, G.M.lineYellow);
  const centerDoubleLine2 = makeRibbon(0.14, G.M.lineYellow);
  const edgeLineLeft = makeRibbon(0.16, G.M.lineWhite);
  const edgeLineRight = makeRibbon(0.16, G.M.lineWhite);
  for (const mesh of [sidewalkLeftMesh, sidewalkRightMesh, curbLeftMesh, curbRightMesh, centerDoubleLine1, centerDoubleLine2, edgeLineLeft, edgeLineRight]) {
    mesh.receiveShadow = false;
  }

  const slopeGeoL = new THREE.PlaneGeometry(85, RIBBON_LEN, 2, RIBBON_SEGS);
  slopeGeoL.rotateX(-Math.PI / 2);
  const slopeLeftMesh = new THREE.Mesh(slopeGeoL, G.M.grass);
  slopeLeftMesh.receiveShadow = true;
  slopeLeftMesh.frustumCulled = false;
  G.scene.add(slopeLeftMesh);

  const slopeGeoR = new THREE.PlaneGeometry(85, RIBBON_LEN, 2, RIBBON_SEGS);
  slopeGeoR.rotateX(-Math.PI / 2);
  const slopeRightMesh = new THREE.Mesh(slopeGeoR, G.M.grass);
  slopeRightMesh.receiveShadow = true;
  slopeRightMesh.frustumCulled = false;
  G.scene.add(slopeRightMesh);

  const dashMeshes = [];
  const dashGeo = new THREE.BoxGeometry(0.14, 0.03, 4.2);
  for (let i = 0; i < 60; i++) {
    const dm = new THREE.Mesh(dashGeo, G.M.lineWhite);
    dm.receiveShadow = false;
    G.scene.add(dm);
    dashMeshes.push({ mesh: dm, laneX: i % 2 === 0 ? -4.75 : 4.75, baseIdx: Math.floor(i / 2) });
  }

  function updateStripRibbon(mesh, lateralCenter, width, yOffset) {
    const pos = mesh.geometry.attributes.position;
    const halfW = width * 0.5;
    const oL = lateralCenter - halfW;
    const oR = lateralCenter + halfW;
    for (let r = 0; r < ROW; r++) {
      const cx = sampleX[r];
      const cy = sampleY[r] + yOffset;
      const cz = sampleZ[r];
      const rx = rightX[r];
      const rz = rightZ[r];
      const idx = r * 2;
      pos.setXYZ(idx, cx + rx * oL, cy, cz + rz * oL);
      pos.setXYZ(idx + 1, cx + rx * oR, cy, cz + rz * oR);
    }
    pos.needsUpdate = true;
  }

  function shadeSlope(geo, y0, y1, y2, x0, x1, x2) {
    const norm = geo.attributes.normal.array;
    for (let r = 0; r < ROW; r++) {
      const ahead = r < ROW - 1;
      const r2 = ahead ? r + 1 : r - 1;
      const sign = ahead ? 1 : -1;
      const ax = (sampleX[r2] - sampleX[r]) * sign;
      const ay = (sampleY[r2] - sampleY[r]) * sign;
      const az = (sampleZ[r2] - sampleZ[r]) * sign;
      const rx = rightX[r];
      const rz = rightZ[r];
      const write = (slot, latA, latB, hA, hB) => {
        const vx = rx * (latB - latA);
        const vy = hB - hA;
        const vz = rz * (latB - latA);
        let nx = ay * vz - az * vy;
        let ny = az * vx - ax * vz;
        let nz = ax * vy - ay * vx;
        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const len = Math.hypot(nx, ny, nz) || 1;
        const o = (r * 3 + slot) * 3;
        norm[o] = nx / len; norm[o + 1] = ny / len; norm[o + 2] = nz / len;
      };
      write(0, x0, x1, y0, y1);
      write(1, x0, x2, y0, y2);
      write(2, x1, x2, y1, y2);
    }
    geo.attributes.normal.needsUpdate = true;
  }

  function updateSlopeRibbons() {
    const posL = slopeLeftMesh.geometry.attributes.position;
    const posR = slopeRightMesh.geometry.attributes.position;
    for (let r = 0; r < ROW; r++) {
      const cx = sampleX[r], cy = sampleY[r], cz = sampleZ[r];
      const rx = rightX[r], rz = rightZ[r];
      const idx = r * 3;

      const l0 = -95, l1 = -22, l2 = -12.7;
      posL.setXYZ(idx,     cx + rx * l0, cy - 4.5, cz + rz * l0);
      posL.setXYZ(idx + 1, cx + rx * l1, cy + 1.8, cz + rz * l1);
      posL.setXYZ(idx + 2, cx + rx * l2, cy + 0.08, cz + rz * l2);

      const r0 = 12.7, r1 = 22, r2 = 95;
      posR.setXYZ(idx,     cx + rx * r0, cy + 0.08, cz + rz * r0);
      posR.setXYZ(idx + 1, cx + rx * r1, cy + 1.8, cz + rz * r1);
      posR.setXYZ(idx + 2, cx + rx * r2, cy - 4.5, cz + rz * r2);
    }
    posL.needsUpdate = true;
    posR.needsUpdate = true;
  }

  const flatStrips = [
    curbLeftMesh, curbRightMesh, sidewalkLeftMesh, sidewalkRightMesh,
    centerDoubleLine1, centerDoubleLine2, edgeLineLeft, edgeLineRight
  ];
  let lastDashS = NaN;
  let lastSlopeShadeS = NaN;

  function shareRoadNormals() {
    shadeStrip(roadMesh.geometry);
    const from = roadMesh.geometry.attributes.normal.array;
    for (const mesh of flatStrips) {
      mesh.geometry.attributes.normal.array.set(from);
      mesh.geometry.attributes.normal.needsUpdate = true;
    }
  }

  function updateRoadSurface(playerS) {
    sampleCenterline(playerS);
    updateStripRibbon(roadMesh, 0, G.ROAD_WIDTH, 0);
    updateStripRibbon(curbLeftMesh, -9.68, 0.35, 0.12);
    updateStripRibbon(curbRightMesh, 9.68, 0.35, 0.12);
    updateStripRibbon(sidewalkLeftMesh, -11.3, 3.2, 0.11);
    updateStripRibbon(sidewalkRightMesh, 11.3, 3.2, 0.11);
    updateStripRibbon(centerDoubleLine1, -0.22, 0.13, 0.025);
    updateStripRibbon(centerDoubleLine2, 0.22, 0.13, 0.025);
    updateStripRibbon(edgeLineLeft, -9.25, 0.15, 0.025);
    updateStripRibbon(edgeLineRight, 9.25, 0.15, 0.025);
    shareRoadNormals();
    updateSlopeRibbons();
    if (Number.isNaN(lastSlopeShadeS) || Math.abs(playerS - lastSlopeShadeS) >= 3) {
      lastSlopeShadeS = playerS;
      shadeSlope(slopeLeftMesh.geometry, -4.5, 1.8, 0.08, -95, -22, -12.7);
      shadeSlope(slopeRightMesh.geometry, 0.08, 1.8, -4.5, 12.7, 22, 95);
    }

    const startDashS = Math.floor((playerS - 20) / 11) * 11;
    if (startDashS === lastDashS) return;
    lastDashS = startDashS;
    for (const d of dashMeshes) {
      const s = startDashS + d.baseIdx * 11;
      G.placeOnRoad(d.mesh, s, d.laneX, 0.025);
    }
  }
  G.updateRoadSurface = updateRoadSurface;
}
