import * as THREE from 'three';
import { devToolsEnabled } from './dev-flag.js';
import { G } from './state.js';

export function initScene() {
  const $ = G.$;
  const clamp = G.clamp;
  const lerp = G.lerp;

  /* =========================================================================
   * 2. ИНИЦИАЛИЗАЦИЯ СЦЕНЫ, РЕНДЕРЕРА И PBR-МАТЕРИАЛОВ
   * ========================================================================= */
  const root = $('view');
  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 560);

  try {
    const dpr = window.devicePixelRatio || 1;
    G.renderer = new THREE.WebGLRenderer({
      antialias: dpr < 1.5,
      powerPreference: 'high-performance',
      stencil: false,
      preserveDrawingBuffer: devToolsEnabled()
    });
  } catch (e) {
    $('fatal').style.display = 'block';
    throw e;
  }
  G.renderer.outputColorSpace = THREE.SRGBColorSpace;
  G.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  G.renderer.shadowMap.enabled = true;
  G.renderer.shadowMap.type = THREE.PCFShadowMap;
  root.appendChild(G.renderer.domElement);

  function createCanvasTexture(w, h, drawFn, repeatX = 1, repeatY = 1, isSRGB = true) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    drawFn(ctx, w, h);
    const tex = new THREE.CanvasTexture(c);
    if (isSRGB) tex.colorSpace = THREE.SRGBColorSpace;
    if (repeatX > 1 || repeatY > 1) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeatX, repeatY);
    }
    return tex;
  }
  G.createCanvasTexture = createCanvasTexture;

  function createAsphaltMap() {
    const w = 256, h = 256;
    return createCanvasTexture(w, h, (ctx) => {
      ctx.fillStyle = '#222733';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 4500; i++) {
        const x = Math.random() * w, y = Math.random() * h;
        const v = 28 + Math.floor(Math.random() * 26);
        ctx.fillStyle = `rgb(${v},${v + 2},${v + 7})`;
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.fillStyle = 'rgba(14,18,26,0.34)';
      ctx.fillRect(w * 0.12, 0, w * 0.18, h);
      ctx.fillRect(w * 0.68, 0, w * 0.18, h);
    }, 1, 26, true);
  }

  function createSidewalkMap() {
    const w = 128, h = 128;
    return createCanvasTexture(w, h, (ctx) => {
      ctx.fillStyle = '#58606e';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#39404c';
      ctx.lineWidth = 3;
      for (let x = 0; x <= w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y <= h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    }, 1, 40, true);
  }

  const envMapTex = createCanvasTexture(256, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#33507a');
    g.addColorStop(0.48, '#d9a878');
    g.addColorStop(0.52, '#20293a');
    g.addColorStop(1, '#0d1119');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, 1, 1, true);
  envMapTex.mapping = THREE.EquirectangularReflectionMapping;
  G.scene.environment = envMapTex;

  G.glowTex = createCanvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,250,220,1)');
    g.addColorStop(0.35, 'rgba(255,205,120,0.48)');
    g.addColorStop(1, 'rgba(255,180,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });

  const asphaltMap = createAsphaltMap();
  const sidewalkMap = createSidewalkMap();

  G.M = {
    road: new THREE.MeshStandardMaterial({
      map: asphaltMap,
      roughness: 0.86,
      metalness: 0.04,
      envMapIntensity: 0.35
    }),
    sidewalk: new THREE.MeshLambertMaterial({ map: sidewalkMap }),
    grass: new THREE.MeshLambertMaterial({ color: 0x264b2c, flatShading: true }),
    curbWhite: new THREE.MeshLambertMaterial({ color: 0xdadce0 }),
    lineWhite: new THREE.MeshLambertMaterial({ color: 0xf2f4f7, emissive: 0x22252a }),
    lineYellow: new THREE.MeshLambertMaterial({ color: 0xffca28, emissive: 0x332400 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xdce3ec, roughness: 0.14, metalness: 0.92, envMapIntensity: 1.4 }),
    goldMetal: new THREE.MeshStandardMaterial({ color: 0xffca28, roughness: 0.22, metalness: 0.88, envMapIntensity: 1.4 }),
    copperMetal: new THREE.MeshStandardMaterial({ color: 0xd87a4a, roughness: 0.28, metalness: 0.82 }),
    filterRed: new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.55, metalness: 0.18 }),
    iridiumBlue: new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x0088cc, emissiveIntensity: 0.9, roughness: 0.25 }),
    smokedGlass: new THREE.MeshStandardMaterial({
      color: 0x111722,
      roughness: 0.08,
      metalness: 0.35,
      transparent: true,
      opacity: 0.56,
      envMapIntensity: 1.6
    }),
    metalDark: new THREE.MeshStandardMaterial({ color: 0x1c222d, roughness: 0.45, metalness: 0.65 }),
    mattePlastic: new THREE.MeshStandardMaterial({ color: 0x151922, roughness: 0.78, metalness: 0.1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x89b4d4, roughness: 0.08, metalness: 0.85, envMapIntensity: 1.5 }),
    glassWindow: new THREE.MeshStandardMaterial({ color: 0x9ad0f5, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.32, envMapIntensity: 1.5 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x101318, roughness: 0.88, metalness: 0.05 }),
    concrete: new THREE.MeshLambertMaterial({ color: 0x737b88 }),
    bridgeSteel: new THREE.MeshLambertMaterial({ color: 0x3b4d63 }),
    tree1: new THREE.MeshLambertMaterial({ color: 0x28593a, flatShading: true }),
    tree2: new THREE.MeshLambertMaterial({ color: 0x366e45, flatShading: true }),
    trunk: new THREE.MeshLambertMaterial({ color: 0x4b382a }),
    neonCyan: new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00b8d4, emissiveIntensity: 2.2, roughness: 0.2 }),
    neonMagenta: new THREE.MeshStandardMaterial({ color: 0xff4081, emissive: 0xf50057, emissiveIntensity: 2.2, roughness: 0.2 }),
    neonYellow: new THREE.MeshStandardMaterial({ color: 0xffee58, emissive: 0xffab00, emissiveIntensity: 1.8, roughness: 0.25 })
  };
}
