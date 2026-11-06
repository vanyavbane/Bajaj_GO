import { balance, button, card, currency, field, heading, iconButton, logo, menuScreen, note, panel, rows, stats, swatch, swatchRow, tag } from '@bajajgo/design';
import { grouped, rubles } from './engine/money.js';
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
  G.jumpSummaryTimer = 0;

  function renderGraphics(from) {
    const overlay = $('overlay');
    overlay.style.display = 'flex';
    overlay.className = 'mode-shop';
    const g = G.graphics;
    const option = (key, value, label) => button({
      variant: 'choice',
      label,
      pressed: g[key] === value,
      data: { gfx: key, value }
    });

    overlay.innerHTML = panel(`
        ${heading('ГРАФИКА', 'ОДНИ НАСТРОЙКИ НА ВЕСЬ ЭКРАН')}
        ${g.preset === 'custom' ? note('Свой набор. Экспозиция 1.18 включается только режимом «Чётко».') : ''}
        ${field('Режим', option('preset', 'fast', 'Быстро') + option('preset', 'balanced', 'Ровно') + option('preset', 'sharp', 'Чётко'))}
        ${field('Тени', option('shadows', 'off', 'Нет') + option('shadows', 'low', 'Рядом') + option('shadows', 'high', 'Чётче'))}
        ${field('Масштаб кадра', option('scale', 0.75, '0.75') + option('scale', 1, '1') + option('scale', 1.25, '1.25'))}
        ${field('Фонари', option('lamps', 0, '0') + option('lamps', 2, '2') + option('lamps', 4, '4'))}
        ${field('Отражения', option('reflections', false, 'Тише') + option('reflections', true, 'Есть'))}
        ${button({ id: 'gfx-back', label: '← НАЗАД' })}
    `, { size: 'narrow' });

    overlay.querySelectorAll('[data-gfx]').forEach(btn => {
      if (!(btn instanceof HTMLElement)) return;
      btn.addEventListener('click', () => {
        G.chooseGraphics(btn.dataset.gfx, btn.dataset.value);
        renderGraphics(from);
      });
    });
    $('gfx-back').addEventListener('click', () => {
      if (from === 'pause') G.renderPauseMenu(false);
      else renderMainMenu();
    });
  }
  G.renderGraphics = renderGraphics;

  function renderMainMenu() {
    G.currentScreen = 'main';
    G.started = false;
    G.ended = false;
    $('hud').hidden = true;
    $('tp-hud').hidden = true;
    $('controls').hidden = true;
    $('jump-live').hidden = true;

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
          id: 'mm-graphics',
          icon: '☀',
          label: 'Графика',
          trail: G.graphicsLabel,
          trailOn: G.graphics.preset === 'sharp'
        })
      ].join(''),
      balance: currency({ id: 'bank', label: 'Баланс', value: rubles(G.bankPoints) }),
      footer: 'bajaj GO · Voxel Traffic & Jump Simulator · Game by a fan',
      tools: [
        iconButton({ id: 'mm-cam-btn', icon: '🎥', title: `Камера: ${G.cameraMode === 'cockpit' ? 'кокпит' : '3-е лицо'}` }),
        iconButton({ id: 'mm-fs-btn', icon: '⛶', title: 'Полный экран' })
      ].join('')
    });

    G.syncVehicleAndCameraVisibility(true);

    $('mm-start').addEventListener('click', startGame);
    $('mm-shop').addEventListener('click', renderShop);
    $('mm-graphics').addEventListener('click', () => renderGraphics('menu'));
    $('mm-cam-btn').addEventListener('click', () => {
      G.toggleCameraMode();
      renderMainMenu();
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
      const priceLine = b.price === 0
        ? 'Стартовый мотоцикл · Цена: 0 ₽ (уже в гараже)'
        : `Цена: ${rubles(b.price)}`;

      return card({
        on: selected,
        title: b.name,
        meta: tag(b.typeLabel, b.vType === 'qute' ? 'warm' : 'plain') + tag(speedBadgeText, 'warm'),
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
    resetRun(G, G.START_LANE);
    $('jump-live').hidden = true;
    $('jump-summary').classList.remove('show');

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
    if (navigator.vibrate) navigator.vibrate(40);

    const earned = Math.floor(G.score);
    G.bankPoints += Math.max(0, earned - G.bankedOrderRun);
    G.bankedOrderRun = 0;
    G.saveGarage();

    $('hud').hidden = true;
    $('tp-hud').hidden = true;
    $('controls').hidden = true;
    $('jump-live').hidden = true;

    const overlay = $('overlay');
    overlay.style.display = 'flex';
    overlay.className = 'mode-crash';

    overlay.innerHTML = panel(`
        ${heading('АВАРИЯ', 'ЗАЕЗД ОКОНЧЕН · МОМЕНТ СТОЛКНОВЕНИЯ')}
        ${stats([
          { label: 'Пройденная дистанция', value: G.formatRunDistance(G.distance) },
          { label: 'Перелетено машин', value: `${G.totalCarsJumpedRun} шт. (+${Math.floor(G.totalJumpBonusRun)} ₽)`, tone: 'signal' },
          { label: 'Заработано за заезд', value: `+${earned} ₽`, tone: 'gold' },
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
