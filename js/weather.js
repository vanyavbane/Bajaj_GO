import * as THREE from 'three';
import { G } from './state.js';

/* =========================================================================
 * 18. ДИНАМИЧЕСКАЯ ПОГОДА: ДОЖДЬ, ТУЧИ, МОКРАЯ ДОРОГА, МОЛНИИ
 * -------------------------------------------------------------------------
 * Модуль не создаёт объекты в кадре: капли живут в одном InstancedMesh,
 * грозовые тучи предсозданы в sky.js. Все переходы — плавные (3–5 сек).
 * Таймеры тикают только в активном заезде; пауза/меню/гараж их морозят.
 * ========================================================================= */

const RAIN_MIN = 25;
const RAIN_MAX = 65;
const GAP_MIN = 90;
const FIRST_MIN = 30;
const FIRST_MAX = 60;
const FADE_IN = 3.6;
const CLOUD_FADE = 4.2;
const DRY_RATE = 9.5;
const MAX_DROPS = 1000;

export function initWeather() {

  /* ---------- Состояние, которое читают атмосфера, свет и дорога ---------- */
  const state = {
    rain: 0,          // текущая сила дождя (0…1)
    cloud: 0,         // плотность грозовых туч (0…1)
    wet: 0,           // влажность дороги (0…1), сохнет медленнее
    raining: false,   // идёт ли запланированный эпизод дождя
    elapsed: 0,       // секунды активного заезда
    nextRainAt: 0,
    rainEndsAt: 0,
    flashes: []
  };
  G.weather = state;

  /* ---------- Voxel-капли: один InstancedMesh на весь дождь ---------- */
  const dropGeo = new THREE.BoxGeometry(0.05, 1.15, 0.05);
  dropGeo.rotateX(0.13); // лёгкий наклон по направлению движения
  G.rainMat = new THREE.MeshBasicMaterial({
    color: 0xbfdcff,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    fog: true
  });
  G.rainMesh = new THREE.InstancedMesh(dropGeo, G.rainMat, MAX_DROPS);
  G.rainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  G.rainMesh.frustumCulled = false;
  G.rainMesh.castShadow = false;
  G.rainMesh.receiveShadow = false;
  G.rainMesh.count = 0;
  G.rainMesh.visible = false;
  G.scene.add(G.rainMesh);

  const dropX = new Float32Array(MAX_DROPS);
  const dropY = new Float32Array(MAX_DROPS);
  const dropZ = new Float32Array(MAX_DROPS);
  const dropVX = new Float32Array(MAX_DROPS);
  const dropVY = new Float32Array(MAX_DROPS);
  const dropVZ = new Float32Array(MAX_DROPS);
  const dropLen = new Float32Array(MAX_DROPS);
  const dummy = new THREE.Object3D();

  function seedDrops() {
    for (let i = 0; i < MAX_DROPS; i++) {
      dropX[i] = (Math.random() - 0.5) * 100;
      dropY[i] = Math.random() * 40;
      dropZ[i] = 20 - Math.random() * 155;
      dropVX[i] = (Math.random() - 0.5) * 2;
      dropVY[i] = -50 - Math.random() * 20;
      dropVZ[i] = -5 - Math.random() * 5;
      dropLen[i] = 0.65 + Math.random() * 0.9;
    }
  }
  seedDrops();

  function respawnDrop(i, px, pz, groundY) {
    dropX[i] = px + (Math.random() - 0.5) * 100;
    dropY[i] = groundY + 20 + Math.random() * 26;
    dropZ[i] = pz + 16 - Math.random() * 156;
    // Скорость сохраняем, чтобы каждая капля падала стабильно.
  }

  const flashEl = document.getElementById('lightning-flash');

  /* ---------- Расписание дождя ---------- */
  function scheduleFirst() {
    state.nextRainAt = FIRST_MIN + Math.random() * (FIRST_MAX - FIRST_MIN);
  }
  scheduleFirst();

  function beginRain() {
    state.raining = true;
    const duration = RAIN_MIN + Math.random() * (RAIN_MAX - RAIN_MIN);
    state.rainEndsAt = state.elapsed + duration;

    // 1–2 редкие вспышки за эпизод, не в первые секунды.
    state.flashes.length = 0;
    const count = Math.random() < 0.6 ? 1 : 2;
    for (let i = 0; i < count; i++) {
      state.flashes.push({
        at: state.elapsed + 5 + Math.random() * Math.max(1, duration - 9),
        fired: false
      });
    }
    state.flashes.sort((a, b) => a.at - b.at);
  }

  function endRain() {
    state.raining = false;
    // Не чаще, чем раз в 90 секунд после окончания предыдущего эпизода.
    state.nextRainAt = state.elapsed + GAP_MIN + Math.random() * 25;
  }

  /* ---------- Молнии и гром ---------- */
  let flashT = -1;
  let thunderAt = -1;

  function triggerFlash() {
    flashT = 0;
    thunderAt = 0.65 + Math.random() * 1.7;
  }

  function updateFlash(dt) {
    if (flashT >= 0) {
      flashT += dt;
      let op = 0;
      if (flashT < 0.05) op = 0.20 * (flashT / 0.05);
      else if (flashT < 0.10) op = 0.05;
      else if (flashT < 0.16) op = 0.15;
      else op = Math.max(0, 0.15 * (1 - (flashT - 0.16) / 0.16));
      if (flashEl) flashEl.style.opacity = op.toFixed(3);
      if (flashT > 0.34) {
        flashT = -1;
        if (flashEl) flashEl.style.opacity = '0';
      }
    }
    if (thunderAt >= 0) {
      thunderAt -= dt;
      if (thunderAt < 0) {
        thunderAt = -1;
        if (G.playThunder) G.playThunder();
      }
    }
  }

  /* ---------- Дорога: влажный асфальт ---------- */
  function applyRoadWetness() {
    const road = G.M && G.M.road;
    if (!road) return;
    const baseRough = road.userData.baseRoughness ?? 0.86;
    const baseMetal = road.userData.baseMetalness ?? 0.04;
    const baseEnv = road.userData.baseEnvIntensity ?? road.envMapIntensity ?? 0.35;
    road.userData.baseRoughness = baseRough;
    road.userData.baseMetalness = baseMetal;
    road.userData.baseEnvIntensity = baseEnv;

    const w = state.wet;
    road.roughness = baseRough - 0.44 * w;
    road.metalness = baseMetal + 0.32 * w;
    road.envMapIntensity = baseEnv * (1 + 1.55 * w);
  }

  /* ---------- Капли вокруг игрока ---------- */
  function updateDrops(dt) {
    const mesh = G.rainMesh;
    const active = Math.min(MAX_DROPS, Math.round(MAX_DROPS * state.rain));
    mesh.visible = active > 0;
    mesh.count = active;
    if (active <= 0) return;

    const bike = G.bikeRoot;
    const px = bike ? bike.position.x : 0;
    const pz = bike ? bike.position.z : 0;
    const groundY = bike ? bike.position.y : 0;

    for (let i = 0; i < active; i++) {
      dropX[i] += dropVX[i] * dt;
      dropY[i] += dropVY[i] * dt;
      dropZ[i] += dropVZ[i] * dt;

      if (dropY[i] < groundY - 1.5
        || dropZ[i] > pz + 20
        || dropZ[i] < pz - 165
        || Math.abs(dropX[i] - px) > 58) {
        respawnDrop(i, px, pz, groundY);
      }

      dummy.position.set(dropX[i], dropY[i], dropZ[i]);
      dummy.scale.set(1, dropLen[i], 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  /* ---------- Публичный сброс для старта/меню/аварии ---------- */
  function resetWeather() {
    state.raining = false;
    state.elapsed = 0;
    state.rainEndsAt = 0;
    state.flashes.length = 0;
    state.rain = 0;
    state.cloud = 0;
    state.wet = 0;
    flashT = -1;
    thunderAt = -1;
    scheduleFirst();
    if (flashEl) flashEl.style.opacity = '0';
    if (G.rainMesh) {
      G.rainMesh.count = 0;
      G.rainMesh.visible = false;
    }
    if (G.stormCloudGroup) G.stormCloudGroup.visible = false;
    if (G.stormCloudMat) G.stormCloudMat.opacity = 0;
    applyRoadWetness();
    if (G.setRainSound) G.setRainSound(0);
  }
  G.resetWeather = resetWeather;

  /* ---------- Кадровое обновление ---------- */
  function updateWeather(dt) {
    // Расписание и молнии живут только в активном заезде.
    if (G.started && !G.ended && !G.paused && !G.uiModal) {
      state.elapsed += dt;

      if (!state.raining && state.elapsed >= state.nextRainAt) beginRain();

      if (state.raining) {
        for (const f of state.flashes) {
          if (!f.fired && state.elapsed >= f.at) {
            f.fired = true;
            triggerFlash();
          }
        }
        if (state.elapsed >= state.rainEndsAt) endRain();
      }
    }

    // Плавные переходы (3–5 сек), дорога сохнет медленнее.
    const target = state.raining ? 1 : 0;
    const rainStep = dt / FADE_IN;
    const cloudStep = dt / CLOUD_FADE;
    const wetStep = dt / (target > state.wet ? FADE_IN : DRY_RATE);

    state.rain = approach(state.rain, target, rainStep);
    state.cloud = approach(state.cloud, target, cloudStep);
    state.wet = approach(state.wet, target, wetStep);

    updateDrops(dt);
    updateFlash(dt);
    applyRoadWetness();

    if (G.setRainSound) G.setRainSound(state.rain * 0.11);
  }
  G.updateWeather = updateWeather;
}

function approach(current, target, step) {
  if (current < target) return Math.min(target, current + step);
  if (current > target) return Math.max(target, current - step);
  return target;
}
