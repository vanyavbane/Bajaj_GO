import {
  AUDIO_BUS_KEYS,
  AUDIO_FILES,
  DEFAULT_AUDIO_SETTINGS,
  ENGINE_VOICES,
  SFX_KEYS,
  allowSfx,
  clampPercent,
  engineGain,
  engineRate,
  rainSoundGain,
  readAudioSettings,
  saveAudioSettings,
  thunderFile,
  thunderRate,
  windGain,
} from './engine/audio.ts';
import { G } from './state.js';

const GAMEPLAY_BUSES = ['engine', 'ambient', 'weather'];

/**
 *AudioManager: AudioContext создаётся только после первого жеста, все файлы
 * грузятся лениво и кэшируются. Отсутствующий MP3 никогда не роняет игру.
 */
export function initAudio() {
  const storage = getStorage();
  let settings = readAudioSettings(storage);
  let ctx = null;
  let master = null;
  let gameplayGain = null;
  /** @type {Record<string, GainNode>} */
  const buses = Object.create(null);
  /** @type {Map<string, AudioBuffer>} */
  const buffers = new Map();
  /** @type {Map<string, Promise<AudioBuffer|null>>} */
  const pending = new Map();
  /** @type {Set<string>} */
  const failed = new Set();
  /** @type {Set<string>} */
  const warned = new Set();
  /** @type {Record<string, number>} */
  const lastPlayed = Object.create(null);

  let inRun = false;
  let active = false;
  let paused = false;
  let engineId = '';
  let engineVoice = null;
  let engineSourceKey = '';
  let engineSource = null;
  let engineLevel = null;
  let engineFilter = null;
  /** @type {OscillatorNode[]} */
  let engineOscs = [];
  let electricOsc = null;
  let electricGain = null;
  /** @type {Record<string, { source: AudioBufferSourceNode, gain: GainNode }>} */
  const cityLoops = Object.create(null);
  let windLoop = null;
  let rainLoop = null;
  let rainWanted = 0;
  let thunderSource = null;
  let noiseBuffer = null;
  let night = false;
  let pitch = 1;
  let lastSpeed = 0;
  let lastMaxSpeed = 1;
  let lastRpmFrac = 0;
  let lastRate = 1;
  let lastGas = false;
  let boostUntil = 0;
  let lastModAt = 0;

  function getStorage() {
    try {
      return window.localStorage;
    } catch {
      return { getItem: () => null, setItem: () => {} };
    }
  }

  function warnOnce(key, message, error) {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(`[bajaj audio] ${message}`, error || '');
  }

  function ensureContext() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      warnOnce('no-webaudio', 'WebAudio недоступен — игра работает без звука');
      return null;
    }
    try {
      ctx = new Ctx();
      master = ctx.createGain();
      master.gain.value = settings.soundOn ? settings.master / 100 : 0;
      master.connect(ctx.destination);
      gameplayGain = ctx.createGain();
      gameplayGain.gain.value = active ? 1 : 0;
      gameplayGain.connect(master);
      buses.master = master;
      for (const bus of AUDIO_BUS_KEYS) {
        if (bus === 'master') continue;
        const node = ctx.createGain();
        node.gain.value = settings[bus] / 100;
        node.connect(GAMEPLAY_BUSES.includes(bus) ? gameplayGain : master);
        buses[bus] = node;
      }
    } catch (error) {
      warnOnce('audio-context', 'Не удалось создать AudioContext — игра работает без звука', error);
      ctx = null;
      master = null;
      gameplayGain = null;
      return null;
    }
    return ctx;
  }

  function rampParam(param, target, duration = 0.1) {
    if (!param || !ctx) return;
    const value = Number.isFinite(target) ? target : 0;
    const now = ctx.currentTime;
    if (typeof param.cancelAndHoldAtTime === 'function') {
      param.cancelAndHoldAtTime(now);
    } else {
      const current = Number.isFinite(param.value) ? param.value : 0;
      param.cancelScheduledValues(now);
      param.setValueAtTime(current, now);
    }
    param.linearRampToValueAtTime(value, now + Math.max(0.01, duration));
  }

  function applySettings() {
    G.soundMuted = !settings.soundOn;
    if (!ctx) return;
    rampParam(master.gain, settings.soundOn ? settings.master / 100 : 0, 0.1);
    for (const bus of AUDIO_BUS_KEYS) {
      if (bus !== 'master' && buses[bus]) rampParam(buses[bus].gain, settings[bus] / 100, 0.1);
    }
  }

  function persist() {
    saveAudioSettings(storage, settings);
    applySettings();
  }

  function load(key) {
    if (buffers.has(key)) return Promise.resolve(buffers.get(key));
    if (pending.has(key)) return pending.get(key);
    const url = AUDIO_FILES[key];
    if (!url || failed.has(key)) return Promise.resolve(null);
    const promise = (async () => {
      const audioCtx = ensureContext();
      if (!audioCtx) return null;
      try {
        const response = await fetch(url, { cache: 'force-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        const decoded = await new Promise((resolve, reject) => {
          const result = audioCtx.decodeAudioData(bytes, resolve, reject);
          if (result && typeof result.then === 'function') result.then(resolve, reject);
        });
        if (!decoded) throw new Error('decodeAudioData вернул пустой буфер');
        buffers.set(key, decoded);
        afterLoad(key);
        return decoded;
      } catch (error) {
        failed.add(key);
        warnOnce(key, `Файл ${url} не загружен — этот звук пропущен`, error);
        return null;
      } finally {
        pending.delete(key);
      }
    })();
    pending.set(key, promise);
    return promise;
  }

  function afterLoad(key) {
    if (!ctx && !ensureContext()) return;
    if (key === `engine:${engineId}`) refreshEngine();
    if (key.startsWith('ambient:')) refreshAmbient();
    if (key === 'weather:rain_loop' && rainWanted > 0) refreshRain();
  }

  function getNoise() {
    if (noiseBuffer || !ctx) return noiseBuffer;
    const length = Math.floor(ctx.sampleRate * 2);
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return noiseBuffer;
  }

  /* ---------- Двигатель ---------- */

  function stopEngine(fade = 0) {
    const stopAt = ctx ? ctx.currentTime + fade : 0;
    const stopNode = (node) => {
      try { node.stop(stopAt); } catch { /* уже остановлен */ }
    };
    if (engineSource) stopNode(engineSource);
    for (const osc of engineOscs) stopNode(osc);
    if (electricOsc) stopNode(electricOsc);
    engineSource = null;
    engineOscs = [];
    electricOsc = null;
    electricGain = null;
    engineFilter = null;
    engineSourceKey = '';
    const level = engineLevel;
    if (level && ctx) {
      rampParam(level.gain, 0, Math.max(0.1, fade || 0.1));
      const old = level;
      setTimeout(() => { try { old.disconnect(); } catch { /* нет подключения */ } }, Math.ceil(Math.max(0.1, fade) * 1000) + 80);
    }
    engineLevel = null;
  }

  function refreshEngine() {
    if (!ctx || !inRun || !engineId) return;
    const key = `engine:${engineId}`;
    if (engineSourceKey === key && (engineSource || engineOscs.length)) return;
    stopEngine();
    const voice = ENGINE_VOICES[engineId] || ENGINE_VOICES.ns125;
    engineVoice = voice;
    const level = ctx.createGain();
    level.gain.value = 0;
    level.connect(buses.engine);
    engineLevel = level;
    const buffer = buffers.get(key);
    if (buffer) {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.playbackRate.value = lastRate;
      source.connect(level);
      source.start();
      engineSource = source;
      engineSourceKey = key;
    } else {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = voice.filterHz;
      filter.connect(level);
      engineFilter = filter;
      for (const detune of [0, voice.detune]) {
        const osc = ctx.createOscillator();
        osc.type = voice.type;
        osc.frequency.value = voice.baseHz * lastRate;
        osc.detune.value = detune;
        osc.connect(filter);
        osc.start();
        engineOscs.push(osc);
      }
      if (voice.electricHz) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = voice.electricHz * lastRate;
        gain.gain.value = 0.016;
        osc.connect(gain);
        gain.connect(level);
        osc.start();
        electricOsc = osc;
        electricGain = gain;
      }
      engineSourceKey = `fallback:${engineId}`;
      load(key);
    }
    rampParam(level.gain, engineGain(lastRpmFrac), 0.25);
  }

  function modulateEngine(rate, gain) {
    lastRate = rate;
    if (!ctx || !engineLevel) return;
    const now = ctx.currentTime;
    rampParam(engineLevel.gain, gain, 0.12);
    if (engineSource) rampParam(engineSource.playbackRate, rate, 0.06);
    for (const osc of engineOscs) {
      if (engineVoice) rampParam(osc.frequency, engineVoice.baseHz * rate, 0.06);
    }
    if (engineFilter && engineVoice) {
      engineFilter.frequency.setTargetAtTime(engineVoice.filterHz * rate, now, 0.08);
    }
    if (electricOsc && engineVoice && engineVoice.electricHz) {
      electricOsc.frequency.setTargetAtTime(engineVoice.electricHz * rate, now, 0.08);
      if (electricGain) electricGain.gain.setTargetAtTime(0.008 + 0.02 * lastRpmFrac, now, 0.1);
    }
  }

  /* ---------- Окружение: город, ветер ---------- */

  function makeLoop(key, bus, gainValue, fallbackBuffer = null) {
    const source = ctx.createBufferSource();
    const buffer = buffers.get(key);
    source.buffer = buffer || fallbackBuffer;
    if (!source.buffer) return null;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(buses[bus]);
    source.start();
    rampParam(gain.gain, gainValue, 0.5);
    return { source, gain };
  }

  function refreshAmbient() {
    if (!ctx || !inRun) return;
    for (const key of ['city_day', 'city_night']) {
      const fileKey = `ambient:${key}`;
      let loop = cityLoops[key];
      if (!loop && buffers.has(fileKey)) {
        loop = makeLoop(fileKey, 'ambient', 0);
        if (loop) cityLoops[key] = loop;
      }
      if (!buffers.has(fileKey)) load(fileKey);
      if (loop) rampParam(loop.gain.gain, (key === 'city_night' ? night : !night) ? 0.5 : 0, 1.8);
    }
    const windKey = 'ambient:wind_high_speed';
    if (!windLoop && buffers.has(windKey)) windLoop = makeLoop(windKey, 'ambient', 0);
    if (!buffers.has(windKey)) load(windKey);
    if (windLoop) rampParam(windLoop.gain.gain, windGain(lastSpeed), 0.2);
  }

  function stopAmbient() {
    const stopAll = (loop) => {
      if (!loop || !ctx) return;
      rampParam(loop.gain.gain, 0, 0.3);
      try { loop.source.stop(ctx.currentTime + 0.35); } catch { /* уже остановлен */ }
    };
    stopAll(cityLoops.city_day);
    stopAll(cityLoops.city_night);
    stopAll(windLoop);
    cityLoops.city_day = null;
    cityLoops.city_night = null;
    windLoop = null;
  }

  /* ---------- Погода: дождь и гром ---------- */

  function refreshRain() {
    if (!ctx || !inRun || rainWanted <= 0) return;
    if (rainLoop) {
      rampParam(rainLoop.gain.gain, rainSoundGain(rainWanted), 2.2);
      return;
    }
    const fileKey = 'weather:rain_loop';
    const buffer = buffers.get(fileKey);
    if (!buffer) {
      load(fileKey);
      // Прежний процедурный дождь остаётся fallback-ом без MP3.
      const source = ctx.createBufferSource();
      source.buffer = getNoise();
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2600;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(buses.weather);
      source.start();
      rainLoop = { source, gain };
    } else {
      rainLoop = makeLoop(fileKey, 'weather', 0);
    }
    if (rainLoop) rampParam(rainLoop.gain.gain, rainSoundGain(rainWanted), 2.2);
  }

  function setRain(level) {
    rainWanted = Math.max(0, Math.min(1, Number(level) || 0));
    if (!ctx || !inRun || !active) {
      if (rainLoop && ctx) {
        rampParam(rainLoop.gain.gain, 0, 0.3);
        try { rainLoop.source.stop(ctx.currentTime + 0.35); } catch { /* уже остановлен */ }
        rainLoop = null;
      }
      return;
    }
    if (rainWanted <= 0) {
      if (rainLoop) {
        rampParam(rainLoop.gain.gain, 0, 2.5);
        try { rainLoop.source.stop(ctx.currentTime + 2.6); } catch { /* уже остановлен */ }
        rainLoop = null;
      }
      return;
    }
    refreshRain();
  }

  function playThunder() {
    if (!settings.soundOn || !ctx || !inRun || !active || thunderSource) return;
    const key = `weather:${thunderFile()}`;
    const buffer = buffers.get(key);
    if (!buffer) load(key);
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = buffer || getNoise();
    if (!source.buffer) return;
    source.playbackRate.value = buffer ? thunderRate() : 1;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(buffer ? 900 : 340, now);
    filter.frequency.exponentialRampToValueAtTime(buffer ? 260 : 90, now + 2.2);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(buffer ? 0.7 : 0.14, now + 0.28);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(buses.weather);
    source.onended = () => {
      thunderSource = null;
      try { source.disconnect(); filter.disconnect(); gain.disconnect(); } catch { /* уже отключено */ }
    };
    source.start(now);
    source.stop(now + 2.25);
    thunderSource = source;
  }

  /* ---------- SFX и процедурные тоны ---------- */

  function playSfx(key, opts = {}) {
    if (!SFX_KEYS.includes(key) || !settings.soundOn) return;
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!allowSfx(key, nowMs, lastPlayed)) return;
    const audioCtx = ensureContext();
    if (!audioCtx) return;
    const fileKey = `sfx:${key}`;
    const buffer = buffers.get(fileKey);
    if (!buffer) {
      load(fileKey);
      return;
    }
    try {
      const source = audioCtx.createBufferSource();
      const gain = audioCtx.createGain();
      source.buffer = buffer;
      source.playbackRate.value = clampRate((opts.rate ?? 1) * pitch);
      gain.gain.value = Math.max(0, Math.min(2, opts.volume ?? 1));
      source.connect(gain);
      gain.connect(buses.sfx);
      source.onended = () => {
        try { source.disconnect(); gain.disconnect(); } catch { /* уже отключено */ }
      };
      source.start();
    } catch (error) {
      warnOnce(`play:${key}`, `Не удалось воспроизвести ${fileKey}`, error);
    }
  }

  function clampRate(value) {
    return Math.max(0.25, Math.min(2, Number.isFinite(value) ? value : 1));
  }

  function playTone(opts = {}) {
    if (!settings.soundOn) return;
    const audioCtx = ensureContext();
    if (!audioCtx) return;
    const {
      freq = 440, dur = 0.16, type = 'sine', level = 0.07, delay = 0,
      bus = 'sfx', sweepTo = 0, filterFrom = 0, filterTo = 0,
    } = opts;
    try {
      const t = audioCtx.currentTime + Math.max(0, delay);
      const osc = audioCtx.createOscillator();
      osc.type = type;
      const frequency = Math.max(20, Number(freq) * pitch);
      osc.frequency.setValueAtTime(frequency, t);
      if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, Number(sweepTo) * pitch), t + dur);
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), t + Math.min(0.02, dur * 0.25));
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let tail = osc;
      let filter = null;
      if (filterFrom) {
        filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(filterFrom, t);
        if (filterTo) filter.frequency.exponentialRampToValueAtTime(Math.max(40, filterTo), t + dur);
        osc.connect(filter);
        tail = filter;
      }
      tail.connect(gain);
      gain.connect(buses[bus] || buses.sfx);
      osc.start(t);
      osc.stop(t + dur + 0.03);
      osc.onended = () => {
        try { osc.disconnect(); gain.disconnect(); if (filter) filter.disconnect(); } catch { /* уже отключено */ }
      };
    } catch (error) {
      warnOnce('tone', 'Процедурный звук пропущен', error);
    }
  }

  /* ---------- Состояния заезда ---------- */

  function setGameplayActive(value) {
    const next = !!value && !paused;
    if (active === next) return;
    active = next;
    if (!ctx) return;
    rampParam(gameplayGain.gain, active ? 1 : 0, 0.2);
    if (!active && engineLevel) rampParam(engineLevel.gain, 0, 0.2);
    if (!active && rainLoop) rampParam(rainLoop.gain.gain, 0, 0.2);
  }

  function startRun(bikeId, nightish = false) {
    ensureContext();
    inRun = true;
    paused = false;
    active = true;
    engineId = bikeId || G.selectedBikeId || 'boxer100es';
    night = !!nightish;
    lastSpeed = 0;
    lastMaxSpeed = 1;
    lastRpmFrac = 0;
    lastRate = 1;
    lastGas = false;
    boostUntil = 0;
    if (ctx) rampParam(gameplayGain.gain, 1, 0.2);
    refreshEngine();
    refreshAmbient();
  }

  function stopRun() {
    inRun = false;
    active = false;
    stopEngine(0.4);
    stopAmbient();
    setRain(0);
    if (ctx) rampParam(gameplayGain.gain, 0, 0.2);
  }

  function setPaused(value) {
    paused = !!value;
    setGameplayActive(!paused && inRun);
    if (ctx) {
      if (ctx.state === 'suspended' && !paused) ctx.resume().catch(() => {});
    }
  }

  function update(_dt, opts = {}) {
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (nowMs - lastModAt < 33) return; // не чаще ~30 Гц
    lastModAt = nowMs;
    if (!ctx) return;
    const speed = Number(opts.speed);
    const maxSpeed = Number(opts.maxSpeed);
    lastSpeed = Number.isFinite(speed) ? Math.max(0, speed) : 0;
    lastMaxSpeed = Math.max(1, Number.isFinite(maxSpeed) ? maxSpeed : 1);
    lastRpmFrac = Math.min(1, lastSpeed / lastMaxSpeed);
    const gas = !!opts.gas;
    if (gas && !lastGas) boostUntil = nowMs + 100;
    lastGas = gas;
    const boost = gas || nowMs < boostUntil ? 1.08 : 1;
    modulateEngine(engineRate(lastSpeed, lastMaxSpeed) * boost, engineGain(lastRpmFrac));
    if (windLoop) rampParam(windLoop.gain.gain, windGain(lastSpeed), 0.15);
    if (typeof opts.night === 'boolean' && opts.night !== night) {
      night = opts.night;
      refreshAmbient();
    }
  }

  /**
   * Пауза/меню/модалки глушат только игровые шины: клики интерфейса
   * продолжают работать через sfx и ui, подключённые к master напрямую.
   */
  applySettings();
  G.soundMuted = !settings.soundOn;
  G.setSoundMuted = (muted) => {
    settings.soundOn = !muted;
    persist();
  };
  G.setRainSound = (level) => setRain(level);
  G.playThunder = () => playThunder();

  const audio = {
    init: ensureContext,
    context: ensureContext,
    bus: (name) => {
      ensureContext();
      return buses[name] || null;
    },
    get settings() {
      return { ...settings };
    },
    get active() {
      return active;
    },
    get engineId() {
      return engineId;
    },
    get pitch() {
      return pitch;
    },
    setPitch(value) {
      pitch = Math.max(0.45, Math.min(1, Number(value) || 1));
    },
    setVolume(bus, value) {
      if (!(bus in DEFAULT_AUDIO_SETTINGS) || bus === 'soundOn') return;
      settings[bus] = clampPercent(value, DEFAULT_AUDIO_SETTINGS[bus]);
      persist();
    },
    setSoundOn(value) {
      settings.soundOn = !!value;
      persist();
    },
    toggleSound() {
      settings.soundOn = !settings.soundOn;
      persist();
    },
    reset() {
      settings = { ...DEFAULT_AUDIO_SETTINGS };
      persist();
    },
    startRun,
    stopRun,
    setGameplayActive,
    setPaused,
    setNight(value) {
      if (night === !!value) return;
      night = !!value;
      refreshAmbient();
    },
    setRain,
    setRainSound: setRain,
    playThunder,
    playSfx,
    playTone,
    playClick() {
      playSfx('click');
    },
    update,
    load,
    snapshot() {
      return {
        settings: { ...settings },
        contextState: ctx ? ctx.state : 'none',
        active,
        inRun,
        engineId,
        engineSourceKey,
        buffers: buffers.size,
        failed: [...failed],
        rain: rainWanted,
        thunder: !!thunderSource,
        night,
      };
    },
  };
  G.audio = audio;

  const unlock = () => {
    const audioCtx = ensureContext();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  };
  for (const event of ['pointerdown', 'touchend', 'keydown']) {
    document.addEventListener(event, unlock, { capture: true, passive: true });
  }

  // Клики интерфейса: покупки и заправка озвучиваются отдельным purchase/refuel.
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!target || !(target instanceof Element)) return;
    const el = target.closest('sl-button, button, [role="button"], .ctrl');
    if (!el) return;
    if (el.closest('[data-buy], [data-buy-upg], [data-toggle-upg], #fuel-fill, [data-service]')) return;
    playSfx('click');
  }, true);

  return audio;
}
