import * as THREE from 'three';
import { exitClock } from './engine/fork.js';
import { lanesOf, offsetDirection } from './engine/lanes.js';
import { G } from './state.js';

/**
 * Та же сцена, что и заезд: полотно, разметка и мотоцикл.
 * Камера «оба» держит в кадре шоссе и съезд по мировым точкам.
 * Открывается как `/?fork=1`. Сохранение заезда не пишет.
 */

const WITH = 0x7ec8ff;
const AGAINST = 0xffb15a;
const BIKE = 0xf4f7fb;
const CLOCK = exitClock();

const STATIONS = [
  ['нос', 0],
  ['отрыв', Math.round(CLOCK.turn * 0.5)],
  ['рядом', Math.round(CLOCK.turn + (CLOCK.choiceAt - CLOCK.turn) * 0.5)],
  ['выбор', CLOCK.choiceAt],
  ['закрытие', Math.round((CLOCK.choiceAt + CLOCK.ownAfter) * 0.5)],
  ['дорога', CLOCK.ownAfter + 40],
];

export function initForkLab() {
  const params = new URLSearchParams(location.search);
  if (!params.has('fork')) return;

  const beside = STATIONS[0][1];
  G.forkLabActive = true;
  G.forkLabD = beside;
  G.forkLabLateral = 2.4;
  G.forkLabChoice = -1;

  const withArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 3.4, WITH, 1.15, 0.6);
  const againstArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 3.4, AGAINST, 1.15, 0.6);
  const bikeArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 7, BIKE, 2.2, 1.05);
  bikeArrow.visible = false;
  G.scene.add(bikeArrow);

  const pool = [];
  function takeArrow(against) {
    const source = against ? againstArrow : withArrow;
    const arrow = pool.find((item) => !item.visible && item.userData.against === against);
    if (arrow) return arrow;
    const made = source.clone();
    made.userData.against = against;
    G.scene.add(made);
    pool.push(made);
    return made;
  }

  const dir = new THREE.Vector3();
  let anchor = null;
  let started = false;
  let cameraMode = 'both';
  let seat = 'free';

  const stationButtons = STATIONS.map(([name, meters]) =>
    `<button type="button" data-d="${meters}"${meters === beside ? ' aria-pressed="true"' : ''}>${name}</button>`).join('');

  const panel = document.createElement('form');
  panel.id = 'fork-lab';
  panel.innerHTML = `
    <p class="fork-lab-title">Развилка</p>
    <div class="fork-lab-row" id="fork-stations">${stationButtons}</div>
    <label>Метр от носа <output id="fork-d-out"></output>
      <input id="fork-d" type="range" min="-40" max="940" value="${beside}" step="1">
    </label>
    <p class="fork-lab-caption">Камера</p>
    <div class="fork-lab-row" role="group" aria-label="Камера">
      <button type="button" data-cam="both" aria-pressed="true">оба</button>
      <button type="button" data-cam="bike">байк</button>
      <button type="button" data-cam="road">шоссе</button>
      <button type="button" data-cam="exit">съезд</button>
    </div>
    <label>Метры от оси <output id="fork-lane-out"></output>
      <input id="fork-lane" type="range" min="-12" max="80" value="2.4" step="0.5">
    </label>
    <div class="fork-lab-row" role="group" aria-label="Где байк">
      <button type="button" data-seat="road">на шоссе</button>
      <button type="button" data-seat="exit">на съезде</button>
    </div>
    <p class="fork-lab-caption">Решение</p>
    <div class="fork-lab-row" role="group" aria-label="Решение">
      <button type="button" data-choice="-1" aria-pressed="true">открыто</button>
      <button type="button" data-choice="0">прямо</button>
      <button type="button" data-choice="1">съезд</button>
    </div>
    <p id="fork-lab-read"></p>
    <p class="fork-lab-key">Синие стрелки — по ходу. Жёлтые — встречные. Белая — нос мотоцикла.</p>
  `;
  document.body.appendChild(panel);

  const style = document.createElement('style');
  style.textContent = `
    #fork-lab {
      position: fixed; z-index: 40; left: 12px; top: 12px; width: min(340px, calc(100vw - 24px));
      max-height: calc(100vh - 24px); overflow: auto;
      margin: 0; padding: 12px; color: #e7ebf0; background: rgba(16, 20, 26, 0.88);
      border: 1px solid #2c3440; border-radius: 8px; font: 14px/1.4 system-ui, sans-serif;
    }
    #fork-lab label { display: grid; grid-template-columns: 1fr auto; gap: 8px; margin: 8px 0; }
    #fork-lab input { grid-column: 1 / -1; }
    #fork-lab output { font-variant-numeric: tabular-nums; }
    #fork-lab .fork-lab-title { margin: 0 0 6px; }
    #fork-lab .fork-lab-caption { margin: 8px 0 0; color: #b7c0cc; font-size: 12px; }
    #fork-lab .fork-lab-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    #fork-lab button { flex: 1 1 auto; min-width: 64px; background: #222833; color: inherit; border: 1px solid #3a4454; border-radius: 6px; padding: 8px 4px; }
    #fork-lab button[aria-pressed="true"] { background: #2f6f4e; border-color: #3d8f64; }
    #fork-lab-read { margin: 8px 0 0; white-space: pre-line; font-variant-numeric: tabular-nums; }
    #fork-lab .fork-lab-key { margin: 6px 0 0; color: #b7c0cc; }
  `;
  document.head.appendChild(style);

  const dInput = /** @type {HTMLInputElement} */ (panel.querySelector('#fork-d'));
  const laneInput = /** @type {HTMLInputElement} */ (panel.querySelector('#fork-lane'));

  function press(button) {
    const group = button.parentElement;
    if (!group) return;
    group.querySelectorAll('button').forEach((other) => {
      other.setAttribute('aria-pressed', other === button ? 'true' : 'false');
    });
  }

  function pressSeat(next) {
    seat = next;
    panel.querySelectorAll('[data-seat]').forEach((button) => {
      button.setAttribute('aria-pressed', button.dataset.seat === next ? 'true' : 'false');
    });
  }

  panel.addEventListener('input', (event) => {
    G.forkLabD = Number(dInput.value);
    if (event.target === laneInput) pressSeat('free');
    if (seat === 'free') G.forkLabLateral = Number(laneInput.value);
    panel.querySelectorAll('[data-d]').forEach((button) => {
      button.setAttribute('aria-pressed', Number(button.dataset.d) === G.forkLabD ? 'true' : 'false');
    });
  });
  panel.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (!button || !panel.contains(button)) return;
    if (button.dataset.d != null) {
      dInput.value = button.dataset.d;
      G.forkLabD = Number(button.dataset.d);
      press(button);
      return;
    }
    if (button.dataset.cam) {
      cameraMode = button.dataset.cam;
      press(button);
      return;
    }
    if (button.dataset.seat) {
      pressSeat(button.dataset.seat);
      return;
    }
    if (button.dataset.choice != null) {
      const choice = Number(button.dataset.choice);
      G.forkLabChoice = choice;
      press(button);
      if (choice === 1) pressSeat('exit');
      if (choice === 0) pressSeat('road');
    }
  });

  function spanAt(s) {
    const edges = G.roadEdgesAt(s);
    const mainLat = (edges.leftOuter + edges.leftInner) * 0.5;
    const width = edges.rightOuter - edges.rightInner;
    const exitLat = width > 1 ? (edges.rightInner + edges.rightOuter) * 0.5 : null;
    return {
      mainLat,
      exitLat,
      main: G.embedRoad(s, mainLat),
      exit: exitLat == null ? null : G.embedRoad(s, exitLat),
    };
  }

  function apart(a, b) {
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.z - b.z);
  }

  function headingDelta(from, to) {
    return Math.atan2(from.fx * to.fz - from.fz * to.fx, from.fx * to.fx + from.fz * to.fz);
  }

  function viewRig(s) {
    const here = spanAt(s);
    const ahead = spanAt(s + 50);
    const gap = Math.max(apart(here.main, here.exit), apart(ahead.main, ahead.exit));
    return { here, ahead, gap };
  }

  /** Над текущим метром. Вперёд не заглядывает: нос смотрится на носе. */
  function forkSpot(s) {
    const here = spanAt(s);
    const gap = apart(here.main, here.exit);
    return {
      x: here.exit ? (here.main.x + here.exit.x) * 0.5 : here.main.x,
      y: here.main.y,
      z: here.exit ? (here.main.z + here.exit.z) * 0.5 : here.main.z,
      fx: here.main.fx,
      fz: here.main.fz,
      gap: Math.max(gap, 14),
    };
  }

  function aim(arrow, pose, s, against, scale) {
    dir.set(pose.fx, G.roadDY(s), pose.fz);
    if (against) dir.negate();
    if (dir.lengthSq() < 1e-8) dir.set(0, 0, -1);
    dir.normalize();
    arrow.position.set(pose.x, pose.y + 0.4 * scale, pose.z);
    arrow.setDirection(dir);
    arrow.setLength(3.4 * scale, 1.15 * scale, 0.6 * scale);
    arrow.visible = true;
  }

  function placeLaneArrows() {
    for (const arrow of pool) arrow.visible = false;
    const scale = cameraMode === 'both' ? Math.max(1, (64 + forkSpot(G.playerS).gap * 0.9) / 70) : 1;
    let used = 0;
    const from = G.playerS - 20;
    const to = G.playerS + (cameraMode === 'both' ? 240 : 170);
    const step = cameraMode === 'both' ? 28 : 22;
    for (let s = from; s <= to; s += step) {
      const roads = G.roadsAt(s);
      const carriages = [roads.main, roads.exit].filter(Boolean);
      for (const carriage of carriages) {
        const lanes = lanesOf(carriage.lanes);
        for (const lane of lanes) {
          const lat = carriage.axis + lane.offset * carriage.scale;
          const pose = G.embedRoad(s, lat);
          const arrow = takeArrow(lane.direction === 'against');
          aim(arrow, pose, s, lane.direction === 'against', scale);
          used += 1;
          if (used > 140) return;
        }
      }
    }
  }

  function placeBikeArrow() {
    const lat = G.riderLatAt(G.playerS);
    const pose = G.embedRoad(G.playerS, lat);
    const nose = G.embedRoad(G.playerS + 3.2, lat);
    const scale = cameraMode === 'both' ? Math.max(1, (64 + forkSpot(G.playerS).gap * 0.9) / 70) : 1;
    bikeArrow.position.set(nose.x, nose.y + 0.55 * scale, nose.z);
    dir.set(pose.fx, G.roadDY(G.playerS), pose.fz);
    if (dir.lengthSq() < 1e-8) dir.set(0, 0, -1);
    bikeArrow.setDirection(dir.normalize());
    bikeArrow.setLength(7 * scale, 2.2 * scale, 1.05 * scale);
    bikeArrow.visible = true;
  }

  function hideTraffic() {
    const poolCars = G.trafficPool;
    if (!poolCars) return;
    for (const car of poolCars) {
      if (car.model && car.model.root) car.model.root.visible = false;
    }
  }

  function blockTitle(s) {
    const block = G.roadBlockAt(s);
    if (!block) return 'до носа';
    if (block.kind === 'split') return 'отрыв';
    if (block.kind === 'fork') return 'рядом';
    if (block.kind === 'seal') return 'закрытие';
    if (block.kind === 'road') return 'новая дорога';
    return 'съезд';
  }

  function courseWords(radians) {
    const degrees = Math.abs(radians * 180 / Math.PI);
    if (degrees < 1) return 'курс вдоль шоссе';
    const side = radians > 0 ? 'вправо' : 'влево';
    return `курс ${side} ${degrees.toFixed(0)}°`;
  }

  function readout() {
    const s = G.playerS;
    const lanes = lanesOf(G.riderLanesAt(s));
    const way = offsetDirection(lanes, G.laneOffset);
    const where = way === 'against' ? 'встречная' : 'попутная';
    const choice = G.forkLabChoice === 1 ? 'съезд' : G.forkLabChoice === 0 ? 'прямо' : 'открыт';
    const lat = G.riderLatAt(s);
    const surface = G.drivenIsExitAt(s) ? 'на съезде' : 'на шоссе';
    const here = spanAt(s);
    const bike = G.embedRoad(s, lat);
    panel.querySelector('#fork-d-out').textContent = String(Math.round(G.forkLabD));
    panel.querySelector('#fork-lane-out').textContent = G.forkLabLateral.toFixed(1);
    const lines = [
      `${blockTitle(s)}, ${Math.round(G.forkLabD)} м. Выбор ${choice}.`,
      `Байк ${surface}, ${lat.toFixed(1)} м, ${where}, ${courseWords(headingDelta(here.main, bike))}.`,
    ];
    if (here.exit) {
      const world = apart(here.main, here.exit);
      lines.push(`Съезд: полосы ${here.exitLat.toFixed(0)} м, мир ${world.toFixed(0)} м, ${courseWords(headingDelta(here.main, here.exit))}.`);
    } else {
      lines.push('Отдельного съезда в этой точке нет.');
    }
    panel.querySelector('#fork-lab-read').textContent = lines.join('\n');
  }

  function parkBike() {
    if (seat !== 'road' && seat !== 'exit') return;
    const here = spanAt(G.playerS);
    const lat = seat === 'exit' && here.exitLat != null ? here.exitLat : here.mainLat;
    G.forkLabLateral = lat;
    laneInput.value = String(lat);
  }

  const updateBiome = G.updateBiome;
  G.updateBiome = (dt) => {
    if (G.forkLabActive && G.started) {
      if (anchor == null) anchor = G.splitCenterS(G.playerS);
      G.speed = 0;
      G.playerS = anchor + G.forkLabD;
      G.laneAssistTarget = null;
      parkBike();
    }
    updateBiome(dt);
    if (!G.forkLabActive || !G.started) return;
    placeLaneArrows();
    placeBikeArrow();
    hideTraffic();
    readout();
  };

  function lookBetween(stand, look, back, height) {
    G.camera.position.set(stand.x - stand.fx * back, stand.y + height, stand.z - stand.fz * back);
    G.camera.up.set(0, 1, 0);
    G.camera.lookAt(look.x, look.y + 1, look.z);
  }

  const follow = G.updateFollowCamera;
  G.updateFollowCamera = (dt, isQute) => {
    if (G.forkLabActive) G.cameraMode = 'third';
    follow(dt, isQute);
    if (!G.forkLabActive || !G.started) return;
    const s = G.playerS;
    const rig = viewRig(s);
    const bikeLat = G.riderLatAt(s);
    const bike = G.embedRoad(s, bikeLat);
    if (G.camera.parent !== G.scene) G.scene.add(G.camera);
    if (cameraMode === 'both') {
      const spot = forkSpot(s);
      const height = Math.min(340, 64 + spot.gap * 0.9);
      G.camera.position.set(spot.x - spot.fx * 6, spot.y + height, spot.z - spot.fz * 6);
      G.camera.up.set(0, 1, 0);
      G.camera.lookAt(spot.x + spot.fx * 10, spot.y, spot.z + spot.fz * 10);
    } else if (cameraMode === 'bike') {
      lookBetween(bike, G.embedRoad(s + 70, bikeLat), 16, 36);
    } else if (cameraMode === 'exit' && rig.here.exit && rig.ahead.exit) {
      lookBetween(rig.here.exit, rig.ahead.exit, 16, 36);
    } else {
      lookBetween(rig.here.main, rig.ahead.main, 16, 36);
    }
    if (Math.abs(G.camera.fov - 68) > 0.1) {
      G.camera.fov = 68;
      G.camera.aspect = innerWidth / innerHeight;
      G.camera.updateProjectionMatrix();
    }
  };

  const atmosphere = G.updateAtmosphereAndTimeOfDay;
  if (atmosphere) {
    G.updateAtmosphereAndTimeOfDay = (dt, s) => {
      atmosphere(dt, s);
      if (!G.forkLabActive || !G.scene.fog) return;
      G.scene.fog.density = 0.00055;
      const uniforms = G.skyDomeMat && G.skyDomeMat.uniforms;
      if (uniforms && uniforms.fogDensity) uniforms.fogDensity.value = G.scene.fog.density;
    };
  }

  function boot() {
    if (started || !G.startGame) return;
    started = true;
    G.cameraMode = 'third';
    G.startGame();
    G.runIntro = 0;
    const hud = document.getElementById('hud');
    const controls = document.getElementById('controls');
    if (hud) hud.hidden = true;
    if (controls) controls.hidden = true;
  }

  requestAnimationFrame(boot);
}
