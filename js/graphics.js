import * as THREE from 'three';
import { G } from './state.js';

const PRESETS = {
  fast: { shadows: 'low', scale: 1, lamps: 2, reflections: false, exposure: 1 },
  balanced: { shadows: 'low', scale: 1, lamps: 4, reflections: true, exposure: 1 },
  sharp: { shadows: 'high', scale: 1.25, lamps: 6, reflections: true, exposure: 1.18 }
};

const LABELS = {
  fast: 'Быстро',
  balanced: 'Ровно',
  sharp: 'Чётко',
  custom: 'Свой'
};

function copyPreset(name) {
  return { preset: name, ...PRESETS[name], hdrPlus: false, sharpness: 0, brightness: 0 };
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

function clampNum(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function sanitize(raw) {
  const shadows = raw && (raw.shadows === 'off' || raw.shadows === 'low' || raw.shadows === 'high')
    ? raw.shadows : 'low';
  const scale = raw && (raw.scale === 0.75 || raw.scale === 1 || raw.scale === 1.25) ? raw.scale : 1;
  const lamps = raw && (raw.lamps === 0 || raw.lamps === 2 || raw.lamps === 4 || raw.lamps === 6) ? raw.lamps : 2;
  const reflections = !!(raw && raw.reflections);
  const exposure = raw && raw.exposure === 1.18 ? 1.18 : 1;
  const hdrPlus = !!(raw && raw.hdrPlus);
  const sharpness = clampNum(raw && raw.sharpness, -100, 100, 0);
  const brightness = clampNum(raw && raw.brightness, -100, 100, 0);
  const graphics = { shadows, scale, lamps, reflections, exposure, hdrPlus, sharpness, brightness, preset: 'custom' };
  graphics.preset = detectPreset(graphics);
  return graphics;
}

function defaultGraphics() {
  const dpr = window.devicePixelRatio || 1;
  const sharp = (navigator.hardwareConcurrency || 4) >= 8 && dpr <= 1.5;
  return copyPreset(sharp ? 'sharp' : 'fast');
}

function shadowMapSize(mode) {
  if (mode === 'high') return 2048;
  if (mode === 'low') return 1024;
  return 0;
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
  // 1 — настройки как есть, 0.5 — тише, 0 — тени и лишние фонари выключены.
  const runtime = { level: 1 };

  function effectiveGraphics() {
    const current = G.graphics;
    const level = runtime.level;
    let shadows = current.shadows;
    let scale = current.scale;
    let lamps = current.lamps;
    if (level <= 0) {
      shadows = 'off';
      scale = Math.min(scale, 0.75);
      lamps = 0;
    } else if (level < 1) {
      if (shadows === 'high') shadows = 'low';
      scale = Math.min(scale, 1);
      lamps = Math.min(lamps, 2);
    }
    return { ...current, shadows, scale, lamps };
  }

  function applyGraphics() {
    const current = G.graphics;
    const draw = effectiveGraphics();
    G.graphicsLabel = LABELS[current.preset];
    G.shadowQuality = draw.shadows;
    G.activeLampBudget = draw.lamps;
    if (!G.renderer || !G.sunLight || !G.M) return;

    const dpr = window.devicePixelRatio || 1;
    G.renderer.setPixelRatio(Math.min(dpr, draw.scale));
    G.renderer.setSize(innerWidth, innerHeight);
    G.renderer.toneMappingExposure = current.exposure;
    const shadowsOn = draw.shadows !== 'off';
    G.renderer.shadowMap.enabled = shadowsOn;
    G.sunLight.castShadow = shadowsOn;
    if (shadowsOn) {
      const size = shadowMapSize(draw.shadows);
      if (G.sunLight.shadow.mapSize.x !== size) {
        G.sunLight.shadow.mapSize.set(size, size);
        if (G.sunLight.shadow.map) {
          G.sunLight.shadow.map.dispose();
          G.sunLight.shadow.map = null;
        }
      }
      // Мягкая карта на высоком качестве. Низкое остаётся на обычном PCF:
      // меньше выборок, та же коробка.
      const shadowType = draw.shadows === 'high'
        ? THREE.PCFSoftShadowMap
        : THREE.PCFShadowMap;
      if (G.renderer.shadowMap.type !== shadowType) G.renderer.shadowMap.type = shadowType;
      G.sunLight.shadow.bias = -0.00018;
      G.sunLight.shadow.normalBias = 0.05;
    }
    const crisp = current.exposure === 1.18;
    const roadEnv = current.reflections ? (crisp ? 1.15 : 0.7) : 0.45;
    G.M.road.envMapIntensity = roadEnv;
    G.M.road.userData.baseEnvIntensity = roadEnv;
    G.M.chrome.envMapIntensity = current.reflections ? (crisp ? 1.65 : 1.1) : 0.8;
    G.M.glass.envMapIntensity = current.reflections ? (crisp ? 1.75 : 1.2) : 0.85;

    // Composer и буферы пост-эффектов должны совпадать с новым размером/DPR.
    if (G.applyPostFxSize) G.applyPostFxSize();

    if (G.postFx) {
      const b = (current.brightness || 0) / 100;
      if (G.postFx.brightnessPass) {
        G.postFx.brightnessPass.uniforms.uAmount.value = b;
        G.postFx.brightnessPass.enabled = Math.abs(b) > 0.001;
      }
      if (G.postFx.hdrPlusPass) G.postFx.hdrPlusPass.enabled = !!current.hdrPlus;
      const sh = (current.sharpness || 0) / 100;
      if (G.postFx.sharpenPass) {
        G.postFx.sharpenPass.uniforms.uAmount.value = sh;
        G.postFx.sharpenPass.enabled = Math.abs(sh) > 0.001;
      }
    }
  }

  function chooseGraphics(key, raw) {
    const current = G.graphics;
    if (key === 'preset' && PRESETS[raw]) {
      G.graphics = copyPreset(raw);
    } else if (key === 'shadows' || key === 'scale' || key === 'lamps' || key === 'reflections' || key === 'hdrPlus') {
      if (key === 'scale' || key === 'lamps') current[key] = Number(raw);
      else if (key === 'reflections') current.reflections = raw === 'true' || raw === '1';
      else if (key === 'hdrPlus') current.hdrPlus = raw === 'true' || raw === '1' || raw === true;
      else current.shadows = raw;
      current.preset = detectPreset(current);
    }
    applyGraphics();
    G.saveGarage();
  }

  function setGraphicsValue(key, value) {
    const current = G.graphics;
    if (key === 'sharpness' || key === 'brightness') {
      current[key] = clampNum(value, -100, 100, 0);
    }
    applyGraphics();
    G.saveGarage();
  }

  G.setGraphicsValue = setGraphicsValue;

  G.applyGraphics = applyGraphics;
  G.chooseGraphics = chooseGraphics;
  G.setGraphicsLoad = (level) => {
    const next = level <= 0 ? 0 : level < 1 ? 0.5 : 1;
    if (runtime.level === next) return;
    runtime.level = next;
    applyGraphics();
  };
}
