import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { G } from './state.js';

/* ===========================================================================
 * 18. ПОСТ-ЭФФЕКТЫ: MOTION BLUR И GOD RAYS (ЛУЧИ ОТ СОЛНЦА)
 * ---------------------------------------------------------------------------
 * Порядок рендера:
 *   RenderPass (слой 0: мир) → GodRaysPass → MotionBlurPass → OutputPass.
 *   Затем слой 1 (мотоцикл/кокпит) рисуется напрямую в canvas поверх кадра,
 *   поэтому размытие и лучи его не касаются. HUD живёт в HTML и защищён by design.
 *
 * Важно: при рендере в render target (EffectComposer) three не применяет
 * tone mapping — его делает только OutputPass (финальный проход в canvas),
 * поэтому цветовая цепочка не удваивается.
 * ========================================================================= */

const KEY_MB = 'bajajGO_motionBlur';
const KEY_MB_INTENSITY = 'bajajGO_motionBlurIntensity';
const KEY_MB_COMFORT = 'bajajGO_motionBlurComfort';
const KEY_GR = 'bajajGO_godRays';
const KEY_GR_INTENSITY = 'bajajGO_godRaysIntensity';
const KEY_GR_LENGTH = 'bajajGO_godRaysLength';

const MB_DEFAULT_INTENSITY = 60;
const GR_DEFAULT_INTENSITY = 55;
const GR_DEFAULT_LENGTH = 50;

const FULLSCREEN_VERTEX = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/* ---------------------------------------------------------------------------
 * Motion Blur: 7 горизонтальных сэмплов с треугольными весами.
 * Сила зависит от скорости, растёт к краям, в центре ослаблена, верх/низ
 * не размываются. Приставка значения — доля от максимума (0…1).
 * ------------------------------------------------------------------------ */
const MOTION_BLUR_FRAGMENT = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform vec2 uResolution;
  uniform float uSpeedRatio;
  uniform float uIntensity;
  uniform float uComfort;
  varying vec2 vUv;

  void main() {
    float speedFactor = smoothstep(0.35, 1.0, uSpeedRatio);
    float radius = length(vUv - 0.5);
    float edgeFactor = smoothstep(0.28, 0.95, radius);
    float comfortCenter = smoothstep(0.55, 0.92, radius);
    float centerMask = mix(1.0, comfortCenter, uComfort);
    float verticalMask = smoothstep(0.13, 0.32, vUv.y) * smoothstep(0.96, 0.82, vUv.y);

    // Не больше ~7 px по ширине всего размытия на 1920 px.
    float blurPx = 7.0 * (uResolution.x / 1920.0);
    blurPx = min(blurPx, 9.0) * mix(1.0, 0.5, uComfort);
    float offset = blurPx * 0.5 * uIntensity * speedFactor * edgeFactor * centerMask * verticalMask;

    vec3 sum = vec3(0.0);
    float totalWeight = 0.0;
    for (int i = -3; i <= 3; i++) {
      float k = float(i);
      float w = 1.0 - abs(k) / 4.0;
      vec2 sampleUv = vUv + vec2((offset * k / 3.0) / uResolution.x, 0.0);
      sum += texture2D(tDiffuse, clamp(sampleUv, vec2(0.001), vec2(0.999))).rgb * w;
      totalWeight += w;
    }
    gl_FragColor = vec4(sum / totalWeight, 1.0);
  }
`;

class MotionBlurPass extends Pass {
  constructor() {
    super();
    this.enabled = true;
    this.renderToScreen = false;
    this.needsSwap = true;
    this.uniforms = {
      tDiffuse: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uSpeedRatio: { value: 0 },
      uIntensity: { value: 0 },
      uComfort: { value: 0 }
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: MOTION_BLUR_FRAGMENT,
      depthTest: false,
      depthWrite: false
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }

  setSize(width, height) {
    this.uniforms.uResolution.value.set(width, height);
  }

  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }
}

/* ---------------------------------------------------------------------------
 * God Rays: радиальный screen-space blur ярких пикселей от солнца.
 * Считается в буфере половинного (или четвертного) разрешения, затем
 * складывается с кадром. Тёплый цвет берётся из sunLight.color.
 * ------------------------------------------------------------------------ */
const GOD_RAYS_FRAGMENT = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform vec2 uSunScreenUV;
  uniform float uLength;
  varying vec2 vUv;

  void main() {
    vec2 delta = (vUv - uSunScreenUV) * (0.15 + 0.85 * uLength);
    vec3 accum = vec3(0.0);
    float weight = 1.0;
    float totalWeight = 0.0;

    for (int i = 0; i < 16; i++) {
      vec2 suv = vUv - delta * (float(i) / 16.0);
      vec3 col = texture2D(tDiffuse, clamp(suv, vec2(0.001), vec2(0.999))).rgb;
      float bright = max(col.r, max(col.g, col.b));
      float mask = smoothstep(0.48, 1.0, bright);
      accum += col * mask * weight;
      totalWeight += weight;
      weight *= 0.94;
    }

    vec3 rays = totalWeight > 0.0 ? accum / totalWeight : vec3(0.0);
    gl_FragColor = vec4(rays, 1.0);
  }
`;

const GOD_RAYS_COMPOSITE = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform sampler2D tRays;
  uniform vec3 uSunColor;
  uniform float uIntensity;
  uniform float uSunVisible;
  varying vec2 vUv;

  void main() {
    vec4 scene = texture2D(tDiffuse, vUv);
    vec3 rays = texture2D(tRays, vUv).rgb;
    // Не светим на дорогу и приборку: нижняя половина кадра ослаблена.
    float verticalMask = smoothstep(0.10, 0.34, vUv.y);
    vec3 add = rays * uSunColor * (uIntensity * uSunVisible * 0.55 * verticalMask);
    gl_FragColor = vec4(scene.rgb + add, 1.0);
  }
`;

class GodRaysPass extends Pass {
  constructor() {
    super();
    this.enabled = true;
    this.renderToScreen = false;
    this.needsSwap = true;
    this.lowQuality = false;
    this._width = 1;
    this._height = 1;
    this.rt = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false
    });
    this.rt.texture.name = 'BajajGodRays';

    this.uniforms = {
      tDiffuse: { value: null },
      tRays: { value: this.rt.texture },
      uSunScreenUV: { value: new THREE.Vector2(0.5, 0.5) },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uIntensity: { value: 0 },
      uLength: { value: 0.5 },
      uSunVisible: { value: 0 }
    };

    this.rayMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: this.uniforms.tDiffuse,
        uSunScreenUV: this.uniforms.uSunScreenUV,
        uLength: this.uniforms.uLength
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: GOD_RAYS_FRAGMENT,
      depthTest: false,
      depthWrite: false
    });
    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: this.uniforms.tDiffuse,
        tRays: this.uniforms.tRays,
        uSunColor: this.uniforms.uSunColor,
        uIntensity: this.uniforms.uIntensity,
        uSunVisible: this.uniforms.uSunVisible
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: GOD_RAYS_COMPOSITE,
      depthTest: false,
      depthWrite: false
    });
    this.fsQuad = new FullScreenQuad(this.rayMaterial);
    this._applyRenderTargetSize();
  }

  _applyRenderTargetSize() {
    const scale = this.lowQuality ? 0.25 : 0.5;
    const w = Math.max(1, Math.floor(this._width * scale));
    const h = Math.max(1, Math.floor(this._height * scale));
    this.rt.setSize(w, h);
  }

  setLowQuality(low) {
    if (this.lowQuality === low) return;
    this.lowQuality = low;
    this._applyRenderTargetSize();
  }

  setSize(width, height) {
    this._width = Math.max(1, width);
    this._height = Math.max(1, height);
    this._applyRenderTargetSize();
  }

  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;

    // 1. Радиальное размытие ярких пикселей в маленький буфер.
    this.fsQuad.material = this.rayMaterial;
    renderer.setRenderTarget(this.rt);
    this.fsQuad.render(renderer);

    // 2. Наложение лучей на кадр.
    this.fsQuad.material = this.compositeMaterial;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }
}

/* ---------------------------------------------------------------------------
 * Настройки: G.visual, localStorage, применение к uniforms.
 * ------------------------------------------------------------------------ */
function readNumber(key, fallback, min, max) {
  let raw = null;
  try { raw = localStorage.getItem(key); } catch { raw = null; }
  const value = Number(raw);
  if (raw === null || raw === '' || !Number.isFinite(value)) return fallback;
  return G.clamp(value, min, max);
}

function readFlag(key, fallback) {
  let raw = null;
  try { raw = localStorage.getItem(key); } catch { raw = null; }
  if (raw === 'on' || raw === '1' || raw === 'true') return true;
  if (raw === 'off' || raw === '0' || raw === 'false') return false;
  return fallback;
}

function detectWeakDevice() {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  return coarse || cores < 4;
}

function loadVisualSettings(weak) {
  G.visual = {
    motionBlur: readFlag(KEY_MB, true),
    motionBlurIntensity: readNumber(KEY_MB_INTENSITY, weak ? 36 : MB_DEFAULT_INTENSITY, 0, 100),
    motionBlurComfort: readFlag(KEY_MB_COMFORT, false),
    godRays: readFlag(KEY_GR, true),
    godRaysIntensity: readNumber(KEY_GR_INTENSITY, GR_DEFAULT_INTENSITY, 0, 100),
    godRaysLength: readNumber(KEY_GR_LENGTH, GR_DEFAULT_LENGTH, 0, 100),
    weakDevice: weak
  };
}

function saveVisualSettings() {
  const v = G.visual;
  if (!v) return;
  try {
    localStorage.setItem(KEY_MB, v.motionBlur ? 'on' : 'off');
    localStorage.setItem(KEY_MB_INTENSITY, String(Math.round(v.motionBlurIntensity)));
    localStorage.setItem(KEY_MB_COMFORT, v.motionBlurComfort ? 'on' : 'off');
    localStorage.setItem(KEY_GR, v.godRays ? 'on' : 'off');
    localStorage.setItem(KEY_GR_INTENSITY, String(Math.round(v.godRaysIntensity)));
    localStorage.setItem(KEY_GR_LENGTH, String(Math.round(v.godRaysLength)));
  } catch {
    // Приватный режим: настройки живут до перезагрузки.
  }
}

export function initPostFx() {
  const weak = detectWeakDevice();
  loadVisualSettings(weak);
  G.saveVisualSettings = saveVisualSettings;

  const renderer = G.renderer;
  const scene = G.scene;
  const camera = G.camera;

  /* ---------- Слой 1: мотоцикл, кокпит и приборка ---------- */
  G.bikeRoot.traverse((obj) => {
    if (!obj.isLight) obj.layers.set(1);
  });
  // Свет должен освещать и мир (слой 0), и байк (слой 1).
  scene.traverse((obj) => {
    if (obj.isLight) obj.layers.enable(1);
  });
  if (G.sunLight) {
    // Байк продолжает отбрасывать тень, хотя рендерится отдельным проходом.
    G.sunLight.shadow.camera.layers.enable(1);
  }
  camera.layers.set(0);

  /* ---------- Composer ---------- */
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const godRaysPass = new GodRaysPass();
  const motionBlurPass = new MotionBlurPass();
  const outputPass = new OutputPass();

  composer.addPass(renderPass);
  composer.addPass(godRaysPass);
  composer.addPass(motionBlurPass);
  composer.addPass(outputPass);

  G.postFx = { composer, renderPass, godRaysPass, motionBlurPass, outputPass };
  G.postFxLevel = 1;

  function applySize() {
    const pr = renderer.getPixelRatio();
    composer.setPixelRatio(pr);
    composer.setSize(innerWidth, innerHeight);
  }
  G.applyPostFxSize = applySize;
  applySize();

  /* ---------- Авто-качество по FPS (скользящее среднее за 60 кадров) ---------- */
  let autoLevel = weak ? 0.5 : 1;
  let fpsAccum = 0;
  let fpsFrames = 0;
  godRaysPass.setLowQuality(autoLevel < 1);

  function updateAutoQuality(dt) {
    if (G.paused || G.uiModal || document.hidden) {
      fpsAccum = 0;
      fpsFrames = 0;
      return;
    }
    fpsAccum += dt;
    fpsFrames++;
    if (fpsFrames < 60) return;
    const fps = fpsFrames / Math.max(0.0001, fpsAccum);
    fpsAccum = 0;
    fpsFrames = 0;

    let next = autoLevel;
    if (fps < 34) next = 0;
    else if (fps < 42) next = 0.5;
    else if (fps > 50) next = 1;

    if (next !== autoLevel) {
      autoLevel = next;
      G.postFxLevel = autoLevel;
      godRaysPass.setLowQuality(autoLevel < 1);
    }
  }

  /* ---------- Видимость солнца и плавное появление лучей ---------- */
  const sunWorld = new THREE.Vector3();
  const sunNdc = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const sunDir = new THREE.Vector3();
  let sunVisible = 0;

  function computeSunState() {
    if (!G.sunBody) return { onScreen: false, target: 0, tunnel: false };
    G.sunBody.getWorldPosition(sunWorld);
    sunNdc.copy(sunWorld).project(camera);

    camera.getWorldDirection(camDir);
    sunDir.copy(sunWorld).sub(camera.position);
    const inFront = sunDir.dot(camDir) > 0;
    const onScreen = inFront
      && sunNdc.z < 1
      && Math.abs(sunNdc.x) <= 1.5
      && Math.abs(sunNdc.y) <= 1.5;

    const inTunnel = !!G.inTunnel;
    const weather = G.weather;
    const cloud = weather ? G.clamp(weather.cloud || 0, 0, 1) : 0;
    const rain = weather ? G.clamp(weather.rain || 0, 0, 1) : 0;
    // Ясное небо = 1, плотные тучи или дождь = 0.
    const clearSky = (1 - G.smoothstep(0.12, 0.55, cloud)) * (1 - G.smoothstep(0.04, 0.30, rain));
    // Высота солнца: ночью (и глубоко за горизонтом) лучей нет.
    const elevation = G.sunBody.visible ? G.smoothstep(-8, 6, sunWorld.y) : 0;
    const enabled = !!G.visual.godRays && G.visual.godRaysIntensity > 0.01;
    const target = enabled && onScreen && !inTunnel ? clearSky * elevation : 0;

    return { onScreen, target, tunnel: inTunnel };
  }

  function updateRenderFrame(dt) {
    updateAutoQuality(dt);

    if (G.visual) {
      const paused = G.paused || G.uiModal;

      /* ---------- God Rays ---------- */
      const sunState = computeSunState();
      const fadeRate = (sunState.tunnel || !sunState.onScreen) ? 7.0 : 0.75;
      sunVisible += (sunState.target - sunVisible) * Math.min(1, dt * fadeRate);
      if (sunVisible < 0.001) sunVisible = 0;

      const gr = godRaysPass.uniforms;
      gr.uSunScreenUV.value.set(sunNdc.x * 0.5 + 0.5, sunNdc.y * 0.5 + 0.5);
      if (G.sunLight) gr.uSunColor.value.copy(G.sunLight.color);
      gr.uIntensity.value = (G.visual.godRaysIntensity / 100) * autoLevel;
      gr.uLength.value = G.visual.godRaysLength / 100;
      gr.uSunVisible.value = sunVisible;
      godRaysPass.enabled = !!G.visual.godRays
        && G.visual.godRaysIntensity > 0.01
        && autoLevel > 0
        && sunVisible > 0.01
        && sunState.onScreen;

      /* ---------- Motion Blur ---------- */
      const maxSpeed = (G.frameStats && G.frameStats.maxSpeed) || 120;
      const speedRatio = paused ? 0 : G.clamp((G.speed || 0) / Math.max(1, maxSpeed), 0, 1);
      const mb = motionBlurPass.uniforms;
      mb.uSpeedRatio.value = speedRatio;
      mb.uIntensity.value = (G.visual.motionBlurIntensity / 100) * autoLevel;
      mb.uComfort.value = G.visual.motionBlurComfort ? 1 : 0;
      motionBlurPass.enabled = !!G.visual.motionBlur
        && G.visual.motionBlurIntensity > 0.01
        && autoLevel > 0
        && speedRatio > 0.01;
    }

    /* ---------- Слой 0 в composer + слой 1 поверх ---------- */
    renderer.shadowMap.autoUpdate = false;
    if (renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = true;

    camera.layers.set(0);
    composer.render();

    renderer.autoClear = false;
    renderer.clearDepth();
    camera.layers.set(1);
    renderer.render(scene, camera);
    camera.layers.set(0);
    renderer.autoClear = true;
  }

  G.renderFrame = updateRenderFrame;
}
