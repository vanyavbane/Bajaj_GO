import { devToolsEnabled } from './dev-flag.js';
import { G } from './state.js';

function round(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return n;
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

function vec(v) {
  if (!v) return null;
  return { x: round(v.x), y: round(v.y), z: round(v.z) };
}

/**
 * Прячет снимок сцены на window.__bajaj. На экран ничего не рисует.
 * В собранном файле молчит, пока в адресе нет `?debug`.
 */
export function initDebug() {
  if (!devToolsEnabled()) return;

  const errors = [];
  const pushError = (text) => {
    errors.push(String(text));
    if (errors.length > 20) errors.shift();
  };
  addEventListener('error', (e) => pushError(e.message));
  addEventListener('unhandledrejection', (e) => pushError(e.reason));
  const consoleError = console.error;
  console.error = (...args) => {
    pushError(args.map((item) => (item instanceof Error ? item.message : String(item))).join(' '));
    consoleError.apply(console, args);
  };

  let frames = 0;
  let fps = 0;
  let acc = 0;
  let last = performance.now();
  const countFrames = (now) => {
    frames += 1;
    acc += now - last;
    last = now;
    if (acc >= 500) {
      fps = Math.round((frames * 1000) / acc);
      frames = 0;
      acc = 0;
    }
    requestAnimationFrame(countFrames);
  };
  requestAnimationFrame(countFrames);

  function tally() {
    let meshes = 0;
    let visible = 0;
    let lights = 0;
    G.scene.traverse((obj) => {
      if (obj.isLight) lights += 1;
      if (obj.isMesh) {
        meshes += 1;
        if (obj.visible) visible += 1;
      }
    });
    return { meshes, visible, lights };
  }

  function snapshot() {
    const info = G.renderer && G.renderer.info;
    const bike = G.selectedBike ? G.selectedBike() : null;
    return {
      fps,
      screen: G.currentScreen,
      started: !!G.started,
      paused: !!G.paused,
      ended: !!G.ended,
      speed: round(G.speed, 1),
      playerS: round(G.playerS, 1),
      lane: round(G.laneOffset, 2),
      airborne: !!(G.jumpState && G.jumpState.airborne),
      bike: bike ? bike.id : null,
      cameraMode: G.cameraMode,
      camera: {
        position: vec(G.camera && G.camera.position),
        parent: G.camera && G.camera.parent ? (G.camera.parent === G.scene ? 'scene' : 'rider') : null
      },
      bikePosition: vec(G.bikeRoot && G.bikeRoot.position),
      graphics: G.graphics || null,
      biome: {
        current: G.currentBiome,
        dominant: G.biomeDominant,
        zone: G.biomeState ? G.biomeState.zone : null,
        meters: round(G.biomeState ? G.biomeState.meters : null),
        roadWidth: round(G.roadWidthAtS ? G.roadWidthAtS(G.playerS) : null),
        transition: G.biomeTransition || null,
        visits: Array.isArray(G.visitCounts) ? G.visitCounts.slice() : null,
        pending: G.pendingBiome
      },
      repair: G.repairEvent ? {
        active: !!G.repairEvent.active,
        s: round(G.repairEvent.s, 1),
        laneIdx: G.repairEvent.laneIdx,
        length: round(G.repairEvent.length, 1),
        biome: G.repairEvent.biome || '',
        progress: round(G.repairProgress, 1),
        next: round(G.repairNextS, 1)
      } : null,
      split: G.splitState ? {
        active: !!G.splitState.active,
        zone: G.splitState.zone,
        s: round(G.splitState.s, 1),
        d: round(G.splitState.d, 1),
        side: G.splitState.side,
        chosen: !!G.splitState.chosen,
        chosenSide: G.splitState.chosenSide,
        choices: Array.isArray(G.splitState.choices) ? G.splitState.choices.slice() : null
      } : null,
      render: info ? {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures
      } : null,
      scene: G.scene ? tally() : null,
      errors: errors.slice()
    };
  }

  function setKeys(partial) {
    for (const key of ['left', 'right', 'gas', 'brake']) {
      if (Object.prototype.hasOwnProperty.call(partial, key)) G.keys[key] = !!partial[key];
    }
  }

  function sample() {
    return {
      t: Math.round(performance.now()),
      s: round(G.playerS, 1),
      speed: round(G.speed, 1),
      lane: round(G.laneOffset, 2)
    };
  }

  function ride(ms = 1200) {
    if (!G.started && G.startGame) G.startGame();
    setKeys({ gas: true, brake: false, left: false, right: false });
    const trace = [];
    const startedAt = performance.now();
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        trace.push(sample());
        if (performance.now() - startedAt < ms) return;
        clearInterval(timer);
        setKeys({ gas: false });
        resolve({ snapshot: snapshot(), trace });
      }, 100);
    });
  }

  function frame() {
    return G.renderer.domElement.toDataURL('image/jpeg', 0.6);
  }

  function feed(text, tone, level) {
    G.pushFeed(text, tone, level);
    const root = document.getElementById('event-feed');
    return {
      count: root ? root.children.length : 0,
      texts: root ? [...root.children].map((node) => node.textContent) : []
    };
  }

  function replayAfterMenu() {
    setKeys({ gas: false, brake: false, left: false, right: false });
    G.playerS = 2500;
    G.laneOffset = G.START_LANE;
    if (G.debugStampExitTrack) G.debugStampExitTrack();
    G.startGame();
    return { playerS: G.playerS, lane: G.laneOffset, modal: !!G.uiModal };
  }

  function placeAtExit(inside, speed) {
    setKeys({ gas: false, brake: false, left: false, right: false });
    const placed = G.debugPlaceAtExit ? G.debugPlaceAtExit(inside) : null;
    if (speed != null && Number.isFinite(Number(speed))) G.speed = Number(speed);
    return placed;
  }

  function exitHint() {
    const el = document.getElementById('exit-hint');
    const feed = document.getElementById('event-feed');
    return {
      shown: !!(el && el.classList.contains('show')),
      text: document.getElementById('exit-hint-text')?.textContent || '',
      how: document.getElementById('exit-hint-how')?.textContent || '',
      slow: !!(el && el.classList.contains('slow')),
      fast: !!(el && el.classList.contains('fast')),
      modal: !!G.uiModal,
      feed: feed ? [...feed.children].map((node) => node.textContent) : []
    };
  }

  /** Ставит байк в точку маршрута, не перезапуская заезд. Только для проверок. */
  function teleport(s, lane) {
    const to = Math.max(0, Number(s));
    if (Number.isFinite(to)) G.playerS = to;
    if (lane != null && Number.isFinite(Number(lane))) G.laneOffset = Number(lane);
    G.lateralVelocity = 0;
    G.slipDriftVel = 0;
    if (G.debugStampExitTrack) G.debugStampExitTrack();
    return {
      playerS: round(G.playerS, 1),
      lane: round(G.laneOffset, 2),
      split: G.splitState ? round(G.splitState.s - G.playerS, 1) : null
    };
  }

  /** Покадровый след камеры и байка: по нему видно дрожь, которой нет в снимке. */
  function probe(ms = 1500) {
    const frames = [];
    const startedAt = performance.now();
    return new Promise((resolve) => {
      const tick = () => {
        const cam = G.camera.position;
        const bike = G.bikeRoot.position;
        frames.push({
          t: Math.round(performance.now() - startedAt),
          s: round(G.playerS, 2),
          speed: round(G.speed, 1),
          lane: round(G.laneOffset, 3),
          cam: [round(cam.x, 3), round(cam.y, 3), round(cam.z, 3)],
          bike: [round(bike.x, 3), round(bike.y, 3), round(bike.z, 3)],
          camRot: [round(G.camera.rotation.x, 4), round(G.camera.rotation.y, 4), round(G.camera.rotation.z, 4)],
          spread: round(G.forkSpreadAtS ? G.forkSpreadAtS(G.playerS) : 0, 2),
          shift: round(G.forkCenterShiftAtS ? G.forkCenterShiftAtS(G.playerS) : 0, 2),
          close: round(G.forkCloseAtS ? G.forkCloseAtS(G.playerS) : 0, 3),
          split: G.splitState ? {
            active: !!G.splitState.active,
            d: round(G.splitState.d, 1),
            chosen: !!G.splitState.chosen,
            chosenSide: G.splitState.chosenSide
          } : null
        });
        if (performance.now() - startedAt < ms) requestAnimationFrame(tick);
        else resolve(frames);
      };
      requestAnimationFrame(tick);
    });
  }

  /** Начать заезд с указанного километра — так же, как после сохранения пробега. */
  function startAt(meters, viewMode) {
    G.biomeStoredMeters = Math.max(0, Number(meters) || 0);
    if (viewMode) view(viewMode);
    if (G.startGame) G.startGame();
    const split = G.biomeState ? G.splitState : null;
    return {
      playerS: round(G.playerS, 1),
      meters: round((G.biomeOffsetM || 0) + G.playerS, 1),
      zone: G.biomeState ? G.biomeState.zone : null,
      splitAhead: split ? round(split.s - G.playerS, 1) : null
    };
  }

  /** Принудительный дождь для проверки мокрого асфальта. */
  function forceWeather(on = true) {
    if (!G.weather) return null;
    G.weather.raining = !!on;
    G.weather.rain = on ? 1 : 0;
    G.weather.cloud = on ? 1 : 0;
    G.weather.wet = on ? 1 : 0;
    G.weather.rainEndsAt = on ? 1e9 : 0;
    G.weather.nextRainAt = on ? 0 : 1e9;
    const road = G.M && G.M.road;
    return {
      raining: G.weather.raining,
      wet: G.weather.wet,
      roadRoughness: road ? round(road.roughness, 3) : null,
      roadMetalness: road ? round(road.metalness, 3) : null,
      roadRightRoughness: G.debugRoadRight ? round(G.debugRoadRight.roughness, 3) : null,
      roadRightMetalness: G.debugRoadRight ? round(G.debugRoadRight.metalness, 3) : null
    };
  }

  /** Переключает вид камеры без похода в настройки. */
  function view(mode) {
    const want = mode === 'cockpit' ? 'cockpit' : 'third';
    if (G.cameraMode !== want && G.toggleCameraMode) G.toggleCameraMode();
    return {
      cameraMode: G.cameraMode,
      parent: G.camera && G.camera.parent ? (G.camera.parent === G.scene ? 'scene' : 'rider') : null
    };
  }

  window.__bajaj = {
    snapshot, ride, setKeys, frame, errors, feed, placeAtExit, exitHint,
    replayAfterMenu, teleport, probe, forceWeather, view, startAt,
    // Только в режиме `?debug`: живое состояние. В обычном собранном файле
    // объекта нет, поэтому на игру это не влияет.
    G
  };
}
