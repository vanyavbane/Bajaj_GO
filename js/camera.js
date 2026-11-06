import * as THREE from 'three';
import { bikePaint, isQuteBody, isYuraType } from './engine/vehicle.js';
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

  function formatRunDistance(km) {
    const meters = Math.max(0, km * 1000);
    if (meters < 1000) return `${Math.round(meters)} м`;
    return `${km.toFixed(2)} км`;
  }
  G.formatRunDistance = formatRunDistance;

  let lastDashDraw = 0;
  let lastDashKey = '';
  let lastThirdKey = '';
  let lastPills = '';
  let dashGrad = null;
  let dashGradYura = null;
  function updateCockpitDashboard(now, speedVal, distVal, scoreVal, multVal, highBeamActive) {
    const effStats = G.frameStats || G.applyWearToStats(G.getBikeEffectiveStats(G.selectedBikeId));
    const maxSpd = effStats.maxSpeed;
    const gear = speedVal < 2 ? 'N' : Math.min(6, Math.max(1, Math.ceil((speedVal / maxSpd) * 6)));
    const speedText = String(Math.round(speedVal));
    const distText = formatRunDistance(distVal);

    if (G.cameraMode === 'third' && G.started && !G.ended) {
      const thirdKey = `${speedText}|${gear}|${distText}|${Math.floor(scoreVal)}`;
      if (thirdKey !== lastThirdKey) {
        lastThirdKey = thirdKey;
        $('tp-speed').textContent = speedText;
        $('tp-gear').textContent = 'G' + gear;
        $('tp-dist').textContent = distText;
        $('tp-rub').textContent = Math.floor(scoreVal) + ' ₽';
      }
      let pills = '';
      if (multVal > 1) pills += `<span class="tp-pill x2">ВСТРЕЧКА ×2</span>`;
      if (G.jumpState.airborne) pills += `<span class="tp-pill jump">ПЕРЕЛЁТ: ${G.jumpState.carsJumped} (+${Math.round(G.jumpState.liveBonus)} ₽)</span>`;
      if (pills !== lastPills) {
        lastPills = pills;
        $('tp-extra').innerHTML = pills;
      }
      return;
    }

    const dashKey = `${speedText}|${distText}|${Math.floor(scoreVal)}|${gear}|${maxSpd}|${multVal}|${highBeamActive ? 1 : 0}`;
    if (dashKey === lastDashKey || now - lastDashDraw < 30) return;
    lastDashKey = dashKey;
    lastDashDraw = now;

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
    G.dashCtx.fillText(String(Math.floor(scoreVal)), 264, 208);

    G.dashTex.needsUpdate = true;
  }
  G.updateCockpitDashboard = updateCockpitDashboard;

  function updateFollowCamera(dt, isQute) {
    const useThirdPersonCam = (!G.started || G.ended) || (G.cameraMode === 'third');
    if (!useThirdPersonCam) {
      if (G.camera.parent !== G.riderPivot) G.riderPivot.add(G.camera);
      const cockpitY = isQute ? 1.33 : 1.56;
      const cockpitZ = isQute ? -0.14 : 0.35;
      G.riderPivot.position.set(0, cockpitY, cockpitZ);
      G.camera.position.set(0, G.accelPitchOffset * 0.35, 0);
      G.camera.rotation.set(G.accelPitchOffset * 0.4, 0, -G.steerVisual * (isQute ? 0.025 : 0.04));
    } else {
      if (G.camera.parent !== G.scene) G.scene.add(G.camera);

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
      G.camera.rotation.z += -G.steerVisual * 0.025;
    }
  }
  G.updateFollowCamera = updateFollowCamera;

  function aimSunAtPlayer() {
    G.sunLight.position.set(G.bikeRoot.position.x - 24, G.bikeRoot.position.y + 48, G.bikeRoot.position.z - 25);
    G.sunLight.target.position.set(G.bikeRoot.position.x, G.bikeRoot.position.y, G.bikeRoot.position.z - 28);
  }
  G.aimSunAtPlayer = aimSunAtPlayer;
}
