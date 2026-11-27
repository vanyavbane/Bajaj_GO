import * as THREE from 'three';
import { G } from './state.js';
import { EXIT_DIVERGE, EXIT_RUN, exitClock, roadsJoined } from './engine/fork.js';
import { asphaltShell, followAsphalt, innerTrackEdge, outerRibbon, pinchAsphalt, pinchShell, walkCrossing } from './engine/asphalt.js';
import { stripSeam } from './engine/roadside.js';

/** Конец отрыва: цветная линия ветки идёт от носа до того места, где дороги уже разошлись. */
const EXIT_SPAN = exitClock().ownAfter;

export function initRoadSurface() {

  /* =========================================================================
   * 5. ДОРОЖНОЕ ПОЛОТНО, РАЗМЕТКА, РАЗВИЛКА И ТРОТУАРЫ
   * Земля — отдельный слой, js/ground.js.
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
  const sampleY = new Float32Array(ROW);
  const sampleCity = new Float32Array(ROW);
  const solidLat = [new Float32Array(ROW), new Float32Array(ROW)];

  const _laneDir = new THREE.Vector3();
  const _laneRight = new THREE.Vector3();
  const _laneUp = new THREE.Vector3();
  const _laneZ = new THREE.Vector3();
  const _laneBasis = new THREE.Matrix4();
  const _laneQuat = new THREE.Quaternion();

  function roadCenter(s) {
    return G.roadOriginAt(s);
  }

  let roadShells = [];

  function shellAt(row) {
    return roadShells[row] ?? null;
  }

  /** Предыдущий ряд сходится в свою точку. */
  function pinchRow(pos, row, verts) {
    if (row < 1) return;
    const base = (row - 1) * verts;
    let x = 0;
    let y = 0;
    let z = 0;
    for (let i = 0; i < verts; i++) {
      x += pos.getX(base + i);
      y += pos.getY(base + i);
      z += pos.getZ(base + i);
    }
    x /= verts;
    y /= verts;
    z /= verts;
    for (let i = 0; i < verts; i++) pos.setXYZ(base + i, x, y, z);
  }

  /** Разрыв ленты. Оба ряда сходятся в точку старого места, квад между ними без площади.
   *  Следующий ряд надо поставить точкой уже на новой кромке: иначе клин тянется через прыжок. */
  function capRow(pos, row, verts) {
    pinchRow(pos, row, verts);
    if (row < 1) return;
    const base = (row - 1) * verts;
    const x = pos.getX(base);
    const y = pos.getY(base);
    const z = pos.getZ(base);
    const here = row * verts;
    for (let i = 0; i < verts; i++) pos.setXYZ(here + i, x, y, z);
  }

  function shellMid(row) {
    const shell = shellAt(row);
    if (!shell) return roadCenter(sampleS[row]);
    return (shell.left + shell.right) * 0.5;
  }

  function ribbonAt(row, side) {
    return outerRibbon(G.roadEdgesAt(sampleS[row]), side);
  }

  /* Кладёт плоский объект вдоль курса в точке s.
   * Направление берётся из заголовка этой полосы: на съезде это вектор ветки,
   * а не ось шоссе, поэтому штрих не встаёт поперёк ленты. */
  function placeAlongLane(obj, s, latA, latB, yOffset) {
    const pose = G.embedRoad(s, (latA + latB) * 0.5);
    const dy = G.roadDY(s);
    _laneDir.set(pose.fx, dy, pose.fz);
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
    obj.position.set(pose.x, pose.y + yOffset, pose.z);
  }

  function sampleCenterline(playerS) {
    for (let r = 0; r < ROW; r++) {
      const frac = r / RIBBON_SEGS;
      const s = playerS - RIBBON_BEHIND + (1 - frac) * RIBBON_LEN;
      sampleS[r] = s;
      sampleY[r] = G.roadY(s);
      sampleCity[r] = G.cityWeightAtS(s);
    }
    if (G.rememberRibbonHeadings) G.rememberRibbonHeadings(sampleS);
  }

  function sampleMarkLats() {
    for (let r = 0; r < ROW; r++) {
      const s = sampleS[r];
      const marks = G.solidMarksAtS(s);
      solidLat[0][r] = marks[0] ? marks[0].lat : NaN;
      solidLat[1][r] = marks[1] ? marks[1].lat : NaN;
    }
  }

  function storedLat(buf) {
    return (r) => {
      const lat = buf[r];
      return Number.isNaN(lat) ? null : lat;
    };
  }
  const solidAt0 = storedLat(solidLat[0]);
  const solidAt1 = storedLat(solidLat[1]);

  /* ---------------- Геометрия лент ---------------- */
  function shadeStrip(geo) {
    const pos = geo.attributes.position.array;
    const norm = geo.attributes.normal.array;
    for (let r = 0; r < ROW; r++) {
      const ahead = r < ROW - 1;
      const r2 = ahead ? r + 1 : r - 1;
      const sign = ahead ? 1 : -1;
      const a = r * 6;
      const b = r2 * 6;
      const ax = ((pos[b] + pos[b + 3]) * 0.5 - (pos[a] + pos[a + 3]) * 0.5) * sign;
      const ay = ((pos[b + 1] + pos[b + 4]) * 0.5 - (pos[a + 1] + pos[a + 4]) * 0.5) * sign;
      const az = ((pos[b + 2] + pos[b + 5]) * 0.5 - (pos[a + 2] + pos[a + 5]) * 0.5) * sign;
      const bx = pos[a + 3] - pos[a];
      const bz = pos[a + 5] - pos[a + 2];
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
  // Положительный сдвиг уводил асфальт +1 полосы под текстуру биома.
  // Небольшой отрицательный держит его над землёй, но под разметкой (-2).
  roadRightMat.polygonOffsetFactor = -1;
  roadRightMat.polygonOffsetUnits = -1;
  const roadRightMesh = makeRibbon(1, roadRightMat);
  // Обе ленты асфальта — основная и правая половина на развилке — мокнут
  // вместе: погода красит весь список через js/weather.js.
  G.roadWetMats = [G.M.road, roadRightMat];
  const gapMat = G.M.grass.clone();
  gapMat.polygonOffset = true;
  gapMat.polygonOffsetFactor = -0.5;
  gapMat.polygonOffsetUnits = -0.5;
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
  const edgeLineLeftB = makeRibbon(0.16, G.M.lineWhite);
  const edgeLineRightB = makeRibbon(0.16, G.M.lineWhite);

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

  for (const mesh of [sidewalkLeftMesh, sidewalkRightMesh, curbLeftMesh, curbRightMesh]) {
    mesh.receiveShadow = false;
  }

  /* ---------------- Разметка полос (инстансы) ---------------- */
  const MAX_DASHES = 768;
  const DASH_LEN = 4.2;
  const dashGeo = new THREE.BoxGeometry(0.15, 0.035, DASH_LEN);
  const dashMesh = new THREE.InstancedMesh(dashGeo, G.M.lineWhite, MAX_DASHES);
  dashMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  dashMesh.frustumCulled = false;
  dashMesh.receiveShadow = true;
  G.scene.add(dashMesh);

  /* Бетонный отбойник по оси МКАД. Сплошной участок 90 м, проезд 10 м.
     Сетка привязана к абсолютным метрам, поэтому проезд не съезжает. */
  const BARRIER_PERIOD = 100;
  const BARRIER_GAP = 10;
  const BARRIER_HALF_W = 0.31;
  const MAX_BLOCKS = 192;
  const blockGeo = new THREE.BoxGeometry(0.62, 0.92, 3.6);
  const blockMesh = new THREE.InstancedMesh(blockGeo, G.M.concrete, MAX_BLOCKS);
  blockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  blockMesh.frustumCulled = false;
  blockMesh.castShadow = true;
  G.scene.add(blockMesh);

  const dummy = new THREE.Object3D();

  /* Зебра — кусок тротуара поперёк съезда. Полоса идёт от кромки до кромки. */
  const CROSS_BARS = 6;
  const crossMat = G.M.lineWhite.clone();
  crossMat.polygonOffset = true;
  crossMat.polygonOffsetFactor = -2;
  crossMat.polygonOffsetUnits = -2;
  const crossMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.04, 0.48), crossMat, CROSS_BARS);
  crossMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  crossMesh.frustumCulled = false;
  crossMesh.receiveShadow = false;
  crossMesh.visible = false;
  G.scene.add(crossMesh);

  /** Полоса между двумя точками асфальта. Длина — расстояние между кромками. */
  function placeEdgeToEdge(obj, a, b, yOffset) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.4) return false;
    _laneRight.set(dx / len, 0, dz / len);
    _laneUp.set(0, 1, 0);
    _laneZ.set(-_laneRight.z, 0, _laneRight.x);
    _laneBasis.makeBasis(_laneRight, _laneUp, _laneZ);
    _laneQuat.setFromRotationMatrix(_laneBasis);
    obj.quaternion.copy(_laneQuat);
    obj.position.set((a.x + b.x) * 0.5, (a.y + b.y) * 0.5 + yOffset, (a.z + b.z) * 0.5);
    obj.scale.set(len, 1, 1);
    return true;
  }

  function updateCrosswalk() {
    const nose = G.splitCenterS(G.playerS);
    const walk = G.shoulder.cityEdge;
    let at = null;
    if (G.cityWeightAtS(nose) > 0.15) {
      for (let d = 0; d <= 80; d += 1) {
        if (walkCrossing(G.roadEdgesAt(nose + d), walk)) {
          at = nose + d;
          break;
        }
      }
    }
    let used = 0;
    if (at != null) {
      for (let i = 0; i < CROSS_BARS; i++) {
        const s = at + i * 0.95;
        const span = walkCrossing(G.roadEdgesAt(s), walk);
        if (!span) continue;
        const near = G.embedRoad(s, span.near);
        const far = G.embedRoad(s, span.far);
        if (!placeEdgeToEdge(dummy, near, far, 0.05)) continue;
        dummy.updateMatrix();
        crossMesh.setMatrixAt(used++, dummy.matrix);
      }
    }
    crossMesh.count = used;
    crossMesh.visible = used > 0;
    if (used > 0) crossMesh.instanceMatrix.needsUpdate = true;
  }

  function updateDashes(playerS, dense) {
    const spacing = 11;
    const startDashS = Math.floor((playerS - 20) / spacing) * spacing;
    let used = 0;
    const paint = (s, back, ahead, w) => {
      if (used >= MAX_DASHES) return;
      dummy.scale.set(1, 1, w);
      placeAlongLane(dummy, s, back, ahead, 0.03);
      dummy.updateMatrix();
      dashMesh.setMatrixAt(used++, dummy.matrix);
    };
    for (let k = 0; k < 32 && dense; k++) {
      const s = startDashS + k * spacing;
      if (s < playerS - RIBBON_BEHIND + 2) continue;
      // Штрих стоит на оси той проезжей части, чьи полосы его породили.
      for (const mark of G.laneMarksAtS(s)) paint(s, mark.lat, mark.lat, mark.w);
    }
    dashMesh.count = used;
    if (used > 0) dashMesh.instanceMatrix.needsUpdate = true;
  }

  function barrierGapAt(s) {
    const meters = (Number.isFinite(G.biomeOffsetM) ? G.biomeOffsetM : 0) + s;
    const local = ((meters % BARRIER_PERIOD) + BARRIER_PERIOD) % BARRIER_PERIOD;
    return local >= BARRIER_PERIOD - BARRIER_GAP;
  }

  /** Бетон стоит на границе хода дороги МКАД. Чужая пришедшая дорога его не получает. */
  function barrierLats(s) {
    const lats = G.medianLatsAt(s);
    return Array.isArray(lats) ? lats : [];
  }

  G.medianBlocksBike = (s, worldLat, halfPlayer) => {
    const weight = G.mkadWeightAtS(s);
    if (weight < 0.55 || barrierGapAt(s)) return null;
    const reach = BARRIER_HALF_W + halfPlayer;
    let nearest = null;
    let best = Infinity;
    for (const lat of barrierLats(s)) {
      const gap = Math.abs(worldLat - lat);
      if (gap < reach && gap < best) {
        best = gap;
        nearest = lat;
      }
    }
    if (nearest == null) return null;
    return { lat: nearest, clear: reach + 0.12 };
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
      const vis = weight > 0.08 && !barrierGapAt(s) ? weight : 0;
      if (vis <= 0.02) continue;
      for (const lat of barrierLats(s)) {
        if (used >= MAX_BLOCKS) break;
        dummy.scale.set(1, vis, 1);
        G.placeOnRoad(dummy, s, lat, 0.46 * vis);
        dummy.updateMatrix();
        blockMesh.setMatrixAt(used++, dummy.matrix);
      }
    }
    blockMesh.count = used;
    if (used > 0) blockMesh.instanceMatrix.needsUpdate = true;
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

  // Плоский цвет: с камеры позади байка тёмная грань стойки после тональной
  // коррекции становится чёрным квадратом и читается как пятно на асфальте.
  const guardMat = new THREE.MeshBasicMaterial({ color: 0xd5dde4 });
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
    mesh.castShadow = false;
    mesh.frustumCulled = false;
    mesh.visible = false;
    G.scene.add(mesh);
    return mesh;
  }

  const guardLeftMesh = makeGuardRibbon();
  const guardRightMesh = makeGuardRibbon();

  function updateGuardRibbon(mesh, side) {
    if (!metroAhead()) {
      mesh.visible = false;
      return;
    }
    const pos = mesh.geometry.attributes.position;
    const arr = pos.array;
    let maxWeight = 0;
    let prevEdge = null;
    for (let r = 0; r < ROW; r++) {
      const s = sampleS[r];
      const weight = Math.max(G.cityWeightAtS(s), G.mkadWeightAtS(s));
      if (weight > maxWeight) maxWeight = weight;
      const edge = ribbonAt(r, side)?.edge ?? null;
      const jumped = stripSeam(prevEdge, edge);
      if (edge != null) prevEdge = edge;
      const vis = jumped ? 0 : (weight > 0.02 && edge != null ? weight : 0);
      const lat = edge == null ? shellMid(r) : edge + (side < 0 ? -GUARD_OFFSET : GUARD_OFFSET);
      const half = GUARD_HALF * vis;
      const low = GUARD_MID + (GUARD_LOW - GUARD_MID) * vis;
      const high = GUARD_MID + (GUARD_HIGH - GUARD_MID) * vis;
      const cy = sampleY[r];
      const course = edge == null ? lat : edge;
      const left = G.embedBeside(s, course, lat - half);
      const right = G.embedBeside(s, course, lat + half);
      const o = r * 12;
      const put = (slot, point, h) => {
        const p = o + slot * 3;
        arr[p] = point.x;
        arr[p + 1] = cy + h;
        arr[p + 2] = point.z;
      };
      put(0, left, low);
      put(1, right, low);
      put(2, right, high);
      put(3, left, high);
      if (jumped) pinchRow(pos, r, 4);
    }
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.visible = maxWeight > 0.02;
  }

  function metroAhead() {
    for (let r = 0; r < ROW; r++) {
      if (sampleCity[r] > 0.02 || G.mkadWeightAtS(sampleS[r]) > 0.02) return true;
    }
    return false;
  }

  const GUARD_POST_STEP = 8;
  const MAX_GUARD_POSTS = 128;
  const guardPostMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.22, 0.62, 0.22), guardMat, MAX_GUARD_POSTS
  );
  guardPostMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  guardPostMesh.frustumCulled = false;
  guardPostMesh.castShadow = false;
  G.scene.add(guardPostMesh);

  function updateGuardPosts(playerS) {
    const start = Math.floor((playerS - RIBBON_BEHIND) / GUARD_POST_STEP) * GUARD_POST_STEP;
    const end = playerS - RIBBON_BEHIND + RIBBON_LEN;
    let used = 0;
    for (let s = start; s <= end && used + 2 <= MAX_GUARD_POSTS; s += GUARD_POST_STEP) {
      const weight = Math.max(G.cityWeightAtS(s), G.mkadWeightAtS(s));
      if (weight <= 0.02) continue;
      const row = rowNear(s);
      for (const side of [-1, 1]) {
        if (used >= MAX_GUARD_POSTS) break;
        const edge = ribbonAt(row, side)?.edge ?? null;
        if (edge == null) continue;
        const lat = edge + (side < 0 ? -GUARD_OFFSET : GUARD_OFFSET);
        dummy.scale.set(weight, weight, weight);
        G.placeBeside(dummy, s, edge, lat, 0.31 * weight);
        dummy.updateMatrix();
        guardPostMesh.setMatrixAt(used++, dummy.matrix);
      }
    }
    guardPostMesh.count = used;
    guardPostMesh.visible = used > 0;
    if (used > 0) guardPostMesh.instanceMatrix.needsUpdate = true;
  }

  /* ---------------- Ленты с переменной шириной ----------------
     Лента держится за свой асфальт. Старая дорога сходит своей лентой,
     въезд продолжается своей и становится новой дорогой. */
  let roadTracks = [[], []];

  function paintSpan(pos, row, s, y, span) {
    const a = G.embedRoad(s, span.left);
    const b = G.embedRoad(s, span.right);
    const idx = row * 2;
    pos.setXYZ(idx, a.x, y, a.z);
    pos.setXYZ(idx + 1, b.x, y, b.z);
  }

  function gapBetween(a, b) {
    const aw = a.right - a.left;
    const bw = b.right - b.left;
    if (aw < 0.05 || bw < 0.05) return null;
    const aMid = (a.left + a.right) * 0.5;
    const bMid = (b.left + b.right) * 0.5;
    const lo = aMid <= bMid ? a : b;
    const hi = aMid <= bMid ? b : a;
    if (hi.left - lo.right < 0.35) return null;
    return { left: lo.right, right: hi.left };
  }

  function updateRoadRibbon() {
    gapMat.color.copy(G.M.grass.color);
    const raw = [];
    let prev = [null, null];
    for (let r = 0; r < ROW; r++) {
      prev = followAsphalt(prev, G.roadEdgesAt(sampleS[r]));
      raw.push(prev);
    }
    roadTracks = pinchAsphalt(raw);
    roadShells = pinchShell(roadTracks[0].map((span, row) => asphaltShell([span, roadTracks[1][row]])));
    const posL = roadMesh.geometry.attributes.position;
    const posR = roadRightMesh.geometry.attributes.position;
    const posG = forkGapMesh.geometry.attributes.position;
    let opened = 0;
    for (let r = 0; r < ROW; r++) {
      const s = sampleS[r];
      const y = sampleY[r];
      paintSpan(posL, r, s, y, roadTracks[0][r]);
      paintSpan(posR, r, s, y, roadTracks[1][r]);
      const gap = gapBetween(roadTracks[0][r], roadTracks[1][r]);
      if (gap) opened = Math.max(opened, gap.right - gap.left);
      const fill = gap ?? { left: roadTracks[0][r].left, right: roadTracks[0][r].left };
      paintSpan(posG, r, s, y, fill);
    }
    posL.needsUpdate = true;
    posR.needsUpdate = true;
    posG.needsUpdate = true;
    forkGapMesh.visible = opened > 0.35;
  }

  /** Белая кромка своей ленты. У схлопнутой ленты линии нет.
   *  Пока съезд ещё одно полотно с шоссе, шов между ними не рисуется:
   *  край дороги там, куда доходит руль. */
  function trackEdge(track, row, side) {
    const span = roadTracks[track][row];
    if (!span) return null;
    const width = span.right - span.left;
    if (width < 0.7) return null;
    const edges = G.roadEdgesAt(sampleS[row]);
    if (roadsJoined(edges)) {
      const at = side < 0 ? span.left : span.right;
      const onShell = Math.abs(at - edges.leftOuter) < 0.35 || Math.abs(at - edges.rightOuter) < 0.35;
      if (!onShell) return null;
    }
    const inset = Math.min(0.32, width * 0.25);
    return side < 0 ? span.left + inset : span.right - inset;
  }

  /** Лента, у которой центр и ширина в мировых метрах зависят от точки s. */
  function updateLateralStrip(mesh, latAt, width, yOffset) {
    const pos = mesh.geometry.attributes.position;
    const halfW = width * 0.5;
    let hold = null;
    let resume = false;
    for (let r = 0; r < ROW; r++) {
      const lat = latAt(r);
      const s = sampleS[r];
      const y = sampleY[r] + yOffset;
      const idx = r * 2;
      if (resume) {
        const c = G.embedRoad(s, lat == null ? roadCenter(s) : lat);
        pos.setXYZ(idx, c.x, y, c.z);
        pos.setXYZ(idx + 1, c.x, y, c.z);
        hold = { x: c.x, z: c.z };
        resume = false;
        continue;
      }
      if (lat == null) {
        if (hold) {
          pos.setXYZ(idx, hold.x, y, hold.z);
          pos.setXYZ(idx + 1, hold.x, y, hold.z);
        } else {
          const c = G.embedRoad(s, roadCenter(s));
          pos.setXYZ(idx, c.x, y, c.z);
          pos.setXYZ(idx + 1, c.x, y, c.z);
          hold = c;
        }
        continue;
      }
      const a = G.embedRoad(s, lat - halfW);
      const b = G.embedRoad(s, lat + halfW);
      const mid = { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 };
      pos.setXYZ(idx, a.x, y, a.z);
      pos.setXYZ(idx + 1, b.x, y, b.z);
      if (hold && Math.hypot(mid.x - hold.x, mid.z - hold.z) > 6) {
        capRow(pos, r, 2);
        resume = true;
        continue;
      }
      hold = mid;
    }
    pos.needsUpdate = true;
  }

  function rowNear(s) {
    let best = 0;
    let bestD = Infinity;
    for (let r = 0; r < ROW; r++) {
      const distance = Math.abs(sampleS[r] - s);
      if (distance < bestD) {
        bestD = distance;
        best = r;
      }
    }
    return best;
  }

  /** Кромка дороги, у которой тротуар. Пока съезд ещё часть шоссе, это внешний край, куда доходит руль. */
  function roadStripEdge(row, side) {
    const edges = G.roadEdgesAt(sampleS[row]);
    if (side > 0 && roadsJoined(edges)) return edges.rightOuter;
    return side < 0 ? edges.leftOuter : edges.leftInner;
  }

  /** Тротуар и бордюр города: снаружи шоссе, не снаружи съезда. */
  function updateCityStrip(mesh, side, baseWidth, width, yOffset) {
    let maxWeight = 0;
    for (let r = 0; r < ROW; r++) if (sampleCity[r] > maxWeight) maxWeight = sampleCity[r];
    mesh.visible = maxWeight > 0.02;
    if (!mesh.visible) return;
    const pos = mesh.geometry.attributes.position;
    maxWeight = 0;
    let prevEdge = null;
    let resume = false;
    for (let r = 0; r < ROW; r++) {
      const cw = sampleCity[r];
      if (cw > maxWeight) maxWeight = cw;
      const s = sampleS[r];
      const edge = roadStripEdge(r, side);
      const jumped = !resume && stripSeam(prevEdge, edge);
      if (edge != null) prevEdge = edge;
      const y = sampleY[r] + yOffset;
      const idx = r * 2;
      if (resume) {
        const at = edge == null ? shellMid(r) : edge;
        const p = G.embedBeside(s, at, at);
        pos.setXYZ(idx, p.x, y, p.z);
        pos.setXYZ(idx + 1, p.x, y, p.z);
        resume = false;
        continue;
      }
      const outward = side < 0 ? -1 : 1;
      const halfW = edge == null || jumped ? 0 : width * 0.5 * cw;
      const center = (edge == null ? shellMid(r) : edge) + outward * (baseWidth * cw + halfW);
      const course = edge == null ? center : edge;
      const a = G.embedBeside(s, course, center - halfW);
      const b = G.embedBeside(s, course, center + halfW);
      pos.setXYZ(idx, a.x, y, a.z);
      pos.setXYZ(idx + 1, b.x, y, b.z);
      if (jumped) {
        capRow(pos, r, 2);
        resume = true;
      }
    }
    pos.needsUpdate = true;
    mesh.visible = maxWeight > 0.02;
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

  /** Центр ленты в этой точке. Узкая лента центра не даёт. */
  function branchCenter(s, track) {
    const span = followAsphalt([null, null], G.roadEdgesAt(s))[track];
    if (!span || span.right - span.left < 2) return null;
    return (span.left + span.right) * 0.5;
  }

  /** Цветная линия на внутренней кромке своей ленты. На центр другой ленты она не съезжает. */
  function updateIslandStrip(mesh, side) {
    const splitS = G.splitCenterS(G.playerS);
    const from = splitS;
    const span = EXIT_SPAN;
    const raw = [];
    let prev = [null, null];
    const samples = [];
    for (let r = 0; r < ISLAND_ROWS; r++) {
      const s = from + span * (r / (ISLAND_ROWS - 1));
      samples.push(s);
      prev = followAsphalt(prev, G.roadEdgesAt(s));
      raw.push(prev);
    }
    const tracks = pinchAsphalt(raw);
    const track = side < 0 ? 0 : 1;
    const halfW = 0.13;
    const pos = mesh.geometry.attributes.position;
    for (let r = 0; r < ISLAND_ROWS; r++) {
      const here = tracks[track][r];
      const s = samples[r];
      const hideSeam = side > 0 && roadsJoined(G.roadEdgesAt(s));
      const lat = hideSeam ? null : innerTrackEdge(here, side < 0 ? -1 : 1, 0.2);
      const half = lat == null ? 0 : halfW;
      const at = lat == null ? (here ? (here.left + here.right) * 0.5 : 0) : lat;
      const a = G.embedRoad(s, at - half);
      const b = G.embedRoad(s, at + half);
      const idx = r * 2;
      pos.setXYZ(idx, a.x, a.y + 0.09, a.z);
      pos.setXYZ(idx + 1, b.x, b.y + 0.09, b.z);
    }
    pos.needsUpdate = true;
  }

  let islandOn = false;

  function updateIsland(playerS) {
    const splitS = G.splitCenterS(playerS);
    const amount = G.splitAmountAtS(splitS + EXIT_DIVERGE);
    const active = amount > 0.2;
    if (!active) {
      if (!islandOn) return;
      islandOn = false;
      accentLineL.visible = false;
      accentLineR.visible = false;
      arrowLeftA.visible = false;
      arrowLeftB.visible = false;
      arrowRightA.visible = false;
      arrowRightB.visible = false;
      return;
    }
    islandOn = true;

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

    // Стрелки стоят на участке выбора, где обе ленты уже полной ширины.
    // Прямые — по центру дороги, съезд — по центру его ленты.
    accentLineMatL.opacity = 0.9;
    accentLineMatR.opacity = 0.9;
    const markS = [
      splitS + EXIT_DIVERGE + 36,
      splitS + EXIT_DIVERGE + EXIT_RUN * 0.62
    ];
    const forward = [
      { mesh: arrowLeftA, s: markS[0] },
      { mesh: arrowLeftB, s: markS[1] }
    ];
    for (const a of forward) {
      a.mesh.visible = active;
      if (!a.mesh.visible) continue;
      const lat = branchCenter(a.s, 0);
      if (lat == null) {
        a.mesh.visible = false;
        continue;
      }
      placeAlongLane(a.mesh, a.s, lat, lat, 0.055);
    }
    const exiting = [
      { mesh: arrowRightA, s: markS[0] },
      { mesh: arrowRightB, s: markS[1] }
    ];
    for (const a of exiting) {
      const lat = active ? branchCenter(a.s, 1) : null;
      a.mesh.visible = lat != null;
      if (lat == null) continue;
      placeAlongLane(a.mesh, a.s, lat, lat, 0.055);
    }
  }

  /* ---------------- Главный апдейт ---------------- */
  function shareRoadNormals() {
    shadeStrip(roadMesh.geometry);
    shadeStrip(roadRightMesh.geometry);
  }

  function updateRoadSurface(playerS) {
    sampleCenterline(playerS);
    updateRoadRibbon();

    // Тротуары и бордюры существуют только в городе.
    updateCityStrip(curbLeftMesh, -1, 0.0, 0.35, 0.12);
    updateCityStrip(curbRightMesh, 1, 0.0, 0.35, 0.12);
    updateCityStrip(sidewalkLeftMesh, -1, 0.35, 3.2, 0.11);
    updateCityStrip(sidewalkRightMesh, 1, 0.35, 3.2, 0.11);

    // Двойная сплошная — граница хода этой дороги, не клин развилки.
    // Обе линии делят один запрос на точку, а не спрашивают разметку заново.
    sampleMarkLats();
    updateLateralStrip(centerDoubleLine1, solidAt0, 0.13, 0.08);
    updateLateralStrip(centerDoubleLine2, solidAt1, 0.13, 0.08);
    updateLateralStrip(edgeLineLeft, (r) => trackEdge(0, r, -1), 0.16, 0.025);
    updateLateralStrip(edgeLineRight, (r) => trackEdge(0, r, 1), 0.16, 0.025);
    updateLateralStrip(edgeLineLeftB, (r) => trackEdge(1, r, -1), 0.16, 0.025);
    updateLateralStrip(edgeLineRightB, (r) => trackEdge(1, r, 1), 0.16, 0.025);

    shareRoadNormals();

    updateIsland(playerS);
    updateCrosswalk();
    updateDashes(playerS, true);
    updateBarrier(playerS, true);
    updateGuardRibbon(guardLeftMesh, -1);
    updateGuardRibbon(guardRightMesh, 1);
    updateGuardPosts(playerS);
  }
  G.updateRoadSurface = updateRoadSurface;
}
