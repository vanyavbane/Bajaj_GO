import * as THREE from 'three';
import { G } from './state.js';
import { EXIT_DIVERGE, EXIT_RUN, shoulderLats, worldEdge } from './engine/fork.js';

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

  /* Точка на дороге со сдвигом оси развилки — как placeOnRoad, но без поворота. */
  const _laneA = new THREE.Vector3();
  const _laneB = new THREE.Vector3();
  const _laneDir = new THREE.Vector3();
  const _laneRight = new THREE.Vector3();
  const _laneUp = new THREE.Vector3();
  const _laneZ = new THREE.Vector3();
  const _laneBasis = new THREE.Matrix4();
  const _laneQuat = new THREE.Quaternion();

  function roadPointAt(out, s, lat, yOffset) {
    const dx = G.roadDX(s);
    const lh = Math.hypot(dx, 1) || 1;
    const total = lat + (G.forkCenterShiftAtS ? G.forkCenterShiftAtS(s) : 0);
    out.set(G.roadX(s) + total / lh, G.roadY(s) + yOffset, -s + total * dx / lh);
    return out;
  }

  /* Кладёт плоский объект вдоль линии между двумя точками ветки (s ∓ halfLen).
   * Касательная берётся по самой линии полосы, а не по оси дороги: на
   * разъезде ветка уходит вбок, и штрих, повёрнутый по оси, стоял бы поперёк
   * своей полосы (до ~33° и ~2 м ошибки на концах). */
  function placeAlongLane(obj, s, latA, latB, halfLen, yOffset) {
    roadPointAt(_laneA, s - halfLen, latA, 0);
    roadPointAt(_laneB, s + halfLen, latB, 0);
    _laneDir.subVectors(_laneB, _laneA);
    if (_laneDir.lengthSq() < 1e-8) _laneDir.set(0, 0, -1);
    else _laneDir.normalize();
    _laneRight.set(-_laneDir.z, 0, _laneDir.x);
    if (_laneRight.lengthSq() < 1e-8) _laneRight.set(1, 0, 0);
    else _laneRight.normalize();
    _laneUp.crossVectors(_laneRight, _laneDir).normalize();
    _laneZ.copy(_laneDir).negate();
    _laneBasis.makeBasis(_laneRight, _laneUp, _laneZ);
    _laneQuat.setFromRotationMatrix(_laneBasis);
    obj.quaternion.copy(_laneQuat);
    obj.position.set(
      (_laneA.x + _laneB.x) * 0.5,
      (_laneA.y + _laneB.y) * 0.5 + yOffset,
      (_laneA.z + _laneB.z) * 0.5
    );
  }

  function sampleCenterline(playerS) {
    for (let r = 0; r < ROW; r++) {
      const frac = r / RIBBON_SEGS;
      const s = playerS - RIBBON_BEHIND + (1 - frac) * RIBBON_LEN;
      const dx = G.roadDX(s);
      const lh = Math.hypot(dx, 1) || 1;
      sampleS[r] = s;
      const rx = 1 / lh;
      const rz = dx / lh;
      const shift = G.forkCenterShiftAtS(s);
      sampleX[r] = G.roadX(s) + rx * shift;
      sampleY[r] = G.roadY(s);
      sampleZ[r] = -s + rz * shift;
      sampleCity[r] = G.cityWeightAtS(s);
      sampleHalf[r] = widthAt(s) * 0.5;
      rightX[r] = rx;
      rightZ[r] = rz;
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
  // Обе ленты асфальта — основная и правая половина на развилке — мокнут
  // вместе: погода красит весь список через js/weather.js.
  G.roadWetMats = [G.M.road, roadRightMat];
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

  /** Внешний асфальт: за живой лентой, без умирающего съезда. */
  function farAsphalt(s, side) {
    return Math.abs(worldEdge(G.roadEdgesAt(s), side < 0 ? -1 : 1));
  }

  function shadeSlope(geo, side) {
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
      const asphalt = farAsphalt(sampleS[r], side);
      const cityOuter = sh.cityEdge * sampleCity[r];
      const lat = shoulderLats(asphalt, cityOuter, sh);
      write(0, -lat.far, -lat.berm, sh.farY, sh.bermY);
      write(1, -lat.far, -lat.lip, sh.farY, sh.lipY);
      write(2, -lat.berm, -lat.lip, sh.bermY, sh.lipY);
    }
    geo.attributes.normal.needsUpdate = true;
  }

  /* ---------------- Разметка полос (инстансы) ---------------- */
  const MAX_DASHES = 384;
  const DASH_LEN = 4.2;
  const DASH_HALF = DASH_LEN * 0.5;
  const dashGeo = new THREE.BoxGeometry(0.15, 0.035, DASH_LEN);
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

  function updateDashes(playerS, dense) {
    const spacing = 11;
    const startDashS = Math.floor((playerS - 20) / spacing) * spacing;
    let used = 0;
    for (let k = 0; k < 32 && dense; k++) {
      const s = startDashS + k * spacing;
      if (s < playerS - RIBBON_BEHIND + 2) continue;
      // На стыке биомов наборы штрихов перетекают: штрих укорачивается
      // по весу и растворяется, вместо мгновенной смены числа полос.
      for (const mark of G.laneMarksAtS(s)) {
        if (used >= MAX_DASHES) break;
        dummy.scale.set(1, 1, mark.w);
        placeAlongLane(
          dummy, s,
          toWorld(s - DASH_HALF, mark.lat),
          toWorld(s + DASH_HALF, mark.lat),
          DASH_HALF, 0.03
        );
        dummy.updateMatrix();
        dashMesh.setMatrixAt(used++, dummy.matrix);
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
    const weight = G.mkadWeightAtS(s);
    const split = G.splitAmountAtS(s);
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
      const weight = G.mkadWeightAtS(s);
      const split = G.splitAmountAtS(s);
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

  /* ---------------- Отбойники вдоль кромки асфальта ----------------
     Балка тянется по фактической кромке полосы (включая разъезд развилки),
     поэтому силуэт дороги повторяется без изломов. Прямые 20-метровые секции
     слотов давали ступеньки на поворотах и на разъезде. Отбойник живёт только
     в городе и на МКАД: толщина и высота гаснут вместе с весом биома. */
  const GUARD_OFFSET = 0.55;
  const GUARD_HALF = 0.09;
  const GUARD_MID = 0.52;
  const GUARD_LOW = 0.40;
  const GUARD_HIGH = 0.64;

  const guardMat = G.M.chrome.clone();
  guardMat.side = THREE.DoubleSide;

  function makeGuardRibbon() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ROW * 4 * 3), 3));
    const idx = [];
    for (let r = 0; r < ROW - 1; r++) {
      const a = r * 4;
      const b = (r + 1) * 4;
      for (let k = 0; k < 4; k++) {
        const k2 = (k + 1) % 4;
        idx.push(a + k, a + k2, b + k2, a + k, b + k2, b + k);
      }
    }
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, guardMat);
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.visible = false;
    G.scene.add(mesh);
    return mesh;
  }

  const guardLeftMesh = makeGuardRibbon();
  const guardRightMesh = makeGuardRibbon();

  function updateGuardRibbon(mesh, side) {
    const pos = mesh.geometry.attributes.position;
    const arr = pos.array;
    let maxWeight = 0;
    for (let r = 0; r < ROW; r++) {
      const s = sampleS[r];
      const weight = Math.max(G.cityWeightAtS(s), G.mkadWeightAtS(s));
      if (weight > maxWeight) maxWeight = weight;
      const vis = weight > 0.02 ? weight : 0;
      const lat = G.roadOuterLat(s, side) + side * GUARD_OFFSET;
      const half = GUARD_HALF * vis;
      const low = GUARD_MID + (GUARD_LOW - GUARD_MID) * vis;
      const high = GUARD_MID + (GUARD_HIGH - GUARD_MID) * vis;
      const cx = sampleX[r], cy = sampleY[r], cz = sampleZ[r];
      const rx = rightX[r], rz = rightZ[r];
      const o = r * 12;
      const put = (slot, l, h) => {
        const p = o + slot * 3;
        arr[p] = cx + rx * l;
        arr[p + 1] = cy + h;
        arr[p + 2] = cz + rz * l;
      };
      put(0, lat - half, low);
      put(1, lat + half, low);
      put(2, lat + half, high);
      put(3, lat - half, high);
    }
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.visible = maxWeight > 0.02;
  }

  const GUARD_POST_STEP = 8;
  const MAX_GUARD_POSTS = 128;
  const guardPostMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.22, 0.62, 0.22), guardMat, MAX_GUARD_POSTS
  );
  guardPostMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  guardPostMesh.frustumCulled = false;
  guardPostMesh.castShadow = true;
  G.scene.add(guardPostMesh);

  function updateGuardPosts(playerS) {
    const start = Math.floor((playerS - RIBBON_BEHIND) / GUARD_POST_STEP) * GUARD_POST_STEP;
    const end = playerS - RIBBON_BEHIND + RIBBON_LEN;
    let used = 0;
    for (let s = start; s <= end && used + 2 <= MAX_GUARD_POSTS; s += GUARD_POST_STEP) {
      const weight = Math.max(G.cityWeightAtS(s), G.mkadWeightAtS(s));
      if (weight <= 0.02) continue;
      for (const side of [-1, 1]) {
        if (used >= MAX_GUARD_POSTS) break;
        const lat = G.roadOuterLat(s, side) + side * GUARD_OFFSET;
        dummy.scale.set(weight, weight, weight);
        G.placeOnRoad(dummy, s, lat, 0.31 * weight);
        dummy.updateMatrix();
        guardPostMesh.setMatrixAt(used++, dummy.matrix);
      }
    }
    for (let i = used; i < MAX_GUARD_POSTS; i++) guardPostMesh.setMatrixAt(i, hidden);
    guardPostMesh.count = used;
    guardPostMesh.instanceMatrix.needsUpdate = true;
    guardPostMesh.visible = used > 0;
  }

  /* ---------------- Ленты с переменной шириной ---------------- */
  function updateRoadRibbon() {
    roadRightMat.envMapIntensity = G.M.road.envMapIntensity;
    gapMat.color.copy(G.M.grass.color);
    const posL = roadMesh.geometry.attributes.position;
    const posR = roadRightMesh.geometry.attributes.position;
    const posG = forkGapMesh.geometry.attributes.position;
    let opened = 0;
    for (let r = 0; r < ROW; r++) {
      const edge = G.roadEdgesAt(sampleS[r]);
      const gap = edge.rightInner - edge.leftInner;
      if (gap > opened) opened = gap;
      const cx = sampleX[r], cy = sampleY[r], cz = sampleZ[r];
      const rx = rightX[r], rz = rightZ[r];
      const idx = r * 2;
      posL.setXYZ(idx, cx + rx * edge.leftOuter, cy, cz + rz * edge.leftOuter);
      posL.setXYZ(idx + 1, cx + rx * edge.leftInner, cy, cz + rz * edge.leftInner);
      posR.setXYZ(idx, cx + rx * edge.rightInner, cy, cz + rz * edge.rightInner);
      posR.setXYZ(idx + 1, cx + rx * edge.rightOuter, cy, cz + rz * edge.rightOuter);
      posG.setXYZ(idx, cx + rx * edge.leftInner, cy, cz + rz * edge.leftInner);
      posG.setXYZ(idx + 1, cx + rx * edge.rightInner, cy, cz + rz * edge.rightInner);
    }
    posL.needsUpdate = true;
    posR.needsUpdate = true;
    posG.needsUpdate = true;
    forkGapMesh.visible = opened > 0.35;
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
      const asphalt = Math.abs(G.roadOuterLat(sampleS[r], side));
      const inner = asphalt + baseWidth * cw;
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
      const cityOuter = G.shoulder.cityEdge * sampleCity[r];
      const sh = G.shoulder;
      const left = shoulderLats(farAsphalt(sampleS[r], -1), cityOuter, sh);
      const right = shoulderLats(farAsphalt(sampleS[r], 1), cityOuter, sh);
      const idx = r * 3;
      posL.setXYZ(idx,     cx + rx * -left.far, cy + sh.farY, cz + rz * -left.far);
      posL.setXYZ(idx + 1, cx + rx * -left.berm, cy + sh.bermY, cz + rz * -left.berm);
      posL.setXYZ(idx + 2, cx + rx * -left.lip, cy + sh.lipY, cz + rz * -left.lip);

      posR.setXYZ(idx,     cx + rx * right.lip, cy + sh.lipY, cz + rz * right.lip);
      posR.setXYZ(idx + 1, cx + rx * right.berm, cy + sh.bermY, cz + rz * right.berm);
      posR.setXYZ(idx + 2, cx + rx * right.far, cy + sh.farY, cz + rz * right.far);
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

  /* Красный знак «∧» из центра развилки убран: там лесопарковая зона
   * (js/forkPark.js). Стрелки и цветные линии остались на асфальте. */

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

  function innerLineLat(s, side, inset) {
    const edge = G.roadEdgesAt(s);
    return side < 0 ? edge.leftInner - inset : edge.rightInner + inset;
  }

  /** Цветная линия вдоль внутренней кромки ветки. inset 0.38 на прямой даёт ±0.22. */
  function updateIslandStrip(mesh, side) {
    const splitS = splitCenterS(G.playerS);
    const from = splitS;
    const span = EXIT_DIVERGE + EXIT_RUN;
    const halfW = 0.13;
    const pos = mesh.geometry.attributes.position;
    for (let r = 0; r < ISLAND_ROWS; r++) {
      const s = from + span * (r / (ISLAND_ROWS - 1));
      const dx = G.roadDX(s);
      const lh = Math.hypot(dx, 1) || 1;
      const rx = 1 / lh;
      const rz = dx / lh;
      const lat = innerLineLat(s, side, 0.2) + G.forkCenterShiftAtS(s);
      const cx = G.roadX(s), cy = G.roadY(s) + 0.09, cz = -s;
      const idx = r * 2;
      pos.setXYZ(idx, cx + rx * (lat - halfW), cy, cz + rz * (lat - halfW));
      pos.setXYZ(idx + 1, cx + rx * (lat + halfW), cy, cz + rz * (lat + halfW));
    }
    pos.needsUpdate = true;
  }

  function updateIsland(playerS) {
    const splitS = splitCenterS(playerS);
    const amount = G.splitAmountAtS(splitS + EXIT_DIVERGE);
    const active = amount > 0.2;

    const choices = G.splitState && G.splitState.choices ? G.splitState.choices : null;
    const leftBiome = choices ? G.BIOMES[choices[0]] : null;
    const rightBiome = choices ? G.BIOMES[choices[1]] : null;
    if (leftBiome) accentLineMatL.color.setHex(leftBiome.accent);
    if (rightBiome) accentLineMatR.color.setHex(rightBiome.accent);
    arrowLeftA.material.color.setHex(leftBiome ? leftBiome.accent : 0x4fc3f7);
    arrowLeftB.material.color.copy(arrowLeftA.material.color);
    arrowRightA.material.color.setHex(rightBiome ? rightBiome.accent : 0xff7043);
    arrowRightB.material.color.copy(arrowRightA.material.color);

    // Цветные линии вдоль внутренней кромки каждой ветки, на асфальте.
    accentLineL.visible = active;
    accentLineR.visible = active;
    if (active) {
      updateIslandStrip(accentLineL, -1);
      updateIslandStrip(accentLineR, 1);
    }

    // Прямые стрелки остаются на основной дороге. Стрелки съезда — на его ленте.
    const exitCenterAt = (s) => {
      const edge = G.roadEdgesAt(s);
      const width = edge.rightOuter - edge.rightInner;
      if (width < 1.2) return null;
      return (edge.rightInner + edge.rightOuter) * 0.5;
    };
    const forward = [
      { mesh: arrowLeftA, s: splitS + 40 },
      { mesh: arrowLeftB, s: splitS + EXIT_DIVERGE * 0.7 }
    ];
    for (const a of forward) {
      a.mesh.visible = active;
      if (!active) continue;
      placeAlongLane(a.mesh, a.s, 0, 0, 2.4, 0.055);
    }
    const exiting = [
      { mesh: arrowRightA, s: splitS + 40 },
      { mesh: arrowRightB, s: splitS + EXIT_DIVERGE * 0.7 }
    ];
    for (const a of exiting) {
      const lat = active ? exitCenterAt(a.s) : null;
      a.mesh.visible = lat != null;
      if (lat == null) continue;
      placeAlongLane(a.mesh, a.s, lat, lat, 2.4, 0.055);
    }
  }

  /* ---------------- Главный апдейт ---------------- */
  const flatStrips = [
    curbLeftMesh, curbRightMesh, sidewalkLeftMesh, sidewalkRightMesh,
    centerDoubleLine1, centerDoubleLine2, edgeLineLeft, edgeLineRight
  ];

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

    // Осевая на прямой — пара жёлтых у оси. На развилке каждая уходит
    // на внутренний край своей ветки и остаётся на асфальте, не в траве.
    updateLateralStrip(centerDoubleLine1, (r) => innerLineLat(sampleS[r], -1, 0.38), 0.13, 0.08);
    updateLateralStrip(centerDoubleLine2, (r) => innerLineLat(sampleS[r], 1, 0.38), 0.13, 0.08);
    updateLateralStrip(edgeLineLeft, (r) => G.roadOuterLat(sampleS[r], -1) + 0.32, 0.16, 0.025);
    updateLateralStrip(edgeLineRight, (r) => G.roadOuterLat(sampleS[r], 1) - 0.32, 0.16, 0.025);

    shareRoadNormals();
    updateSlopeRibbons();
    if (Number.isNaN(lastSlopeShadeS) || Math.abs(playerS - lastSlopeShadeS) >= 4) {
      lastSlopeShadeS = playerS;
      shadeSlope(slopeLeftMesh.geometry, -1);
      shadeSlope(slopeRightMesh.geometry, 1);
    }

    updateIsland(playerS);
    updateDashes(playerS, true);
    updateBarrier(playerS, true);
    updateGuardRibbon(guardLeftMesh, -1);
    updateGuardRibbon(guardRightMesh, 1);
    updateGuardPosts(playerS);
  }
  let lastSlopeShadeS = NaN;
  G.updateRoadSurface = updateRoadSurface;
}
