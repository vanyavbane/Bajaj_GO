import * as THREE from 'three';
import { box, cylinder } from './geom.js';
import { BIOMES } from './engine/biomes.js';
import { keepInWindow } from './engine/stream.js';
import { besidePose } from './engine/roadside.js';
import { G } from './state.js';

/* =========================================================================
 * СЛОТЫ ДЕКОРА ПОЛЯ И МКАД
 * -------------------------------------------------------------------------
 * Лес, горы и набережная живут в своих модулях, город — в roadside.js.
 * Здесь только объекты, которые биом ставит слотами по обочине.
 * Дорогу они читают через G: кромки, позу обочины и высоту земли.
 * ========================================================================= */

const SCENERY_SLOTS = 20;
const SCENERY_STEP = 28;
const SCENERY_SPAN = SCENERY_SLOTS * SCENERY_STEP;
const spinners = [];

/* ---------- Материалы декораций ---------- */
let MAT = null;

function buildMaterials() {
  MAT = {
    hay: new THREE.MeshLambertMaterial({ color: 0xc9a34e, flatShading: true }),
    hayDark: new THREE.MeshLambertMaterial({ color: 0x9d7a34, flatShading: true }),
    wood: new THREE.MeshLambertMaterial({ color: 0x5b4129 }),
    woodLight: new THREE.MeshLambertMaterial({ color: 0x7a5a38 }),
    barnRed: new THREE.MeshLambertMaterial({ color: 0x8e3b2d }),
    barnTrim: new THREE.MeshLambertMaterial({ color: 0xd9d2c2 }),
    roof: new THREE.MeshLambertMaterial({ color: 0x3b3531 }),
    silo: new THREE.MeshLambertMaterial({ color: 0x9aa3a8 }),
    siloTop: new THREE.MeshLambertMaterial({ color: 0x767f85 }),
    rockDark: new THREE.MeshLambertMaterial({ color: 0x525761, flatShading: true }),
    mkadPanel: new THREE.MeshStandardMaterial({ color: 0x4b5665, roughness: 0.82 }),
    mkadPanelLight: new THREE.MeshStandardMaterial({ color: 0x727f8e, roughness: 0.78 }),
    mkadGlass: new THREE.MeshStandardMaterial({ color: 0x9fc4e0, emissive: 0x2d4f66, emissiveIntensity: 0.9, roughness: 0.35 }),
    mkadConcrete: new THREE.MeshStandardMaterial({ color: 0x8d939b, roughness: 0.9 }),
    mkadMetal: new THREE.MeshStandardMaterial({ color: 0x59636e, roughness: 0.55, metalness: 0.55 }),
    mkadLight: new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffb74d, emissiveIntensity: 1.8 }),
    wire: new THREE.MeshStandardMaterial({ color: 0x20262d, roughness: 0.7 })
  };
  G.mkadLightMat = MAT.mkadLight;
  G.mkadGlassMat = MAT.mkadGlass;
}

function addBox(parent, mat, w, h, d, x, y, z) {
  const mesh = new THREE.Mesh(box(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/* ---------- Поле ---------- */
function buildFieldVariant(variant) {
  const g = new THREE.Group();
  let lat = 26;
  let spin = null;

  if (variant === 0) {
    lat = 24;
    addBox(g, MAT.hay, 3.0, 1.3, 2.0, 0, 0.65, 0);
    addBox(g, MAT.hayDark, 2.4, 1.1, 1.7, 0.2, 1.85, 0.1);
    addBox(g, MAT.hay, 1.7, 0.9, 1.3, -0.3, 2.9, 0);
    addBox(g, MAT.hayDark, 2.2, 0.8, 1.3, 2.6, 0.4, 1.6);
  } else if (variant === 1) {
    lat = 54;
    const tower = new THREE.Mesh(cylinder(0.85, 1.55, 11.5, 8), MAT.woodLight);
    tower.position.y = 5.75;
    tower.castShadow = true;
    g.add(tower);
    addBox(g, MAT.roof, 2.6, 1.1, 2.6, 0, 11.6, 0);
    const hub = new THREE.Group();
    hub.position.set(0, 9.6, 1.05);
    for (let i = 0; i < 4; i++) {
      const blade = addBox(hub, MAT.barnTrim, 0.34, 4.6, 0.16, 0, 2.5, 0);
      blade.rotation.z = i * Math.PI * 0.5;
    }
    g.add(hub);
    spin = { mesh: hub, speed: 0.42 };
    g.rotation.y = Math.PI * 0.5;
  } else if (variant === 2) {
    lat = 46;
    addBox(g, MAT.barnRed, 8.0, 4.6, 10.0, 0, 2.3, 0);
    addBox(g, MAT.barnTrim, 8.2, 0.32, 10.2, 0, 0.16, 0);
    for (const side of [-1, 1]) {
      const roof = addBox(g, MAT.roof, 4.9, 0.42, 10.6, side * 2.1, 5.5, 0);
      roof.rotation.z = side * -0.62;
    }
    addBox(g, MAT.roof, 8.2, 0.5, 10.4, 0, 5.0, 0);
    addBox(g, MAT.barnTrim, 3.0, 3.4, 0.22, 0, 1.75, -5.06);
    addBox(g, MAT.barnRed, 1.1, 0.35, 0.3, -0.8, 2.2, -5.2);
    addBox(g, MAT.barnRed, 1.1, 0.35, 0.3, 0.8, 2.2, -5.2);
    addBox(g, MAT.barnTrim, 0.27, 2.7, 0.24, 0, 1.7, -5.24);
  } else if (variant === 3) {
    lat = 44;
    const body = new THREE.Mesh(cylinder(1.65, 1.75, 11.5, 10), MAT.silo);
    body.position.y = 5.75;
    body.castShadow = true;
    g.add(body);
    addBox(g, MAT.siloTop, 3.7, 0.5, 3.7, 0, 11.6, 0);
    addBox(g, MAT.siloTop, 2.6, 0.45, 2.6, 0, 12.05, 0);
    for (let y = 1.2; y < 11; y += 1.5) {
      addBox(g, MAT.rockDark, 0.28, 0.12, 0.7, 1.7, y, 0);
    }
    addBox(g, MAT.rockDark, 0.18, 10.4, 0.18, 1.7, 5.4, 0.42);
  } else {
    lat = 28;
    for (let i = 0; i < 7; i++) {
      addBox(g, MAT.wood, 0.24, 1.5, 0.24, 0, 0.75, (i - 3) * 2.4);
    }
    addBox(g, MAT.woodLight, 0.16, 0.22, 16.6, 0, 1.02, 0);
    addBox(g, MAT.woodLight, 0.16, 0.22, 16.6, 0, 0.46, 0);
  }

  return { group: g, lat, spin };
}

function buildMkadVariant(variant) {
  const g = new THREE.Group();
  let lat = 42;

  if (variant === 0) {
    // Панельная высотка с лентами остекления.
    lat = 46;
    addBox(g, MAT.mkadPanel, 15, 46, 13, 0, 23, 0);
    for (let y = 5; y < 43; y += 5.2) {
      addBox(g, MAT.mkadGlass, 15.3, 1.0, 13.3, 0, y, 0);
    }
    addBox(g, MAT.mkadConcrete, 16.6, 1.3, 14.6, 0, 46.5, 0);
    addBox(g, MAT.mkadConcrete, 5.2, 2.2, 5.2, 2.6, 47.8, 1.4);
  } else if (variant === 1) {
    // Опора ЛЭП с проводами вдоль трассы.
    lat = 40;
    for (const x of [-3.1, 3.1]) {
      addBox(g, MAT.mkadMetal, 0.55, 29, 0.55, x, 14.5, -1.5).rotation.z = x * 0.022;
      addBox(g, MAT.mkadMetal, 0.55, 29, 0.55, x, 14.5, 1.5).rotation.z = x * 0.022;
    }
    for (let y = 9; y <= 25; y += 5.2) {
      addBox(g, MAT.mkadMetal, 15, 0.42, 0.42, 0, y, 0);
      addBox(g, MAT.mkadMetal, 0.34, 3.4, 0.34, -7.2, y + 1.7, 0);
      addBox(g, MAT.mkadMetal, 0.34, 3.4, 0.34, 7.2, y + 1.7, 0);
    }
    for (const x of [-7.2, -2.6, 2.6, 7.2]) {
      addBox(g, MAT.wire, 0.07, 0.07, 34, x, 27.6, 0);
    }
  } else if (variant === 2) {
    // Двойные мачты освещения.
    lat = 36;
    for (const x of [-3.4, 3.4]) {
      const pole = new THREE.Mesh(cylinder(0.16, 0.22, 14, 7), MAT.mkadMetal);
      pole.position.set(x, 7, 0);
      pole.castShadow = true;
      g.add(pole);
      const arm = addBox(g, MAT.mkadMetal, 2.2, 0.16, 0.16, x + (x < 0 ? 1.1 : -1.1), 13.6, 0);
      arm.rotation.z = 0;
      addBox(g, MAT.mkadLight, 0.9, 0.16, 0.34, x + (x < 0 ? 2.1 : -2.1), 13.48, 0);
    }
    addBox(g, MAT.mkadMetal, 7.2, 0.2, 0.2, 0, 12.9, 0);
  } else if (variant === 3) {
    // Офисная башня с рекламной полосой.
    lat = 52;
    addBox(g, MAT.mkadPanelLight, 20, 34, 15, 0, 17, 0);
    addBox(g, MAT.mkadGlass, 4.6, 2.4, 0.4, 0, 27.5, 7.6);
    addBox(g, MAT.mkadLight, 12.8, 0.5, 0.3, 0, 31.5, 7.66);
    addBox(g, MAT.mkadConcrete, 21.4, 0.9, 16.2, 0, 34.3, 0);
    for (let x = -7; x <= 7; x += 3.5) {
      addBox(g, MAT.mkadPanel, 0.35, 30, 0.35, x, 15, 7.7);
    }
  } else {
    // Шумозащитный экран вдоль МКАД.
    lat = 32;
    addBox(g, MAT.mkadConcrete, 0.4, 4.4, 30, 0, 2.2, 0);
    for (let z = -12; z <= 12; z += 6) {
      addBox(g, MAT.mkadMetal, 0.55, 4.8, 0.55, 0, 2.4, z);
    }
    addBox(g, MAT.mkadGlass, 0.2, 2.4, 29.4, 0.16, 2.6, 0);
  }

  return { group: g, lat, spin: null };
}

function buildVariant(biome, variant) {
  const id = BIOMES[biome] && BIOMES[biome].id;
  if (id === 'field') return buildFieldVariant(variant);
  if (id === 'mkad') return buildMkadVariant(variant);
  throw new Error(`Для биома «${id || biome}» нет слота: лес, горы и набережная строятся своими модулями, город — в roadside.js`);
}

/* ---------- Мир декораций ---------- */
export function initBiomeWorld() {
  buildMaterials();

  G.biomeScenery = [];
  G.resetBiomeScenery = () => {
    for (let i = 0; i < G.biomeScenery.length; i++) {
      G.biomeScenery[i].s = i * SCENERY_STEP;
      G.biomeScenery[i].placedS = NaN;
    }
  };

  for (let i = 0; i < SCENERY_SLOTS; i++) {
    /** @type {import('./game-state.d.ts').ScenerySlot} */
    const slot = { s: i * SCENERY_STEP, placedS: NaN, left: [], right: [] };
    for (const side of [-1, 1]) {
      const list = side < 0 ? slot.left : slot.right;
      for (let biome = 1; biome < BIOMES.length; biome++) {
        if (BIOMES[biome].decor !== 'slots') continue;
        const variant = ((i * 3 + (side > 0 ? 2 : 0) + biome) % 5 + 5) % 5;
        const built = buildVariant(biome, variant);
        const meshes = [];
        built.group.traverse((obj) => {
          if (obj.isMesh) meshes.push(obj);
        });
        built.group.visible = false;
        G.scene.add(built.group);
        list.push({
          biome,
          group: built.group,
          meshes,
          lodFar: false,
          yaw: built.group.rotation.y,
          lat: built.lat + ((i + biome) % 3) * 2.2,
          ds: (((i * 7 + biome * 5 + (side > 0 ? 3 : 0)) % 9) - 4) * 1.4,
          spin: built.spin
        });
        if (built.spin) spinners.push(built.spin);
      }
    }
    G.biomeScenery.push(slot);
  }

  G.updateBiomeScenery = (dt) => {
    const step = Number.isFinite(dt) ? dt : 0;
    for (const sp of spinners) sp.mesh.rotation.z += sp.speed * step;
    for (const slot of G.biomeScenery) {
      slot.s = keepInWindow(slot.s, G.playerS, 90, Infinity, SCENERY_SPAN);
      const w = G.biomeWeightsAtS(slot.s);
      for (const side of [-1, 1]) {
        const list = side < 0 ? slot.left : slot.right;
        for (const entry of list) {
          const bw = w[entry.biome] || 0;
          const s = slot.s + entry.ds;
          const visible = bw > 0.12;
          entry.group.visible = visible;
          if (!visible) continue;
          const sceneryScale = BIOMES[entry.biome].sceneryScale || 1;
          entry.group.scale.setScalar(sceneryScale);
          const sideSign = side < 0 ? -1 : 1;
          const fullEdges = G.roadEdgesAt(s);
          const origin = G.roadOriginAt(s);
          const fullEdge = sideSign < 0 ? fullEdges.leftOuter : fullEdges.rightOuter;
          const fullMid = (fullEdges.leftOuter + fullEdges.rightOuter) * 0.5;
          const gap = Math.max(8, entry.lat - Math.abs(fullEdge - fullMid));
          const pose = besidePose({ edges: fullEdges, origin }, { side: sideSign, gap, inset: 0 });
          const far = Math.abs(s - G.playerS) > 165;
          if (far !== entry.lodFar) {
            entry.lodFar = far;
            for (let k = 2; k < entry.meshes.length; k++) entry.meshes[k].visible = !far;
          }
          G.placeBeside(
            entry.group,
            s,
            fullEdge,
            pose.lateral,
            G.groundOffset(pose.lateral, s),
            entry.yaw
          );
        }
      }
    }
  };
}
