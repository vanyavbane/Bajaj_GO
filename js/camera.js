import * as THREE from 'three';
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
    const isQute = b.vType === 'qute' || b.vType === 'yura';
    const isYura = b.vType === 'yura';

    G.tankMat.color.setHex(b.color);
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
  function updateCockpitDashboard(now, speedVal, distVal, scoreVal, multVal, highBeamActive) {
    const effStats = G.getBikeEffectiveStats(G.selectedBikeId);
    G.applyWearToStats(effStats);
    const maxSpd = effStats.maxSpeed;
    const gear = speedVal < 2 ? 'N' : Math.min(6, Math.max(1, Math.ceil((speedVal / maxSpd) * 6)));

    if (G.cameraMode === 'third' && G.started && !G.ended) {
      $('tp-speed').textContent = String(Math.round(speedVal));
      $('tp-gear').textContent = 'G' + gear;
      $('tp-dist').textContent = distVal.toFixed(2) + ' КМ';
      $('tp-rub').textContent = Math.floor(scoreVal) + ' ₽';

      let pills = '';
      if (multVal > 1) pills += `<span class="tp-pill x2">ВСТРЕЧКА ×2</span>`;
      if (G.jumpState.airborne) pills += `<span class="tp-pill jump">ПЕРЕЛЁТ: ${G.jumpState.carsJumped} (+${Math.round(G.jumpState.liveBonus)} ₽)</span>`;
      $('tp-extra').innerHTML = pills;
      return;
    }

    if (now - lastDashDraw < 30) return;
    lastDashDraw = now;

    const rpmFrac = clamp(speedVal / maxSpd, 0, 1);
    const isYura = G.selectedBike().vType === 'yura';

    const bg = G.dashCtx.createLinearGradient(0, 0, 0, 256);
    bg.addColorStop(0, isYura ? '#140824' : '#07131e');
    bg.addColorStop(1, isYura ? '#220e3b' : '#0d2233');
    G.dashCtx.fillStyle = bg;
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
    G.dashCtx.fillText(distVal.toFixed(2) + ' KM', 24, 208);

    G.dashCtx.fillStyle = '#ffcc80';
    G.dashCtx.font = '800 16px system-ui,Segoe UI,Arial';
    G.dashCtx.fillText('РУБЛИ' + (multVal > 1 ? ' ×' + multVal : ''), 264, 178);
    G.dashCtx.fillStyle = '#ffb64e';
    G.dashCtx.font = '900 26px system-ui,Segoe UI,Arial';
    G.dashCtx.fillText(String(Math.floor(scoreVal)), 264, 208);

    G.dashTex.needsUpdate = true;
  }
  G.updateCockpitDashboard = updateCockpitDashboard;
}
