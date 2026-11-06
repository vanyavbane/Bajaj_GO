import { G } from './state.js';

const PRESETS = {
  fast: { shadows: 'low', scale: 1, lamps: 2, reflections: false, exposure: 1 },
  balanced: { shadows: 'low', scale: 1, lamps: 4, reflections: true, exposure: 1 },
  sharp: { shadows: 'high', scale: 1.25, lamps: 4, reflections: true, exposure: 1.18 }
};

const LABELS = {
  fast: 'Быстро',
  balanced: 'Ровно',
  sharp: 'Чётко',
  custom: 'Свой'
};

function copyPreset(name) {
  return { preset: name, ...PRESETS[name] };
}

function detectPreset(graphics) {
  for (const name of Object.keys(PRESETS)) {
    const preset = PRESETS[name];
    if (graphics.shadows === preset.shadows
      && graphics.scale === preset.scale
      && graphics.lamps === preset.lamps
      && graphics.reflections === preset.reflections
      && graphics.exposure === preset.exposure) {
      return name;
    }
  }
  return 'custom';
}

function sanitize(raw) {
  const shadows = raw && (raw.shadows === 'off' || raw.shadows === 'low' || raw.shadows === 'high')
    ? raw.shadows : 'low';
  const scale = raw && (raw.scale === 0.75 || raw.scale === 1 || raw.scale === 1.25) ? raw.scale : 1;
  const lamps = raw && (raw.lamps === 0 || raw.lamps === 2 || raw.lamps === 4) ? raw.lamps : 2;
  const reflections = !!(raw && raw.reflections);
  const exposure = raw && raw.exposure === 1.18 ? 1.18 : 1;
  const graphics = { shadows, scale, lamps, reflections, exposure, preset: 'custom' };
  graphics.preset = detectPreset(graphics);
  return graphics;
}

function defaultGraphics() {
  const dpr = window.devicePixelRatio || 1;
  const sharp = (navigator.hardwareConcurrency || 4) >= 8 && dpr <= 1.5;
  return copyPreset(sharp ? 'sharp' : 'fast');
}

export function initGraphics() {
  const saved = localStorage.getItem('bajajGO_lighting');
  let graphics = defaultGraphics();
  if (saved === 'dlss') graphics = copyPreset('sharp');
  else if (saved === 'normal') graphics = copyPreset('fast');
  else if (saved) {
    try {
      graphics = sanitize(JSON.parse(saved));
    } catch {
      graphics = defaultGraphics();
    }
  }
  G.graphics = graphics;
  G.graphicsLabel = LABELS[graphics.preset];

  function applyGraphics() {
    const current = G.graphics;
    G.graphicsLabel = LABELS[current.preset];
    if (!G.renderer || !G.sunLight || !G.M) return;

    const dpr = window.devicePixelRatio || 1;
    G.renderer.setPixelRatio(Math.min(dpr, current.scale));
    G.renderer.setSize(innerWidth, innerHeight);
    G.renderer.toneMappingExposure = current.exposure;
    const shadowsOn = current.shadows !== 'off';
    G.renderer.shadowMap.enabled = shadowsOn;
    G.sunLight.castShadow = shadowsOn;
    if (shadowsOn) {
      const size = current.shadows === 'high' ? 1024 : 512;
      G.sunLight.shadow.mapSize.set(size, size);
      if (G.sunLight.shadow.map) {
        G.sunLight.shadow.map.dispose();
        G.sunLight.shadow.map = null;
      }
    }
    const crisp = current.exposure === 1.18;
    G.M.road.envMapIntensity = current.reflections ? (crisp ? 1.15 : 0.7) : 0.45;
    G.M.chrome.envMapIntensity = current.reflections ? (crisp ? 1.65 : 1.1) : 0.8;
    G.M.glass.envMapIntensity = current.reflections ? (crisp ? 1.75 : 1.2) : 0.85;
  }

  function chooseGraphics(key, raw) {
    const current = G.graphics;
    if (key === 'preset' && PRESETS[raw]) {
      G.graphics = copyPreset(raw);
    } else if (key === 'shadows' || key === 'scale' || key === 'lamps' || key === 'reflections') {
      if (key === 'scale' || key === 'lamps') current[key] = Number(raw);
      else if (key === 'reflections') current.reflections = raw === 'true' || raw === '1';
      else current.shadows = raw;
      current.preset = detectPreset(current);
    }
    applyGraphics();
    G.saveGarage();
  }

  G.applyGraphics = applyGraphics;
  G.chooseGraphics = chooseGraphics;
}
