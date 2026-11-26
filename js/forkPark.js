import * as THREE from 'three';
import { EXIT_RUN, exitClock } from './engine/fork.js';
import { goreSpan } from './engine/asphalt.js';
import { box, cylinder } from './geom.js';
import { G } from './state.js';

/* =========================================================================
 * 5b. ЛЕСОПАРКОВАЯ ЗОНА В ЦЕНТРЕ РАЗЪЕЗДА
 * -------------------------------------------------------------------------
 * Парк стоит в клине между прямой дорогой и съездом вправо: берёзы, ели,
 * кусты, лавочки и пешеходы. На асфальт он не выходит — только в зазор,
 * который открывает `forkSpreadAt`.
 *
 * Всё живёт в InstancedMesh: 12 вызовов отрисовки на всю зону. Позиции
 * статичных объектов не зависят от кадра — они пересчитываются только при
 * смене развилки, а пешеходы ходят каждый кадр (их восемь).
 * ========================================================================= */

const BIRCH_COUNT = 44;
const FIR_COUNT = 28;
const BUSH_COUNT = 40;
const BENCH_COUNT = 4;
const WALKER_COUNT = 8;
/** Крайние метры развилки, где островок ещё слишком узкий для деревьев. */
const PARK_EDGE = EXIT_RUN * 0.5 - 8;
/** Отступ от кромки асфальта до ствола и лавочки, метров. Крона шире ствола. */
const PARK_MARGIN = 5.5;
const PARK_CLOCK = exitClock();
/** Сколько метров до/после центра развилки парк вообще виден. */
const VIEW_BEHIND = 700;
const VIEW_AHEAD = 360;

/** Детерминированный генератор: парк одинаковый в каждом заезде. */
function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function initForkPark() {
  const texRandom = makeRandom(0x1b2c3d4e);
  const random = makeRandom(0x5ba7c0de);
  const rand = (a, b) => a + random() * (b - a);

  /* ---------- Материалы и геометрии: один раз на всю игру ---------- */
  const barkTex = G.createCanvasTexture(64, 128, (ctx, w, h) => {
    ctx.fillStyle = '#e6e3da';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2c2a26';
    for (let i = 0; i < 26; i++) {
      const y = texRandom() * h;
      const wide = 6 + texRandom() * 22;
      ctx.fillRect(texRandom() * w, y, wide, 2 + texRandom() * 4);
    }
  }, 1, 2);

  const mats = {
    birchTrunk: new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.88, metalness: 0.02 }),
    birchLeaf: new THREE.MeshLambertMaterial({ color: 0x5f9a4a, flatShading: true }),
    bushLeaf: new THREE.MeshLambertMaterial({ color: 0x3f7440, flatShading: true }),
    firTrunk: G.M.trunk || new THREE.MeshLambertMaterial({ color: 0x4b382a, flatShading: true }),
    firLeaf: G.M.tree1 || new THREE.MeshLambertMaterial({ color: 0x28593a, flatShading: true }),
    benchWood: new THREE.MeshLambertMaterial({ color: 0x77502f }),
    benchLeg: G.M.metalDark || new THREE.MeshLambertMaterial({ color: 0x2a3038 }),
    skin: new THREE.MeshLambertMaterial({ color: 0xe0ac69 }),
    pants: new THREE.MeshLambertMaterial({ color: 0x2b3138 }),
    people: new THREE.MeshLambertMaterial({ color: 0xffffff })
  };
  const jacketColors = [0xb8452f, 0x3d6b9c, 0x4c8a55].map((c) => new THREE.Color(c));

  const trunkGeo = cylinder(0.11, 0.18, 1, 6);
  const coneGeo = new THREE.ConeGeometry(1, 1, 7);
  const crownGeo = new THREE.IcosahedronGeometry(1, 0);
  const bushGeo = new THREE.IcosahedronGeometry(1, 0);
  const seatGeo = box(1.6, 0.12, 0.5);
  const backGeo = box(1.6, 0.5, 0.1);
  const benchLegGeo = box(0.12, 0.45, 0.42);
  const torsoGeo = box(0.46, 0.68, 0.28);
  const headGeo = box(0.3, 0.3, 0.3);
  const pedLegGeo = box(0.17, 0.72, 0.17);

  function instance(geo, mat, count, shadows) {
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = !!shadows;
    mesh.receiveShadow = false;
    mesh.visible = false;
    mesh.count = 0;
    G.scene.add(mesh);
    return mesh;
  }

  const birchTrunks = instance(trunkGeo, mats.birchTrunk, BIRCH_COUNT, true);
  const birchCrowns = instance(crownGeo, mats.birchLeaf, BIRCH_COUNT * 3, true);
  const firTrunks = instance(trunkGeo, mats.firTrunk, FIR_COUNT, true);
  const firCones = instance(coneGeo, mats.firLeaf, FIR_COUNT * 3, true);
  const bushes = instance(bushGeo, mats.bushLeaf, BUSH_COUNT, false);
  const benchSeats = instance(seatGeo, mats.benchWood, BENCH_COUNT, true);
  const benchBacks = instance(backGeo, mats.benchWood, BENCH_COUNT, true);
  const benchLegs = instance(benchLegGeo, mats.benchLeg, BENCH_COUNT * 2, false);
  const walkTorso = instance(torsoGeo, mats.people, WALKER_COUNT, true);
  const walkHead = instance(headGeo, mats.skin, WALKER_COUNT, false);
  const walkLegL = instance(pedLegGeo, mats.pants, WALKER_COUNT, false);
  const walkLegR = instance(pedLegGeo, mats.pants, WALKER_COUNT, false);

  /* ---------- Раскладка. d — метры от центра развилки ---------- */
  const trees = [];
  for (let i = 0; i < BIRCH_COUNT; i++) {
    trees.push({ fir: false, d: rand(-PARK_EDGE, PARK_EDGE), u: rand(-1, 1), scale: rand(0.85, 1.2), yaw: rand(0, Math.PI * 2) });
  }
  for (let i = 0; i < FIR_COUNT; i++) {
    trees.push({ fir: true, d: rand(-PARK_EDGE, PARK_EDGE), u: rand(-1, 1), scale: rand(0.8, 1.15), yaw: rand(0, Math.PI * 2) });
  }
  // Деревья не растут вплотную друг к другу: иначе кроны сливаются в кашу.
  const kept = [];
  for (const t of trees) {
    if (Math.abs(t.u) < 0.22) continue;
    if (kept.some((k) => Math.abs(k.d - t.d) < 4.6 && Math.abs(k.u - t.u) < 0.35)) continue;
    kept.push(t);
  }

  const bushSpots = [];
  for (let i = 0; i < BUSH_COUNT; i++) {
    const d = rand(-PARK_EDGE, PARK_EDGE);
    bushSpots.push({
      d,
      u: rand(-1, 1),
      scale: rand(0.7, 1.5),
      yaw: rand(0, Math.PI * 2)
    });
  }

  const benches = [];
  for (let i = 0; i < BENCH_COUNT; i++) {
    const d = -36 + i * 24 + rand(-3, 3);
    const side = i % 2 === 0 ? -1 : 1;
    benches.push({ d, u: side * 0.72, yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
  }

  const walkers = [];
  for (let i = 0; i < WALKER_COUNT; i++) {
    walkers.push({
      d0: rand(-46, 46),
      rd: rand(10, 22),
      u: rand(0.35, 0.9) * (i % 2 === 0 ? 1 : -1),
      speed: rand(0.055, 0.1) * (i % 3 === 0 ? -1 : 1),
      phase: rand(0, Math.PI * 2)
    });
    walkTorso.setColorAt(i, jacketColors[i % jacketColors.length]);
  }
  if (walkTorso.instanceColor) walkTorso.instanceColor.needsUpdate = true;

  /** Точка внутри клина. u = -1 у прямой дороги, +1 у съезда. null — клина нет. */
  function goreLat(s, u) {
    const gore = goreSpan(G.roadEdgesAt(s));
    if (!gore) return null;
    const width = gore.right - gore.left;
    // Узкий клин не вмещает крону с отступом — лучше не ставить дерево совсем.
    if (width < PARK_MARGIN * 2 + 1) return null;
    const pad = Math.min(PARK_MARGIN, width * 0.35);
    const t = (Math.max(-1, Math.min(1, u)) + 1) * 0.5;
    return gore.left + pad + t * Math.max(0, width - pad * 2);
  }

  const dummy = new THREE.Object3D();
  let lastCenter = NaN;
  let lastParkShell = '';
  let visible = false;

  /** Берёза: белый ствол и три кроны. Ель: ствол и три конуса. */
  function placeTrees(center) {
    let birchTrunkI = 0;
    let birchCrownI = 0;
    let firTrunkI = 0;
    let firConeI = 0;
    for (const t of kept) {
      const s = center + t.d;
      const lat = goreLat(s, t.u);
      if (lat == null) continue;
      G.placeOnRoad(dummy, s, lat, 0);
      const x0 = dummy.position.x;
      const y0 = dummy.position.y;
      const z0 = dummy.position.z;
      dummy.rotation.set(0, t.yaw, 0);
      if (!t.fir) {
        const h = 8.6 * t.scale;
        dummy.position.set(x0, y0 + h * 0.5, z0);
        dummy.scale.set(t.scale, h, t.scale);
        dummy.updateMatrix();
        birchTrunks.setMatrixAt(birchTrunkI++, dummy.matrix);
        for (let k = 0; k < 3; k++) {
          const r = (2.5 - k * 0.4) * t.scale;
          const ang = t.yaw + k * 2.1;
          dummy.position.set(
            x0 + Math.cos(ang) * 0.6 * t.scale,
            y0 + h * (0.88 + k * 0.15),
            z0 + Math.sin(ang) * 0.6 * t.scale
          );
          dummy.scale.set(r, r * 0.85, r);
          dummy.updateMatrix();
          birchCrowns.setMatrixAt(birchCrownI++, dummy.matrix);
        }
      } else {
        const h = 4.6 * t.scale;
        dummy.position.set(x0, y0 + h * 0.5, z0);
        dummy.scale.set(t.scale, h, t.scale);
        dummy.updateMatrix();
        firTrunks.setMatrixAt(firTrunkI++, dummy.matrix);
        for (let k = 0; k < 3; k++) {
          const r = (2.4 - k * 0.6) * t.scale;
          const segH = (3.8 - k * 0.55) * t.scale;
          dummy.position.set(x0, y0 + h * 0.7 + k * 1.7 * t.scale + segH * 0.5, z0);
          dummy.scale.set(r, segH, r);
          dummy.updateMatrix();
          firCones.setMatrixAt(firConeI++, dummy.matrix);
        }
      }
    }
    birchTrunks.count = birchTrunkI;
    birchCrowns.count = birchCrownI;
    firTrunks.count = firTrunkI;
    firCones.count = firConeI;
    birchTrunks.instanceMatrix.needsUpdate = true;
    birchCrowns.instanceMatrix.needsUpdate = true;
    firTrunks.instanceMatrix.needsUpdate = true;
    firCones.instanceMatrix.needsUpdate = true;
  }

  function placeBushes(center) {
    let i = 0;
    for (const b of bushSpots) {
      const s = center + b.d;
      const lat = goreLat(s, b.u);
      if (lat == null) continue;
      G.placeOnRoad(dummy, s, lat, 0);
      dummy.rotation.set(0, b.yaw, 0);
      dummy.position.y += b.scale * 0.45;
      dummy.scale.set(b.scale * 1.5, b.scale * 0.9, b.scale * 1.5);
      dummy.updateMatrix();
      bushes.setMatrixAt(i++, dummy.matrix);
    }
    bushes.count = i;
    bushes.instanceMatrix.needsUpdate = true;
  }

  function placeBenches(center) {
    let seatI = 0;
    let backI = 0;
    let legI = 0;
    for (const b of benches) {
      const s = center + b.d;
      const lat = goreLat(s, b.u);
      if (lat == null) continue;
      G.placeOnRoad(dummy, s, lat, 0);
      const x0 = dummy.position.x;
      const y0 = dummy.position.y;
      const z0 = dummy.position.z;
      const sin = Math.sin(b.yaw);
      const cos = Math.cos(b.yaw);
      dummy.rotation.set(0, b.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.position.set(x0, y0 + 0.46, z0);
      dummy.updateMatrix();
      benchSeats.setMatrixAt(seatI++, dummy.matrix);
      // Спинка отодвинута назад и приподнята относительно сиденья.
      dummy.position.set(x0 - sin * 0.2, y0 + 0.78, z0 - cos * 0.2);
      dummy.updateMatrix();
      benchBacks.setMatrixAt(backI++, dummy.matrix);
      for (const side of [-0.62, 0.62]) {
        dummy.position.set(x0 + cos * side, y0 + 0.22, z0 - sin * side);
        dummy.updateMatrix();
        benchLegs.setMatrixAt(legI++, dummy.matrix);
      }
    }
    benchSeats.count = seatI;
    benchBacks.count = backI;
    benchLegs.count = legI;
    benchSeats.instanceMatrix.needsUpdate = true;
    benchBacks.instanceMatrix.needsUpdate = true;
    benchLegs.instanceMatrix.needsUpdate = true;
  }

  /** Пешеходы гуляют по замкнутым эллипсам внутри островка. */
  function placeWalkers(center, dt, now) {
    for (let i = 0; i < walkers.length; i++) {
      const w = walkers[i];
      w.phase += w.speed * dt;
      const th = w.phase;
      const d = w.d0 + Math.cos(th) * w.rd;
      const s = center + d;
      const lat = goreLat(s, w.u * Math.abs(Math.sin(th)));
      if (lat == null) {
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        walkTorso.setMatrixAt(i, dummy.matrix);
        walkHead.setMatrixAt(i, dummy.matrix);
        walkLegL.setMatrixAt(i, dummy.matrix);
        walkLegR.setMatrixAt(i, dummy.matrix);
        continue;
      }

      // Направление шага — производная пути, чтобы пешеход смотрел вперёд.
      const dd = -Math.sin(th) * w.rd * Math.sign(w.speed);
      const dl = w.u * Math.cos(th) * Math.sign(w.speed);
      const yaw = Math.atan2(-dl, dd) || 0;
      const bob = Math.sin(now * 0.006 + i) * 0.04;
      const stride = Math.sin(now * 0.009 + i * 1.7) * 0.2;

      G.placeOnRoad(dummy, s, lat, 0);
      const x = dummy.position.x;
      const y = dummy.position.y;
      const z = dummy.position.z;
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      dummy.scale.set(1, 1, 1);

      dummy.position.set(x, y + 1.05 + bob, z);
      dummy.rotation.set(0, yaw, 0);
      dummy.updateMatrix();
      walkTorso.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, y + 1.6 + bob, z);
      dummy.updateMatrix();
      walkHead.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x + rx * 0.12 - rz * stride * 0.5, y + 0.36 + bob * 0.5, z + rz * 0.12 + rx * stride * 0.5);
      dummy.updateMatrix();
      walkLegL.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x - rx * 0.12 + rz * stride * 0.5, y + 0.36 + bob * 0.5, z - rz * 0.12 - rx * stride * 0.5);
      dummy.updateMatrix();
      walkLegR.setMatrixAt(i, dummy.matrix);
    }
    walkTorso.count = walkers.length;
    walkHead.count = walkers.length;
    walkLegL.count = walkers.length;
    walkLegR.count = walkers.length;
    walkTorso.instanceMatrix.needsUpdate = true;
    walkHead.instanceMatrix.needsUpdate = true;
    walkLegL.instanceMatrix.needsUpdate = true;
    walkLegR.instanceMatrix.needsUpdate = true;
  }

  const staticParts = [birchTrunks, birchCrowns, firTrunks, firCones, bushes, benchSeats, benchBacks, benchLegs];
  const walkerParts = [walkTorso, walkHead, walkLegL, walkLegR];

  function setVisible(on) {
    if (on === visible) return;
    visible = on;
    for (const m of staticParts) m.visible = on;
    for (const m of walkerParts) m.visible = on;
    if (!on) {
      lastCenter = NaN;
      lastParkShell = '';
    }
  }

  function updateForkPark(dt, now) {
    if (!G.splitCenterS || !G.forkSpreadAtS) return;
    // Старый центр приходился на подход до фиксации выбора, когда клина ещё
    // не было. Ставим парк в середине реально открытого блока seal.
    const center = G.splitCenterS(G.playerS) + PARK_CLOCK.choiceAt + PARK_CLOCK.turn * 0.5;
    const dNow = G.playerS - center;
    setVisible(dNow > -VIEW_BEHIND && dNow < VIEW_AHEAD);
    if (!visible) return;

    const shell = [-60, 0, 60]
      .map((d) => (G.roadShellKeyAt ? G.roadShellKeyAt(center + d) : ''))
      .join('|');
    if (center !== lastCenter || shell !== lastParkShell) {
      lastCenter = center;
      lastParkShell = shell;
      placeTrees(center);
      placeBushes(center);
      placeBenches(center);
    }
    placeWalkers(center, dt, now);
  }

  G.updateForkPark = updateForkPark;
  G.resetForkPark = () => {
    lastCenter = NaN;
    lastParkShell = '';
  };
}
