import { G } from './state.js';

/* =========================================================================
 * 15b. РЕЖИМ УПРАВЛЕНИЯ: КНОПКИ / АКСЕЛЕРОМЕТР
 *
 * Оба режима пишут в одни и те же G.keys.* — физика не меняется.
 * «Кнопки» — прежние .ctrl[data-key], свайп на #view и #btn-flash.
 * «Акселерометр» — наклон рулит, правая половина экрана — газ,
 * левая — тормоз, сигнал — отдельная кнопка #btn-flash-tilt.
 * ========================================================================= */

const MODE_KEY = 'bajajGO_controlMode';
const CALIBRATION_KEY = 'bajajGO_tiltCalibration';
const SENSITIVITY_KEY = 'bajajGO_tiltSensitivity';
const INVERT_KEY = 'bajajGO_tiltInvert';

const CALIBRATION_SAMPLES = 12;
const CALIBRATION_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const SENSOR_TIMEOUT = 2200;
const HINT_TIMEOUT = 4200;

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    /* приватный режим или запрет хранилища — играем без сохранения */
  }
}

export function initControls() {
  const $ = G.$;
  const overlay = $('tilt-overlay');
  const zoneGas = $('tilt-zone-gas');
  const zoneBrake = $('tilt-zone-brake');
  const indicatorDot = $('tilt-indicator-dot');
  const flashBtn = $('btn-flash-tilt');
  const controls = $('controls');

  const activePointers = new Map();
  let hintTimer = 0;
  let lastOverlayVisible = null;
  let tiltLastNow = 0;

  /* ---------- Состояние и загрузка настроек ---------- */
  G.controlMode = 'buttons';
  G.tiltSensitivity = 1;
  G.tiltInvert = false;
  G.tiltCalibration = { beta: 0, gamma: 0, calibratedAt: 0 };
  G.tiltRaw = { beta: 0, gamma: 0, alpha: 0 };
  G.tiltSmoothed = 0;
  G.tiltGotEvent = false;
  G.tiltEventCount = 0;
  G.tiltLastEventAt = 0;
  G.tiltActive = false;
  G.tiltStartedAt = 0;
  G.tiltCalibrationSamples = [];
  G.tiltCalibrationActive = false;
  G.tiltCalibrationAutoStop = false;
  G.tiltHintHidden = false;
  G.tiltHandler = null;
  G.controlModeNotice = '';
  G.swipeActive = false;

  const DeviceOrientation = /** @type {any} */ (window).DeviceOrientationEvent;
  // На десктопе без тач-экрана датчиков ориентации обычно нет: карточка
  // акселерометра сразу недоступна, без запроса разрешения и ожидания событий.
  const touchCapable = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
  G.tiltAvailable = touchCapable
    && typeof DeviceOrientation !== 'undefined'
    && ('ondeviceorientation' in window
      || typeof DeviceOrientation.requestPermission === 'function');

  const storedMode = readStorage(MODE_KEY);
  if (storedMode === 'tilt') {
    if (G.tiltAvailable) G.controlMode = 'tilt';
    else writeStorage(MODE_KEY, 'buttons');
  }

  const storedSensitivity = Number(readStorage(SENSITIVITY_KEY));
  if (Number.isFinite(storedSensitivity) && storedSensitivity > 0) {
    G.tiltSensitivity = G.clamp(storedSensitivity, 0.5, 2);
  }
  G.tiltInvert = readStorage(INVERT_KEY) === '1';

  const storedCalibration = readStorage(CALIBRATION_KEY);
  if (storedCalibration) {
    try {
      const parsed = JSON.parse(storedCalibration);
      if (parsed && Number.isFinite(Number(parsed.gamma))) {
        G.tiltCalibration = {
          beta: Number(parsed.beta) || 0,
          gamma: Number(parsed.gamma) || 0,
          calibratedAt: Number(parsed.calibratedAt) || 0
        };
      }
    } catch (err) {
      G.tiltCalibration = { beta: 0, gamma: 0, calibratedAt: 0 };
    }
  }

  function persistMode() {
    writeStorage(MODE_KEY, G.controlMode);
  }

  function saveCalibration() {
    writeStorage(CALIBRATION_KEY, JSON.stringify(G.tiltCalibration));
  }

  function clearTiltKeys() {
    G.keys.gas = false;
    G.keys.brake = false;
    G.keys.left = false;
    G.keys.right = false;
    activePointers.clear();
    zoneGas.classList.remove('active');
    zoneBrake.classList.remove('active');
  }

  /* ---------- Разрешение iOS 13+ ---------- */
  async function requestTiltPermission() {
    const API = /** @type {any} */ (window).DeviceOrientationEvent;
    if (typeof API === 'undefined') return false;
    if (typeof API.requestPermission === 'function') {
      try {
        const result = await API.requestPermission();
        return result === 'granted';
      } catch (err) {
        return false;
      }
    }
    return true;
  }

  /* ---------- Подписка и калибровка ---------- */
  function finishCalibration() {
    const samples = G.tiltCalibrationSamples;
    if (!G.tiltCalibrationActive || samples.length < CALIBRATION_SAMPLES) return;
    const beta = samples.reduce((sum, s) => sum + s.beta, 0) / samples.length;
    const gamma = samples.reduce((sum, s) => sum + s.gamma, 0) / samples.length;
    G.tiltCalibration = { beta, gamma, calibratedAt: Date.now() };
    G.tiltCalibrationActive = false;
    G.tiltCalibrationSamples = [];
    saveCalibration();
    if (G.tiltCalibrationAutoStop && !(G.started && !G.ended)) stopTilt();
  }

  function beginCalibration() {
    G.tiltCalibration = { beta: 0, gamma: 0, calibratedAt: 0 };
    G.tiltCalibrationSamples = [];
    G.tiltCalibrationActive = true;
  }

  function tiltHandler(e) {
    if (e.beta == null && e.gamma == null) return;
    const beta = Number.isFinite(e.beta) ? e.beta : 0;
    const gamma = Number.isFinite(e.gamma) ? e.gamma : 0;
    G.tiltRaw.beta = beta;
    G.tiltRaw.gamma = gamma;
    G.tiltRaw.alpha = Number.isFinite(e.alpha) ? e.alpha : 0;
    G.tiltGotEvent = true;
    G.tiltEventCount += 1;
    G.tiltLastEventAt = performance.now();
    if (G.tiltCalibrationActive) {
      G.tiltCalibrationSamples.push({ beta, gamma });
      if (G.tiltCalibrationSamples.length >= CALIBRATION_SAMPLES) finishCalibration();
    }
  }

  function resetTiltHints() {
    G.tiltHintHidden = false;
    zoneGas.classList.remove('hint-hidden');
    zoneBrake.classList.remove('hint-hidden');
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(hideTiltHints, HINT_TIMEOUT);
  }

  function hideTiltHints() {
    G.tiltHintHidden = true;
    zoneGas.classList.add('hint-hidden');
    zoneBrake.classList.add('hint-hidden');
    if (hintTimer) {
      clearTimeout(hintTimer);
      hintTimer = 0;
    }
  }

  function startTilt() {
    if (!G.tiltAvailable || G.tiltHandler) return !!G.tiltActive;
    G.tiltHandler = tiltHandler;
    window.addEventListener('deviceorientation', G.tiltHandler, { passive: true });
    G.tiltActive = true;
    G.tiltGotEvent = false;
    G.tiltEventCount = 0;
    G.tiltLastEventAt = 0;
    G.tiltStartedAt = performance.now();
    G.tiltSmoothed = 0;
    const calibrationFresh = G.tiltCalibration.calibratedAt > 0
      && Date.now() - G.tiltCalibration.calibratedAt < CALIBRATION_MAX_AGE;
    if (!calibrationFresh) {
      G.tiltCalibrationAutoStop = false;
      beginCalibration();
    }
    return true;
  }

  function stopTilt() {
    if (G.tiltHandler) {
      window.removeEventListener('deviceorientation', G.tiltHandler);
      G.tiltHandler = null;
    }
    G.tiltActive = false;
    G.tiltCalibrationActive = false;
    G.tiltCalibrationSamples = [];
    G.tiltSmoothed = 0;
    if (hintTimer) {
      clearTimeout(hintTimer);
      hintTimer = 0;
    }
    activePointers.clear();
    syncControlUi();
  }

  function calibrateTilt() {
    if (!G.tiltAvailable) return false;
    const wasActive = G.tiltActive;
    if (!wasActive) startTilt();
    G.tiltCalibrationAutoStop = !wasActive;
    beginCalibration();
    return true;
  }

  function probeTiltSensors(timeout = SENSOR_TIMEOUT) {
    if (!G.tiltAvailable) return Promise.resolve(false);
    if (!G.tiltActive) startTilt();
    const startedAt = performance.now();
    const hadEvents = G.tiltEventCount > 0;
    return new Promise(resolve => {
      const timer = setInterval(() => {
        const sawEvent = hadEvents || G.tiltLastEventAt >= startedAt;
        const elapsed = performance.now() - startedAt;
        // Даём автокалибровке добрать первые события, чтобы при выходе
        // из настроек уже было сохранённое нейтральное положение.
        if (sawEvent && !G.tiltCalibrationActive) {
          clearInterval(timer);
          resolve(true);
        } else if (elapsed >= timeout) {
          clearInterval(timer);
          resolve(sawEvent);
        }
      }, 100);
    });
  }

  /* ---------- Видимость оверлея и кнопок ---------- */
  function syncControlUi() {
    const inRun = !!(G.started && !G.ended && !G.paused && !G.uiModal);
    const tiltVisible = G.controlMode === 'tilt' && inRun;
    if (overlay.hidden !== !tiltVisible) overlay.hidden = !tiltVisible;
    if (G.controlMode === 'tilt') {
      if (!controls.hidden) controls.hidden = true;
      flashBtn.hidden = !tiltVisible;
    } else {
      flashBtn.hidden = true;
    }
    if (tiltVisible) {
      if (lastOverlayVisible !== true) resetTiltHints();
      lastOverlayVisible = true;
    } else {
      lastOverlayVisible = false;
    }
  }

  function fallbackToButtons(message) {
    G.controlMode = 'buttons';
    persistMode();
    stopTilt();
    clearTiltKeys();
    G.controlModeNotice = message;
    if (G.showEcoToast) G.showEcoToast(message, true);
    syncControlUi();
    if (G.currentScreen === 'settings' && G.renderSettings) {
      G.renderSettings('controls', G.paused ? 'pause' : 'menu');
    }
  }

  async function setControlMode(mode) {
    if (mode !== 'tilt') {
      G.controlMode = 'buttons';
      persistMode();
      stopTilt();
      clearTiltKeys();
      G.controlModeNotice = '';
      syncControlUi();
      return { ok: true };
    }

    if (!G.tiltAvailable) {
      return { ok: false, message: 'Акселерометр недоступен на этом устройстве. Используйте кнопки.' };
    }

    const granted = await requestTiltPermission();
    if (!granted) {
      return { ok: false, message: 'Доступ к датчикам отклонён. Остаёмся на кнопках.' };
    }

    G.controlMode = 'tilt';
    G.controlModeNotice = '';
    persistMode();
    startTilt();
    resetTiltHints();
    syncControlUi();
    return { ok: true };
  }

  function startTiltSession() {
    if (G.controlMode !== 'tilt') return;
    if (G.tiltActive) {
      resetTiltHints();
      return;
    }
    requestTiltPermission().then(granted => {
      if (!granted) {
        fallbackToButtons('Доступ к датчикам отклонён. Остаёмся на кнопках.');
        return;
      }
      if (G.controlMode !== 'tilt') return;
      startTilt();
      resetTiltHints();
    });
  }

  function setTiltSensitivity(value) {
    G.tiltSensitivity = G.clamp(Number(value) || 1, 0.5, 2);
    writeStorage(SENSITIVITY_KEY, String(G.tiltSensitivity));
  }

  function setTiltInvert(value) {
    G.tiltInvert = !!value;
    writeStorage(INVERT_KEY, G.tiltInvert ? '1' : '0');
  }

  /* ---------- Тач-зоны газа и тормоза ---------- */
  function canTiltDrive() {
    return G.controlMode === 'tilt'
      && G.started && !G.ended && !G.paused && !G.uiModal;
  }

  function interactiveTarget(target) {
    if (!(target instanceof Element)) return false;
    return !!target.closest('#btn-flash-tilt, #btn-pause, #btn-camera, #overlay, #controls, .ds-button, .ds-icon-button');
  }

  function releasePointer(e) {
    const zone = activePointers.get(e.pointerId);
    if (!zone) return;
    activePointers.delete(e.pointerId);
    let stillHeld = false;
    for (const held of activePointers.values()) {
      if (held === zone) { stillHeld = true; break; }
    }
    if (!stillHeld) G.keys[zone] = false;
  }

  function pointerDown(e) {
    if (!canTiltDrive()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (interactiveTarget(e.target)) return;
    const zone = e.clientX > window.innerWidth / 2 ? 'gas' : 'brake';
    activePointers.set(e.pointerId, zone);
    G.keys[zone] = true;
    hideTiltHints();
  }

  function pointerEnd(e) {
    releasePointer(e);
  }

  window.addEventListener('pointerdown', pointerDown, { passive: true });
  window.addEventListener('pointerup', pointerEnd, { passive: true });
  window.addEventListener('pointercancel', pointerEnd, { passive: true });
  window.addEventListener('blur', () => {
    activePointers.clear();
    if (G.controlMode === 'tilt') {
      G.keys.gas = false;
      G.keys.brake = false;
    }
  });

  flashBtn.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    if (G.triggerHighBeam) G.triggerHighBeam();
    flashBtn.classList.add('on');
    setTimeout(() => flashBtn.classList.remove('on'), 140);
  });

  /* ---------- Кадровое обновление ---------- */
  function updateZone(zone, active) {
    if (zone.classList.contains('active') !== active) zone.classList.toggle('active', active);
  }

  function updateIndicator() {
    const steer = G.tiltSmoothed;
    indicatorDot.style.left = `${(50 + steer * 50).toFixed(1)}%`;
    const abs = Math.abs(steer);
    indicatorDot.style.background = abs > 0.5 ? '#e15b55' : (abs > 0.15 ? '#ffd166' : '#ffffff');
  }

  function updateTilt(now) {
    syncControlUi();
    if (G.controlMode !== 'tilt') {
      tiltLastNow = 0;
      return;
    }

    // Сглаживание не зависит от частоты кадров: на 60 и 120 Гц руль
    // доезжает до целевого угла за одинаковое время.
    const rawDt = tiltLastNow ? (now - tiltLastNow) / 1000 : 1 / 60;
    tiltLastNow = now;
    const dt = G.clamp(rawDt, 0, 0.05);
    const smooth = 1 - Math.exp(-dt * 12);

    const running = !!(G.started && !G.ended && !G.paused && !G.uiModal);
    if (!running) {
      G.tiltSmoothed = G.lerp(G.tiltSmoothed, 0, smooth);
      return;
    }

    if (!G.tiltActive) return;

    if (!G.tiltGotEvent) {
      if (now - G.tiltStartedAt > SENSOR_TIMEOUT) {
        fallbackToButtons('Датчики не отвечают. Переключено на кнопки.');
      }
      updateIndicator();
      return;
    }

    if (G.tiltCalibrationActive && G.tiltCalibration.calibratedAt === 0) {
      G.tiltSmoothed = G.lerp(G.tiltSmoothed, 0, smooth);
    } else {
      const invert = G.tiltInvert ? -1 : 1;
      // Без мёртвой зоны: даже небольшой наклон сразу даёт малый поворот.
      const target = G.clamp(
        ((G.tiltRaw.gamma - G.tiltCalibration.gamma) / 25) * G.tiltSensitivity * invert,
        -1,
        1
      );
      G.tiltSmoothed = G.lerp(G.tiltSmoothed, target, smooth);
    }

    // В наклоне руление идёт аналоговым G.tiltSmoothed; клавиши не трогаем,
    // пока активен свайп, и гасим остатки после него.
    if (!G.swipeActive) {
      G.keys.left = false;
      G.keys.right = false;
    }

    updateZone(zoneGas, !!G.keys.gas);
    updateZone(zoneBrake, !!G.keys.brake);
    updateIndicator();
  }

  G.tiltHandler = null;
  G.startTilt = startTilt;
  G.stopTilt = stopTilt;
  G.startTiltSession = startTiltSession;
  G.setControlMode = setControlMode;
  G.requestTiltPermission = requestTiltPermission;
  G.probeTiltSensors = probeTiltSensors;
  G.calibrateTilt = calibrateTilt;
  G.setTiltSensitivity = setTiltSensitivity;
  G.setTiltInvert = setTiltInvert;
  G.updateTilt = updateTilt;
  G.syncControlUi = syncControlUi;

  syncControlUi();
}
