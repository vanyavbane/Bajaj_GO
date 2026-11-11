import * as THREE from 'three';
import { button, heading, panel } from '@bajajgo/design';
import { bikePaint, isQuteBody, isYuraType } from './engine/vehicle.js';
import { grouped, rubles, runDistance } from './engine/money.js';
import { G } from './state.js';

export function initCamera() {
  const $ = G.$;
  const clamp = G.clamp;
  const lerp = G.lerp;

  /* =========================================================================
   * 11. ПЕРЕКЛЮЧЕНИЕ ВИДА КАМЕРЫ (КОКПИТ ↔ ТРЕТЬЕ ЛИЦО) И HUD БЕЗ ДУБЛИРОВАНИЯ
   * ========================================================================= */
  G.camPosSmooth = new THREE.Vector3(0, 3.1, 6.4);
  G.camLookSmooth = new THREE.Vector3(0, 1.2, -32);

  // Профили камеры от первого лица: отдельно для каждого мотоцикла.
  // { ns125: { fov: 75, height: 0 }, ... }
  const CAM_PROFILE_KEY = 'bajajGO_camprofiles';
  const CAM_FOV_DEFAULT = 75;
  const CAM_FOV_MIN = 60;
  const CAM_FOV_MAX = 110;
  const CAM_HEIGHT_DEFAULT = 0;
  const CAM_HEIGHT_MIN = -1.5;
  const CAM_HEIGHT_MAX = 1.5;
  let camProfiles = {};
  try {
    camProfiles = JSON.parse(localStorage.getItem(CAM_PROFILE_KEY) || '{}') || {};
  } catch {
    camProfiles = {};
  }

  // Заводские дефолты для отдельных моделей (не сохраняются в localStorage):
  // у Avenger посадка ниже и обзор шире, у остальных — стандартные 75 / 0.
  const CAM_PROFILE_DEFAULTS = {
    avenger220: { fov: 78, height: 0.15 }
  };

  function getCamProfile(bikeId = G.selectedBikeId) {
    const p = camProfiles[bikeId] || {};
    const fallback = CAM_PROFILE_DEFAULTS[bikeId] || { fov: CAM_FOV_DEFAULT, height: CAM_HEIGHT_DEFAULT };
    const fov = Number(p.fov);
    const height = Number(p.height);
    return {
      fov: clamp(Number.isFinite(fov) ? fov : fallback.fov, CAM_FOV_MIN, CAM_FOV_MAX),
      height: clamp(Number.isFinite(height) ? height : fallback.height, CAM_HEIGHT_MIN, CAM_HEIGHT_MAX)
    };
  }
  G.getCamProfile = getCamProfile;

  function saveCamProfiles() {
    try {
      localStorage.setItem(CAM_PROFILE_KEY, JSON.stringify(camProfiles));
    } catch {
      // Хранилище может быть недоступно (приватный режим) — профиль живёт до перезагрузки
    }
  }
  G.saveCamProfiles = saveCamProfiles;

  function syncVehicleAndCameraVisibility(forceMenuThirdPerson = false) {
    const b = G.selectedBike();
    const isQute = isQuteBody(b.vType);
    const isYura = isYuraType(b.vType);

    G.tankMat.color.setHex(bikePaint(b, G.customColors));
    G.accentMat.color.setHex(b.accent);

    G.applyVisualTuningToModel();

    const effectiveThirdPerson = forceMenuThirdPerson || (G.cameraMode === 'third');

    if (isQute) {
      G.bikeChassisGroup.visible = false;
      G.quteExteriorGroup.visible = effectiveThirdPerson;
      G.yuraTuningGroup.visible = isYura;
      G.bikeCockpitGroup.visible = false;
      G.quteCockpitGroup.visible = !effectiveThirdPerson;
      G.quteYuraInteriorNeon.visible = isYura;
      G.yuraUnderGlowLight.intensity = isYura ? 6.5 : 0;
    } else {
      G.quteExteriorGroup.visible = false;
      G.quteCockpitGroup.visible = false;
      G.bikeChassisGroup.visible = true;
      G.bikeThirdPersonBody.visible = effectiveThirdPerson;
      G.bikeCockpitGroup.visible = !effectiveThirdPerson;
      G.yuraUnderGlowLight.intensity = 0;
    }

    const tpHud = $('tp-hud');
    const badgeCam = $('badge-cam');
    const hintSub = $('hint-sub');
    if (G.started && !G.ended) {
      tpHud.hidden = !effectiveThirdPerson;
      if (badgeCam) {
        badgeCam.textContent = effectiveThirdPerson ? '🎥 3-Е ЛИЦО (T/C)' : '🎥 КОКПИТ (T/C)';
      }
      if (hintSub) {
        hintSub.textContent = effectiveThirdPerson
          ? 'Показатели выведены справа снизу · T / C / V — переключить в кокпит'
          : 'Скорость, пробег и рубли на приборной панели · T / C / V — вид от 3-го лица';
      }
    } else {
      tpHud.hidden = true;
    }
  }
  G.syncVehicleAndCameraVisibility = syncVehicleAndCameraVisibility;

  function toggleCameraMode() {
    G.cameraMode = (G.cameraMode === 'cockpit') ? 'third' : 'cockpit';
    G.saveGarage();
    syncVehicleAndCameraVisibility(!G.started || G.ended);
  }
  G.toggleCameraMode = toggleCameraMode;

  let lastDashDraw = 0;
  let lastDashKey = '';
  let lastThirdKey = '';
  let lastPills = '';
  let dashGrad = null;
  let dashGradYura = null;

  /* ---------- Круглая аналоговая приборка Boxer / Avenger ---------- */
  const roundDash = { bg: null, chrome: null };

  function drawRoundDashboard(speedVal, distVal, scoreVal, multVal, highBeamActive, maxSpd) {
    const ctx = G.dashCtx;
    if (!roundDash.bg) {
      roundDash.bg = ctx.createLinearGradient(0, 0, 0, 256);
      roundDash.bg.addColorStop(0, '#282828');
      roundDash.bg.addColorStop(0.55, '#1a1a1a');
      roundDash.bg.addColorStop(1, '#0e0e0e');
      roundDash.chrome = ctx.createLinearGradient(0, 0, 512, 256);
      roundDash.chrome.addColorStop(0, '#f4f4f4');
      roundDash.chrome.addColorStop(0.32, '#9a9a9a');
      roundDash.chrome.addColorStop(0.55, '#ededed');
      roundDash.chrome.addColorStop(1, '#5f5f5f');
    }

    ctx.fillStyle = roundDash.bg;
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(10, 10, 492, 236);
    ctx.strokeStyle = '#313131';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, 492, 236);

    const accent = '#' + G.accentMat.color.getHexString();
    const speedFrac = clamp(maxSpd > 0 ? speedVal / maxSpd : 0, 0, 1);
    const gaugeStart = 150;
    const gaugeSweep = 240;
    const rad = deg => deg * Math.PI / 180;

    function ring(x, y, r, width, stroke) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.lineWidth = width;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }

    /* --- Круглый спидометр --- */
    const cx = 128;
    const cy = 126;
    const R = 104;
    ring(cx, cy, R, 8, roundDash.chrome);
    ring(cx, cy, R - 8, 2, '#3d3d3d');
    ctx.beginPath();
    ctx.arc(cx, cy, R - 12, 0, Math.PI * 2);
    ctx.fillStyle = '#151515';
    ctx.fill();

    const maxTick = Math.max(10, Math.ceil(maxSpd / 10) * 10);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let v = 0; v <= maxTick; v += 10) {
      const a = rad(gaugeStart + gaugeSweep * (v / maxTick));
      const major = v % 20 === 0;
      const r1 = R - 14;
      const r2 = R - (major ? 28 : 22);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.strokeStyle = major ? '#ffffff' : '#9e9e9e';
      ctx.lineWidth = major ? 2.5 : 1.4;
      ctx.stroke();
      if (major) {
        const rt = R - 40;
        ctx.fillStyle = '#d8d8d8';
        ctx.font = '700 12px system-ui,Arial';
        ctx.fillText(String(v), cx + Math.cos(a) * rt, cy + Math.sin(a) * rt);
      }
    }

    // Дуга прогресса в цвете акцента байка.
    ctx.beginPath();
    ctx.arc(cx, cy, R - 46, rad(gaugeStart), rad(gaugeStart + gaugeSweep * speedFrac));
    ctx.strokeStyle = accent;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Оранжевая стрелка.
    const na = rad(gaugeStart + gaugeSweep * speedFrac);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(na);
    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.lineTo(0, -4.5);
    ctx.lineTo(R - 32, 0);
    ctx.lineTo(0, 4.5);
    ctx.closePath();
    ctx.fillStyle = '#ff9800';
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#cfcfcf';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#333333';
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 40px system-ui,Segoe UI,Arial';
    ctx.fillText(String(Math.round(speedVal)), cx, cy + 32);
    ctx.fillStyle = '#bdbdbd';
    ctx.font = '700 12px system-ui,Arial';
    ctx.fillText('км/ч', cx, cy + 56);

    if (highBeamActive) {
      ctx.beginPath();
      ctx.arc(cx, cy - 58, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#2196f3';
      ctx.fill();
      ctx.strokeStyle = '#90caf9';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    /* --- Круглый одометр --- */
    const ox = 372;
    const oy = 126;
    const OR = 92;
    ring(ox, oy, OR, 7, roundDash.chrome);
    ring(ox, oy, OR - 7, 2, '#3d3d3d');
    ctx.beginPath();
    ctx.arc(ox, oy, OR - 11, 0, Math.PI * 2);
    ctx.fillStyle = '#141414';
    ctx.fill();

    const hundredths = Math.max(0, Math.floor((distVal || 0) * 100));
    const digitStr = String(hundredths).padStart(5, '0').slice(-5);
    for (let i = 0; i < 5; i++) {
      const a = rad(215 + i * 27.5);
      const dx = ox + Math.cos(a) * (OR - 24);
      const dy = oy + Math.sin(a) * (OR - 24);
      ctx.save();
      ctx.translate(dx, dy);
      ctx.fillStyle = '#0c0c0c';
      ctx.fillRect(-11, -14, 22, 28);
      ctx.strokeStyle = '#4a4a4a';
      ctx.lineWidth = 1;
      ctx.strokeRect(-11, -14, 22, 28);
      ctx.fillStyle = '#f5f5f5';
      ctx.font = '900 18px Consolas,monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(digitStr[i], 0, 1);
      ctx.restore();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f2f2f2';
    ctx.font = '900 26px Consolas,monospace';
    ctx.fillText((distVal || 0).toFixed(2).padStart(6, '0'), ox, oy - 4);
    ctx.fillStyle = '#9e9e9e';
    ctx.font = '700 10px system-ui,Arial';
    ctx.fillText('ОБЩИЙ ПРОБЕГ', ox, oy + 30);

    /* --- Баланс и множитель встречки --- */
    const scoreText = `${grouped(scoreVal)} ₽`;
    const multLabel = multVal > 1 ? ` ×${multVal}` : '';
    ctx.font = '800 15px system-ui,Arial';
    const wScore = ctx.measureText(scoreText).width;
    let wMult = 0;
    if (multLabel) {
      ctx.font = '900 16px system-ui,Arial';
      wMult = ctx.measureText(multLabel).width;
    }
    let sx = 256 - (wScore + wMult) / 2;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffcc80';
    ctx.font = '800 15px system-ui,Arial';
    ctx.fillText(scoreText, sx, 242);
    if (multLabel) {
      ctx.fillStyle = '#ff1744';
      ctx.font = '900 16px system-ui,Arial';
      ctx.fillText(multLabel, sx + wScore, 242);
    }
  }

  function updateCockpitDashboard(now, speedVal, distVal, scoreVal, multVal, highBeamActive) {
    const effStats = G.frameStats || G.applyWearToStats(G.getBikeEffectiveStats(G.selectedBikeId));
    const maxSpd = effStats.maxSpeed;
    const bike = G.selectedBike();
    const hudStyle = bike.hudStyle || 'digital';
    const gear = speedVal < 2 ? 'N' : Math.min(6, Math.max(1, Math.ceil((speedVal / maxSpd) * 6)));
    const speedText = String(Math.round(speedVal));
    const distText = runDistance(distVal);
    const rubText = rubles(scoreVal);

    if (G.cameraMode === 'third' && G.started && !G.ended) {
      const thirdKey = `${speedText}|${gear}|${distText}|${rubText}`;
      if (thirdKey !== lastThirdKey) {
        lastThirdKey = thirdKey;
        $('tp-speed').textContent = speedText;
        $('tp-gear').textContent = 'G' + gear;
        $('tp-dist').textContent = distText;
        $('tp-rub').textContent = rubText;
      }
      let pills = '';
      if (multVal > 1) pills += `<span class="tp-pill x2">ВСТРЕЧКА ×2</span>`;
      if (G.jumpState.airborne) pills += `<span class="tp-pill jump">ПЕРЕЛЁТ: ${G.jumpState.carsJumped} (+${rubles(G.jumpState.liveBonus)})</span>`;
      if (pills !== lastPills) {
        lastPills = pills;
        $('tp-extra').innerHTML = pills;
      }
      return;
    }

    const dashKey = `${bike.id}|${hudStyle}|${speedText}|${distText}|${rubText}|${gear}|${maxSpd}|${multVal}|${highBeamActive ? 1 : 0}`;
    if (dashKey === lastDashKey || now - lastDashDraw < 30) return;
    lastDashKey = dashKey;
    lastDashDraw = now;

    if (hudStyle === 'round') {
      drawRoundDashboard(speedVal, distVal, scoreVal, multVal, highBeamActive, maxSpd);
      G.dashTex.needsUpdate = true;
      return;
    }

    const rpmFrac = clamp(speedVal / maxSpd, 0, 1);
    const isYura = effStats.isYura;

    if (!dashGrad) {
      dashGrad = G.dashCtx.createLinearGradient(0, 0, 0, 256);
      dashGrad.addColorStop(0, '#07131e');
      dashGrad.addColorStop(1, '#0d2233');
      dashGradYura = G.dashCtx.createLinearGradient(0, 0, 0, 256);
      dashGradYura.addColorStop(0, '#140824');
      dashGradYura.addColorStop(1, '#220e3b');
    }
    G.dashCtx.fillStyle = isYura ? dashGradYura : dashGrad;
    G.dashCtx.fillRect(0, 0, 512, 256);

    G.dashCtx.strokeStyle = isYura ? '#ff4081' : '#29b6f6';
    G.dashCtx.lineWidth = 5;
    G.dashCtx.strokeRect(8, 8, 496, 240);

    const bars = 22;
    for (let i = 0; i < bars; i++) {
      const active = (i / bars) <= rpmFrac;
      G.dashCtx.fillStyle = !active ? '#163042' : (i > 17 ? '#ff1744' : i > 13 ? '#ffab00' : '#00e5ff');
      G.dashCtx.fillRect(24 + i * 21, 16, 16, 16);
    }

    G.dashCtx.fillStyle = highBeamActive ? '#00b0ff' : '#132a3a';
    G.dashCtx.beginPath();
    G.dashCtx.arc(470, 46, 16, 0, Math.PI * 2);
    G.dashCtx.fill();
    G.dashCtx.fillStyle = highBeamActive ? '#ffffff' : '#375368';
    G.dashCtx.font = '900 15px Arial';
    G.dashCtx.textAlign = 'center';
    G.dashCtx.fillText('HI', 470, 51);

    G.dashCtx.fillStyle = '#ffffff';
    G.dashCtx.font = '900 96px system-ui,Segoe UI,Arial';
    G.dashCtx.textAlign = 'right';
    G.dashCtx.fillText(String(Math.round(speedVal)), 248, 142);

    G.dashCtx.textAlign = 'left';
    G.dashCtx.fillStyle = '#4fc3f7';
    G.dashCtx.font = '900 20px system-ui,Segoe UI,Arial';
    G.dashCtx.fillText('КМ/Ч', 264, 86);
    G.dashCtx.fillText('MAX ' + Math.round(maxSpd), 264, 112);

    G.dashCtx.fillStyle = '#ffd54f';
    G.dashCtx.font = '900 28px system-ui,Segoe UI,Arial';
    G.dashCtx.fillText('GEAR ' + gear, 264, 148);

    G.dashCtx.fillStyle = '#90caf9';
    G.dashCtx.font = '800 16px system-ui,Segoe UI,Arial';
    G.dashCtx.fillText('ДИСТАНЦИЯ', 24, 178);
    G.dashCtx.fillStyle = '#ffffff';
    G.dashCtx.font = '900 26px system-ui,Segoe UI,Arial';
    G.dashCtx.fillText(distText, 24, 208);

    G.dashCtx.fillStyle = '#ffcc80';
    G.dashCtx.font = '800 16px system-ui,Segoe UI,Arial';
    G.dashCtx.fillText('РУБЛИ' + (multVal > 1 ? ' ×' + multVal : ''), 264, 178);
    G.dashCtx.fillStyle = '#ffb64e';
    G.dashCtx.font = '900 26px system-ui,Segoe UI,Arial';
    G.dashCtx.fillText(grouped(scoreVal), 264, 208);

    G.dashTex.needsUpdate = true;
  }
  G.updateCockpitDashboard = updateCockpitDashboard;

  let camBiomeRoll = 0;

  function updateFollowCamera(dt, isQute) {
    const useThirdPersonCam = (!G.started || G.ended) || (G.cameraMode === 'third');

    // Крен в поворотах: читаем кривизну профиля дороги, в горах усиливаем.
    // Сглаживание ~6/с убирает дрожь и не даёт камере прыгать на стыках биомов.
    const driving = G.started && !G.ended;
    let targetRoll = 0;
    if (driving) {
      const wts = G.biomeWeightsAtS(G.playerS);
      const mountainWeight = wts[3];
      const speedFactor = clamp(G.speed / 55, 0.3, 1.25);
      targetRoll = clamp(-G.roadDDX(G.playerS) * 5.5, -0.055, 0.055)
        * speedFactor * (1 + 0.9 * mountainWeight);
    }
    camBiomeRoll += (targetRoll - camBiomeRoll) * Math.min(1, dt * 6);

    if (!useThirdPersonCam) {
      if (G.camera.parent !== G.riderPivot) G.riderPivot.add(G.camera);
      // Профиль кокпита: отдельный FOV и высота для каждого мотоцикла.
      // Высота применяется только к камере — мотоцикл и кокпит стоят на месте.
      const profile = getCamProfile(G.selectedBikeId);
      const cockpitY = isQute ? 1.33 : 1.56;
      const cockpitZ = isQute ? -0.14 : 0.35;
      G.riderPivot.position.set(0, cockpitY, cockpitZ);
      G.camera.position.set(0, profile.height + G.accelPitchOffset * 0.35, 0);
      G.camera.rotation.set(G.accelPitchOffset * 0.4, 0, -G.steerVisual * (isQute ? 0.025 : 0.04) + camBiomeRoll);
      if (Math.abs(G.camera.fov - profile.fov) > 0.01) {
        G.camera.fov = profile.fov;
        G.camera.aspect = innerWidth / innerHeight;
        G.camera.updateProjectionMatrix();
      }
    } else {
      if (G.camera.parent !== G.scene) G.scene.add(G.camera);
      // Вид от третьего лица фиксированный — профиль кокпита не применяется.
      if (Math.abs(G.camera.fov - 75) > 0.01) {
        G.camera.fov = 75;
        G.camera.aspect = innerWidth / innerHeight;
        G.camera.updateProjectionMatrix();
      }

      const roadYaw = -Math.atan(G.roadDX(G.playerS));
      const cosY = Math.cos(-roadYaw), sinY = Math.sin(-roadYaw);

      const isMenuView = !G.started && !G.ended;
      const speedPullback = clamp(G.speed / 220, 0, 1.35);
      const jumpPullback = G.jumpState.airborne ? clamp(G.jumpState.height * 0.55, 0, 2.2) : 0;
      const distBehind = isMenuView ? 6.6 : (6.1 + speedPullback + jumpPullback);
      const heightAboveRoad = isMenuView
        ? 3.35
        : (3.05 + G.jumpState.height * 0.72 + clamp(G.speed / 320, 0, 0.45));

      const camS = G.playerS - distBehind;
      const camLat = isMenuView ? (G.laneOffset - 1.4) : (G.laneOffset * 0.92);
      const camYaw = -Math.atan(G.roadDX(camS));
      const minSafeY = G.roadY(camS) + 1.85;
      const targetCamX = G.roadX(camS) + Math.cos(camYaw) * camLat;
      const targetCamZ = -camS + Math.sin(camYaw) * camLat;
      const targetCamY = Math.max(minSafeY, G.roadY(G.playerS) + heightAboveRoad);

      const followRate = Math.min(1, dt * 11.5);
      if (G.camPosSmooth.distanceToSquared(G.bikeRoot.position) > 900) {
        G.camPosSmooth.set(targetCamX, targetCamY, targetCamZ);
      } else {
        G.camPosSmooth.x = lerp(G.camPosSmooth.x, targetCamX, followRate);
        G.camPosSmooth.y = lerp(G.camPosSmooth.y, targetCamY, followRate);
        G.camPosSmooth.z = lerp(G.camPosSmooth.z, targetCamZ, followRate);
      }
      G.camera.position.copy(G.camPosSmooth);

      const lookAheadS = G.playerS + (isMenuView ? 42 : 46);
      const lookLat = isMenuView ? 0.5 : (G.laneOffset * 0.55);
      const targetLookX = G.roadX(lookAheadS) + cosY * lookLat;
      const targetLookZ = -lookAheadS + sinY * lookLat;
      const targetLookY = G.roadY(lookAheadS) + 1.25 + G.jumpState.height * 0.25;

      G.camLookSmooth.x = lerp(G.camLookSmooth.x, targetLookX, Math.min(1, dt * 13));
      G.camLookSmooth.y = lerp(G.camLookSmooth.y, targetLookY, Math.min(1, dt * 13));
      G.camLookSmooth.z = lerp(G.camLookSmooth.z, targetLookZ, Math.min(1, dt * 13));

      G.camera.lookAt(G.camLookSmooth);
      G.camera.rotation.z += -G.steerVisual * 0.025 + camBiomeRoll;
    }
  }
  G.updateFollowCamera = updateFollowCamera;

  function aimSunAtPlayer() {
    G.sunLight.position.set(G.bikeRoot.position.x - 24, G.bikeRoot.position.y + 48, G.bikeRoot.position.z - 25);
    G.sunLight.target.position.set(G.bikeRoot.position.x, G.bikeRoot.position.y, G.bikeRoot.position.z - 28);
  }
  G.aimSunAtPlayer = aimSunAtPlayer;

  // Немедленно применяем профиль к активной камере (работает и на паузе).
  function applyCamProfileToCamera(bike) {
    if (!G.started || G.ended || G.cameraMode !== 'cockpit') return;
    const profile = getCamProfile(bike.id);
    const isQute = isQuteBody(bike.vType);
    // Пивот мотоцикла неподвижен, высота профиля уходит в локальную позицию камеры.
    G.riderPivot.position.set(0, isQute ? 1.33 : 1.56, isQute ? -0.14 : 0.35);
    G.camera.position.set(0, profile.height + G.accelPitchOffset * 0.35, 0);
    G.camera.fov = profile.fov;
    G.camera.aspect = innerWidth / innerHeight;
    G.camera.updateProjectionMatrix();
  }
  G.applyCamProfileToCamera = applyCamProfileToCamera;

  /* ---------- Экран настроек камеры от первого лица + живой предпросмотр ---------- */
  let camPreviewRenderer = null;
  let camPreviewReturn = null;
  let camPreviewLastFrame = 0;
  let camPreviewW = 0;
  let camPreviewH = 0;
  let draftCamFov = CAM_FOV_DEFAULT;
  let draftCamHeight = CAM_HEIGHT_DEFAULT;
  G.camPreviewActive = false;

  function ensureCamPreviewRenderer() {
    if (camPreviewRenderer) return camPreviewRenderer;
    try {
      camPreviewRenderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
      camPreviewRenderer.setPixelRatio(1);
      camPreviewRenderer.outputColorSpace = THREE.SRGBColorSpace;
      camPreviewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      camPreviewRenderer.shadowMap.enabled = false;
    } catch {
      camPreviewRenderer = null;
    }
    return camPreviewRenderer;
  }

  // Лёгкий предпросмотр: та же сцена и модели, но рендер в маленький canvas
  // с ограничением ~30 fps. Камера временно ставится в кокпит выбранной техники.
  function renderCameraPreview(now) {
    if (now - camPreviewLastFrame < 33) return;
    const container = document.getElementById('cam-preview');
    if (!container) return;
    const w = Math.floor(container.clientWidth);
    const h = Math.floor(container.clientHeight);
    if (w < 8 || h < 8) return;
    const pr = ensureCamPreviewRenderer();
    if (!pr) return;

    camPreviewLastFrame = now;
    if (pr.domElement.parentElement !== container) container.appendChild(pr.domElement);
    if (camPreviewW !== w || camPreviewH !== h) {
      camPreviewW = w;
      camPreviewH = h;
      pr.setSize(w, h, false);
    }

    const bike = G.selectedBike();
    const isQute = isQuteBody(bike.vType);

    const prevParent = G.camera.parent;
    const prevPos = G.camera.position.clone();
    const prevRot = G.camera.rotation.clone();
    const prevFov = G.camera.fov;
    const prevAspect = G.camera.aspect;
    const prevPivot = G.riderPivot.position.clone();
    const previewHadLayer1 = G.camera.layers.isEnabled(1);
    // Кокпит живёт на слое 1 — для предпросмотра включаем его вручную.
    G.camera.layers.enable(1);

    if (G.camera.parent !== G.riderPivot) G.riderPivot.add(G.camera);
    G.riderPivot.position.set(0, isQute ? 1.33 : 1.56, isQute ? -0.14 : 0.35);
    G.camera.position.set(0, draftCamHeight, 0);
    G.camera.rotation.set(0, 0, 0);
    G.camera.fov = draftCamFov;
    G.camera.aspect = w / h;
    G.camera.updateProjectionMatrix();

    // Показываем кокпит нужной техники и убираем кузов игрока из кадра.
    const visBikeCockpit = G.bikeCockpitGroup.visible;
    const visQuteCockpit = G.quteCockpitGroup.visible;
    const visThirdBody = G.bikeThirdPersonBody.visible;
    const visQuteExterior = G.quteExteriorGroup.visible;
    G.bikeCockpitGroup.visible = !isQute;
    G.quteCockpitGroup.visible = isQute;
    G.bikeThirdPersonBody.visible = false;
    G.quteExteriorGroup.visible = false;

    pr.render(G.scene, G.camera);

    G.bikeCockpitGroup.visible = visBikeCockpit;
    G.quteCockpitGroup.visible = visQuteCockpit;
    G.bikeThirdPersonBody.visible = visThirdBody;
    G.quteExteriorGroup.visible = visQuteExterior;

    G.riderPivot.position.copy(prevPivot);
    if (prevParent) prevParent.add(G.camera);
    G.camera.position.copy(prevPos);
    G.camera.rotation.copy(prevRot);
    G.camera.fov = prevFov;
    G.camera.aspect = prevAspect;
    if (!previewHadLayer1) G.camera.layers.disable(1);
    G.camera.updateProjectionMatrix();
    G.camera.updateMatrixWorld(true);
  }
  G.renderCameraPreview = renderCameraPreview;

  function leaveCameraSettings() {
    G.camPreviewActive = false;
    if (camPreviewRenderer && camPreviewRenderer.domElement.parentElement) {
      camPreviewRenderer.domElement.parentElement.removeChild(camPreviewRenderer.domElement);
    }
    // Возвращаем экран в корректное состояние, чтобы Esc снова работал
    // как пауза/возврат, а не как повторный выход из настроек.
    G.currentScreen = (G.started && !G.ended) ? 'playing' : 'main';
    const fn = camPreviewReturn;
    camPreviewReturn = null;
    if (fn) fn();
  }
  G.leaveCameraSettings = leaveCameraSettings;

  function renderCameraSettings(returnFn) {
    G.currentScreen = 'camsettings';
    camPreviewReturn = returnFn || G.renderMainMenu;
    G.camPreviewActive = true;
    camPreviewLastFrame = 0;

    const b = G.selectedBike();
    const profile = getCamProfile(b.id);
    draftCamFov = profile.fov;
    draftCamHeight = profile.height;

    const overlay = $('overlay');
    overlay.style.display = 'flex';
    overlay.className = 'mode-shop';

    overlay.innerHTML = panel(`
        ${heading('КАМЕРА · ПЕРВОЕ ЛИЦО', `ПРОФИЛЬ: ${b.name} · НАСТРОЙКИ ТОЛЬКО ДЛЯ КОКПИТА`)}
        <div class="cam-settings-body">
          <div class="cam-settings-col">
            <div class="cam-profile-line">
              Профиль камеры хранится отдельно для каждого мотоцикла и восстанавливается при его выборе.
              Вид от третьего лица фиксированный.
            </div>
            <div class="cam-slider-block">
              <div class="cam-slider-head">
                <span>УГОЛ ОБЗОРА (FOV)</span>
                <b><span id="cam-fov-val">${Math.round(draftCamFov)}</span>°</b>
              </div>
              <input type="range" id="cam-fov" min="${CAM_FOV_MIN}" max="${CAM_FOV_MAX}" step="1" value="${Math.round(draftCamFov)}">
              <div class="cam-slider-hint">${CAM_FOV_MIN}° — узкий кадр · ${CAM_FOV_MAX}° — широкий обзор</div>
            </div>
            <div class="cam-slider-block">
              <div class="cam-slider-head">
                <span>ВЫСОТА КАМЕРЫ</span>
                <b><span id="cam-height-val">${draftCamHeight.toFixed(2)}</span> м</b>
              </div>
              <input type="range" id="cam-height" min="${CAM_HEIGHT_MIN}" max="${CAM_HEIGHT_MAX}" step="0.05" value="${draftCamHeight}">
              <div class="cam-slider-hint">${CAM_HEIGHT_MIN.toFixed(2)} м — ниже · +${CAM_HEIGHT_MAX.toFixed(2)} м — выше</div>
            </div>
            <div class="cam-status" id="cam-status"></div>
            ${button({ id: 'cam-apply', variant: 'primary', icon: '✓', label: 'ПРИМЕНИТЬ' })}
            ${button({ id: 'cam-reset', icon: '↺', label: 'СБРОСИТЬ ПО УМОЛЧАНИЮ' })}
            ${button({ id: 'cam-back', label: '← НАЗАД' })}
          </div>
          <div class="cam-settings-col">
            <div class="cam-preview-wrap">
              <div class="cam-preview-tag">LIVE · КОКПИТ</div>
              <div id="cam-preview"></div>
              <div class="cam-preview-note">Предпросмотр обновляется сразу при движении ползунков</div>
            </div>
          </div>
        </div>
    `);
    const card = overlay.querySelector('.ds-panel');
    if (card) card.classList.add('cam-settings-card');

    const fovEl = /** @type {HTMLInputElement} */ ($('cam-fov'));
    const heightEl = /** @type {HTMLInputElement} */ ($('cam-height'));
    const statusEl = $('cam-status');

    fovEl.addEventListener('input', () => {
      draftCamFov = clamp(Number(fovEl.value), CAM_FOV_MIN, CAM_FOV_MAX);
      $('cam-fov-val').textContent = String(Math.round(draftCamFov));
      statusEl.textContent = '';
      statusEl.className = 'cam-status';
    });

    heightEl.addEventListener('input', () => {
      draftCamHeight = clamp(Number(heightEl.value), CAM_HEIGHT_MIN, CAM_HEIGHT_MAX);
      $('cam-height-val').textContent = draftCamHeight.toFixed(2);
      statusEl.textContent = '';
      statusEl.className = 'cam-status';
    });

    $('cam-apply').addEventListener('click', () => {
      camProfiles[b.id] = { fov: draftCamFov, height: draftCamHeight };
      saveCamProfiles();
      applyCamProfileToCamera(b);
      statusEl.textContent = 'Сохранено для ' + b.name;
      statusEl.className = 'cam-status';
    });

    $('cam-reset').addEventListener('click', () => {
      draftCamFov = CAM_FOV_DEFAULT;
      draftCamHeight = CAM_HEIGHT_DEFAULT;
      fovEl.value = String(CAM_FOV_DEFAULT);
      heightEl.value = String(CAM_HEIGHT_DEFAULT);
      $('cam-fov-val').textContent = String(CAM_FOV_DEFAULT);
      $('cam-height-val').textContent = CAM_HEIGHT_DEFAULT.toFixed(2);
      delete camProfiles[b.id];
      saveCamProfiles();
      applyCamProfileToCamera(b);
      statusEl.textContent = 'Сброшено по умолчанию';
      statusEl.className = 'cam-status';
    });

    $('cam-back').addEventListener('click', leaveCameraSettings);
  }
  G.renderCameraSettings = renderCameraSettings;
}
