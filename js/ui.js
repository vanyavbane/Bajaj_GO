import * as THREE from 'three';
import { button, callout, check, choiceGrid, currency, field, heading, iconButton, inline, logo, menuScreen, note, panel, slider, stats, swatch, swatchRow, tabBody, tabs } from '@bajajgo/design';
import { creditRun, rubles, runDistance, shortfall } from './engine/money.js';
import { resetRun } from './engine/rules.js';
import { G } from './state.js';
import { bikePaint } from './engine/vehicle.js';
import { OUTFIT_COLORS, OUTFIT_DEFAULT, applyOutfit, loadOutfit, normalizeOutfit, resetOutfit, saveOutfit } from './outfit.js';

function buildStamp() {
  const iso = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';
  if (!iso) return 'сборка dev';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'сборка dev';
  const text = date.toLocaleString('ru', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `сборка ${text}`;
}

export function initUi() {
  const $ = G.$;
  const builtAt = buildStamp();
  const buildBadge = $('badge-build');
  if (buildBadge) buildBadge.textContent = builtAt;

  /* =========================================================================
   * 14. ИГРОВОЕ СОСТОЯНИЕ, ГЛАВНОЕ МЕНЮ, МАГАЗИН, ТЮНИНГ И ОКНО СМЕРТИ
   * ========================================================================= */
  G.keys = { left: false, right: false, gas: false, brake: false };
  G.currentScreen = 'main';
  G.started = false;
  G.ended = false;
  G.lastTime = performance.now();
  resetRun(G, G.START_LANE);

  /* ---------- Настройки: общий экран с вкладками ---------- */
  let settingsReturn = null;
  let controlsNotice = '';
  let controlsInfo = '';

  function saveVisual() {
    if (G.saveVisualSettings) G.saveVisualSettings();
  }

  function fxState(on) {
    return on ? 'Вкл' : 'Выкл';
  }

  function fxOpenModal(render) {
    G.currentScreen = 'settings';
    render();
  }

  function continueFromSettings() {
    if (!G.paused) return;
    G.currentScreen = (G.started && !G.ended) ? 'playing' : 'main';
    if (G.resumeGame) G.resumeGame();
    else {
      G.paused = false;
      const overlay = $('overlay');
      overlay.style.display = 'none';
      overlay.innerHTML = '';
    }
  }

  G.leaveSettings = () => {
    const fn = settingsReturn;
    if (!fn) return;
    settingsReturn = null;
    fn();
  };

  function renderSettings(tab = 'graphics', from = 'menu') {
    G.currentScreen = 'settings';
    settingsReturn = () => {
      if (from === 'pause') G.renderPauseMenu();
      else renderMainMenu();
    };

    const overlay = $('overlay');
    overlay.style.display = 'flex';
    overlay.className = 'mode-shop';

    const g = G.graphics;
    const v = G.visual;
    const option = (key, value, label) => button({
      variant: 'choice',
      label,
      pressed: g[key] === value,
      data: { gfx: key, value }
    });

    const tabItems = [
      ['graphics', 'Графика'],
      ['lighting', 'Освещение'],
      ['camera', 'Вид камеры'],
      ['controls', 'Управление'],
      ['sound', 'Звук']
    ];

    let body = '';
    if (tab === 'graphics') {
      body = `
        ${g.preset === 'custom' ? note('Свой набор. Экспозиция 1.18 включается только режимом «Чётко».') : ''}
        ${field('Режим', option('preset', 'fast', 'Быстро') + option('preset', 'balanced', 'Ровно') + option('preset', 'sharp', 'Чётко'))}
        ${field('Тени', option('shadows', 'off', 'Нет') + option('shadows', 'low', 'Рядом') + option('shadows', 'high', 'Чётче'))}
        ${field('Масштаб кадра', option('scale', 0.75, '0.75') + option('scale', 1, '1') + option('scale', 1.25, '1.25'))}
        ${field('Фонари', option('lamps', 0, '0') + option('lamps', 2, '2') + option('lamps', 4, '4') + option('lamps', 6, '6'))}
        ${slider({
          id: 'gfx-sharp-range',
          valueId: 'gfx-sharp-val',
          label: 'Резкость',
          min: -100,
          max: 100,
          step: 1,
          value: Math.round(g.sharpness || 0),
          hint: '0 — как сейчас · < 0 мягче · > 0 чётче. Двойной тап по значению — сброс в 0.'
        })}
        ${slider({
          id: 'gfx-bright-range',
          valueId: 'gfx-bright-val',
          label: 'Яркость',
          min: -100,
          max: 100,
          step: 1,
          value: Math.round(g.brightness || 0),
          hint: '0 — как сейчас · мягкая регулировка без пересветов. Двойной тап по значению — сброс в 0.'
        })}
        ${note('Отражения и HDR+ — во вкладке «Освещение».')}
      `;
    } else if (tab === 'lighting') {
      body = `
        ${inline('HDR+', button({
          id: 'fx-toggle-hdr',
          variant: 'compact',
          label: fxState(!!g.hdrPlus),
          pressed: !!g.hdrPlus
        }))}
        ${inline('🪞 Отражения', button({
          id: 'fx-toggle-reflections',
          variant: 'compact',
          label: fxState(g.reflections),
          pressed: !!g.reflections
        }))}
        ${inline('💨 Motion Blur', button({ id: 'fx-open-mb', variant: 'compact', label: fxState(v.motionBlur) }))}
        ${inline('☀️ Лучи от солнца', button({ id: 'fx-open-gr', variant: 'compact', label: fxState(v.godRays) }))}
        ${note('Эффекты применяются мгновенно и сохраняются в браузере.')}
      `;
    } else if (tab === 'camera') {
      body = `
        ${inline('Вид камеры', button({ id: 'settings-cam', variant: 'compact', label: G.cameraMode === 'cockpit' ? 'Кокпит' : '3-е лицо' }))}
        ${inline('Кокпит: FOV / высота', button({ id: 'settings-cam-fov', variant: 'compact', icon: '🎛', label: 'Настроить' }))}
        ${note('Вид от третьего лица фиксированный. Профиль камеры хранится отдельно для каждого мотоцикла.')}
      `;
    } else if (tab === 'controls') {
      const mode = G.controlMode === 'tilt' ? 'tilt' : (G.controlMode === 'stick' ? 'stick' : 'buttons');
      const tiltAvailable = !!G.tiltAvailable;
      const noticeText = controlsNotice || G.controlModeNotice || '';
      const infoText = controlsInfo;
      controlsNotice = '';
      controlsInfo = '';
      G.controlModeNotice = '';
      const calibration = G.tiltCalibration || { beta: 0, gamma: 0, calibratedAt: 0, axis: '', angle: 0 };
      const calibrationAxis = calibration.axis === 'beta' ? 'β' : 'γ';
      const calibrationText = calibration.calibratedAt > 0
        ? `Калибровка: ${calibrationAxis}=${Number(calibration.axis === 'beta' ? calibration.beta : calibration.gamma).toFixed(1)}° · ${new Date(calibration.calibratedAt).toLocaleDateString('ru-RU')}`
        : 'Калибровка ещё не выполнена — она пройдёт автоматически в первые секунды заезда.';

      const keyPreview = (glyphs) => `<div class="ds-choice-keys">${glyphs.map((glyph) => `<span>${glyph}</span>`).join('')}</div>`;
      body = `
        ${choiceGrid('Способ управления', [
          {
            on: mode === 'stick',
            data: { 'ctrl-mode': 'stick' },
            preview: keyPreview(['◉', '▲', '▼']),
            label: 'Джойстик',
            detail: 'Стик справа вместо кнопок: влево и вправо — руль, вверх — газ, вниз — тормоз. Клавиатура работает вместе с ним.'
          },
          {
            on: mode === 'buttons',
            data: { 'ctrl-mode': 'buttons' },
            preview: keyPreview(['←', '▼', '▲', '→']),
            label: 'Кнопки',
            detail: 'Экранные кнопки газа, тормоза и поворота. Работает на любом устройстве.'
          },
          {
            on: mode === 'tilt',
            disabled: !tiltAvailable,
            data: { 'ctrl-mode': 'tilt' },
            preview: `<div class="ds-choice-phone"><span class="ds-choice-signal">💡</span><span class="ds-choice-steer">← →</span><span class="ds-choice-pedals">▲<br>▼</span><span class="ds-choice-mark"></span></div>`,
            label: 'Акселерометр',
            detail: 'Наклон устройства — руление. Правая часть экрана — газ, левая — тормоз. Кнопка «Сигнал» справа. Для мобильных.'
          }
        ])}
        ${noticeText ? callout(noticeText, 'err') : ''}
        ${infoText ? note(infoText) : ''}
        ${!tiltAvailable ? callout('Акселерометр недоступен на этом устройстве. Используйте кнопки.', 'err') : ''}
        ${mode === 'tilt' && tiltAvailable ? `
          ${slider({
            id: 'tilt-sens-range',
            valueId: 'tilt-sens-val',
            label: 'Чувствительность акселерометра',
            min: 50,
            max: 200,
            step: 5,
            value: Math.round(G.tiltSensitivity * 100),
            suffix: '%',
            hint: '50% — плавное руление (нужен большой наклон) · 200% — резкое (маленький наклон)'
          })}
          ${inline('Инверсия наклона', button({ id: 'tilt-invert', variant: 'compact', label: G.tiltInvert ? 'Вкл' : 'Выкл', pressed: G.tiltInvert }))}
          ${button({ id: 'tilt-calibrate', variant: 'primary', icon: '🎯', label: 'КАЛИБРОВАТЬ (ДЕРЖИТЕ РОВНО)' })}
          ${note(calibrationText)}
          ${note('Держите устройство перед собой, как при съёмке. Наклон влево/вправо — руление. Ось выбирается автоматически: в портрете — γ, в ландшафте — β; при повороте телефона калибровка обновляется сама.')}
        ` : ''}
      `;
    } else {
      const muted = !!G.soundMuted;
      body = `
        ${inline('Звук', button({
          id: 'sound-mute',
          variant: 'compact',
          label: muted ? 'Выключен' : 'Включён',
          pressed: !muted
        }))}
        ${note(muted
          ? 'Беззвучный режим: прыжки, съезды, дождь, гром и очки не звучат.'
          : 'Игровые звуки включены. Беззвучный режим выключает их все сразу.')}
      `;
    }

    overlay.innerHTML = panel(`
        ${heading('НАСТРОЙКИ', 'ГРАФИКА · ОСВЕЩЕНИЕ · КАМЕРА · УПРАВЛЕНИЕ · ЗВУК')}
        ${tabs(tabItems, tab)}
        ${tabBody(body)}
        ${button({ id: 'settings-back', label: '← НАЗАД' })}
    `, { size: 'narrow' });

    overlay.querySelectorAll('[data-tab]').forEach(btn => {
      if (!(btn instanceof HTMLElement)) return;
      btn.addEventListener('click', () => renderSettings(btn.dataset.tab, from));
    });
    overlay.querySelectorAll('[data-gfx]').forEach(btn => {
      if (!(btn instanceof HTMLElement)) return;
      btn.addEventListener('click', () => {
        G.chooseGraphics(btn.dataset.gfx, btn.dataset.value);
        renderSettings(tab, from);
      });
    });
    $('settings-back').addEventListener('click', () => G.leaveSettings());

    const openMb = document.getElementById('fx-open-mb');
    if (openMb) {
      openMb.addEventListener('click', () => {
        fxOpenModal(() => renderMotionBlurSettings(() => renderSettings('lighting', from), from === 'pause'));
      });
    }
    const openGr = document.getElementById('fx-open-gr');
    if (openGr) {
      openGr.addEventListener('click', () => {
        fxOpenModal(() => renderGodRaysSettings(() => renderSettings('lighting', from), from === 'pause'));
      });
    }
    const toggleHdr = document.getElementById('fx-toggle-hdr');
    if (toggleHdr) {
      toggleHdr.addEventListener('click', () => {
        G.chooseGraphics('hdrPlus', g.hdrPlus ? 'false' : 'true');
        renderSettings('lighting', from);
      });
    }
    const toggleReflections = document.getElementById('fx-toggle-reflections');
    if (toggleReflections) {
      toggleReflections.addEventListener('click', () => {
        G.chooseGraphics('reflections', g.reflections ? 'false' : 'true');
        renderSettings('lighting', from);
      });
    }

    const sharpRange = /** @type {HTMLInputElement|null} */ (document.getElementById('gfx-sharp-range'));
    if (sharpRange) {
      const valEl = document.getElementById('gfx-sharp-val');
      sharpRange.addEventListener('input', () => {
        const v = G.clamp(Number(sharpRange.value), -100, 100);
        if (valEl) valEl.textContent = String(Math.round(v));
        if (G.setGraphicsValue) G.setGraphicsValue('sharpness', v);
      });
      if (valEl) {
        valEl.addEventListener('dblclick', () => {
          sharpRange.value = '0';
          valEl.textContent = '0';
          if (G.setGraphicsValue) G.setGraphicsValue('sharpness', 0);
        });
      }
    }
    const brightRange = /** @type {HTMLInputElement|null} */ (document.getElementById('gfx-bright-range'));
    if (brightRange) {
      const valEl = document.getElementById('gfx-bright-val');
      brightRange.addEventListener('input', () => {
        const v = G.clamp(Number(brightRange.value), -100, 100);
        if (valEl) valEl.textContent = String(Math.round(v));
        if (G.setGraphicsValue) G.setGraphicsValue('brightness', v);
      });
      if (valEl) {
        valEl.addEventListener('dblclick', () => {
          brightRange.value = '0';
          valEl.textContent = '0';
          if (G.setGraphicsValue) G.setGraphicsValue('brightness', 0);
        });
      }
    }
    const cam = document.getElementById('settings-cam');
    if (cam) {
      cam.addEventListener('click', () => {
        G.toggleCameraMode();
        renderSettings('camera', from);
      });
    }
    const camFov = document.getElementById('settings-cam-fov');
    if (camFov) {
      camFov.addEventListener('click', () => {
        G.renderCameraSettings(() => renderSettings('camera', from));
      });
    }

    overlay.querySelectorAll('[data-ctrl-mode]').forEach(btn => {
      if (!(btn instanceof HTMLElement) || btn.hasAttribute('disabled')) return;
      btn.addEventListener('click', async () => {
        const next = btn.dataset.ctrlMode;
        if (next === G.controlMode) return;

        if (next === 'buttons' || next === 'stick') {
          await G.setControlMode(next);
          renderSettings('controls', from);
          return;
        }

        if (!G.tiltAvailable) {
          controlsNotice = 'Акселерометр недоступен на этом устройстве. Используйте кнопки.';
          renderSettings('controls', from);
          return;
        }

        const result = await G.setControlMode('tilt');
        if (!result.ok) {
          controlsNotice = result.message;
          renderSettings('controls', from);
          return;
        }
        renderSettings('controls', from);

        const alive = await G.probeTiltSensors(2200);
        if (!alive) {
          await G.setControlMode('buttons');
          G.controlModeNotice = 'Датчики не отвечают. Переключено на кнопки.';
          if (G.currentScreen === 'settings') renderSettings('controls', from);
          return;
        }
        if (!(G.started && !G.ended)) G.stopTilt();
        const activeTab = overlay.querySelector('.ds-tab-on');
        if (G.currentScreen === 'settings' && activeTab instanceof HTMLElement && activeTab.dataset.tab === 'controls') {
          renderSettings('controls', from);
        }
      });
    });

    const soundMute = document.getElementById('sound-mute');
    if (soundMute) {
      soundMute.addEventListener('click', () => {
        if (G.setSoundMuted) G.setSoundMuted(!G.soundMuted);
        renderSettings('sound', from);
      });
    }

    const tiltRange = /** @type {HTMLInputElement} */ (document.getElementById('tilt-sens-range'));
    if (tiltRange) {
      const valueEl = document.getElementById('tilt-sens-val');
      tiltRange.addEventListener('input', () => {
        const percent = G.clamp(Number(tiltRange.value), 50, 200);
        G.setTiltSensitivity(percent / 100);
        if (valueEl) valueEl.textContent = String(Math.round(percent));
      });
    }

    const tiltInvert = document.getElementById('tilt-invert');
    if (tiltInvert) {
      tiltInvert.addEventListener('click', () => {
        G.setTiltInvert(!G.tiltInvert);
        renderSettings('controls', from);
      });
    }

    const tiltCalibrate = document.getElementById('tilt-calibrate');
    if (tiltCalibrate) {
      tiltCalibrate.addEventListener('click', () => {
        if (!G.calibrateTilt()) return;
        controlsInfo = 'Идёт калибровка — держите устройство ровно.';
        renderSettings('controls', from);
        setTimeout(() => {
          if (G.currentScreen !== 'settings') return;
          controlsInfo = G.tiltCalibration.calibratedAt > 0
            ? 'Калибровка сохранена. Наклон снова считается от текущего положения.'
            : 'Датчики не прислали показания. Попробуйте ещё раз на телефоне.';
          renderSettings('controls', from);
        }, 1600);
      });
    }
  }
  G.renderSettings = renderSettings;

  function renderMotionBlurSettings(backFn, fromPause) {
    G.currentScreen = 'settings';
    settingsReturn = backFn || (() => renderSettings('lighting', 'menu'));
    const v = G.visual;

    const overlay = $('overlay');
    overlay.style.display = 'flex';
    overlay.className = 'mode-shop';
    overlay.innerHTML = panel(`
        ${heading('💨 MOTION BLUR', 'КИНЕМАТОГРАФИЧНОЕ РАЗМЫТИЕ НА СКОРОСТИ')}
        ${inline('Включить эффект', button({ id: 'mb-toggle', variant: 'compact', label: fxState(v.motionBlur), pressed: v.motionBlur }))}
        ${slider({
          id: 'mb-range',
          valueId: 'mb-val',
          label: 'Интенсивность',
          min: 0,
          max: 100,
          step: 1,
          value: Math.round(v.motionBlurIntensity),
          suffix: '%',
          hint: 'Проявляется от ~35% максимальной скорости (≈80 км/ч) и плавно усиливается.'
        })}
        ${check({ id: 'mb-comfort', label: 'Уменьшить укачивание', checked: v.motionBlurComfort })}
        ${note('Размытие сильнее по краям, центр и полосы сверху/снизу остаются чёткими. HUD и мотоцикл игрока не размываются.')}
        ${callout('Авто-режим: на слабых устройствах эффект снижается или отключается автоматически.', '')}
        ${button({ id: 'mb-reset', icon: '↺', label: 'СБРОСИТЬ' })}
        ${button({ id: 'mb-back', label: '← НАЗАД' })}
        ${fromPause ? button({ id: 'mb-continue', variant: 'primary', icon: '▶', label: 'ПРОДОЛЖИТЬ' }) : ''}
    `, { size: 'narrow' });

    const range = /** @type {HTMLInputElement} */ ($('mb-range'));
    const valueEl = $('mb-val');
    range.addEventListener('input', () => {
      v.motionBlurIntensity = G.clamp(Number(range.value), 0, 100);
      valueEl.textContent = String(Math.round(v.motionBlurIntensity));
      saveVisual();
    });

    $('mb-toggle').addEventListener('click', () => {
      v.motionBlur = !v.motionBlur;
      saveVisual();
      renderMotionBlurSettings(backFn, fromPause);
    });

    const comfort = /** @type {HTMLInputElement} */ ($('mb-comfort'));
    comfort.addEventListener('change', () => {
      v.motionBlurComfort = comfort.checked;
      saveVisual();
    });

    $('mb-reset').addEventListener('click', () => {
      v.motionBlur = true;
      v.motionBlurIntensity = v.weakDevice ? 36 : 60;
      v.motionBlurComfort = false;
      saveVisual();
      renderMotionBlurSettings(backFn, fromPause);
    });
    $('mb-back').addEventListener('click', () => G.leaveSettings());
    const cont = document.getElementById('mb-continue');
    if (cont) cont.addEventListener('click', continueFromSettings);
  }
  G.renderMotionBlurSettings = renderMotionBlurSettings;

  function renderGodRaysSettings(backFn, fromPause) {
    G.currentScreen = 'settings';
    settingsReturn = backFn || (() => renderSettings('lighting', 'menu'));
    const v = G.visual;

    const overlay = $('overlay');
    overlay.style.display = 'flex';
    overlay.className = 'mode-shop';
    overlay.innerHTML = panel(`
        ${heading('☀️ ЛУЧИ ОТ СОЛНЦА', 'GOD RAYS · СВЕТОВЫЕ ЛУЧИ СКВОЗЬ ОБЛАКА')}
        ${inline('Включить эффект', button({ id: 'gr-toggle', variant: 'compact', label: fxState(v.godRays), pressed: v.godRays }))}
        ${slider({
          id: 'gr-range',
          valueId: 'gr-val',
          label: 'Интенсивность',
          min: 0,
          max: 100,
          step: 1,
          value: Math.round(v.godRaysIntensity),
          suffix: '%'
        })}
        ${slider({
          id: 'gr-len',
          valueId: 'gr-len-val',
          label: 'Длина лучей',
          min: 0,
          max: 100,
          step: 1,
          value: Math.round(v.godRaysLength),
          suffix: '%'
        })}
        ${note('Лучи видны только днём и на закате, когда солнце не закрыто тучами. Во время дождя, ночью и в тоннеле лучи автоматически скрываются.')}
        ${callout('Авто-режим: на слабых устройствах эффект снижается или отключается автоматически.', '')}
        ${button({ id: 'gr-reset', icon: '↺', label: 'СБРОСИТЬ' })}
        ${button({ id: 'gr-back', label: '← НАЗАД' })}
        ${fromPause ? button({ id: 'gr-continue', variant: 'primary', icon: '▶', label: 'ПРОДОЛЖИТЬ' }) : ''}
    `, { size: 'narrow' });

    const range = /** @type {HTMLInputElement} */ ($('gr-range'));
    const valueEl = $('gr-val');
    range.addEventListener('input', () => {
      v.godRaysIntensity = G.clamp(Number(range.value), 0, 100);
      valueEl.textContent = String(Math.round(v.godRaysIntensity));
      saveVisual();
    });

    const lenRange = /** @type {HTMLInputElement} */ ($('gr-len'));
    const lenValueEl = $('gr-len-val');
    lenRange.addEventListener('input', () => {
      v.godRaysLength = G.clamp(Number(lenRange.value), 0, 100);
      lenValueEl.textContent = String(Math.round(v.godRaysLength));
      saveVisual();
    });

    $('gr-toggle').addEventListener('click', () => {
      v.godRays = !v.godRays;
      saveVisual();
      renderGodRaysSettings(backFn, fromPause);
    });

    $('gr-reset').addEventListener('click', () => {
      v.godRays = true;
      v.godRaysIntensity = 55;
      v.godRaysLength = 50;
      saveVisual();
      renderGodRaysSettings(backFn, fromPause);
    });
    $('gr-back').addEventListener('click', () => G.leaveSettings());
    const cont = document.getElementById('gr-continue');
    if (cont) cont.addEventListener('click', continueFromSettings);
  }
  G.renderGodRaysSettings = renderGodRaysSettings;

  /* Совместимость: старый вызов экрана «Графика» открывает вкладку графики. */
  G.renderGraphics = (from) => renderSettings('graphics', from === 'pause' ? 'pause' : 'menu');

  let outfitPreview = null;

  function disposeOutfitPreview() {
    if (!outfitPreview) return;
    if (outfitPreview.raf) cancelAnimationFrame(outfitPreview.raf);
    if (outfitPreview.resize) window.removeEventListener('resize', outfitPreview.resize);
    if (outfitPreview.ro) outfitPreview.ro.disconnect();
    if (outfitPreview.scene) {
      const shared = new Set(Object.values(G.outfitParts || {}));
      outfitPreview.scene.traverse((obj) => {
        if (!obj.isMesh) return;
        if (obj.geometry) obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) { if (m && !shared.has(m)) m.dispose(); }
      });
    }
    if (outfitPreview.renderer) {
      outfitPreview.renderer.dispose();
      const c = outfitPreview.renderer.domElement;
      if (c && c.parentNode) c.parentNode.removeChild(c);
    }
    outfitPreview = null;
  }

  function buildStandingRider() {
    const p = G.outfitParts || {};
    const helmetMat = p.helmetMat || new THREE.MeshStandardMaterial({ color: 0x111111 });
    const visorMat = p.visorMat || new THREE.MeshStandardMaterial({ color: 0x1a2230, transparent: true, opacity: 0.72 });
    const jacketMat = p.jacketMat || new THREE.MeshStandardMaterial({ color: 0x111111 });
    const stripeMat = p.stripeMat || new THREE.MeshStandardMaterial({ color: 0xd9363e });
    const pantsMat = p.pantsMat || new THREE.MeshStandardMaterial({ color: 0x111111 });
    const bootsMat = p.bootsMat || new THREE.MeshStandardMaterial({ color: 0x111111 });
    const gloveMat = p.gloveMat || new THREE.MeshStandardMaterial({ color: 0x1a1d22 });
    const soleMat = p.soleMat || new THREE.MeshStandardMaterial({ color: 0x0b0d10 });
    const skinMat = p.skinMat || new THREE.MeshStandardMaterial({ color: 0xc49a7c });

    const g = new THREE.Group();
    const add = (mat, geo, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      g.add(m);
      return m;
    };
    const cap = (mat, r, len, x, y, z, rx = 0, ry = 0, rz = 0) =>
      add(mat, new THREE.CapsuleGeometry(r, Math.max(0.001, len), 4, 8), x, y, z, rx, ry, rz);

    // Шлем
    const helmet = new THREE.Group();
    helmet.position.set(0, 1.72, 0);
    g.add(helmet);
    helmet.add(new THREE.Mesh(new THREE.SphereGeometry(0.235, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), helmetMat));
    helmet.add(new THREE.Mesh(new THREE.SphereGeometry(0.232, 18, 10, 0, Math.PI * 2, Math.PI * 0.58, Math.PI * 0.26), helmetMat));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.196, 0.022, 8, 20), helmetMat);
    rim.rotation.x = Math.PI / 2; rim.position.y = -0.13; helmet.add(rim);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.13, 0.12), visorMat);
    visor.position.set(0, -0.01, -0.19); visor.rotation.x = -0.12; helmet.add(visor);
    const chin = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.14), helmetMat);
    chin.position.set(0, -0.15, -0.12); chin.rotation.x = 0.22; helmet.add(chin);

    // Шея, куртка, полоса
    cap(skinMat, 0.07, 0.04, 0, 1.53, -0.02, 0);
    add(jacketMat, new THREE.BoxGeometry(0.46, 0.56, 0.3), 0, 1.28, 0);
    add(jacketMat, new THREE.BoxGeometry(0.54, 0.14, 0.32), 0, 1.46, -0.01); // плечи
    add(jacketMat, new THREE.BoxGeometry(0.24, 0.09, 0.24), 0, 1.54, -0.02); // воротник
    add(stripeMat, new THREE.BoxGeometry(0.5, 0.085, 0.33), 0, 1.31, 0); // полоса
    add(jacketMat, new THREE.BoxGeometry(0.4, 0.12, 0.28), 0, 1.04, 0.01); // пояс

    for (const side of [-1, 1]) {
      // Руки вниз по швам
      cap(jacketMat, 0.075, 0.28, side * 0.34, 1.27, 0, 0, 0, 0, side * 0.08);
      cap(jacketMat, 0.065, 0.26, side * 0.38, 0.93, 0.02, 0.08, 0, 0, side * 0.04);
      add(gloveMat, new THREE.BoxGeometry(0.11, 0.1, 0.16), side * 0.4, 0.74, 0.05, 0.08);

      // Ноги прямо
      cap(pantsMat, 0.095, 0.3, side * 0.13, 0.79, 0, 0);
      cap(pantsMat, 0.082, 0.32, side * 0.13, 0.42, 0, 0);
      add(bootsMat, new THREE.BoxGeometry(0.16, 0.16, 0.28), side * 0.13, 0.16, 0.03, 0);
      add(soleMat, new THREE.BoxGeometry(0.17, 0.05, 0.3), side * 0.13, 0.07, 0.04, 0);
    }
    return g;
  }

  function startOutfitPreview(canvas) {
    disposeOutfitPreview();
    if (!canvas) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 30);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x556677, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(2.4, 3.8, 3.2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xcfe3ff, 0.9);
    fill.position.set(-2.8, 2.2, 2.4);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.75);
    rim.position.set(-1.8, 2.6, -3.0);
    scene.add(rim);

    const root = new THREE.Group();
    scene.add(root);
    const rider = buildStandingRider();
    const box = new THREE.Box3().setFromObject(rider);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    rider.position.sub(center);
    root.add(rider);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(0.72, 48),
      new THREE.MeshBasicMaterial({ color: 0x90a8c4, transparent: true, opacity: 0.32 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -size.y / 2 + 0.01;
    root.add(ground);

    const maxDim = Math.max(size.x, size.y, 0.001);
    const fov = camera.fov * (Math.PI / 180);
    let dist = (maxDim / 2) / Math.tan(fov / 2);
    dist *= 1.45;
    camera.position.set(0, 0, dist);
    camera.near = 0.1;
    camera.far = Math.max(30, dist + 10);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    const state = { renderer, scene, camera, root, raf: 0, resize: null, ro: null };
    const resize = () => {
      const w = Math.max(1, canvas.clientWidth || 320);
      const h = Math.max(1, canvas.clientHeight || 420);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    state.resize = resize;
    window.addEventListener('resize', resize);
    if (typeof ResizeObserver !== 'undefined') {
      state.ro = new ResizeObserver(resize);
      state.ro.observe(canvas);
    }
    resize();
    requestAnimationFrame(resize);

    let dragging = false;
    let lastX = 0;
    let rotY = 0.35;
    let velY = 0.006;
    const onDown = (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture?.(e.pointerId); };
    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      rotY += dx * 0.008;
      velY = dx * 0.0003;
    };
    const onUp = () => { dragging = false; };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onUp);

    const tick = () => {
      if (!outfitPreview || outfitPreview !== state) return;
      if (!dragging) rotY += velY;
      velY *= dragging ? 0 : 0.985;
      if (!dragging && Math.abs(velY) < 0.0035) velY = 0.0035 * Math.sign(velY || 1);
      root.rotation.y = rotY;
      renderer.render(scene, camera);
      state.raf = requestAnimationFrame(tick);
    };
    tick();
    outfitPreview = state;
  }

  function renderOutfit() {
    disposeOutfitPreview();
    G.currentScreen = 'outfit';
    const overlay = $('overlay');
    overlay.style.display = 'flex';
    overlay.className = 'mode-outfit';
    const current = normalizeOutfit(G.outfit || loadOutfit());
    const cats = [
      { id: 'helmet', label: 'Шлем' },
      { id: 'jacket', label: 'Куртка' },
      { id: 'pants',  label: 'Штаны' },
      { id: 'boots',  label: 'Ботинки' },
    ];

    overlay.innerHTML = `
      <div class="outfit-shell ds-panel">
        <div class="outfit-head">
          <div>
            <div class="ds-kicker">КАСТОМИЗАЦИЯ</div>
            <h2 class="ds-title">Экипировка</h2>
          </div>
          <div class="outfit-head-actions">
            <button id="outfit-reset" class="ds-button ds-button--compact">Сбросить</button>
            <button id="outfit-close" class="ds-icon-button" title="Закрыть" aria-label="Закрыть">✕</button>
          </div>
        </div>
        <div class="outfit-body">
          <div class="outfit-left">
            ${cats.map(cat => `
              <div class="outfit-cat" data-cat="${cat.id}">
                <div class="outfit-cat-title">${cat.label}</div>
                <div class="outfit-swatches">
                  ${OUTFIT_COLORS.map(c => `
                    <button class="outfit-swatch ${current[cat.id] === c.hex ? 'is-on' : ''}"
                      data-part="${cat.id}" data-color="${c.hex}" title="${c.name}" aria-label="${c.name}">
                      <span style="background:${c.hex}"></span>
                    </button>
                  `).join('')}
                </div>
              </div>
            `).join('')}
            <div class="outfit-hint ds-note">Изменения применяются сразу и сохраняются автоматически.</div>
            <button id="outfit-back" class="ds-button">← Назад в меню</button>
          </div>
          <div class="outfit-right">
            <div class="outfit-preview-wrap">
              <canvas id="outfit-preview-canvas" class="outfit-preview-canvas"></canvas>
            </div>
          </div>
        </div>
      </div>`;

    overlay.querySelectorAll('.outfit-swatch').forEach(btn => {
      btn.addEventListener('click', () => {
        const part = btn.getAttribute('data-part');
        const color = btn.getAttribute('data-color');
        if (!part || !color) return;
        const next = { ...(G.outfit || loadOutfit()), [part]: color };
        saveOutfit(next);
        applyOutfit(next);
        overlay.querySelectorAll(`.outfit-swatch[data-part="${part}"]`).forEach(b => b.classList.toggle('is-on', b === btn));
      });
    });

    $('outfit-close').addEventListener('click', () => { disposeOutfitPreview(); renderMainMenu(); });
    $('outfit-back').addEventListener('click', () => { disposeOutfitPreview(); renderMainMenu(); });
    $('outfit-reset').addEventListener('click', () => {
      resetOutfit();
      renderOutfit();
    });

    startOutfitPreview($('outfit-preview-canvas'));
  }

  function renderMainMenu() {
    // Пробег заезда дописывается в счётчик выбранного мотоцикла и на выходе
    // в меню, и в аварии: оба пути ведут сюда.
    if (G.creditRunMileage) G.creditRunMileage();
    if (G.closeShopPreview) G.closeShopPreview();
    disposeOutfitPreview();
    G.currentScreen = 'main';
    G.started = false;
    G.ended = false;
    if (G.stopTilt) G.stopTilt();
    $('hud').hidden = true;
    $('tp-hud').hidden = true;
    $('controls').hidden = true;
    $('jump-live').hidden = true;
    $('badge-beam').hidden = true;
    $('badge-oncoming').hidden = true;
    if (G.hideBiomeBanner) G.hideBiomeBanner();
    if (G.clearFeed) G.clearFeed();
    G.resetSlowMo();
    if (G.resetWeather) G.resetWeather();

    const overlay = $('overlay');
    overlay.style.display = 'block';
    overlay.className = 'mode-main';

    const b = G.selectedBike();
    const eff = G.getBikeEffectiveStats(b.id);
    const deltaSign = eff.speedDelta > 0 ? `+${eff.speedDelta}` : (eff.speedDelta < 0 ? `${eff.speedDelta}` : '');

    const badge = `Выбран: <b>${b.name}</b> · <b>${eff.maxSpeed} км/ч</b>${deltaSign ? ` (${deltaSign})` : ''} (${b.typeLabel})`;
    overlay.innerHTML = menuScreen({
      badge,
      biome: G.biomeMenuMarkup ? G.biomeMenuMarkup() : '',
      actions: [
        button({ id: 'mm-start', variant: 'primary', icon: '▶', label: 'Начать заезд' }),
        button({ id: 'mm-shop', icon: '🛒', label: 'Магазин мотоциклов', trail: `${G.bikeCatalog.length} ед.` }),
        button({ id: 'mm-outfit', icon: '🧥', label: 'Экипировка' }),
        button({
          id: 'mm-settings',
          icon: '⚙',
          label: 'Настройки',
          trail: G.graphicsLabel,
          trailOn: G.graphics.preset === 'sharp'
        })
      ].join(''),
      balance: currency({ id: 'bank', label: 'Баланс', value: rubles(G.bankPoints) }),
      footer: `bajaj GO · Voxel Traffic & Jump Simulator · Game by a fan · ${builtAt}`,
      tools: [
        iconButton({ id: 'mm-cam-settings', icon: '🎥', title: 'Настройки камеры от первого лица (FOV, высота)' }),
        iconButton({ id: 'mm-fs-btn', icon: '⛶', title: 'Полный экран' })
      ].join('')
    });

    G.syncVehicleAndCameraVisibility(true);

    $('mm-start').addEventListener('click', startGame);
    $('mm-shop').addEventListener('click', renderShop);
    $('mm-outfit').addEventListener('click', renderOutfit);
    $('mm-settings').addEventListener('click', () => renderSettings('graphics', 'menu'));
    $('mm-cam-settings').addEventListener('click', () => {
      G.renderCameraSettings(renderMainMenu);
    });
    $('mm-fs-btn').addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    });
  }
  G.renderMainMenu = renderMainMenu;

  function renderShop() {
    G.currentScreen = 'shop';
    const overlay = $('overlay');
    overlay.style.display = 'flex';
    overlay.className = 'mode-shop';

    // Магазин: от самой медленной машины к самой быстрой. При равной скорости
    // сначала идёт более дешёвая, затем — по названию.
    const shopBikes = [...G.bikeCatalog].sort((a, b) =>
      a.maxSpeed - b.maxSpeed || a.price - b.price || a.name.localeCompare(b.name, 'ru')
    );

    // Просматриваемый мотоцикл живёт отдельно от выбранного для заезда.
    // При входе в магазин показываем текущий, при клике по строке — только он.
    const remembered = shopBikes.find(b => b.id === G.shopPreviewId);
    const previewBike = remembered
      || shopBikes.find(b => b.id === G.selectedBikeId)
      || shopBikes[0];
    G.shopPreviewId = previewBike.id;

    const previewOwned = G.ownedBikes.includes(previewBike.id);
    const previewSelected = G.selectedBikeId === previewBike.id;
    const previewEff = G.getBikeEffectiveStats(previewBike.id);
    const previewColor = bikePaint(previewBike, G.customColors);
    const previewMissing = shortfall(previewBike.price, G.bankPoints);

    /* ---------- левая колонка: компактные строки ---------- */

    const rows = shopBikes.map(b => {
      const owned = G.ownedBikes.includes(b.id);
      const selected = G.selectedBikeId === b.id;
      const previewing = b.id === previewBike.id;
      const missing = shortfall(b.price, G.bankPoints);

      let side = '';
      if (owned) {
        side = '<b class="shop-row-owned">В гараже</b>';
      } else if (b.price === 0) {
        side = '<b class="shop-row-price">Бесплатно</b>';
      } else if (missing <= 0) {
        side = `<b class="shop-row-price">${rubles(b.price)}</b>`;
      } else {
        side = `<b class="shop-row-missing">не хватает ${rubles(missing)}</b>`;
      }
      const mark = selected ? '<em class="shop-row-badge">✓ Выбран</em>' : '';

      return `<button type="button" class="shop-row${previewing ? ' shop-row-on' : ''}" data-preview="${b.id}"${previewing ? ' aria-current="true"' : ''}>
        <span class="shop-row-main"><b>${b.name}</b><small>${b.typeLabel}</small></span>
        <span class="shop-row-side">${side}${mark}</span>
      </button>`;
    }).join('');

    /* ---------- правая колонка: характеристики и действие ---------- */

    const speedValue = previewEff.speedDelta > 0
      ? `${previewBike.maxSpeed} → ${previewEff.maxSpeed} км/ч`
      : `${previewEff.maxSpeed} км/ч`;
    const accelValue = `${Math.round(previewEff.accel)}${previewEff.accelBonusPct > 0 ? ` (+${previewEff.accelBonusPct}%)` : ''}`;
    const mileage = previewOwned && G.getBikeMileage ? G.getBikeMileage(previewBike.id) : 0;
    const mileageRow = previewOwned
      ? `<div class="shop-mileage${mileage > 0 ? '' : ' shop-mileage-empty'}">
          <span>Пробег</span>
          <b>${mileage > 0 ? runDistance(mileage / 1000) : 'ещё не ездили'}</b>
        </div>`
      : '';

    let actionBtn = '';
    let missingLine = '';
    let statusLine = '';
    if (previewSelected) {
      actionBtn = button({ variant: 'primary', label: '✓ ВЫБРАН', disabled: true, data: { state: 'selected' } });
      statusLine = `Выбран для заезда · тюнинг ${previewEff.installedCount}/${G.tuningCatalog.length}`;
    } else if (previewOwned) {
      actionBtn = button({ variant: 'primary', label: 'ВЫБРАТЬ', data: { state: 'select', select: previewBike.id } });
      statusLine = `В гараже · тюнинг ${previewEff.installedCount}/${G.tuningCatalog.length}`;
    } else if (previewBike.price === 0) {
      actionBtn = button({ variant: 'primary', label: 'ВЫБРАТЬ', data: { state: 'select', buy: previewBike.id } });
      statusLine = 'Стартовый мотоцикл · бесплатно';    } else if (previewMissing <= 0) {
      actionBtn = button({
        variant: 'primary',
        label: `КУПИТЬ ЗА ${rubles(previewBike.price)}`,
        data: { state: 'buy', buy: previewBike.id }
      });
      statusLine = `После покупки останется ${rubles(G.bankPoints - previewBike.price)}`;
    } else {
      actionBtn = button({
        variant: 'primary',
        label: `НУЖНО ${rubles(previewBike.price)}`,
        disabled: true,
        data: { state: 'missing' }
      });
      missingLine = `<div class="shop-missing">Не хватает ${rubles(previewMissing)}</div>`;
      statusLine = `Заработайте ещё ${rubles(previewMissing)} в заезде`;
    }

    let paint = '';
    if (previewBike.swatches && previewBike.swatches.length) {
      paint = `<div class="shop-paint">${swatchRow('Окраска', previewBike.swatches.map(s => swatch({
        color: '#' + s.hex.toString(16).padStart(6, '0'),
        title: s.name,
        on: previewColor === s.hex,
        data: { 'swatch-bike': previewBike.id, 'swatch-hex': s.hex }
      })).join(''))}</div>`;
    }

    overlay.innerHTML = panel(`
      <div class="shop-head">
        <div class="shop-brand">
          ${logo({ left: 'ГАРАЖ', right: 'GO', compact: true })}
          <span class="shop-brand-sub">Магазин мотоциклов</span>
        </div>
        ${currency({ id: 'shop-balance', label: 'Баланс', value: rubles(G.bankPoints) })}
      </div>
      <div class="shop-grid">
        <div class="shop-list-col">
          <div class="shop-col-title">Список мотоциклов</div>
          <div class="shop-list">${rows}</div>
        </div>
        <div class="shop-side">
          <div class="shop-preview-wrap">
            <div id="shop-preview" class="shop-preview" role="img" aria-label="3D-модель ${previewBike.name}"></div>
            <span class="shop-preview-tag">Просмотр</span>
            <div class="shop-preview-bar"></div>
          </div>
          <div class="shop-model">
            <b>${previewBike.name}</b>
            <span>${previewBike.typeLabel}</span>
          </div>
          ${stats([
            { label: 'Макс. скорость', value: speedValue, tone: 'signal' },
            { label: 'Разгон', value: accelValue },
            { label: 'Тюнинг', value: `${previewEff.installedCount}/${G.tuningCatalog.length}` },
            { label: 'Тип', value: previewBike.typeLabel }
          ])}
          ${mileageRow}
          <div class="shop-action">
            ${actionBtn}
            ${missingLine}
            <div class="shop-status">${statusLine}</div>
          </div>
          ${paint}
        </div>
      </div>
      <div class="shop-foot">${button({ id: 'shop-back', label: '← НАЗАД В ГЛАВНОЕ МЕНЮ' })}</div>
    `, { className: 'shop-panel' });

    // Клик по строке только меняет витрину: selectedBikeId не трогаем.
    overlay.querySelectorAll('[data-preview]').forEach(btn => {
      if (!(btn instanceof HTMLElement)) return;
      btn.addEventListener('click', () => {
        G.shopPreviewId = btn.dataset.preview;
        renderShop();
      });
    });
    overlay.querySelectorAll('[data-buy]').forEach(btn => {
      if (!(btn instanceof HTMLElement)) return;
      btn.addEventListener('click', () => {
        const bike = G.bikeCatalog.find(x => x.id === btn.dataset.buy);
        if (!bike || G.ownedBikes.includes(bike.id) || G.bankPoints < bike.price) return;
        G.bankPoints -= bike.price;
        G.ownedBikes.push(bike.id);
        G.selectedBikeId = bike.id;
        G.shopPreviewId = bike.id;
        G.saveGarage();
        G.syncVehicleAndCameraVisibility(true);
        renderShop();
      });
    });
    overlay.querySelectorAll('[data-select]').forEach(btn => {
      if (!(btn instanceof HTMLElement)) return;
      btn.addEventListener('click', () => {
        G.selectedBikeId = btn.dataset.select;
        G.shopPreviewId = btn.dataset.select;
        G.saveGarage();
        G.syncVehicleAndCameraVisibility(true);
        renderShop();
      });
    });
    overlay.querySelectorAll('[data-swatch-bike]').forEach(btn => {
      if (!(btn instanceof HTMLElement)) return;
      btn.addEventListener('click', () => {
        const bId = btn.dataset.swatchBike;
        const hex = Number(btn.dataset.swatchHex);
        G.customColors[bId] = hex;
        G.saveGarage();
        G.syncVehicleAndCameraVisibility(true);
        renderShop();
      });
    });
    $('shop-back').addEventListener('click', renderMainMenu);

    if (G.openShopPreview) G.openShopPreview(previewBike.id);
  }

  function startGame() {
    if (G.closeShopPreview) G.closeShopPreview();
    G.currentScreen = 'playing';
    G.started = true;
    G.ended = false;
    G.resetSlowMo();
    if (G.resetWeather) G.resetWeather();
    // Биом продолжается с сохранённого пробега: конфиг полос и профиль
    // дороги пересобираются до старта, чтобы полоса старта и трафик попали
    // на полосы текущего биома (у горного их две, у МКАД — восемь).
    if (G.resetBiomeRun) G.resetBiomeRun();
    // Кусок, не дописанный до аварии/выхода, зачисляем до обнуления заезда.
    if (G.creditRunMileage) G.creditRunMileage();
    if (G.resetRunMileage) G.resetRunMileage();
    resetRun(G, G.START_LANE);
    G.laneAssistTarget = null;
    if (G.updateBiome) G.updateBiome(0);
    if (G.biomeState && G.showBiomeBanner) G.showBiomeBanner(G.biomeState.dominant);
    $('jump-live').hidden = true;
    $('badge-beam').hidden = true;
    $('badge-oncoming').hidden = true;
    if (G.clearFeed) G.clearFeed();

    for (let i = 0; i < G.NUM_ROADSIDE_SLOTS; i++) {
      G.roadsideSlots[i].s = i * G.SLOT_STEP - 20;
    }
    for (let i = 0; i < G.megaStructures.length; i++) {
      G.megaStructures[i].userData.s = 220 + i * 320;
    }
    for (let i = 0; i < G.rampsPool.length; i++) {
      const r = G.rampsPool[i];
      // Попутная полоса берётся в точке рампы, а не у байка.
      r.s = G.findSafeRampS(150 + i * 280);
      const laneIdx = G.randomRunLane(r.s);
      r.laneIdx = laneIdx;
      r.lateralOffset = G.drivenLanesAt(r.s).offsets[laneIdx];
      r.triggeredThisPass = false;
    }
    for (let i = 0; i < G.pedestrians.length; i++) {
      G.pedestrians[i].s = i * 16;
    }
    for (let i = 0; i < G.trafficPool.length; i++) {
      // Полосу выбирает пул под текущий биом; жёсткий i % 4 оставлял
      // машины вне массива полос на горной дороге и на МКАД.
      G.resetTrafficVehicle(G.trafficPool[i], 38 + i * 24);
    }

    G.prepareRunEconomy();
    if (G.resetRepair) G.resetRepair();

    // Меню гаснет под вуалью, экспозиция и камера догоняют уже в заезде.
    G.runIntro = 1;
    const veil = $('run-veil');
    if (veil) {
      veil.style.transition = 'none';
      veil.style.opacity = '1';
      void veil.offsetWidth;
      veil.style.transition = '';
      veil.style.opacity = '0';
    }
    $('overlay').style.display = 'none';
    $('hud').hidden = false;
    $('controls').hidden = G.controlMode === 'tilt';
    if (G.startTiltSession) G.startTiltSession();
    if (G.syncControlUi) G.syncControlUi();
    G.syncVehicleAndCameraVisibility(false);

    const hint = $('hint');
    const bottom = $('bottom');
    hint.style.opacity = '1';
    bottom.style.opacity = '1';
    setTimeout(() => {
      if (!G.started) return;
      hint.style.opacity = '0';
      bottom.style.opacity = '0';
    }, 5500);
  }
  G.startGame = startGame;

  function crashGame() {
    if (G.ended) return;
    G.ended = true;
    G.started = false;
    G.runIntro = 0;
    G.currentScreen = 'crash';
    G.resetSlowMo();
    if (G.resetWeather) G.resetWeather();
    if (G.stopTilt) G.stopTilt();
    if (navigator.vibrate) navigator.vibrate(40);

    if (G.creditRunMileage) G.creditRunMileage();
    const earned = creditRun(G.score, G.bankedOrderRun);
    G.bankPoints += earned;
    G.bankedOrderRun = 0;
    G.saveGarage();
    if (G.persistBiome) G.persistBiome();

    $('hud').hidden = true;
    $('tp-hud').hidden = true;
    $('controls').hidden = true;
    $('jump-live').hidden = true;
    $('badge-beam').hidden = true;
    $('badge-oncoming').hidden = true;
    if (G.clearFeed) G.clearFeed();

    const overlay = $('overlay');
    overlay.style.display = 'flex';
    overlay.className = 'mode-crash';

    overlay.innerHTML = panel(`
        ${heading('АВАРИЯ', 'ЗАЕЗД ОКОНЧЕН · МОМЕНТ СТОЛКНОВЕНИЯ')}
        ${stats([
          { label: 'Пройденная дистанция', value: runDistance(G.distance) },
          { label: 'Перелетено машин', value: `${G.totalCarsJumpedRun} шт. (+${rubles(G.totalJumpBonusRun)})`, tone: 'signal' },
          { label: 'Заработано за заезд', value: `+${rubles(earned)}`, tone: 'gold' },
          { label: 'Баланс в банке', value: rubles(G.bankPoints) }
        ])}
        ${button({ id: 'crash-restart', variant: 'primary', icon: '▶', label: 'ИГРАТЬ СНОВА' })}
        ${button({ id: 'crash-menu', label: 'В ГЛАВНОЕ МЕНЮ' })}
    `, { tone: 'danger' });

    $('crash-restart').addEventListener('click', startGame);
    $('crash-menu').addEventListener('click', renderMainMenu);
  }
  G.crashGame = crashGame;
}
