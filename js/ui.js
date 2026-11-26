import * as THREE from 'three';
import { button, callout, check, choiceGrid, currency, field, heading, icon, iconButton, inline, logo, menuScreen, note, panel, slider, stats, swatch, swatchRow, tabs, tag } from '@bajajgo/design';
import { creditRun, rubles, runDistance, shortfall } from './engine/money.js';
import { DEFAULT_AUDIO_SETTINGS, isNightish } from './engine/audio.ts';
import { initialGearboxState } from './engine/gearbox.ts';
import { resetRun } from './engine/rules.js';
import { G } from './state.js';
import { bikePaint } from './engine/vehicle.js';
import { OUTFIT_COLORS, OUTFIT_DEFAULT, applyOutfit, clampOutfitToAchievements, loadOutfit, normalizeOutfit, resetOutfit, saveOutfit } from './outfit.js';
import { buildDetailedRider } from './outfitRig.js';
import { ACHIEVEMENT_DEFS, ACHIEVEMENT_THRESHOLDS } from './achievements.js';

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

  // --- Достижения: всплывающее уведомление ---
  const achQueue = [];
  let achShowing = false;
  let achEl = null;

  function ensureAchEl() {
    if (achEl) return achEl;
    achEl = document.createElement('div');
    achEl.className = 'ach-toast';
    achEl.innerHTML = `
      <div class="ach-toast-rays" aria-hidden="true"></div>
      <div class="ach-toast-flags" aria-hidden="true">
        <svg class="ach-flag ach-flag-l" viewBox="0 0 64 96"><defs><pattern id="achChkL" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#fff"/><rect width="8" height="8" fill="#111"/><rect x="8" y="8" width="8" height="8" fill="#111"/></pattern></defs><rect x="6" y="8" width="6" height="84" fill="#d0d4dc"/><path d="M12 10 L58 22 L12 38 Z" fill="url(#achChkL)" stroke="#e8ecf2" stroke-width="2"/></svg>
        <svg class="ach-flag ach-flag-r" viewBox="0 0 64 96"><defs><pattern id="achChkR" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#fff"/><rect width="8" height="8" fill="#111"/><rect x="8" y="8" width="8" height="8" fill="#111"/></pattern></defs><rect x="52" y="8" width="6" height="84" fill="#d0d4dc"/><path d="M52 10 L6 22 L52 38 Z" fill="url(#achChkR)" stroke="#e8ecf2" stroke-width="2"/></svg>
      </div>
      <div class="ach-toast-cup" aria-hidden="true">🏆</div>
      <div class="ach-toast-title"></div>
    `;
    document.body.appendChild(achEl);
    return achEl;
  }

  function playAchievementSound() {
    if (!G.audio) return;
    // Короткая фанфара на «трубах» через шину ui, чтобы слушалась громкость интерфейса.
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const dur = i === notes.length - 1 ? 0.45 : 0.12;
      G.audio.playTone({
        freq, dur, type: 'sawtooth', level: 0.12, delay: i * 0.08,
        bus: 'ui', filterFrom: 1800, filterTo: 900,
      });
      G.audio.playTone({ freq: freq * 1.002, dur, type: 'square', level: 0.03, delay: i * 0.08, bus: 'ui' });
    });
  }

  function showNextAchievement() {
    if (achShowing || achQueue.length === 0) return;
    achShowing = true;
    const item = achQueue.shift();
    const el = ensureAchEl();
    el.querySelector('.ach-toast-title').textContent = item.title || 'Достижение';
    el.classList.remove('is-in', 'is-out');
    // перезапуск анимации
    void el.offsetWidth; // eslint-disable-line no-unused-expressions
    el.classList.add('is-in');
    playAchievementSound();
    clearTimeout(el._hideTimer);
    clearTimeout(el._doneTimer);
    el._hideTimer = setTimeout(() => {
      el.classList.remove('is-in');
      el.classList.add('is-out');
    }, 2500);
    el._doneTimer = setTimeout(() => {
      el.classList.remove('is-out');
      achShowing = false;
      showNextAchievement();
    }, 3100);
  }

  G.onAchievementUnlock = (item) => {
    if (!item) return;
    achQueue.push(item);
    showNextAchievement();
  };

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
    const overlay = $('overlay');
    const tabGroup = overlay.querySelector('sl-tab-group.ds-tabs');
    const stay = G.currentScreen === 'settings'
      && overlay.classList.contains('mode-shop')
      && !!tabGroup
      && !!overlay.querySelector('#settings-back');

    G.currentScreen = 'settings';
    settingsReturn = () => {
      if (from === 'pause') G.renderPauseMenu();
      else renderMainMenu();
    };

    if (!stay) {
      overlay.style.display = 'flex';
      overlay.className = 'mode-shop';
    }

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
      ['sound', 'Звук'],
      ['debug', 'Отладка']
    ];

    function settingsTabBody(tab) {
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
        ${inline('Отражения', button({
          id: 'fx-toggle-reflections',
          variant: 'compact',
          label: fxState(g.reflections),
          pressed: !!g.reflections
        }))}
        ${inline('Motion Blur', button({ id: 'fx-open-mb', variant: 'compact', label: fxState(v.motionBlur) }))}
        ${inline('Лучи от солнца', button({ id: 'fx-open-gr', variant: 'compact', label: fxState(v.godRays) }))}
        ${note('Эффекты применяются мгновенно и сохраняются в браузере.')}
      `;
    } else if (tab === 'camera') {
      body = `
        ${inline('Вид камеры', button({ id: 'settings-cam', variant: 'compact', label: G.cameraMode === 'cockpit' ? 'Кокпит' : '3-е лицо' }))}
        ${inline('Кокпит: FOV / высота', button({ id: 'settings-cam-fov', variant: 'compact', icon: 'sliders', label: 'Настроить' }))}
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

      const keyPreview = (names) => `<div class="ds-choice-keys">${names.map((name) => `<span>${icon(name)}</span>`).join('')}</div>`;
      body = `
        ${choiceGrid('Способ управления', [
          {
            on: mode === 'stick',
            data: { 'ctrl-mode': 'stick' },
            preview: `<span class="ds-choice-hero">${icon('joystick')}</span>`,
            label: 'Джойстик',
            detail: 'Стик справа вместо кнопок: влево и вправо — руль, вверх — газ, вниз — тормоз. Клавиатура работает вместе с ним.'
          },
          {
            on: mode === 'buttons',
            data: { 'ctrl-mode': 'buttons' },
            preview: keyPreview(['arrow-left', 'arrow-down', 'arrow-up', 'arrow-right']),
            label: 'Кнопки',
            detail: 'Экранные кнопки газа, тормоза и поворота. Работает на любом устройстве.'
          },
          {
            on: mode === 'tilt',
            disabled: !tiltAvailable,
            data: { 'ctrl-mode': 'tilt' },
            preview: `<div class="ds-choice-phone"><span class="ds-choice-signal">${icon('lightbulb')}</span><span class="ds-choice-steer">${icon('arrow-left')}${icon('arrow-right')}</span><span class="ds-choice-pedals">${icon('arrow-up')}<br>${icon('arrow-down')}</span><span class="ds-choice-mark"></span></div>`,
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
          ${button({ id: 'tilt-calibrate', variant: 'primary', icon: 'bullseye', label: 'КАЛИБРОВАТЬ (ДЕРЖИТЕ РОВНО)' })}
          ${note(calibrationText)}
          ${note('Держите устройство перед собой, как при съёмке. Наклон влево/вправо — руление. Ось выбирается автоматически: в портрете — γ, в ландшафте — β; при повороте телефона калибровка обновляется сама.')}
        ` : ''}
      `;
    } else if (tab === 'sound') {
      const audioSettings = G.audio ? G.audio.settings : { ...DEFAULT_AUDIO_SETTINGS };
      const volumeSlider = (bus, label, hint, accent) => `
        <div class="ds-slider audio-slider audio-slider--${accent}">
          <div class="ds-slider-head">
            <span>${label}</span>
            <b><span id="vol-${bus}-val">${audioSettings[bus]}</span>%</b>
          </div>
          <input id="vol-${bus}" class="audio-range" type="range" min="0" max="100" step="1" value="${audioSettings[bus]}">
          <p class="ds-slider-hint">${hint}</p>
        </div>
      `;
      body = `
        ${inline('Весь звук', button({
          id: 'sound-mute',
          variant: 'compact',
          label: audioSettings.soundOn ? 'Включён' : 'Выключен',
          pressed: audioSettings.soundOn
        }))}
        ${volumeSlider('engine', 'Громкость мотора мотоцикла', 'Двигатель выбранного байка.', 'engine')}
        ${volumeSlider('ambient', 'Громкость окружения (город + ветер)', 'Город днём и ночью, ветер на скорости.', 'ambient')}
        ${volumeSlider('sfx', 'Громкость эффектов (SFX)', 'Прыжки, аварии, заказы, покупки.', 'sfx')}
        ${volumeSlider('weather', 'Громкость погоды (дождь, гром)', 'Дождь звучит только в активном заезде.', 'weather')}
        ${volumeSlider('ui', 'Громкость интерфейса (клики)', 'Кнопки меню, магазина и паузы.', 'ui')}
        ${volumeSlider('master', 'Общая громкость', 'Обнуляет весь звук, не сбрасывая ползунки.', 'master')}
        ${button({ id: 'sound-reset', variant: 'compact', icon: 'arrow-counterclockwise', label: 'СБРОС К ЗНАЧЕНИЯМ ПО УМОЛЧАНИЮ' })}
        ${note('Значения сохраняются в браузере и применяются сразу. Если папка sounds/ пуста, игра работает тихо и продолжается без ошибок.')}
      `;
    } else if (tab === 'debug') {
      body = `
        ${inline('Редактор локаций', button({ id: 'debug-open-loc-editor', variant: 'primary', icon: 'sliders', label: 'Открыть редактор' }))}
        ${note('Удобная работа с декорациями: выделение рамкой, перемещение, дублирование, удаление и изменение размера мышью или числами. Можно править уже имеющиеся объекты карты — смещать, масштабировать, поворачивать и скрывать те, что мешают игре. Меню и HUD на время редактора скрываются и возвращаются при выходе.')}
        ${note('Изменения сохраняются в localStorage. Чтобы перенести их в сборку, экспортируйте JSON кнопкой в редакторе.')}
      `;
    }
    return body;
    }

    const settingsMarkup = () => panel(`
        ${heading('НАСТРОЙКИ', 'ГРАФИКА · ОСВЕЩЕНИЕ · КАМЕРА · УПРАВЛЕНИЕ · ЗВУК · ОТЛАДКА')}
        ${tabs(tabItems, tab, {
          graphics: settingsTabBody('graphics'),
          lighting: settingsTabBody('lighting'),
          camera: settingsTabBody('camera'),
          controls: settingsTabBody('controls'),
          sound: settingsTabBody('sound'),
          debug: settingsTabBody('debug')
        })}
        ${button({ id: 'settings-back', icon: 'arrow-left', label: 'НАЗАД' })}
    `, { size: 'narrow' });

    let root = overlay;
    if (!stay) {
      overlay.innerHTML = settingsMarkup();
      $('settings-back').addEventListener('click', () => G.leaveSettings());
    } else {
      const card = overlay.querySelector('sl-card.ds-panel');
      const scroll = card ? card.scrollTop : 0;
      const host = overlay.querySelector(`sl-tab-panel[name="${tab}"] .ds-tab-body`);
      if (host) host.innerHTML = settingsTabBody(tab);
      else overlay.innerHTML = settingsMarkup();
      root = host || overlay;
      if (host && tabGroup && typeof tabGroup.show === 'function') tabGroup.show(tab);
      if (card) card.scrollTop = scroll;
      if (!host) $('settings-back').addEventListener('click', () => G.leaveSettings());
    }

    const owned = (id) => {
      const el = document.getElementById(id);
      return el && root.contains(el) ? el : null;
    };

    root.querySelectorAll('[data-gfx]').forEach(btn => {
      if (!(btn instanceof HTMLElement)) return;
      btn.addEventListener('click', () => {
        G.chooseGraphics(btn.dataset.gfx, btn.dataset.value);
        renderSettings('graphics', from);
      });
    });

    const openMb = owned('fx-open-mb');
    if (openMb) {
      openMb.addEventListener('click', () => {
        fxOpenModal(() => renderMotionBlurSettings(() => renderSettings('lighting', from), from === 'pause'));
      });
    }
    const openGr = owned('fx-open-gr');
    if (openGr) {
      openGr.addEventListener('click', () => {
        fxOpenModal(() => renderGodRaysSettings(() => renderSettings('lighting', from), from === 'pause'));
      });
    }
    const toggleHdr = owned('fx-toggle-hdr');
    if (toggleHdr) {
      toggleHdr.addEventListener('click', () => {
        G.chooseGraphics('hdrPlus', g.hdrPlus ? 'false' : 'true');
        renderSettings('lighting', from);
      });
    }
    const toggleReflections = owned('fx-toggle-reflections');
    if (toggleReflections) {
      toggleReflections.addEventListener('click', () => {
        G.chooseGraphics('reflections', g.reflections ? 'false' : 'true');
        renderSettings('lighting', from);
      });
    }

    const sharpRange = /** @type {HTMLInputElement|null} */ (owned('gfx-sharp-range'));
    if (sharpRange) {
      const valEl = owned('gfx-sharp-val');
      sharpRange.addEventListener('sl-input', () => {
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
    const brightRange = /** @type {HTMLInputElement|null} */ (owned('gfx-bright-range'));
    if (brightRange) {
      const valEl = owned('gfx-bright-val');
      brightRange.addEventListener('sl-input', () => {
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
    const cam = owned('settings-cam');
    if (cam) {
      cam.addEventListener('click', () => {
        G.toggleCameraMode();
        renderSettings('camera', from);
      });
    }
    const camFov = owned('settings-cam-fov');
    if (camFov) {
      camFov.addEventListener('click', () => {
        G.renderCameraSettings(() => renderSettings('camera', from));
      });
    }

    root.querySelectorAll('[data-ctrl-mode]').forEach(btn => {
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
        const activeTab = overlay.querySelector('sl-tab[active]');
        if (G.currentScreen === 'settings' && activeTab instanceof HTMLElement && activeTab.dataset.tab === 'controls') {
          renderSettings('controls', from);
        }
      });
    });

    const soundMute = owned('sound-mute');
    if (soundMute) {
      soundMute.addEventListener('click', () => {
        if (G.audio) G.audio.toggleSound();
        else if (G.setSoundMuted) G.setSoundMuted(!G.soundMuted);
        renderSettings('sound', from);
      });
    }
    for (const bus of ['engine', 'ambient', 'sfx', 'weather', 'ui', 'master']) {
      const range = /** @type {HTMLInputElement|null} */ (owned(`vol-${bus}`));
      if (!range) continue;
      const valueEl = owned(`vol-${bus}-val`);
      range.addEventListener('input', () => {
        const value = G.clamp(Number(range.value), 0, 100);
        if (valueEl) valueEl.textContent = String(Math.round(value));
        if (G.audio) G.audio.setVolume(bus, value);
      });
      if (valueEl) {
        valueEl.addEventListener('dblclick', () => {
          range.value = String(DEFAULT_AUDIO_SETTINGS[bus] || 0);
          valueEl.textContent = range.value;
          if (G.audio) G.audio.setVolume(bus, Number(range.value));
        });
      }
    }
    const soundReset = owned('sound-reset');
    if (soundReset) {
      soundReset.addEventListener('click', () => {
        if (G.audio) G.audio.reset();
        renderSettings('sound', from);
      });
    }

    const openLocEditor = owned('debug-open-loc-editor');
    if (openLocEditor) {
      openLocEditor.addEventListener('click', () => {
        if (G.openLocationEditor) {
          if (G.leaveSettings) G.leaveSettings();
          else { const ov = $('overlay'); if (ov) ov.style.display = 'none'; }
          G.openLocationEditor({ from });
        } else alert('Редактор локаций не загружен.');
      });
    }

    const tiltRange = /** @type {HTMLInputElement} */ (owned('tilt-sens-range'));
    if (tiltRange) {
      const valueEl = document.getElementById('tilt-sens-val');
      tiltRange.addEventListener('sl-input', () => {
        const percent = G.clamp(Number(tiltRange.value), 50, 200);
        G.setTiltSensitivity(percent / 100);
        if (valueEl) valueEl.textContent = String(Math.round(percent));
      });
    }

    const tiltInvert = owned('tilt-invert');
    if (tiltInvert) {
      tiltInvert.addEventListener('click', () => {
        G.setTiltInvert(!G.tiltInvert);
        renderSettings('controls', from);
      });
    }

    const tiltCalibrate = owned('tilt-calibrate');
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
        ${heading('MOTION BLUR', 'КИНЕМАТОГРАФИЧНОЕ РАЗМЫТИЕ НА СКОРОСТИ', 'wind')}
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
        ${button({ id: 'mb-reset', icon: 'arrow-counterclockwise', label: 'СБРОСИТЬ' })}
        ${button({ id: 'mb-back', icon: 'arrow-left', label: 'НАЗАД' })}
        ${fromPause ? button({ id: 'mb-continue', variant: 'primary', icon: 'play-fill', label: 'ПРОДОЛЖИТЬ' }) : ''}
    `, { size: 'narrow' });

    const range = /** @type {HTMLInputElement} */ ($('mb-range'));
    const valueEl = $('mb-val');
    range.addEventListener('sl-input', () => {
      v.motionBlurIntensity = G.clamp(Number(range.value), 0, 100);
      valueEl.textContent = String(Math.round(v.motionBlurIntensity));
      saveVisual();
    });

    $('mb-toggle').addEventListener('click', () => {
      v.motionBlur = !v.motionBlur;
      saveVisual();
      renderMotionBlurSettings(backFn, fromPause);
    });

    const comfort = $('mb-comfort');
    comfort.addEventListener('sl-change', () => {
      v.motionBlurComfort = !!comfort.checked;
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
        ${heading('ЛУЧИ ОТ СОЛНЦА', 'GOD RAYS · СВЕТОВЫЕ ЛУЧИ СКВОЗЬ ОБЛАКА', 'sun')}
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
        ${button({ id: 'gr-reset', icon: 'arrow-counterclockwise', label: 'СБРОСИТЬ' })}
        ${button({ id: 'gr-back', icon: 'arrow-left', label: 'НАЗАД' })}
        ${fromPause ? button({ id: 'gr-continue', variant: 'primary', icon: 'play-fill', label: 'ПРОДОЛЖИТЬ' }) : ''}
    `, { size: 'narrow' });

    const range = /** @type {HTMLInputElement} */ ($('gr-range'));
    const valueEl = $('gr-val');
    range.addEventListener('sl-input', () => {
      v.godRaysIntensity = G.clamp(Number(range.value), 0, 100);
      valueEl.textContent = String(Math.round(v.godRaysIntensity));
      saveVisual();
    });

    const lenRange = /** @type {HTMLInputElement} */ ($('gr-len'));
    const lenValueEl = $('gr-len-val');
    lenRange.addEventListener('sl-input', () => {
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
    const rig = buildDetailedRider('stand');
    // В предпросмотре шлем смотрит в камеру
    rig.joints.helmet.rotation.y = Math.PI;
    return rig;
  }

  function startOutfitPreview(canvas) {
    disposeOutfitPreview();
    if (!canvas) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x1a2636, 1);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a2636);
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

    // Платформа, как в витрине магазина
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.78, 0.08, 48),
      new THREE.MeshStandardMaterial({ color: 0x2a3648, roughness: 0.72, metalness: 0.18 })
    );
    platform.position.y = -0.04;
    root.add(platform);
    const platformTop = new THREE.Mesh(
      new THREE.CircleGeometry(0.7, 48),
      new THREE.MeshStandardMaterial({ color: 0x3a4a62, roughness: 0.55, metalness: 0.12 })
    );
    platformTop.rotation.x = -Math.PI / 2;
    platformTop.position.y = 0.001;
    root.add(platformTop);

    const rider = buildStandingRider();
    const riderGroup = rider.group;
    const box = new THREE.Box3().setFromObject(riderGroup);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    // Центр по X/Z, ноги на платформу (y=0)
    riderGroup.position.x -= center.x;
    riderGroup.position.z -= center.z;
    riderGroup.position.y -= box.min.y;
    root.add(riderGroup);

    // Кадрируем по райдеру
    const maxDim = Math.max(size.x, size.y, 0.001);
    const fov = camera.fov * (Math.PI / 180);
    let dist = (maxDim / 2) / Math.tan(fov / 2);
    dist *= 1.55;
    camera.position.set(0, size.y * 0.52, dist);
    camera.near = 0.1;
    camera.far = Math.max(30, dist + 10);
    camera.lookAt(0, size.y * 0.48, 0);
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

    let lastT = performance.now();
    outfitPreview = state;
    const tick = (now = performance.now()) => {
      if (!outfitPreview || outfitPreview !== state) return;
      const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
      lastT = now;
      if (rider.update) rider.update(dt);
      if (!dragging) rotY += velY;
      velY *= dragging ? 0 : 0.985;
      if (!dragging && Math.abs(velY) < 0.0035) velY = 0.0035 * Math.sign(velY || 1);
      root.rotation.y = rotY;
      renderer.render(scene, camera);
      state.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  function renderOutfit() {
    disposeOutfitPreview();
    G.currentScreen = 'outfit';
    const overlay = $('overlay');
    overlay.style.display = 'flex';
    overlay.className = 'mode-outfit';
    const rawOutfit = normalizeOutfit(G.outfit || loadOutfit());
    const current = clampOutfitToAchievements(rawOutfit);
    if (current.helmet !== rawOutfit.helmet || current.jacket !== rawOutfit.jacket || current.pants !== rawOutfit.pants || current.boots !== rawOutfit.boots) {
      saveOutfit(current);
      applyOutfit(current);
    }
    const achStats = G.getPlayerStats ? G.getPlayerStats() : {};
    const achLevel = (id) => {
      const a = Array.isArray(achStats.achievements) ? achStats.achievements.find(x => x.id === id) : null;
      return Math.max(0, Math.min(5, Number(a?.level) || 0));
    };
    const cats = [
      { id: 'helmet', label: 'Шлем',   ach: 'mountaineer',  achName: 'Горец' },
      { id: 'jacket', label: 'Куртка', ach: 'forester',     achName: 'Лесник' },
      { id: 'pants',  label: 'Штаны',  ach: 'petersburger', achName: 'Питербуржец' },
      { id: 'boots',  label: 'Ботинки',ach: 'mkadWarrior',  achName: 'МКАД-ый воин' },
    ];

    overlay.innerHTML = `
      <sl-card class="outfit-shell">
        <header class="outfit-head">
          <div>
            <p class="ds-kicker">КАСТОМИЗАЦИЯ</p>
            <h2 class="ds-title">Экипировка</h2>
          </div>
          <div class="outfit-head-actions">
            ${button({ id: 'outfit-reset', variant: 'compact', label: 'Сбросить' })}
            ${iconButton({ id: 'outfit-close', icon: 'x-lg', title: 'Закрыть' })}
          </div>
        </header>
        <div class="outfit-body">
          <div class="outfit-left">
            ${cats.map(cat => {
              const lvl = achLevel(cat.ach);
              return `
              <fieldset class="outfit-cat" data-cat="${cat.id}">
                <legend class="outfit-cat-title">${cat.label} <span class="outfit-cat-ach">${cat.achName}: ${achievementRoman(lvl)}</span></legend>
                <div class="outfit-swatches">
                  ${OUTFIT_COLORS.map((c, i) => {
                    const unlocked = i === 0 || lvl >= i;
                    const need = i === 0 ? '' : ` (ур. ${i} «${cat.achName}»)`;
                    const title = unlocked ? c.name : `${c.name}${need}`;
                    const on = current[cat.id] === c.hex;
                    return `
                    <button class="outfit-swatch ${on ? 'is-on' : ''} ${unlocked ? '' : 'is-locked'}"
                      data-part="${cat.id}" data-color="${c.hex}" data-locked="${unlocked ? '0' : '1'}"
                      title="${title}" aria-label="${title}" ${unlocked ? '' : 'disabled'}>
                      <span style="background:${c.hex}"></span>
                      ${unlocked ? '' : '<i class="outfit-lock" aria-hidden="true">🔒</i>'}
                    </button>`;
                  }).join('')}
                </div>
              </fieldset>`;
            }).join('')}
            <div class="outfit-hint ds-note">Цвета открываются уровнями достижений: Горец — шлем, Лесник — куртка, Питербуржец — штаны, МКАД-ый воин — ботинки.</div>
            ${button({ id: 'outfit-back', icon: 'arrow-left', label: 'Назад в меню' })}
          </div>
          <div class="outfit-right">
            <div class="outfit-preview-wrap">
              <canvas id="outfit-preview-canvas" class="outfit-preview-canvas"></canvas>
            </div>
          </div>
        </div>
      </sl-card>`;

    overlay.querySelectorAll('.outfit-swatch').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.getAttribute('data-locked') === '1') return;
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

  function achievementRoman(level) {
    return ['—', 'I', 'II', 'III', 'IV', 'V'][Math.max(0, Math.min(5, level))] || '—';
  }

  function achievementValueText(def, value) {
    const v = Number(value) || 0;
    if (def.unit === 'm') return runDistance(v / 1000);
    if (def.unit === 'kmh') return `${Math.round(v)} км/ч`;
    return `${Math.floor(v)}`;
  }

  function renderAchievements() {
    G.currentScreen = 'achievements';
    const overlay = $('overlay');
    overlay.style.display = 'flex';
    overlay.className = 'mode-achievements';

    const stats = G.getPlayerStats ? G.getPlayerStats() : {};
    const progress = Array.isArray(stats.achievements) ? stats.achievements : [];
    const byId = new Map(progress.map((p) => [p.id, p]));

    const tiles = ACHIEVEMENT_DEFS.map((def) => {
      const p = byId.get(def.id) || { value: 0, level: 0, unlocked: false };
      const thresholds = ACHIEVEMENT_THRESHOLDS[def.id] || [];
      const level = def.type === 'boolean' ? (p.unlocked ? 1 : 0) : Math.max(0, Math.min(5, p.level || 0));
      const unlocked = !!p.unlocked || level > 0;
      const stateClass = def.type === 'boolean'
        ? (p.unlocked ? 'is-done' : 'is-locked')
        : (level >= 5 ? 'is-done' : (level > 0 ? 'is-progress' : 'is-locked'));

      let progressHtml = '';
      if (def.type === 'boolean') {
        progressHtml = `<div class="ach-state">${p.unlocked ? 'Открыто' : 'Не открыто'}</div>`;
      } else {
        const cur = Number(p.value) || 0;
        const next = level < 5 ? thresholds[level] : thresholds[4];
        const prev = level > 0 ? thresholds[level - 1] : 0;
        const pct = level >= 5 ? 100 : Math.max(0, Math.min(100, ((cur - prev) / Math.max(1, next - prev)) * 100));
        const levelText = achievementRoman(level);
        const valueText = level >= 5
          ? `${achievementValueText(def, cur)} · макс.`
          : `${achievementValueText(def, cur)} / ${achievementValueText(def, next)}`;
        progressHtml = `
          <div class="ach-level">Уровень ${levelText}</div>
          <div class="ach-bar"><span style="width:${pct.toFixed(1)}%"></span></div>
          <div class="ach-value">${valueText}</div>`;
      }

      return `
        <article class="ach-tile ${stateClass}">
          <div class="ach-icon" aria-hidden="true">${def.icon}</div>
          <div class="ach-body">
            <h3 class="ach-title">${def.title}</h3>
            <p class="ach-desc">${def.description}</p>
            ${progressHtml}
          </div>
        </article>`;
    }).join('');

    overlay.innerHTML = `
      <sl-card class="ach-shell">
        <header class="ach-head">
          <div>
            <p class="ds-kicker">ПРОГРЕСС</p>
            <h2 class="ds-title">Достижения</h2>
          </div>
          ${iconButton({ id: 'ach-close', icon: 'x-lg', title: 'Закрыть' })}
        </header>
        <div class="ach-grid">${tiles}</div>
        <footer class="ach-foot">${button({ id: 'ach-back', icon: 'arrow-left', label: 'Назад в меню' })}</footer>
      </sl-card>`;

    $('ach-close').addEventListener('click', renderMainMenu);
    $('ach-back').addEventListener('click', renderMainMenu);
  }

  function renderMainMenu() {
    // Пробег заезда дописывается в счётчик выбранного мотоцикла и на выходе
    // в меню, и в аварии: оба пути ведут сюда.
    if (G.creditRunMileage) G.creditRunMileage();
    if (G.creditRunBiomeDistance) G.creditRunBiomeDistance();
    if (G.savePlayerStats) G.savePlayerStats(true);
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
    if (G.audio) G.audio.stopRun();

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
        button({ id: 'mm-start', variant: 'primary', icon: 'play-fill', label: 'Начать заезд' }),
        button({ id: 'mm-shop', icon: 'cart3', label: 'Магазин мотоциклов', trail: `${G.bikeCatalog.length} ед.` }),
        button({ id: 'mm-outfit', icon: 'backpack', label: 'Экипировка' }),
        button({ id: 'mm-achievements', icon: 'trophy', label: 'Достижения' }),
        button({
          id: 'mm-settings',
          icon: 'gear',
          label: 'Настройки',
          trail: G.graphicsLabel,
          trailOn: G.graphics.preset === 'sharp'
        })
      ].join(''),
      balance: currency({ id: 'bank', label: 'Баланс', value: rubles(G.bankPoints) }),
      footer: `bajaj GO · Voxel Traffic & Jump Simulator · Game by a fan · ${builtAt}`,
      tools: [
        iconButton({ id: 'mm-cam-settings', icon: 'camera-video', title: 'Настройки камеры от первого лица (FOV, высота)' }),
        iconButton({ id: 'mm-fs-btn', icon: 'arrows-fullscreen', title: 'Полный экран' })
      ].join('')
    });

    G.syncVehicleAndCameraVisibility(true);

    $('mm-start').addEventListener('click', startGame);
    $('mm-shop').addEventListener('click', renderShop);
    $('mm-outfit').addEventListener('click', renderOutfit);
    $('mm-achievements').addEventListener('click', renderAchievements);
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
    const pStats = G.getPlayerStats ? G.getPlayerStats() : {};
    const courierLevel = Array.isArray(pStats.achievements)
      ? (pStats.achievements.find(a => a.id === 'courier')?.level || 0)
      : 0;
    function bikeLockReason(bike) {
      if (!bike) return '';
      if (bike.id === 'dominar1000' && (Number(pStats.maxSpeedKmh) || 0) < 175) {
        return 'Достигните 175 км/ч для разблокировки';
      }
      if (bike.id === 'qute_yura' && courierLevel < 4) {
        return 'Достигните 4 уровня «Успешный курьер»';
      }
      return '';
    }
    const previewLockReason = bikeLockReason(previewBike);

    /* ---------- левая колонка: компактные строки ---------- */

    const rows = shopBikes.map(b => {
      const owned = G.ownedBikes.includes(b.id);
      const selected = G.selectedBikeId === b.id;
      const previewing = b.id === previewBike.id;
      const missing = shortfall(b.price, G.bankPoints);
      const lockReason = bikeLockReason(b);

      let side = '';
      if (owned) side = tag('В гараже', 'good');
      else if (lockReason) side = tag('Закрыт', 'warn');
      else if (b.price === 0) side = tag('Бесплатно');
      else if (missing <= 0) side = tag(rubles(b.price), 'warm');
      else side = tag(`не хватает ${rubles(missing)}`, 'warn');
      const mark = selected ? tag('Выбран', 'good') : '';
      const face = previewing ? 'variant="primary"' : 'variant="neutral" outline';

      return `<li><sl-button ${face} class="shop-row${lockReason ? ' is-locked-bike' : ''}" data-preview="${b.id}"${previewing ? ' aria-current="true"' : ''}>
        <span class="shop-row-main"><b>${b.name}</b><small>${b.typeLabel}</small></span>
        <span slot="suffix" class="shop-row-side">${side}${mark}</span>
      </sl-button></li>`;
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
      actionBtn = button({ variant: 'primary', icon: 'check-lg', label: 'ВЫБРАН', disabled: true, data: { state: 'selected' } });
      statusLine = `Выбран для заезда · тюнинг ${previewEff.installedCount}/${G.tuningCatalog.length}`;
    } else if (previewOwned) {
      actionBtn = button({ variant: 'primary', label: 'ВЫБРАТЬ', data: { state: 'select', select: previewBike.id } });
      statusLine = `В гараже · тюнинг ${previewEff.installedCount}/${G.tuningCatalog.length}`;
    } else if (previewLockReason) {
      actionBtn = button({ variant: 'primary', label: 'НЕДОСТУПЕН', disabled: true, data: { state: 'locked' } });
      missingLine = `<div class="shop-missing">${previewLockReason}</div>`;
      statusLine = previewLockReason;
    } else if (previewBike.price === 0) {
      actionBtn = button({ variant: 'primary', label: 'ВЫБРАТЬ', data: { state: 'select', buy: previewBike.id } });
      statusLine = 'Стартовый мотоцикл · бесплатно';
    } else if (previewMissing <= 0) {
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
          <h3 class="shop-col-title">Список мотоциклов</h3>
          <ul class="shop-list">${rows}</ul>
        </div>
        <div class="shop-side">
          <div class="shop-preview-wrap">
            <div id="shop-preview" class="shop-preview" role="img" aria-label="3D-модель ${previewBike.name}"></div>
            <sl-badge class="shop-preview-tag" variant="neutral">Просмотр</sl-badge>
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
      <div class="shop-foot">${button({ id: 'shop-back', icon: 'arrow-left', label: 'НАЗАД В ГЛАВНОЕ МЕНЮ' })}</div>
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
        const lock = bikeLockReason(bike);
        if (lock) return;
        G.bankPoints -= bike.price;
        G.ownedBikes.push(bike.id);
        G.selectedBikeId = bike.id;
        G.shopPreviewId = bike.id;
        if (G.audio) G.audio.playSfx('purchase');
        G.saveGarage();
        if (G.trackBikeBought) G.trackBikeBought();
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
    G.gearbox = initialGearboxState();
    if (G.audio) G.audio.startRun(G.selectedBikeId, isNightish(G.todCycleTime));
    G.resetSlowMo();
    if (G.resetWeather) G.resetWeather();
    // Биом продолжается с сохранённого пробега: конфиг полос и профиль
    // дороги пересобираются до старта, чтобы полоса старта и трафик попали
    // на полосы текущего биома (у горного их две, у МКАД — восемь).
    if (G.resetBiomeRun) G.resetBiomeRun();
    // Кусок, не дописанный до аварии/выхода, зачисляем до обнуления заезда.
    if (G.creditRunMileage) G.creditRunMileage();
    if (G.resetRunMileage) G.resetRunMileage();
    if (G.creditRunBiomeDistance) G.creditRunBiomeDistance();
    if (G.resetRunPlayerStats) G.resetRunPlayerStats();
    if (G.resetDriftSmoke) G.resetDriftSmoke();
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
    G.gearbox = initialGearboxState();
    G.runIntro = 0;
    G.currentScreen = 'crash';
    if (G.audio) {
      G.audio.playSfx('crash');
      G.audio.stopRun();
    }
    G.resetSlowMo();
    if (G.resetWeather) G.resetWeather();
    if (G.stopTilt) G.stopTilt();
    if (navigator.vibrate) navigator.vibrate(40);

    if (G.creditRunMileage) G.creditRunMileage();
    if (G.creditRunBiomeDistance) G.creditRunBiomeDistance();
    if (G.savePlayerStats) G.savePlayerStats(true);
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
        ${heading('АВАРИЯ', 'ЗАЕЗД ОКОНЧЕН · МОМЕНТ СТОЛКНОВЕНИЯ', 'exclamation-triangle-fill')}
        ${stats([
          { label: 'Пройденная дистанция', value: runDistance(G.distance) },
          { label: 'Перелетено машин', value: `${G.totalCarsJumpedRun} шт. (+${rubles(G.totalJumpBonusRun)})`, tone: 'signal' },
          { label: 'Заработано за заезд', value: `+${rubles(earned)}`, tone: 'gold' },
          { label: 'Баланс в банке', value: rubles(G.bankPoints) }
        ])}
        ${button({ id: 'crash-restart', variant: 'primary', icon: 'play-fill', label: 'ИГРАТЬ СНОВА' })}
        ${button({ id: 'crash-menu', label: 'В ГЛАВНОЕ МЕНЮ' })}
    `, { tone: 'danger' });

    $('crash-restart').addEventListener('click', startGame);
    $('crash-menu').addEventListener('click', renderMainMenu);
  }
  G.crashGame = crashGame;
}
