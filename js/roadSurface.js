import * as THREE from 'three';
import { G } from './state.js';
import { EXIT_DIVERGE, EXIT_RUN, asphaltShell, followAsphalt, innerTrackEdge, outerRibbon, outwardFrom, pinchAsphalt, pinchShell, shoulderLats } from './engine/fork.js';

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
  const sampleY = new Float32Array(ROW);
  const sampleCity = new Float32Array(ROW);

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

  function shellWide(shell) {
    return !!shell && shell.right - shell.left >= 0.5;
  }

  /** Кромка дороги байка. Тротуар и отбойник стоят у неё, не у дальней ленты. */
  function drivenEdge(row, side) {
    const span = G.drivenSpanAt(sampleS[row]);
    if (!span || span.width < 0.5) return null;
    return side < 0 ? span.left : span.right;
  }

  function shellMid(row) {
    const shell = shellAt(row);
    if (!shell) return roadCenter(sampleS[row]);
    return (shell.left + shell.right) * 0.5;
  }

  function ribbonAt(row, side) {
    return outerRibbon(G.roadEdgesAt(sampleS[row]), side);
  }

  /**
   * Откос принадлежит дороге байка.
   * Если другая живая лента торчит дальше, откос остаётся снаружи неё.
   */
  function slopeRibbon(row, side) {
    const outer = ribbonAt(row, side);
    const edge = drivenEdge(row, side);
    const span = G.drivenSpanAt(sampleS[row]);
    if (edge == null || !span) return outer;
    const driven = { edge, center: span.mid, half: span.width * 0.5 };
    if (!outer) return driven;
    const further = side < 0 ? outer.edge < driven.edge - 0.5 : outer.edge > driven.edge + 0.5;
    return further ? outer : driven;
  }

  /** Точка откоса снаружи своей ленты, не от середины обеих. */
  function slopeLat(row, side, fromCenter) {
    const ribbon = slopeRibbon(row, side);
    if (!ribbon) return shellMid(row);
    return outwardFrom(ribbon.edge, ribbon.center, Math.max(0, fromCenter - ribbon.half));
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
  }

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
  const ribbonDoubleLine1 = makeRibbon(0.13, G.M.lineYellow);
  const ribbonDoubleLine2 = makeRibbon(0.13, G.M.lineYellow);
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

  for (const mesh of [sidewalkLeftMesh, sidewalkRightMesh, curbLeftMesh, curbRightMesh,
    centerDoubleLine1, centerDoubleLine2, ribbonDoubleLine1, ribbonDoubleLine2,
    edgeLineLeft, edgeLineRight, edgeLineLeftB, edgeLineRightB]) {
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

/** Удаление живой кромки от середины оболочки. Откос начинается отсюда. */
  function farAsphalt(row, side) {
    const ribbon = slopeRibbon(row, side);
    return ribbon ? ribbon.half : 0;
  }

  /** Нормаль откоса берётся из уже поставленных вершин, по курсу съезда, а не по сплайну. */
  function shadeSlope(geo) {
    const pos = geo.attributes.position.array;
    const norm = geo.attributes.normal.array;
    for (let r = 0; r < ROW; r++) {
      const ahead = r < ROW - 1;
      const r2 = ahead ? r + 1 : r - 1;
      const sign = ahead ? 1 : -1;
      for (let slot = 0; slot < 3; slot++) {
        const o = (r * 3 + slot) * 3;
        const n = (r2 * 3 + slot) * 3;
        const ax = (pos[n] - pos[o]) * sign;
        const ay = (pos[n + 1] - pos[o + 1]) * sign;
        const az = (pos[n + 2] - pos[o + 2]) * sign;
        const across = slot < 2 ? slot + 1 : slot - 1;
        const b = (r * 3 + across) * 3;
        const vx = pos[b] - pos[o];
        const vy = pos[b + 1] - pos[o + 1];
        const vz = pos[b + 2] - pos[o + 2];
        let nx = ay * vz - az * vy;
        let ny = az * vx - ax * vz;
        let nz = ax * vy - ay * vx;
        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const len = Math.hypot(nx, ny, nz) || 1;
        norm[o] = nx / len; norm[o + 1] = ny / len; norm[o + 2] = nz / len;
      }
    }
    geo.attributes.normal.needsUpdate = true;
  }

  /* ---------------- Разметка полос (инстансы) ---------------- */
  const MAX_DASHES = 768;
  const DASH_LEN = 4.2;
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
  const MAX_BLOCKS = 192;
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
      for (const mark of G.ribbonMarksAtS(s)) paint(s, mark.lat, mark.lat, mark.w);
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
      const edge = drivenEdge(r, side);
      const vis = weight > 0.02 && edge != null ? weight : 0;
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
      const row = rowNear(s);
      for (const side of [-1, 1]) {
        if (used >= MAX_GUARD_POSTS) break;
        const edge = drivenEdge(row, side);
        if (edge == null) continue;
        const lat = edge + (side < 0 ? -GUARD_OFFSET : GUARD_OFFSET);
        dummy.scale.set(weight, weight, weight);
        G.placeBeside(dummy, s, edge, lat, 0.31 * weight);
        dummy.updateMatrix();
        guardPostMesh.setMatrixAt(used++, dummy.matrix);
      }
    }
    for (let i = used; i < MAX_GUARD_POSTS; i++) guardPostMesh.setMatrixAt(i, hidden);
    guardPostMesh.count = used;
    guardPostMesh.instanceMatrix.needsUpdate = true;
    guardPostMesh.visible = used > 0;
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
    roadRightMat.envMapIntensity = G.M.road.envMapIntensity;
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

  /** Белая кромка своей ленты. У схлопнутой ленты линии нет. */
  function trackEdge(track, row, side) {
    const span = roadTracks[track][row];
    if (!span) return null;
    const width = span.right - span.left;
    if (width < 0.7) return null;
    const inset = Math.min(0.32, width * 0.25);
    return side < 0 ? span.left + inset : span.right - inset;
  }

  /** Лента, у которой центр и ширина в мировых метрах зависят от точки s. */
  function updateLateralStrip(mesh, latAt, width, yOffset) {
    const pos = mesh.geometry.attributes.position;
    const halfW = width * 0.5;
    let hold = null;
    for (let r = 0; r < ROW; r++) {
      const lat = latAt(r);
      const s = sampleS[r];
      const y = sampleY[r] + yOffset;
      if (lat == null) {
        const idx = r * 2;
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
      const idx = r * 2;
      pos.setXYZ(idx, a.x, y, a.z);
      pos.setXYZ(idx + 1, b.x, y, b.z);
      hold = { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 };
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

  /** Тротуар и бордюр города: снаружи дороги байка. */
  function updateCityStrip(mesh, side, baseWidth, width, yOffset) {
    const pos = mesh.geometry.attributes.position;
    let maxWeight = 0;
    for (let r = 0; r < ROW; r++) {
      const cw = sampleCity[r];
      if (cw > maxWeight) maxWeight = cw;
      const s = sampleS[r];
      const edge = drivenEdge(r, side);
      const outward = side < 0 ? -1 : 1;
      const halfW = edge == null ? 0 : width * 0.5 * cw;
      const center = (edge == null ? shellMid(r) : edge) + outward * (baseWidth * cw + halfW);
      const y = sampleY[r] + yOffset;
      const course = edge == null ? center : edge;
      const a = G.embedBeside(s, course, center - halfW);
      const b = G.embedBeside(s, course, center + halfW);
      const idx = r * 2;
      pos.setXYZ(idx, a.x, y, a.z);
      pos.setXYZ(idx + 1, b.x, y, b.z);
    }
    pos.needsUpdate = true;
    mesh.visible = maxWeight > 0.02;
  }

  function updateSlopeRibbons() {
    const posL = slopeLeftMesh.geometry.attributes.position;
    const posR = slopeRightMesh.geometry.attributes.position;
    for (let r = 0; r < ROW; r++) {
      const s = sampleS[r];
      const cy = sampleY[r];
      const cityOuter = G.shoulder.cityEdge * sampleCity[r];
      const sh = G.shoulder;
      const left = shoulderLats(farAsphalt(r, -1), cityOuter, sh);
      const right = shoulderLats(farAsphalt(r, 1), cityOuter, sh);
      // Набережная: справа плоская пешеходная зона и спуск к воде.
      const embW = Math.max(0, Math.min(1, G.embankmentWeightAtS(s)));
      const eL = (a, b) => a + (b - a) * embW;
      const rLip = eL(right.lip, farAsphalt(r, 1));
      const rBerm = eL(right.berm, 17);
      const rFar = eL(right.far, 30);
      const rLipY = eL(sh.lipY, 0.08);
      const rBermY = eL(sh.bermY, 0.08);
      const rFarY = eL(sh.farY, -6);
      const at = (side, fromCenter, height) => {
        const wide = shellWide(shellAt(r));
        const lat = wide ? slopeLat(r, side, fromCenter) : shellMid(r);
        const lip = wide ? slopeRibbon(r, side) : null;
        const p = lip ? G.embedBeside(s, lip.edge, lat) : G.embedRoad(s, lat);
        return [p.x, cy + height, p.z];
      };
      const idx = r * 3;
      posL.setXYZ(idx,     ...at(-1, left.far, sh.farY));
      posL.setXYZ(idx + 1, ...at(-1, left.berm, sh.bermY));
      posL.setXYZ(idx + 2, ...at(-1, left.lip, sh.lipY));
      posR.setXYZ(idx,     ...at(1, rLip, rLipY));
      posR.setXYZ(idx + 1, ...at(1, rBerm, rBermY));
      posR.setXYZ(idx + 2, ...at(1, rFar, rFarY));
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
    const span = EXIT_DIVERGE + EXIT_RUN;
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
      const lat = innerTrackEdge(here, side < 0 ? -1 : 1, 0.2);
      const half = lat == null ? 0 : halfW;
      const at = lat == null ? (here ? (here.left + here.right) * 0.5 : 0) : lat;
      const s = samples[r];
      const a = G.embedRoad(s, at - half);
      const b = G.embedRoad(s, at + half);
      const idx = r * 2;
      pos.setXYZ(idx, a.x, a.y + 0.09, a.z);
      pos.setXYZ(idx + 1, b.x, b.y + 0.09, b.z);
    }
    pos.needsUpdate = true;
  }

  function updateIsland(playerS) {
    const splitS = G.splitCenterS(playerS);
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

    // Стрелки стоят на участке выбора, где обе ленты уже полной ширины.
    // Прямые — по центру дороги, съезд — по центру его ленты.
    const decided = !!(G.splitState && G.splitState.chosen);
    const tookExit = decided && G.splitState.chosenSide === 1;
    const stayed = decided && G.splitState.chosenSide === 0;
    accentLineMatL.opacity = !decided || stayed ? 0.9 : 0.22;
    accentLineMatR.opacity = !decided || tookExit ? 0.9 : 0.22;
    const markS = [
      splitS + EXIT_DIVERGE + 36,
      splitS + EXIT_DIVERGE + EXIT_RUN * 0.62
    ];
    const forward = [
      { mesh: arrowLeftA, s: markS[0] },
      { mesh: arrowLeftB, s: markS[1] }
    ];
    for (const a of forward) {
      a.mesh.visible = active && !tookExit;
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
      const lat = active && !stayed ? branchCenter(a.s, 1) : null;
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
    const solidAt = (s, index) => {
      const marks = G.solidMarksAtS(s);
      return marks[index] ? marks[index].lat : null;
    };
    updateLateralStrip(centerDoubleLine1, (r) => solidAt(sampleS[r], 0), 0.13, 0.08);
    updateLateralStrip(centerDoubleLine2, (r) => solidAt(sampleS[r], 1), 0.13, 0.08);
    const ribbonSolidAt = (s, index) => {
      const marks = G.ribbonSolidMarksAtS(s);
      return marks[index] ? marks[index].lat : null;
    };
    updateLateralStrip(ribbonDoubleLine1, (r) => ribbonSolidAt(sampleS[r], 0), 0.13, 0.08);
    updateLateralStrip(ribbonDoubleLine2, (r) => ribbonSolidAt(sampleS[r], 1), 0.13, 0.08);
    updateLateralStrip(edgeLineLeft, (r) => trackEdge(0, r, -1), 0.16, 0.025);
    updateLateralStrip(edgeLineRight, (r) => trackEdge(0, r, 1), 0.16, 0.025);
    updateLateralStrip(edgeLineLeftB, (r) => trackEdge(1, r, -1), 0.16, 0.025);
    updateLateralStrip(edgeLineRightB, (r) => trackEdge(1, r, 1), 0.16, 0.025);

    shareRoadNormals();
    updateSlopeRibbons();
    if (Number.isNaN(lastSlopeShadeS) || Math.abs(playerS - lastSlopeShadeS) >= 4) {
      lastSlopeShadeS = playerS;
      shadeSlope(slopeLeftMesh.geometry);
      shadeSlope(slopeRightMesh.geometry);
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
