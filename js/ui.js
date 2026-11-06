import { G } from './state.js';

export function initUi() {
  const $ = G.$;
  const clamp = G.clamp;
  const lerp = G.lerp;

  /* =========================================================================
   * 14. ИГРОВОЕ СОСТОЯНИЕ, ГЛАВНОЕ МЕНЮ, МАГАЗИН, ТЮНИНГ И ОКНО СМЕРТИ
   * ========================================================================= */
  G.keys = { left: false, right: false, gas: false, brake: false };
  G.currentScreen = 'main'; // 'main' | 'shop' | 'tuning' | 'playing' | 'crash'
  G.started = false;
  G.ended = false;
  G.speed = 0;
  G.distance = 0;
  G.score = 0;
  G.totalJumpBonusRun = 0;
  G.totalCarsJumpedRun = 0;
  G.comboCount = 0;
  G.comboTimer = 0;
  G.playerS = 0;
  G.laneOffset = 7.1;
  G.lateralVelocity = 0;
  G.steerVisual = 0;
  G.slipDriftVel = 0;
  G.accelPitchOffset = 0;
  G.lastTime = performance.now();

  G.jumpState = {
    airborne: false,
    height: 0,
    vy: 0,
    pitch: 0,
    startS: 0,
    carsJumped: 0,
    liveBonus: 0,
    wobbleTimer: 0
  };
  G.jumpSummaryTimer = 0;

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
    const isDlss = G.lightingQuality === 'dlss';
    const deltaSign = eff.speedDelta > 0 ? `+${eff.speedDelta}` : (eff.speedDelta < 0 ? `${eff.speedDelta}` : '');

    overlay.innerHTML = `
      <div class="main-menu-layout">
        <div class="mm-top-bar">
          <div class="mm-left-col">
            <div class="voxel-logo-wrap">
              <div class="speed-lines" aria-hidden="true">
                <span></span><span></span><span></span>
              </div>
              <div class="voxel-logo">
                <span class="w-bajaj">bajaj</span>
                <span class="w-go">GO</span>
              </div>
            </div>
            <div class="mm-selected-badge">
              Выбран: <b>${b.name}</b> · <b>${eff.maxSpeed} км/ч</b>${deltaSign ? `<span class="tune-plus">(${deltaSign})</span>` : ''} (${b.typeLabel})
            </div>
            <div class="mm-btn-stack">
              <button class="mm-btn-start" id="mm-start">
                <span class="ico">▶</span>
                <span>Начать заезд</span>
              </button>
              <button class="mm-btn-sec" id="mm-shop">
                <span class="ico">🛒</span>
                <span>Магазин мотоциклов</span>
                <span class="sub-val">${G.bikeCatalog.length} ед.</span>
              </button>
              <button class="mm-btn-sec" id="mm-lighting">
                <span class="ico">☀️</span>
                <span>Качество освещения</span>
                <span class="sub-val ${isDlss ? 'on' : ''}">${isDlss ? 'DLSS-стиль' : 'Обычное'}</span>
              </button>
            </div>
          </div>

          <div class="mm-currency">
            <span>Баланс</span>
            <b id="bank">${Math.floor(G.bankPoints)} ₽</b>
          </div>
        </div>

        <div class="mm-bottom-bar">
          <div class="mm-dev-info">
            bajaj GO · Voxel Traffic &amp; Jump Simulator · Game by a fan
          </div>
          <div class="mm-corner-icons">
            <button class="mm-icon-btn" id="mm-cam-btn" title="Переключить вид камеры по умолчанию (${G.cameraMode === 'cockpit' ? 'Кокпит' : '3-е лицо'})">🎥</button>
            <button class="mm-icon-btn" id="mm-fs-btn" title="Полный экран">⛶</button>
          </div>
        </div>
      </div>
    `;

    G.syncVehicleAndCameraVisibility(true);

    $('mm-start').addEventListener('click', startGame);
    $('mm-shop').addEventListener('click', renderShop);
    $('mm-lighting').addEventListener('click', () => {
      G.lightingQuality = (G.lightingQuality === 'dlss') ? 'normal' : 'dlss';
      G.saveGarage();
      G.applyLightingSettings();
      renderMainMenu();
    });
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
      const activeColor = G.customColors[b.id] || b.color;
      const eff = G.getBikeEffectiveStats(b.id);
      let btn = '';
      if (selected) {
        btn = `<button class="choose disabled" disabled>✓ ВЫБРАН</button>`;
      } else if (owned) {
        btn = `<button class="choose" data-select="${b.id}">ВЫБРАТЬ</button>`;
      } else {
        const canBuy = G.bankPoints >= b.price;
        btn = `<button class="buy ${canBuy ? '' : 'disabled'}" data-buy="${b.id}" ${canBuy ? '' : 'disabled'}>${canBuy ? 'КУПИТЬ ЗА ' + b.price.toLocaleString('ru-RU') + ' ₽' : 'НУЖНО ' + b.price.toLocaleString('ru-RU') + ' ₽'}</button>`;
      }

      let swatchHtml = '';
      if (b.swatches && b.swatches.length) {
        const swItems = b.swatches.map(s => {
          const hexStr = '#' + s.hex.toString(16).padStart(6, '0');
          const isAct = activeColor === s.hex;
          return `<button class="swatch ${isAct ? 'active' : ''}" style="background:${hexStr}" title="${s.name}" data-swatch-bike="${b.id}" data-swatch-hex="${s.hex}"></button>`;
        }).join('');
        swatchHtml = `<div class="color-swatches"><span>Окраска:</span>${swItems}</div>`;
      }

      const badgeClass = b.vType === 'yura' ? 'vtype yura' : (b.vType === 'qute' ? 'vtype qute' : 'vtype');
      const speedBadgeText = eff.speedDelta !== 0
        ? `${b.maxSpeed} км/ч (с тюнингом ${eff.maxSpeed} км/ч)`
        : `${b.maxSpeed} км/ч`;

      return `
        <div class="bike-card ${selected ? 'active-card' : ''}">
          <strong>
            <span>${b.name}</span>
            <span style="display:flex;gap:6px;align-items:center">
              <span class="${badgeClass}">${b.typeLabel}</span>
              <span style="color:#ffb64e">${speedBadgeText}</span>
            </span>
          </strong>
          <small>${b.price === 0 ? 'Стартовый мотоцикл · Цена: 0 ₽ (уже в гараже)' : 'Цена: ' + b.price.toLocaleString('ru-RU') + ' ₽'} · Тюнинг: ${eff.installedCount}/${G.tuningCatalog.length}</small>
          ${swatchHtml}
          <div class="bike-actions">${btn}</div>
        </div>
      `;
    }).join('');

    overlay.innerHTML = `
      <div class="modal-card">
        <div class="voxel-logo" style="justify-content:center;font-size:42px"><span class="w-bajaj">ГАРАЖ</span><span class="w-go">GO</span></div>
        <div class="sub">МАГАЗИН МОТОЦИКЛОВ И КВАДРИЦИКЛОВ BAJAJ</div>
        <p style="font-size:14px;margin:4px 0">Накопленные рубли: <b style="color:#fff59d">${Math.floor(G.bankPoints).toLocaleString('ru-RU')} ₽</b></p>
        <div class="shop-list">${cards}</div>
        <button class="secondary" id="shop-back">← НАЗАД В ГЛАВНОЕ МЕНЮ</button>
      </div>
    `;

    overlay.querySelectorAll('[data-buy]').forEach(btn =>
      btn.addEventListener('click', () => {
        const bike = G.bikeCatalog.find(x => x.id === btn.dataset.buy);
        if (!bike || G.ownedBikes.includes(bike.id) || G.bankPoints < bike.price) return;
        G.bankPoints -= bike.price;
        G.ownedBikes.push(bike.id);
        G.selectedBikeId = bike.id;
        G.saveGarage();
        G.syncVehicleAndCameraVisibility(true);
        renderShop();
      })
    );
    overlay.querySelectorAll('[data-select]').forEach(btn =>
      btn.addEventListener('click', () => {
        G.selectedBikeId = btn.dataset.select;
        G.saveGarage();
        G.syncVehicleAndCameraVisibility(true);
        renderShop();
      })
    );
    overlay.querySelectorAll('[data-swatch-bike]').forEach(btn =>
      btn.addEventListener('click', () => {
        const bId = btn.dataset.swatchBike;
        const hex = Number(btn.dataset.swatchHex);
        G.customColors[bId] = hex;
        const bObj = G.bikeCatalog.find(x => x.id === bId);
        if (bObj) bObj.color = hex;
        G.saveGarage();
        G.syncVehicleAndCameraVisibility(true);
        renderShop();
      })
    );
    $('shop-back').addEventListener('click', renderMainMenu);
  }

  // ЭКРАН ТЮНИНГА ДЛЯ ТЕКУЩЕГО ВЫБРАННОГО МОТОЦИКЛА
  function renderTuning(statusMessage = '', statusType = '') {
    G.currentScreen = 'tuning';
    const overlay = $('overlay');
    overlay.style.display = 'flex';
    overlay.className = 'mode-shop';

    const bike = G.selectedBike();
    const eff = G.getBikeEffectiveStats(bike.id);

    const speedDiffHtml = eff.speedDelta !== 0
      ? `<em class="${eff.speedDelta < 0 ? 'neg' : ''}">(${eff.speedDelta > 0 ? '+' + eff.speedDelta : eff.speedDelta} км/ч)</em>`
      : '';
    const accelDiffHtml = eff.accelBonusPct > 0
      ? `<em>(+${eff.accelBonusPct}%)</em>`
      : '';
    const brakeDiffHtml = eff.brakeBonusPct > 0
      ? `<em>(+${eff.brakeBonusPct}%)</em>`
      : '';

    const cardsHtml = G.tuningCatalog.map(upg => {
      const price = G.getUpgradePrice(bike, upg);
      const owned = G.hasUpgradeOwned(bike.id, upg.id);
      const installed = G.hasUpgradeInstalled(bike.id, upg.id);

      let statusBadge = '';
      let actionBtn = '';

      if (installed) {
        statusBadge = `<span class="tune-price" style="color:#69f0ae">✓ Установлено</span>`;
        actionBtn = `<button class="tune-btn installed-btn" data-toggle-upg="${upg.id}" title="Нажмите, чтобы снять или снова установить деталь">УСТАНОВЛЕНО ✓</button>`;
      } else if (owned) {
        statusBadge = `<span class="tune-price" style="color:#81d4fa">Куплено</span>`;
        actionBtn = `<button class="tune-btn owned-btn" data-toggle-upg="${upg.id}">УСТАНОВИТЬ</button>`;
      } else {
        statusBadge = `<span class="tune-price">${price.toLocaleString('ru-RU')} ₽</span>`;
        actionBtn = `<button class="tune-btn buy" data-buy-upg="${upg.id}">КУПИТЬ</button>`;
      }

      return `
        <div class="tune-card ${installed ? 'installed' : ''}">
          <div class="tune-ico">${upg.icon}</div>
          <div class="tune-info">
            <strong>
              <span>${upg.name}</span>
              <span class="effect-tag ${upg.isWarn ? 'warn' : ''}">${upg.effectLabel}</span>
            </strong>
            <small>${upg.desc}</small>
          </div>
          <div class="tune-act">
            ${statusBadge}
            ${actionBtn}
          </div>
        </div>
      `;
    }).join('');

    overlay.innerHTML = `
      <div class="modal-card">
        <div class="voxel-logo" style="justify-content:center;font-size:40px"><span class="w-bajaj">ТЮНИНГ</span><span class="w-go">GO</span></div>
        <div class="sub">ИНДИВИДУАЛЬНАЯ ДОВОДКА И КАСТОМИЗАЦИЯ МОДЕЛИ</div>

        <div class="tuning-summary">
          <div class="tuning-bike-header">
            <strong>🏍️ ${bike.name} <span style="font-size:12px;color:#90caf9;font-weight:700">(База: ${bike.maxSpeed} км/ч)</span></strong>
            <span class="balance-pill">Баланс: ${Math.floor(G.bankPoints).toLocaleString('ru-RU')} ₽</span>
          </div>
          <div class="tuning-stats-row">
            <div class="t-stat">
              <span>Макс. скорость</span>
              <b>${eff.maxSpeed} км/ч ${speedDiffHtml}</b>
            </div>
            <div class="t-stat">
              <span>Динамика разгона</span>
              <b>${eff.accel.toFixed(1)} ед. ${accelDiffHtml}</b>
            </div>
            <div class="t-stat">
              <span>Торможение</span>
              <b>${Math.round(eff.brakeDecel)} ед. ${brakeDiffHtml}</b>
            </div>
          </div>
        </div>

        <div class="tuning-msg ${statusType}" id="tuning-msg">${statusMessage || 'Улучшения привязаны к текущему мотоциклу и сохраняются автоматически'}</div>

        <div class="shop-list">${cardsHtml}</div>

        <button class="secondary" id="tuning-back">← НАЗАД В ГЛАВНОЕ МЕНЮ</button>
      </div>
    `;

    overlay.querySelectorAll('[data-buy-upg]').forEach(btn => {
      btn.addEventListener('click', () => {
        const upgId = btn.dataset.buyUpg;
        const upg = G.tuningCatalog.find(u => u.id === upgId);
        if (!upg) return;
        const price = G.getUpgradePrice(bike, upg);
        if (G.bankPoints < price) {
          const need = price - Math.floor(G.bankPoints);
          renderTuning(`⚠ Недостаточно средств! Для покупки «${upg.shortName}» не хватает ещё ${need.toLocaleString('ru-RU')} ₽`, 'err');
          return;
        }
        G.bankPoints -= price;
        const rec = G.getBikeTuningRecord(bike.id);
        if (!rec.owned.includes(upg.id)) rec.owned.push(upg.id);
        if (!rec.installed.includes(upg.id)) rec.installed.push(upg.id);
        G.saveGarage();
        G.syncVehicleAndCameraVisibility(true);
        renderTuning(`✓ Улучшение «${upg.shortName}» куплено и установлено на ${bike.name}!`, 'ok');
      });
    });

    overlay.querySelectorAll('[data-toggle-upg]').forEach(btn => {
      btn.addEventListener('click', () => {
        const upgId = btn.dataset.toggleUpg;
        const upg = G.tuningCatalog.find(u => u.id === upgId);
        if (!upg) return;
        const rec = G.getBikeTuningRecord(bike.id);
        if (!rec.owned.includes(upg.id)) return;
        const idx = rec.installed.indexOf(upg.id);
        let msg = '';
        if (idx >= 0) {
          rec.installed.splice(idx, 1);
          msg = `Деталь «${upg.shortName}» снята (остаётся в вашем гараже — статус «Куплено»)`;
        } else {
          rec.installed.push(upg.id);
          msg = `✓ Деталь «${upg.shortName}» установлена на ${bike.name}!`;
        }
        G.saveGarage();
        G.syncVehicleAndCameraVisibility(true);
        renderTuning(msg, 'ok');
      });
    });

    $('tuning-back').addEventListener('click', renderMainMenu);
  }

  function startGame() {
    G.currentScreen = 'playing';
    G.started = true;
    G.ended = false;
    G.speed = 0;
    G.distance = 0;
    G.score = 0;
    G.totalJumpBonusRun = 0;
    G.totalCarsJumpedRun = 0;
    G.comboCount = 0;
    G.comboTimer = 0;
    G.playerS = 0;
    G.laneOffset = 7.1;
    G.lateralVelocity = 0;
    G.steerVisual = 0;
    G.slipDriftVel = 0;

    G.jumpState.airborne = false;
    G.jumpState.height = 0;
    G.jumpState.vy = 0;
    G.jumpState.pitch = 0;
    G.jumpState.carsJumped = 0;
    G.jumpState.liveBonus = 0;
    G.jumpState.wobbleTimer = 0;
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
    hint.style.opacity = '1';
    setTimeout(() => { if (G.started) hint.style.opacity = '0'; }, 5500);
  }
  G.startGame = startGame;

  function crashGame() {
    if (G.ended) return;
    G.ended = true;
    G.started = false;
    G.currentScreen = 'crash';

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

    overlay.innerHTML = `
      <div class="modal-card crash-card">
        <h2 class="crash-title">💥 АВАРИЯ</h2>
        <div class="sub" style="margin-bottom:10px">ЗАЕЗД ОКОНЧЕН · МОМЕНТ СТОЛКНОВЕНИЯ</div>
        <div class="crash-stats">
          <div><span>Пройденная дистанция:</span><b>${G.distance.toFixed(2)} км</b></div>
          <div><span>Перелетено машин:</span><b class="cyan">${G.totalCarsJumpedRun} шт. (+${Math.floor(G.totalJumpBonusRun)} ₽)</b></div>
          <div><span>Всего заработано за заезд:</span><b class="gold">+${earned} ₽</b></div>
          <div><span>Баланс в банке:</span><b>${Math.floor(G.bankPoints)} ₽</b></div>
        </div>
        <button class="primary" id="crash-restart">▶ ИГРАТЬ СНОВА</button>
        <button class="secondary" id="crash-menu">В ГЛАВНОЕ МЕНЮ</button>
      </div>
    `;

    $('crash-restart').addEventListener('click', startGame);
    $('crash-menu').addEventListener('click', renderMainMenu);
  }
  G.crashGame = crashGame;
}
