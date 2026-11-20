import { button, callout, check, choiceGrid, currency, field, heading, iconButton, inline, logo, menuScreen, note, panel, slider, stats, swatch, swatchRow, tabBody, tabs } from '@bajajgo/design';
import { creditRun, rubles, runDistance, shortfall } from './engine/money.js';
import { resetRun } from './engine/rules.js';
import { G } from './state.js';
import { bikePaint } from './engine/vehicle.js';

export function initUi() {
  const $ = G.$;

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

  function renderMainMenu() {
    // Пробег заезда дописывается в счётчик выбранного мотоцикла и на выходе
    // в меню, и в аварии: оба пути ведут сюда.
    if (G.creditRunMileage) G.creditRunMileage();
    if (G.closeShopPreview) G.closeShopPreview();
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
        button({
          id: 'mm-settings',
          icon: '⚙',
          label: 'Настройки',
          trail: G.graphicsLabel,
          trailOn: G.graphics.preset === 'sharp'
        })
      ].join(''),
      balance: currency({ id: 'bank', label: 'Баланс', value: rubles(G.bankPoints) }),
      footer: 'bajaj GO · Voxel Traffic & Jump Simulator · Game by a fan',
      tools: [
        iconButton({ id: 'mm-cam-settings', icon: '🎥', title: 'Настройки камеры от первого лица (FOV, высота)' }),
        iconButton({ id: 'mm-fs-btn', icon: '⛶', title: 'Полный экран' })
      ].join('')
    });

    G.syncVehicleAndCameraVisibility(true);

    $('mm-start').addEventListener('click', startGame);
    $('mm-shop').addEventListener('click', renderShop);
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
      r.lateralOffset = G.lanesAtS(r.s).offsets[laneIdx];
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
