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
  const RIBBON_SEGS = 140;
  const RIBBON_BEHIND = 30;

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
    dm.receiveShadow = true;
    G.scene.add(dm);
    dashMeshes.push({ mesh: dm, laneX: i % 2 === 0 ? -4.75 : 4.75, baseIdx: Math.floor(i / 2) });
  }

  function updateStripRibbon(mesh, playerS, lateralCenter, width, yOffset) {
    const pos = mesh.geometry.attributes.position;
    const halfW = width * 0.5;
    for (let r = 0; r <= RIBBON_SEGS; r++) {
      const frac = r / RIBBON_SEGS;
      const s = playerS - RIBBON_BEHIND + (1 - frac) * RIBBON_LEN;
      const yaw = -Math.atan(G.roadDX(s));
      const cosY = Math.cos(-yaw), sinY = Math.sin(-yaw);
      const cx = G.roadX(s), cy = G.roadY(s) + yOffset, cz = -s;

      const oL = lateralCenter - halfW;
      const oR = lateralCenter + halfW;
      const idx = r * 2;
      pos.setXYZ(idx,     cx + cosY * oL, cy, cz + sinY * oL);
      pos.setXYZ(idx + 1, cx + cosY * oR, cy, cz + sinY * oR);
    }
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }

  function updateSlopeRibbons(playerS) {
    const posL = slopeLeftMesh.geometry.attributes.position;
    const posR = slopeRightMesh.geometry.attributes.position;
    for (let r = 0; r <= RIBBON_SEGS; r++) {
      const frac = r / RIBBON_SEGS;
      const s = playerS - RIBBON_BEHIND + (1 - frac) * RIBBON_LEN;
      const yaw = -Math.atan(G.roadDX(s));
      const cosY = Math.cos(-yaw), sinY = Math.sin(-yaw);
      const cx = G.roadX(s), cy = G.roadY(s), cz = -s;
      const idx = r * 3;

      const l0 = -95, l1 = -22, l2 = -12.7;
      posL.setXYZ(idx,     cx + cosY * l0, cy - 4.5, cz + sinY * l0);
      posL.setXYZ(idx + 1, cx + cosY * l1, cy + 1.8, cz + sinY * l1);
      posL.setXYZ(idx + 2, cx + cosY * l2, cy + 0.08, cz + sinY * l2);

      const r0 = 12.7, r1 = 22, r2 = 95;
      posR.setXYZ(idx,     cx + cosY * r0, cy + 0.08, cz + sinY * r0);
      posR.setXYZ(idx + 1, cx + cosY * r1, cy + 1.8, cz + sinY * r1);
      posR.setXYZ(idx + 2, cx + cosY * r2, cy - 4.5, cz + sinY * r2);
    }
    posL.needsUpdate = true;
    posR.needsUpdate = true;
    slopeLeftMesh.geometry.computeVertexNormals();
    slopeRightMesh.geometry.computeVertexNormals();
  }

  function updateRoadSurface(playerS) {
    updateStripRibbon(roadMesh, playerS, 0, G.ROAD_WIDTH, 0);
    updateStripRibbon(curbLeftMesh, playerS, -9.68, 0.35, 0.12);
    updateStripRibbon(curbRightMesh, playerS, 9.68, 0.35, 0.12);
    updateStripRibbon(sidewalkLeftMesh, playerS, -11.3, 3.2, 0.11);
    updateStripRibbon(sidewalkRightMesh, playerS, 11.3, 3.2, 0.11);
    updateStripRibbon(centerDoubleLine1, playerS, -0.22, 0.13, 0.025);
    updateStripRibbon(centerDoubleLine2, playerS, 0.22, 0.13, 0.025);
    updateStripRibbon(edgeLineLeft, playerS, -9.25, 0.15, 0.025);
    updateStripRibbon(edgeLineRight, playerS, 9.25, 0.15, 0.025);
    updateSlopeRibbons(playerS);

    const startDashS = Math.floor((playerS - 20) / 11) * 11;
    for (const d of dashMeshes) {
      const s = startDashS + d.baseIdx * 11;
      G.placeOnRoad(d.mesh, s, d.laneX, 0.025);
    }
  }
  G.updateRoadSurface = updateRoadSurface;
}
