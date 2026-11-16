import * as THREE from 'three';
import { G } from './state.js';
import { branchEdges, shoulderLats } from './engine/fork.js';

export function initRoadSurface() {

  /* =========================================================================
   * 5. ДОРОЖНОЕ ПОЛОТНО, РАЗМЕТКА, РАЗВИЛКА, ТРОТУАРЫ И ОТКОСЫ
   * -------------------------------------------------------------------------
   * Ширина полотна — ширина одной ветки. Разъезд в неё не входит:
   * две ленты и трава между ними считаются в js/engine/fork.js.
   * ========================================================================= */
  const RIBBON_LEN = 350;
  const RIBBON_SEGS = 112;
  const RIBBON_BEHIND = 28;
  const ROW = RIBBON_SEGS + 1;
  const ISLAND_ROWS = 49;

  const sampleS = new Float32Array(ROW);
  const sampleX = new Float32Array(ROW);
  const sampleY = new Float32Array(ROW);
  const sampleZ = new Float32Array(ROW);
  const sampleCity = new Float32Array(ROW);
  const sampleHalf = new Float32Array(ROW);
  const rightX = new Float32Array(ROW);
  const rightZ = new Float32Array(ROW);

  const toWorld = (s, lat) => G.laneWorldOffsetAtS(s, lat);
  const widthAt = (s) => G.roadWidthAtS(s);

  function sampleCenterline(playerS) {
    for (let r = 0; r < ROW; r++) {
      const frac = r / RIBBON_SEGS;
      const s = playerS - RIBBON_BEHIND + (1 - frac) * RIBBON_LEN;
      const dx = G.roadDX(s);
      const lh = Math.hypot(dx, 1) || 1;
      sampleS[r] = s;
      sampleX[r] = G.roadX(s);
      sampleY[r] = G.roadY(s);
      sampleZ[r] = -s;
      sampleCity[r] = G.cityWeightAtS(s);
      sampleHalf[r] = widthAt(s) * 0.5;
      rightX[r] = 1 / lh;
      rightZ[r] = dx / lh;
    }
  }

  /* ---------------- Геометрия лент ---------------- */
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

  const roadMesh = makeRibbon(1, G.M.road);
  const roadRightMat = G.M.road.clone();
  roadRightMat.polygonOffset = true;
  roadRightMat.polygonOffsetFactor = 1;
  roadRightMat.polygonOffsetUnits = 1;
  const roadRightMesh = makeRibbon(1, roadRightMat);
  const gapMat = G.M.grass.clone();
  gapMat.polygonOffset = true;
  gapMat.polygonOffsetFactor = 1;
  gapMat.polygonOffsetUnits = 1;
  const forkGapMesh = makeRibbon(1, gapMat);
  forkGapMesh.receiveShadow = true;
  const sidewalkLeftMesh = makeRibbon(3.2, G.M.sidewalk);
  const sidewalkRightMesh = makeRibbon(3.2, G.M.sidewalk);
  const curbLeftMesh = makeRibbon(0.35, G.M.curbWhite);
  const curbRightMesh = makeRibbon(0.35, G.M.curbWhite);
  const centerDoubleLine1 = makeRibbon(0.13, G.M.lineYellow);
  const centerDoubleLine2 = makeRibbon(0.13, G.M.lineYellow);
  const edgeLineLeft = makeRibbon(0.16, G.M.lineWhite);
  const edgeLineRight = makeRibbon(0.16, G.M.lineWhite);

  const accentLineMatL = new THREE.MeshBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.9 });
  const accentLineMatR = new THREE.MeshBasicMaterial({ color: 0xff7043, transparent: true, opacity: 0.9 });

  function makeIslandRibbon(mat) {
    const geo = makeIslandGeometryBase();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.visible = false;
    G.scene.add(mesh);
    return mesh;
  }
  const accentLineL = makeIslandRibbon(accentLineMatL);
  const accentLineR = makeIslandRibbon(accentLineMatR);

  for (const mesh of [sidewalkLeftMesh, sidewalkRightMesh, curbLeftMesh, curbRightMesh,
    centerDoubleLine1, centerDoubleLine2, edgeLineLeft, edgeLineRight]) {
    mesh.receiveShadow = false;
  }

  /* ---------------- Откосы ---------------- */
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

  function shadeSlope(geo) {
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
      const sh = G.shoulder;
      const half = sampleHalf[r];
      const spread = spreadAt(sampleS[r]);
      const cityOuter = (0.35 + 3.2) * sampleCity[r];
      const lat = shoulderLats(half, spread, cityOuter, sh);
      write(0, -lat.far, -lat.berm, sh.farY, sh.bermY);
      write(1, -lat.far, -lat.lip, sh.farY, sh.lipY);
      write(2, -lat.berm, -lat.lip, sh.bermY, sh.lipY);
    }
    geo.attributes.normal.needsUpdate = true;
  }

  /* ---------------- Разметка полос (инстансы) ---------------- */
  const MAX_DASHES = 240;
  const dashGeo = new THREE.BoxGeometry(0.15, 0.035, 4.2);
  const dashMesh = new THREE.InstancedMesh(dashGeo, G.M.lineWhite, MAX_DASHES);
  dashMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  dashMesh.frustumCulled = false;
  dashMesh.receiveShadow = false;
  G.scene.add(dashMesh);

  /* Бетонный отбойник по оси МКАД. Сплошной участок 90 м, проезд 10 м.
     Сетка привязана к абсолютным метрам, поэтому проезд не съезжает. */
  const BARRIER_PERIOD = 100;
  const BARRIER_GAP = 10;
  const BARRIER_HALF_W = 0.31;
  const MAX_BLOCKS = 96;
  const blockGeo = new THREE.BoxGeometry(0.62, 0.92, 3.6);
  const blockMesh = new THREE.InstancedMesh(blockGeo, G.M.concrete, MAX_BLOCKS);
  blockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  blockMesh.frustumCulled = false;
  blockMesh.castShadow = true;
  G.scene.add(blockMesh);

  const dummy = new THREE.Object3D();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  function laneBoundaryRanks(cfg) {
    const ranks = [];
    const maxRank = Math.max(cfg.oncomingCount, cfg.count - cfg.oncomingCount) - 1;
    for (let rank = 1; rank <= maxRank; rank++) ranks.push(rank);
    return ranks;
  }

  function updateDashes(playerS, dense) {
    const dominant = Number.isInteger(G.biomeDominant) ? G.biomeDominant : 0;
    const cfg = G.getLaneConfig ? G.getLaneConfig(dominant) : null;
    if (!cfg) { dashMesh.count = 0; return; }
    const spacing = 11;
    const startDashS = Math.floor((playerS - 20) / spacing) * spacing;
    const ranks = laneBoundaryRanks(cfg);
    let used = 0;
    for (const rank of ranks) {
      for (const side of [-1, 1]) {
        const logical = side * cfg.laneWidth * rank;
        for (let k = 0; k < 32; k++) {
          if (used >= MAX_DASHES || !dense) break;
          const s = startDashS + k * spacing;
          if (s < playerS - RIBBON_BEHIND + 2) continue;
          const worldLat = toWorld(s, logical);
          dummy.scale.set(1, 1, 1);
          G.placeOnRoad(dummy, s, worldLat, 0.03);
          dummy.updateMatrix();
          dashMesh.setMatrixAt(used++, dummy.matrix);
        }
      }
    }
    for (let i = used; i < MAX_DASHES; i++) dashMesh.setMatrixAt(i, hidden);
    dashMesh.count = used;
    dashMesh.instanceMatrix.needsUpdate = true;
  }

  function barrierGapAt(s) {
    const meters = (Number.isFinite(G.biomeOffsetM) ? G.biomeOffsetM : 0) + s;
    const local = ((meters % BARRIER_PERIOD) + BARRIER_PERIOD) % BARRIER_PERIOD;
    return local >= BARRIER_PERIOD - BARRIER_GAP;
  }

  G.medianBlocksBike = (s, worldLat, halfPlayer) => {
    const weight = G.mkadWeightAtS ? G.mkadWeightAtS(s) : 0;
    const split = G.splitAmountAtS ? G.splitAmountAtS(s) : 0;
    if (weight < 0.55 || split > 0.05 || barrierGapAt(s)) return 0;
    const reach = BARRIER_HALF_W + halfPlayer;
    return Math.abs(worldLat) < reach ? reach : 0;
  };

  function updateBarrier(playerS, dense) {
    const spacing = 4.2;
    const startS = Math.floor((playerS - 20) / spacing) * spacing;
    let used = 0;
    for (let k = 0; k < 80; k++) {
      if (used >= MAX_BLOCKS || !dense) break;
      const s = startS + k * spacing;
      if (s < playerS - RIBBON_BEHIND + 2) continue;
      const weight = G.mkadWeightAtS ? G.mkadWeightAtS(s) : 0;
      const split = G.splitAmountAtS ? G.splitAmountAtS(s) : 0;
      const vis = weight > 0.08 && split < 0.05 && !barrierGapAt(s) ? weight : 0;
      if (vis <= 0.02) continue;
      dummy.scale.set(1, vis, 1);
      G.placeOnRoad(dummy, s, 0, 0.46 * vis);
      dummy.updateMatrix();
      blockMesh.setMatrixAt(used++, dummy.matrix);
    }
    for (let i = used; i < MAX_BLOCKS; i++) blockMesh.setMatrixAt(i, hidden);
    blockMesh.count = used;
    blockMesh.instanceMatrix.needsUpdate = true;
  }

  /* ---------------- Ленты с переменной шириной ---------------- */
  function spreadAt(s) {
    return G.forkSpreadAtS(s);
  }

  function updateRoadRibbon() {
    roadRightMat.envMapIntensity = G.M.road.envMapIntensity;
    gapMat.color.copy(G.M.grass.color);
    const posL = roadMesh.geometry.attributes.position;
    const posR = roadRightMesh.geometry.attributes.position;
    const posG = forkGapMesh.geometry.attributes.position;
    let opened = 0;
    for (let r = 0; r < ROW; r++) {
      const spread = spreadAt(sampleS[r]);
      if (spread > opened) opened = spread;
      const edge = branchEdges(sampleHalf[r], spread);
      const cx = sampleX[r], cy = sampleY[r], cz = sampleZ[r];
      const rx = rightX[r], rz = rightZ[r];
      const idx = r * 2;
      posL.setXYZ(idx, cx + rx * edge.leftOuter, cy, cz + rz * edge.leftOuter);
      posL.setXYZ(idx + 1, cx + rx * edge.leftInner, cy, cz + rz * edge.leftInner);
      posR.setXYZ(idx, cx + rx * edge.rightInner, cy, cz + rz * edge.rightInner);
      posR.setXYZ(idx + 1, cx + rx * edge.rightOuter, cy, cz + rz * edge.rightOuter);
      posG.setXYZ(idx, cx - rx * spread, cy, cz - rz * spread);
      posG.setXYZ(idx + 1, cx + rx * spread, cy, cz + rz * spread);
    }
    posL.needsUpdate = true;
    posR.needsUpdate = true;
    posG.needsUpdate = true;
    forkGapMesh.visible = opened > 0.02;
  }

  /** Лента, у которой центр и ширина в мировых метрах зависят от точки s. */
  function updateLateralStrip(mesh, latAt, width, yOffset) {
    const pos = mesh.geometry.attributes.position;
    const halfW = width * 0.5;
    for (let r = 0; r < ROW; r++) {
      const lat = latAt(r);
      const cx = sampleX[r], cy = sampleY[r] + yOffset, cz = sampleZ[r];
      const rx = rightX[r], rz = rightZ[r];
      const idx = r * 2;
      pos.setXYZ(idx, cx + rx * (lat - halfW), cy, cz + rz * (lat - halfW));
      pos.setXYZ(idx + 1, cx + rx * (lat + halfW), cy, cz + rz * (lat + halfW));
    }
    pos.needsUpdate = true;
  }

  /** Тротуар/бордюр города: сжимается к кромке вместе с весом города. */
  function updateCityStrip(mesh, side, baseWidth, width, yOffset) {
    const pos = mesh.geometry.attributes.position;
    let maxWeight = 0;
    for (let r = 0; r < ROW; r++) {
      const cw = sampleCity[r];
      if (cw > maxWeight) maxWeight = cw;
      const half = sampleHalf[r];
      const spread = spreadAt(sampleS[r]);
      const inner = half + spread + baseWidth * cw;
      const halfW = width * 0.5 * cw;
      const center = side * (inner + halfW);
      const cx = sampleX[r], cy = sampleY[r] + yOffset, cz = sampleZ[r];
      const rx = rightX[r], rz = rightZ[r];
      const idx = r * 2;
      pos.setXYZ(idx, cx + rx * (center - halfW), cy, cz + rz * (center - halfW));
      pos.setXYZ(idx + 1, cx + rx * (center + halfW), cy, cz + rz * (center + halfW));
    }
    pos.needsUpdate = true;
    mesh.visible = maxWeight > 0.02;
  }

  function updateSlopeRibbons() {
    const posL = slopeLeftMesh.geometry.attributes.position;
    const posR = slopeRightMesh.geometry.attributes.position;
    for (let r = 0; r < ROW; r++) {
      const cx = sampleX[r], cy = sampleY[r], cz = sampleZ[r];
      const rx = rightX[r], rz = rightZ[r];
      const half = sampleHalf[r];
      const spread = spreadAt(sampleS[r]);
      const cityOuter = (0.35 + 3.2) * sampleCity[r];
      const sh = G.shoulder;
      const lat = shoulderLats(half, spread, cityOuter, sh);
      const idx = r * 3;
      posL.setXYZ(idx,     cx + rx * -lat.far, cy + sh.farY, cz + rz * -lat.far);
      posL.setXYZ(idx + 1, cx + rx * -lat.berm, cy + sh.bermY, cz + rz * -lat.berm);
      posL.setXYZ(idx + 2, cx + rx * -lat.lip, cy + sh.lipY, cz + rz * -lat.lip);

      posR.setXYZ(idx,     cx + rx * lat.lip, cy + sh.lipY, cz + rz * lat.lip);
      posR.setXYZ(idx + 1, cx + rx * lat.berm, cy + sh.bermY, cz + rz * lat.berm);
      posR.setXYZ(idx + 2, cx + rx * lat.far, cy + sh.farY, cz + rz * lat.far);
    }
    posL.needsUpdate = true;
    posR.needsUpdate = true;
  }

  /* ---------------- Островок развилки ---------------- */
  function makeIslandGeometryBase() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(ISLAND_ROWS * 2 * 3);
    const uv = new Float32Array(ISLAND_ROWS * 2 * 2);
    const idx = [];
    for (let r = 0; r < ISLAND_ROWS; r++) {
      uv[(r * 2) * 2] = 0;
      uv[(r * 2) * 2 + 1] = r / (ISLAND_ROWS - 1);
      uv[(r * 2 + 1) * 2] = 1;
      uv[(r * 2 + 1) * 2 + 1] = r / (ISLAND_ROWS - 1);
      if (r < ISLAND_ROWS - 1) {
        const a = r * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    return geo;
  }

  const islandMat = new THREE.MeshLambertMaterial({ color: 0x9aa1a9 });
  const islandMesh = new THREE.Mesh(makeIslandGeometryBase(), islandMat);
  islandMesh.receiveShadow = true;
  islandMesh.frustumCulled = false;
  G.scene.add(islandMesh);

  const signTex = G.createCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#c62828';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w * 0.46, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 22;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(w * 0.28, h * 0.66);
    ctx.lineTo(w * 0.5, h * 0.34);
    ctx.lineTo(w * 0.72, h * 0.66);
    ctx.stroke();
  });
  const signBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(1.36, 1.36),
    new THREE.MeshBasicMaterial({ map: signTex, transparent: true, side: THREE.DoubleSide })
  );
  signBoard.position.y = 1.34;
  const signPost = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.05, 0.1), G.M.metalDark || G.M.concrete);
  signPost.position.y = 0.52;
  const signGroup = new THREE.Group();
  signGroup.add(signBoard, signPost);
  signGroup.frustumCulled = false;
  signGroup.visible = false;
  G.scene.add(signGroup);

  function arrowTexture() {
    return G.createCanvasTexture(128, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 26;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const y0 of [0.62, 0.86]) {
        ctx.beginPath();
        ctx.moveTo(w * 0.22, h * y0);
        ctx.lineTo(w * 0.5, h * (y0 - 0.26));
        ctx.lineTo(w * 0.78, h * y0);
        ctx.stroke();
      }
    });
  }

  function makeArrow(mat) {
    const tex = arrowTexture();
    const geo = new THREE.PlaneGeometry(2.4, 4.8);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: mat })
    );
    m.receiveShadow = false;
    m.visible = false;
    m.frustumCulled = false;
    G.scene.add(m);
    return m;
  }

  const arrowLeftA = makeArrow(0x4fc3f7);
  const arrowLeftB = makeArrow(0x4fc3f7);
  const arrowRightA = makeArrow(0xff7043);
  const arrowRightB = makeArrow(0xff7043);

  function splitCenterS(playerS) {
    return G.splitCenterS(playerS);
  }

  function islandHalfAt(s) {
    return G.splitLateralShiftAtS(s, 1);
  }

  /** Цветная линия вдоль кромки островка (своя 49-рядная геометрия). */
  function updateIslandStrip(mesh, side) {
    const splitS = splitCenterS(G.playerS);
    const from = splitS - 120;
    const span = 240;
    const halfW = 0.13;
    const pos = mesh.geometry.attributes.position;
    for (let r = 0; r < ISLAND_ROWS; r++) {
      const s = from + span * (r / (ISLAND_ROWS - 1));
      const dx = G.roadDX(s);
      const lh = Math.hypot(dx, 1) || 1;
      const rx = 1 / lh;
      const rz = dx / lh;
      const lat = side * Math.max(0.2, islandHalfAt(s) - 0.45);
      const cx = G.roadX(s), cy = G.roadY(s) + 0.09, cz = -s;
      const idx = r * 2;
      pos.setXYZ(idx, cx + rx * (lat - halfW), cy, cz + rz * (lat - halfW));
      pos.setXYZ(idx + 1, cx + rx * (lat + halfW), cy, cz + rz * (lat + halfW));
    }
    pos.needsUpdate = true;
  }

  function updateIsland(playerS) {
    const splitS = splitCenterS(playerS);
    const amount = G.splitAmountAtS ? G.splitAmountAtS(splitS) : 0;
    const active = amount > 0.01;
    islandMesh.visible = false;
    signGroup.visible = active;

    const choices = G.splitState && G.splitState.choices ? G.splitState.choices : null;
    const leftBiome = choices ? G.BIOMES[choices[0]] : null;
    const rightBiome = choices ? G.BIOMES[choices[1]] : null;
    if (leftBiome) accentLineMatL.color.setHex(leftBiome.accent);
    if (rightBiome) accentLineMatR.color.setHex(rightBiome.accent);
    arrowLeftA.material.color.setHex(leftBiome ? leftBiome.accent : 0x4fc3f7);
    arrowLeftB.material.color.copy(arrowLeftA.material.color);
    arrowRightA.material.color.setHex(rightBiome ? rightBiome.accent : 0xff7043);
    arrowRightB.material.color.copy(arrowRightA.material.color);

    // Серый островок выключен: зазор между ветками рисует травяная лента.
    // Цветные линии вдоль внутренней кромки каждой ветки.
    accentLineL.visible = active;
    accentLineR.visible = active;
    if (active) {
      updateIslandStrip(accentLineL, -1);
      updateIslandStrip(accentLineR, 1);
    }

    // Стрелки: по две на ветку до развилки. Боковое смещение считается от
    // ширины в точке стрелки, иначе на узкой горной дороге они уезжают за
    // кромку (ширина развилки там заметно больше обычной).
    const hintLatAt = (s) => {
      const spread = G.forkSpreadAtS ? G.forkSpreadAtS(s) : 0;
      const half = widthAt(s) * 0.5;
      return spread + Math.max(1.6, Math.min(half * 0.45, half - 0.8));
    };
    const arrows = [
      { mesh: arrowLeftA, s: splitS - 95, side: -1 },
      { mesh: arrowLeftB, s: splitS - 48, side: -1 },
      { mesh: arrowRightA, s: splitS - 95, side: 1 },
      { mesh: arrowRightB, s: splitS - 48, side: 1 }
    ];
    for (const a of arrows) {
      a.mesh.visible = active;
      if (!active) continue;
      G.placeOnRoad(a.mesh, a.s, a.side * hintLatAt(a.s), 0.055);
    }

    if (active) {
      G.placeOnRoad(signGroup, splitS - 8, 0, 0.075);
    }
  }

  /* ---------------- Главный апдейт ---------------- */
  const flatStrips = [
    curbLeftMesh, curbRightMesh, sidewalkLeftMesh, sidewalkRightMesh,
    centerDoubleLine1, centerDoubleLine2, edgeLineLeft, edgeLineRight
  ];
  let lastDashS = NaN;
  let lastDashBiome = -1;

  function shareRoadNormals() {
    shadeStrip(roadMesh.geometry);
    shadeStrip(roadRightMesh.geometry);
    const from = roadMesh.geometry.attributes.normal.array;
    for (const mesh of flatStrips) {
      mesh.geometry.attributes.normal.array.set(from);
      mesh.geometry.attributes.normal.needsUpdate = true;
    }
  }

  function updateRoadSurface(playerS) {
    sampleCenterline(playerS);
    updateRoadRibbon();

    // Тротуары и бордюры существуют только в городе.
    updateCityStrip(curbLeftMesh, -1, 0.0, 0.35, 0.12);
    updateCityStrip(curbRightMesh, 1, 0.0, 0.35, 0.12);
    updateCityStrip(sidewalkLeftMesh, -1, 0.35, 3.2, 0.11);
    updateCityStrip(sidewalkRightMesh, 1, 0.35, 3.2, 0.11);

    // Осевая разметка уходит на кромки островка во время развилки.
    updateLateralStrip(centerDoubleLine1, (r) => toWorld(sampleS[r], -0.22), 0.13, 0.08);
    updateLateralStrip(centerDoubleLine2, (r) => toWorld(sampleS[r], 0.22), 0.13, 0.08);
    updateLateralStrip(edgeLineLeft, (r) => -(sampleHalf[r] + spreadAt(sampleS[r]) - 0.32), 0.16, 0.025);
    updateLateralStrip(edgeLineRight, (r) => sampleHalf[r] + spreadAt(sampleS[r]) - 0.32, 0.16, 0.025);

    shareRoadNormals();
    updateSlopeRibbons();
    if (Number.isNaN(lastSlopeShadeS) || Math.abs(playerS - lastSlopeShadeS) >= 4) {
      lastSlopeShadeS = playerS;
      shadeSlope(slopeLeftMesh.geometry);
      shadeSlope(slopeRightMesh.geometry);
    }

    updateIsland(playerS);

    const dense = true;
    if (Number.isNaN(lastDashS) || Math.abs(playerS - lastDashS) >= 8 || lastDashBiome !== G.biomeDominant) {
      lastDashS = playerS;
      lastDashBiome = G.biomeDominant;
      updateDashes(playerS, dense);
      updateBarrier(playerS, dense);
    }
  }
  let lastSlopeShadeS = NaN;
  G.updateRoadSurface = updateRoadSurface;
}
