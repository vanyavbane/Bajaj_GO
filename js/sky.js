import * as THREE from 'three';
import { G } from './state.js';

export function initSky() {

  /* =========================================================================
   * 4. НЕБО, КУПОЛ, ОБЪЁМНЫЕ VOXEL-ОБЛАКА, СОЛНЦЕ/ЛУНА И ОСВЕЩЕНИЕ
   * ========================================================================= */
  G.skyDomeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x121a30) },
      midColor: { value: new THREE.Color(0x1e2a44) },
      botColor: { value: new THREE.Color(0x2c3a58) },
      fogColor: { value: new THREE.Color(0x1b2740) },
      fogDensity: { value: 0.0024 }
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 botColor;
      uniform vec3 fogColor;
      uniform float fogDensity;
      varying vec3 vWorldPos;
      void main() {
        float h = normalize(vWorldPos - cameraPosition).y;
        vec3 col = mix(botColor, midColor, smoothstep(-0.05, 0.22, h));
        col = mix(col, topColor, smoothstep(0.22, 0.78, h));
        // Дорога растворяется в тумане, поэтому кромка неба — тот же цвет.
        float reach = clamp(fogDensity / 0.0024, 0.65, 2.4);
        float haze = 1.0 - smoothstep(-0.03, 0.14 * reach, h);
        col = mix(col, fogColor, haze);
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  G.skyDome = new THREE.Mesh(new THREE.SphereGeometry(490, 24, 16), G.skyDomeMat);
  G.scene.add(G.skyDome);

  G.scene.fog = new THREE.FogExp2(0x1b2740, 0.0024);

  G.hemiLight = new THREE.HemisphereLight(0x5a6a86, 0x141a26, 0.30);
  G.scene.add(G.hemiLight);

  G.sunLight = new THREE.DirectionalLight(0x9aabc4, 0.40);
  G.sunLight.castShadow = true;
  G.sunLight.shadow.bias = -0.00018;
  G.sunLight.shadow.normalBias = 0.05;
  G.scene.add(G.sunLight);
  G.scene.add(G.sunLight.target);

  const celestialGroup = new THREE.Group();
  G.scene.add(celestialGroup);

  G.sunBody = new THREE.Group();
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffe57f });
  G.sunBody.add(new THREE.Mesh(new THREE.BoxGeometry(16, 16, 16), sunMat));
  G.sunBody.add(new THREE.Mesh(new THREE.BoxGeometry(20, 12, 12), sunMat));
  G.sunBody.add(new THREE.Mesh(new THREE.BoxGeometry(12, 20, 12), sunMat));
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.glowTex, color: 0xffca28, transparent: true, blending: THREE.AdditiveBlending }));
  sunGlow.scale.set(74, 74, 1);
  G.sunBody.add(sunGlow);
  celestialGroup.add(G.sunBody);

  G.moonBody = new THREE.Group();
  const moonMat = new THREE.MeshBasicMaterial({ color: 0xdbeeff });
  G.moonBody.add(new THREE.Mesh(new THREE.BoxGeometry(13, 13, 13), moonMat));
  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.glowTex, color: 0x80d8ff, transparent: true, blending: THREE.AdditiveBlending }));
  moonGlow.scale.set(52, 52, 1);
  G.moonBody.add(moonGlow);
  celestialGroup.add(G.moonBody);

  const cloudGroup = new THREE.Group();
  G.scene.add(cloudGroup);
  G.cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  G.clouds = [];
  for (let i = 0; i < 34; i++) {
    const cg = new THREE.Group();
    const layer = i % 3;
    const scale = 0.8 + layer * 0.45 + Math.random() * 0.4;
    const blocks = 3 + (i % 4);
    for (let b = 0; b < blocks; b++) {
      const bw = (9 + Math.random() * 10) * scale;
      const bh = (2.4 + Math.random() * 2.2) * scale;
      const bd = (7 + Math.random() * 8) * scale;
      const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), G.cloudMat);
      m.position.set((b - blocks / 2) * 5.5 * scale, (b % 2) * 1.4 * scale, (Math.random() - 0.5) * 4 * scale);
      cg.add(m);
    }
    cg.userData = {
      ox: (Math.random() - 0.5) * 440,
      oy: 46 + layer * 22 + Math.random() * 12,
      oz: -40 - Math.random() * 380,
      driftSpeed: 1.6 + layer * 0.9 + Math.random() * 0.8
    };
    cloudGroup.add(cg);
    G.clouds.push(cg);
  }

  // Грозовой слой: предсозданные voxel-тучи, проявляются только в дождь.
  G.stormCloudMat = new THREE.MeshLambertMaterial({
    color: 0x2a3140,
    flatShading: true,
    transparent: true,
    opacity: 0,
    depthWrite: false
  });
  G.stormCloudGroup = new THREE.Group();
  G.stormCloudGroup.visible = false;
  G.scene.add(G.stormCloudGroup);
  G.stormClouds = [];
  for (let i = 0; i < 26; i++) {
    const cg = new THREE.Group();
    const layer = i % 3;
    const scale = 1.15 + layer * 0.42 + Math.random() * 0.55;
    const blocks = 4 + (i % 4);
    for (let b = 0; b < blocks; b++) {
      const bw = (12 + Math.random() * 14) * scale;
      const bh = (3.2 + Math.random() * 3.0) * scale;
      const bd = (9 + Math.random() * 11) * scale;
      const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), G.stormCloudMat);
      m.position.set((b - blocks / 2) * 7.2 * scale, (b % 2) * 1.8 * scale, (Math.random() - 0.5) * 5 * scale);
      cg.add(m);
    }
    cg.userData = {
      ox: (Math.random() - 0.5) * 460,
      oy: 50 + layer * 18 + Math.random() * 14,
      oz: -30 - Math.random() * 390,
      driftSpeed: 2.0 + layer * 1.0 + Math.random() * 1.0
    };
    G.stormCloudGroup.add(cg);
    G.stormClouds.push(cg);
  }

  // Пул фонарей рассчитан на МКАД: шесть ближайших источников, вне его
  // бюджет урезается настройками графики до 4.
  G.MAX_ACTIVE_LAMPS = 6;
  G.lampLights = [];
  for (let i = 0; i < G.MAX_ACTIVE_LAMPS; i++) {
    const pl = new THREE.PointLight(0xffb74d, 0, 28, 1.7);
    G.scene.add(pl);
    G.lampLights.push(pl);
  }
}
