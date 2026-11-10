import { balance, button, callout, card, currency, field, heading, iconButton, inline, logo, menuScreen, note, panel, rows, stats, swatch, swatchRow, tag } from '@bajajgo/design';
import { creditRun, grouped, rubles, runDistance } from './engine/money.js';
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
      if (from === 'pause') G.renderPauseMenu(true);
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

    const tabs = [
      ['graphics', 'Графика'],
      ['lighting', 'Освещение'],
      ['camera', 'Вид камеры'],
      ['sound', 'Звук']
    ];
    const tabsHtml = `<div class="ds-tabs">${tabs.map(([key, label]) => (
      `<button type="button" class="ds-tab${tab === key ? ' ds-tab-on' : ''}" data-tab="${key}">${label}</button>`
    )).join('')}</div>`;

    let body = '';
    if (tab === 'graphics') {
      body = `
        ${g.preset === 'custom' ? note('Свой набор. Экспозиция 1.18 включается только режимом «Чётко».') : ''}
        ${field('Режим', option('preset', 'fast', 'Быстро') + option('preset', 'balanced', 'Ровно') + option('preset', 'sharp', 'Чётко'))}
        ${field('Тени', option('shadows', 'off', 'Нет') + option('shadows', 'low', 'Рядом') + option('shadows', 'high', 'Чётче'))}
        ${field('Масштаб кадра', option('scale', 0.75, '0.75') + option('scale', 1, '1') + option('scale', 1.25, '1.25'))}
        ${field('Фонари', option('lamps', 0, '0') + option('lamps', 2, '2') + option('lamps', 4, '4'))}
        ${note('Отражения перенесены во вкладку «Освещение».')}
      `;
    } else if (tab === 'lighting') {
      body = `
        ${field('Отражения', option('reflections', false, 'Тише') + option('reflections', true, 'Есть'))}
        ${inline('💨 Motion Blur', button({ id: 'fx-open-mb', variant: 'compact', label: fxState(v.motionBlur) }))}
        ${inline('☀️ Лучи от солнца', button({ id: 'fx-open-gr', variant: 'compact', label: fxState(v.godRays) }))}
        ${note('Оба эффекта применяются мгновенно и сохраняются в браузере.')}
      `;
    } else if (tab === 'camera') {
      body = `
        ${inline('Вид камеры', button({ id: 'settings-cam', variant: 'compact', label: G.cameraMode === 'cockpit' ? 'Кокпит' : '3-е лицо' }))}
        ${inline('Кокпит: FOV / высота', button({ id: 'settings-cam-fov', variant: 'compact', icon: '🎛', label: 'Настроить' }))}
        ${note('Вид от третьего лица фиксированный. Профиль камеры хранится отдельно для каждого мотоцикла.')}
      `;
    } else {
      body = `
        ${note('Раздел «Звук» пока пуст и появится позже.')}
        ${note('Сейчас доступны графика, качество освещения и вид камеры.')}
      `;
    }

    overlay.innerHTML = panel(`
        ${heading('НАСТРОЙКИ', 'ГРАФИКА · ОСВЕЩЕНИЕ · КАМЕРА · ЗВУК')}
        ${tabsHtml}
        <div class="ds-tab-body">${body}</div>
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
        <div class="cam-slider-block">
          <div class="cam-slider-head">
            <span>ИНТЕНСИВНОСТЬ</span>
            <b><span id="mb-val">${Math.round(v.motionBlurIntensity)}</span>%</b>
          </div>
          <input type="range" id="mb-range" min="0" max="100" step="1" value="${Math.round(v.motionBlurIntensity)}">
          <div class="cam-slider-hint">Проявляется от ~35% максимальной скорости (≈80 км/ч) и плавно усиливается.</div>
        </div>
        <label class="fx-check">
          <input type="checkbox" id="mb-comfort"${v.motionBlurComfort ? ' checked' : ''}>
          <span>Уменьшить укачивание</span>
        </label>
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
        <div class="cam-slider-block">
          <div class="cam-slider-head">
            <span>ИНТЕНСИВНОСТЬ</span>
            <b><span id="gr-val">${Math.round(v.godRaysIntensity)}</span>%</b>
          </div>
          <input type="range" id="gr-range" min="0" max="100" step="1" value="${Math.round(v.godRaysIntensity)}">
        </div>
        <div class="cam-slider-block">
          <div class="cam-slider-head">
            <span>ДЛИНА ЛУЧЕЙ</span>
            <b><span id="gr-len-val">${Math.round(v.godRaysLength)}</span>%</b>
          </div>
          <input type="range" id="gr-len" min="0" max="100" step="1" value="${Math.round(v.godRaysLength)}">
        </div>
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
    G.currentScreen = 'main';
    G.started = false;
    G.ended = false;
    $('hud').hidden = true;
    $('tp-hud').hidden = true;
    $('controls').hidden = true;
    $('jump-live').hidden = true;
    $('badge-beam').hidden = true;
    $('badge-oncoming').hidden = true;
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
        iconButton({ id: 'mm-cam-settings', icon: '⚙', title: 'Настройки камеры от первого лица (FOV, высота)' }),
        iconButton({ id: 'mm-cam-btn', icon: '🎥', title: `Камера: ${G.cameraMode === 'cockpit' ? 'кокпит' : '3-е лицо'}` }),
        iconButton({ id: 'mm-fs-btn', icon: '⛶', title: 'Полный экран' })
      ].join('')
    });

    G.syncVehicleAndCameraVisibility(true);

    $('mm-start').addEventListener('click', startGame);
    $('mm-shop').addEventListener('click', renderShop);
    $('mm-settings').addEventListener('click', () => renderSettings('graphics', 'menu'));
    $('mm-cam-btn').addEventListener('click', () => {
      G.toggleCameraMode();
      renderMainMenu();
    });
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

    const cards = G.bikeCatalog.map(b => {
      const owned = G.ownedBikes.includes(b.id);
      const selected = G.selectedBikeId === b.id;
      const activeColor = bikePaint(b, G.customColors);
      const eff = G.getBikeEffectiveStats(b.id);
      let btn = '';
      if (selected) {
        btn = button({ variant: 'primary', label: '✓ ВЫБРАН', disabled: true });
      } else if (owned) {
        btn = button({ variant: 'primary', label: 'ВЫБРАТЬ', data: { select: b.id } });
      } else {
        const canBuy = G.bankPoints >= b.price;
        const price = grouped(b.price);
        btn = button({
          variant: 'primary',
          label: canBuy ? `КУПИТЬ ЗА ${price} ₽` : `НУЖНО ${price} ₽`,
          disabled: !canBuy,
          data: { buy: b.id }
        });
      }

      let paint = '';
      if (b.swatches && b.swatches.length) {
        paint = swatchRow('Окраска', b.swatches.map(s => swatch({
          color: '#' + s.hex.toString(16).padStart(6, '0'),
          title: s.name,
          on: activeColor === s.hex,
          data: { 'swatch-bike': b.id, 'swatch-hex': s.hex }
        })).join(''));
      }

      const speedBadgeText = eff.speedDelta !== 0
        ? `${b.maxSpeed} км/ч (с тюнингом ${eff.maxSpeed} км/ч)`
        : `${b.maxSpeed} км/ч`;
      const hudBadgeText = b.hudStyle === 'round' ? 'Круглая приборка' : 'Цифровая приборка';
      const hudBadgeTone = b.hudStyle === 'round' ? 'warm' : 'plain';
      const priceLine = b.price === 0
        ? (owned ? 'Стартовый мотоцикл · Бесплатно (уже в гараже)' : 'Стартовый мотоцикл · Бесплатно')
        : `Цена: ${rubles(b.price)}`;

      return card({
        on: selected,
        title: b.name,
        meta: tag(b.typeLabel, b.vType === 'qute' ? 'warm' : 'plain') + tag(speedBadgeText, 'warm') + tag(hudBadgeText, hudBadgeTone),
        detail: `${priceLine} · Тюнинг: ${eff.installedCount}/${G.tuningCatalog.length}`,
        extra: paint,
        footer: btn
      });
    }).join('');

    overlay.innerHTML = panel(`
        ${logo({ left: 'ГАРАЖ', right: 'GO', compact: true })}
        ${heading('МАГАЗИН', 'МОТОЦИКЛЫ И КВАДРИЦИКЛЫ BAJAJ')}
        ${balance('Накоплено', rubles(G.bankPoints))}
        ${rows(cards)}
        ${button({ id: 'shop-back', label: '← НАЗАД В ГЛАВНОЕ МЕНЮ' })}
    `);

    overlay.querySelectorAll('[data-buy]').forEach(btn => {
      if (!(btn instanceof HTMLElement)) return;
      btn.addEventListener('click', () => {
        const bike = G.bikeCatalog.find(x => x.id === btn.dataset.buy);
        if (!bike || G.ownedBikes.includes(bike.id) || G.bankPoints < bike.price) return;
        G.bankPoints -= bike.price;
        G.ownedBikes.push(bike.id);
        G.selectedBikeId = bike.id;
        G.saveGarage();
        G.syncVehicleAndCameraVisibility(true);
        renderShop();
      });
    });
    overlay.querySelectorAll('[data-select]').forEach(btn => {
      if (!(btn instanceof HTMLElement)) return;
      btn.addEventListener('click', () => {
        G.selectedBikeId = btn.dataset.select;
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
  }

  function startGame() {
    G.currentScreen = 'playing';
    G.started = true;
    G.ended = false;
    G.resetSlowMo();
    if (G.resetWeather) G.resetWeather();
    resetRun(G, G.START_LANE);
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
      r.laneIdx = (i % 2 === 0) ? 2 : 3;
      r.lateralOffset = G.LANE_OFFSETS[r.laneIdx];
      r.s = G.findSafeRampS(150 + i * 280);
      r.triggeredThisPass = false;
    }
    for (let i = 0; i < G.pedestrians.length; i++) {
      G.pedestrians[i].s = i * 16;
    }
    for (let i = 0; i < G.trafficPool.length; i++) {
      G.resetTrafficVehicle(G.trafficPool[i], 38 + i * 24, i % 4);
    }

    G.prepareRunEconomy();

    $('overlay').style.display = 'none';
    $('hud').hidden = false;
    $('controls').hidden = false;
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
    G.currentScreen = 'crash';
    G.resetSlowMo();
    if (G.resetWeather) G.resetWeather();
    if (navigator.vibrate) navigator.vibrate(40);

    const earned = creditRun(G.score, G.bankedOrderRun);
    G.bankPoints += earned;
    G.bankedOrderRun = 0;
    G.saveGarage();

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
