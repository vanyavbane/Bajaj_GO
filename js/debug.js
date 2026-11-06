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

  function placeAtExit(inside) {
    setKeys({ gas: false, brake: false, left: false, right: false });
    return G.debugPlaceAtExit ? G.debugPlaceAtExit(inside) : null;
  }

  function armExit() {
    return { ok: G.armExit ? !!G.armExit() : false, ...exitHint() };
  }

  function exitHint() {
    const el = document.getElementById('exit-hint');
    const feed = document.getElementById('event-feed');
    return {
      shown: !!(el && el.classList.contains('show')),
      text: document.getElementById('exit-hint-text')?.textContent || '',
      how: document.getElementById('exit-hint-how')?.textContent || '',
      armed: !!(el && el.classList.contains('armed')),
      button: document.getElementById('btn-take-exit')?.textContent || '',
      modal: !!G.uiModal,
      feed: feed ? [...feed.children].map((node) => node.textContent) : []
    };
  }

  window.__bajaj = { snapshot, ride, setKeys, frame, errors, feed, placeAtExit, armExit, exitHint, replayAfterMenu };
}
