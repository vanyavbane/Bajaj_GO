import * as THREE from 'three';
import { balance, button, callout, card, heading, inline, listItem, panel, rows, stats, tag } from '@bajajgo/design';
import { creditRun, latePenalty, meters, rubles, runDistance, shortfall } from './engine/money.js';
import { EXIT_ZONE_LENGTH, EXIT_ZONE_OFFSET, EXIT_ZONE_WIDTH, crossedExitBox, exitBoxCenter } from './engine/rules.js';
import { G } from './state.js';
import { placeIfMoved } from './engine/stream.js';

export function initEconomy() {
  const $ = G.$;
  const clamp = G.clamp;
  const lerp = G.lerp;

  /* =========================================================================
   * 16. СЪЕЗДЫ, ЭКОНОМИКА (ТОПЛИВО / ИЗНОС / ДОСТАВКА),
   *     КРИТИЧЕСКИЕ СИТУАЦИИ И ПАУЗА
   * ========================================================================= */
  const FUEL_RANGE_M = 25000;
  const REFUEL_PRICE = 500;
  const TOW_PRICE = 1000;
  const MEDKIT_PRICE = 250;
  G.LIMP_MAX_SPEED = 5;
  const ORDER_MIN_M = 150;
  const ORDER_MAX_M = 760;
  const ORDER_MIN_TIME = 30;
  const ORDER_MAX_TIME = 120;
  const EXIT_MIN_GAP = 300;
  const EXIT_MAX_GAP = 800;
  const EXIT_COUNT = 5;

  const WEAR_LIMITS = { pads: 60000, oil: 40000, plugs: 100000 };
  const WEAR_CAP = 3;
  const WEAR_LABELS = { pads: 'Колодки', oil: 'Масло', plugs: 'Свечи' };
  const WEAR_ICONS = { pads: '🛑', oil: '🛢', plugs: '⚡' };
  const SERVICE_BASE_PRICE = { pads: 400, oil: 600, plugs: 500 };

  const RESTAURANTS = [
    { name: "McDonald's", badge: 'MCD' },
    { name: 'Вкусно — и точка', badge: 'ВК' },
    { name: 'KFC', badge: 'KFC' },
    { name: 'Burger King', badge: 'BK' },
    { name: 'Суши Wok', badge: 'WOK' },
    { name: 'Додо Пицца', badge: 'ДОДО' },
    { name: 'Пицца Хат', badge: 'PH' }
  ];

  const EXIT_TYPES = ['restaurant', 'fuel', 'sto', 'tuning'];
  const EXIT_META = {
    restaurant: { title: 'РЕСТОРАНЫ', sub: 'В КОРОБКУ', badge: 'FOOD' },
    fuel:       { title: 'АЗС',       sub: 'В КОРОБКУ', badge: 'FUEL' },
    sto:        { title: 'СТО',       sub: 'В КОРОБКУ', badge: 'STO' },
    tuning:     { title: 'ТЮНИНГ',    sub: 'В КОРОБКУ', badge: 'TUNE' }
  };

  /* ---------- Персистентное состояние экономики ---------- */
  function fuelPercent() {
    return clamp(G.fuelM / FUEL_RANGE_M, 0, 1) * 100;
  }

  function orderPayout(order) {
    const frac = clamp(order.timeLeft / order.timeLimit, 0, 1);
    return Math.round(order.baseReward * (0.45 + 0.55 * frac));
  }

  function readStoredNumber(key, fallback) {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const v = Number(raw);
    return Number.isFinite(v) ? v : fallback;
  }

  G.fuelM = clamp(readStoredNumber('bajajGO_fuel', FUEL_RANGE_M), 0, FUEL_RANGE_M);
  let wearM = { pads: 0, oil: 0, plugs: 0 };
  try {
    const w = JSON.parse(localStorage.getItem('bajajGO_wear') || '{}');
    if (w && typeof w === 'object') {
      for (const p of Object.keys(WEAR_LIMITS)) {
        const v = Number(w[p]);
        wearM[p] = Number.isFinite(v) ? clamp(v, 0, WEAR_LIMITS[p] * WEAR_CAP) : 0;
      }
    }
  } catch { /* повреждённое сохранение — начинаем с новых деталей */ }

  G.limpMode = localStorage.getItem('bajajGO_limp') === '1';
  let activeOrder = null;
  G.bankedOrderRun = 0;
  try {
    const o = JSON.parse(localStorage.getItem('bajajGO_order') || 'null');
    if (o && typeof o === 'object' && o.restaurant) {
      activeOrder = {
        restaurant: String(o.restaurant),
        targetS: null,
        remainingM: Math.max(0, Number(o.remainingM) || 0),
        timeLimit: Math.max(1, Number(o.timeLimit) || ORDER_MIN_TIME),
        timeLeft: Number(o.timeLeft) || 0,
        baseReward: Math.max(1, Number(o.baseReward) || 100),
        penaltyApplied: !!o.penaltyApplied
      };
    }
  } catch { activeOrder = null; }

  G.paused = false;
  G.uiModal = false;
  G.modalKind = '';
  let ecoSaveTimer = 0;
  let lastEcoHudDraw = 0;
  G.accidentCooldown = 0;
  let pendingAccidentCar = null;
  let toastTimer = null;

  function saveEco() {
    localStorage.setItem('bajajGO_fuel', String(Math.round(G.fuelM)));
    localStorage.setItem('bajajGO_wear', JSON.stringify({
      pads: Math.round(wearM.pads),
      oil: Math.round(wearM.oil),
      plugs: Math.round(wearM.plugs)
    }));
    localStorage.setItem('bajajGO_limp', G.limpMode ? '1' : '0');
    if (activeOrder) {
      localStorage.setItem('bajajGO_order', JSON.stringify({
        restaurant: activeOrder.restaurant,
        remainingM: Math.max(0, Math.round(activeOrder.remainingM)),
        timeLimit: activeOrder.timeLimit,
        timeLeft: Number(activeOrder.timeLeft.toFixed(2)),
        baseReward: activeOrder.baseReward,
        penaltyApplied: activeOrder.penaltyApplied
      }));
    } else {
      localStorage.removeItem('bajajGO_order');
    }
  }

  function getWearLeftPct(part) {
    return clamp(1 - wearM[part] / WEAR_LIMITS[part], 0, 1) * 100;
  }

  // Износ ухудшает торможение, динамику и максимальную скорость
  function applyWearToStats(stats) {
    const padsFrac = clamp(wearM.pads / WEAR_LIMITS.pads, 0, 1);
    const oilFrac = clamp(wearM.oil / WEAR_LIMITS.oil, 0, 1);
    const plugsFrac = clamp(wearM.plugs / WEAR_LIMITS.plugs, 0, 1);
    stats.brakeDecel *= (1 - 0.35 * padsFrac);
    stats.accel *= (1 - 0.30 * oilFrac);
    stats.maxSpeed = Math.max(45, stats.maxSpeed * (1 - 0.18 * plugsFrac));
    stats.wearBrakePct = Math.round(padsFrac * 35);
    stats.wearAccelPct = Math.round(oilFrac * 30);
    stats.wearSpeedPct = Math.round(plugsFrac * 18);
    return stats;
  }
  G.applyWearToStats = applyWearToStats;

  function getServicePrice(part) {
    const bike = G.selectedBike();
    const factor = 1 + (bike.price > 0 ? bike.price / 12000 : 0);
    return Math.round(SERVICE_BASE_PRICE[part] * factor / 50) * 50;
  }

  function formatClock(sec) {
    const s = Math.max(0, Math.floor(sec));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  /* ---------- Всплывающие сообщения в HUD ---------- */
  function showEcoToast(text, bad = false) {
    const el = $('eco-toast');
    if (!el) return;
    el.textContent = text;
    el.className = 'show' + (bad ? ' bad' : '');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ''; }, 3200);
  }

  /* ---------- 3D-указатели съездов ---------- */
  function buildExitSignTexture(type, side) {
    const meta = EXIT_META[type];
    return G.createCanvasTexture(512, 160, (ctx, w, h) => {
      ctx.fillStyle = '#101620';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#486090';
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, w - 8, h - 8);

      ctx.fillStyle = '#c8a05a';
      ctx.fillRect(20, 20, 96, 120);
      ctx.fillStyle = '#101620';
      ctx.font = '900 26px system-ui,Segoe UI,Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(meta.badge, 68, 82);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#e8eef5';
      ctx.font = '900 42px system-ui,Segoe UI,Arial';
      ctx.fillText(meta.title, 136, 68);
      ctx.fillStyle = '#9cb8d8';
      ctx.font = '800 23px system-ui,Segoe UI,Arial';
      ctx.fillText(meta.sub, 136, 108);

      ctx.fillStyle = '#d6e2f1';
      ctx.font = '900 62px system-ui,Segoe UI,Arial';
      ctx.textAlign = 'right';
      ctx.fillText(side > 0 ? '→' : '←', w - 26, 104);
    });
  }

  const exitSignTextures = {};
  for (const t of EXIT_TYPES) {
    exitSignTextures[t] = {
      right: buildExitSignTexture(t, 1),
      left: buildExitSignTexture(t, -1)
    };
  }

  /* ---------- Маркерные зоны съездов (GTA-стиль) ---------- */
  // Зелёный — еда/заказы, жёлтый — сервис (АЗС, СТО, тюнинг)
  const EXIT_MARKER_COLORS = { food: 0x3ce07d, service: 0xffd24a };
  const EXIT_HINT_ICONS = { restaurant: '🍔', fuel: '⛽', sto: '🔧', tuning: '⚙️' };
  const EXIT_HINT_LABELS = { restaurant: 'РЕСТОРАН', fuel: 'АЗС', sto: 'СТО', tuning: 'ТЮНИНГ' };
  const EXIT_HINT_RANGE = 160;
  let exitPulseT = 0;
  let exitHintKey = '';

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // Белая текстура зоны: цвет задаётся material.color (зелёный/жёлтый)
  function buildExitZoneTexture() {
    return G.createCanvasTexture(256, 288, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);

      const glow = ctx.createRadialGradient(w / 2, h / 2, 16, w / 2, h / 2, w * 0.72);
      glow.addColorStop(0, 'rgba(255,255,255,0.10)');
      glow.addColorStop(0.62, 'rgba(255,255,255,0.16)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      roundRectPath(ctx, 18, 18, w - 36, h - 36, 14);
      ctx.fill();

      ctx.shadowColor = 'rgba(255,255,255,0.95)';
      ctx.shadowBlur = 24;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 9;
      roundRectPath(ctx, 18, 18, w - 36, h - 36, 14);
      ctx.stroke();

      ctx.shadowBlur = 10;
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 3;
      roundRectPath(ctx, 34, 34, w - 68, h - 68, 9);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Шевроны указывают вперёд по ходу движения (к съезду)
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 11;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const cy of [h * 0.36, h * 0.5, h * 0.64]) {
        ctx.beginPath();
        ctx.moveTo(w * 0.34, cy + 18);
        ctx.lineTo(w * 0.5, cy - 18);
        ctx.lineTo(w * 0.66, cy + 18);
        ctx.stroke();
      }
    });
  }

  function buildExitIconTexture(type) {
    const isFood = type === 'restaurant';
    const color = isFood ? '#3ce07d' : '#ffd24a';
    const glyph = EXIT_HINT_ICONS[type];
    return G.createCanvasTexture(256, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.shadowColor = color;
      ctx.shadowBlur = 34;
      ctx.fillStyle = 'rgba(8,14,23,0.9)';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 88, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 88, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 104px "Segoe UI Emoji","Noto Color Emoji","Apple Color Emoji",system-ui,Arial';
      ctx.fillText(glyph, w / 2, h / 2 + 6);
    });
  }

  function buildExitLabelTexture(type) {
    const isFood = type === 'restaurant';
    const color = isFood ? '#3ce07d' : '#ffd24a';
    return G.createCanvasTexture(512, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(8,14,23,0.82)';
      roundRectPath(ctx, 6, 12, w - 12, h - 24, 20);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      roundRectPath(ctx, 6, 12, w - 12, h - 24, 20);
      ctx.stroke();
      ctx.fillStyle = '#eef7f2';
      ctx.font = '900 46px system-ui,"Segoe UI",Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(EXIT_HINT_LABELS[type], w / 2, h / 2 - 16);
      ctx.fillStyle = color;
      ctx.font = '800 26px system-ui,"Segoe UI",Arial';
      ctx.fillText('В КОРОБКУ', w / 2, h / 2 + 28);
    });
  }

  const exitMarkerTextures = { zone: buildExitZoneTexture(), icons: {}, labels: {} };
  for (const t of EXIT_TYPES) {
    exitMarkerTextures.icons[t] = buildExitIconTexture(t);
    exitMarkerTextures.labels[t] = buildExitLabelTexture(t);
  }

  function createExitMarker() {
    const marker = new THREE.Group();

    // Полупрозрачная светящаяся зона на асфальте: emissive-вид за счёт
    // аддитивного смешивания, без реальных источников света и постобработки.
    const zoneMat = new THREE.MeshBasicMaterial({
      map: exitMarkerTextures.zone,
      color: EXIT_MARKER_COLORS.food,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4
    });
    const zone = new THREE.Mesh(new THREE.PlaneGeometry(EXIT_ZONE_WIDTH, EXIT_ZONE_LENGTH), zoneMat);
    zone.rotation.x = -Math.PI / 2;
    marker.add(zone);

    const iconMat = new THREE.SpriteMaterial({
      map: exitMarkerTextures.icons.restaurant,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      fog: false
    });
    const icon = new THREE.Sprite(iconMat);
    icon.position.set(0, 2.75, 0);
    icon.scale.set(2.1, 2.1, 1);
    marker.add(icon);

    const labelMat = new THREE.SpriteMaterial({
      map: exitMarkerTextures.labels.restaurant,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      fog: false
    });
    const label = new THREE.Sprite(labelMat);
    label.position.set(0, 1.35, 0);
    label.scale.set(4.2, 1.15, 1);
    marker.add(label);

    marker.visible = false;
    G.scene.add(marker);
    return { marker, zoneMat, iconSprite: icon, labelSprite: label };
  }

  // Уровень свечения зон: 0.45 днём, 1.0 ночью (закат — плавный переход)
  function getExitGlowLevel() {
    const t = G.todCycleTime;
    if (t < 0.25) return 0.45;
    if (t < 0.4) return lerp(0.45, 0.8, G.smoothstep(0.25, 0.4, t));
    if (t < 0.55) return lerp(0.8, 1, G.smoothstep(0.4, 0.55, t));
    if (t < 0.82) return 1;
    return lerp(1, 0.45, G.smoothstep(0.82, 0.98, t));
  }

  function nearestExitAhead() {
    let best = null;
    let bestDist = Infinity;
    for (const e of exitPool) {
      if (e.used) continue;
      const dist = exitBoxCenter(e.s) - G.playerS;
      if (dist < -EXIT_ZONE_LENGTH * 0.5 || dist > EXIT_HINT_RANGE) continue;
      if (dist < bestDist) {
        best = e;
        bestDist = dist;
      }
    }
    return best ? { exit: best, dist: bestDist } : null;
  }

  function hideExitHint() {
    if (!exitHintKey) return;
    $('exit-hint').className = '';
    exitHintKey = '';
  }

  function refreshExitHint() {
    if (!G.started || G.ended || G.uiModal || G.paused) {
      hideExitHint();
      return;
    }
    const ahead = nearestExitAhead();
    if (!ahead) {
      hideExitHint();
      return;
    }
    const exit = ahead.exit;
    const sideWord = exit.side > 0 ? 'справа' : 'слева';
    const title = `${EXIT_HINT_LABELS[exit.type]} · ${sideWord.toUpperCase()} · ${meters(Math.max(0, ahead.dist))}`;
    const armed = exitIsArmed(exit);
    const how = armed ? 'Ждёт въезда в коробку' : 'Меню откроется само в коробке';
    const key = `${exit.type}|${title}|${armed ? 1 : 0}`;
    if (key === exitHintKey) return;
    exitHintKey = key;
    $('exit-hint-ico').textContent = EXIT_HINT_ICONS[exit.type];
    $('exit-hint-text').textContent = title;
    $('exit-hint-how').textContent = how;
    const take = $('btn-take-exit');
    take.textContent = armed ? 'Жду коробку' : 'Съехать';
    take.setAttribute('aria-pressed', armed ? 'true' : 'false');
    $('exit-hint').className = 'show' + (exit.type === 'restaurant' ? '' : ' service') + (armed ? ' armed' : '');
  }

  function openExitFromBox(exit) {
    exit.used = true;
    exit.zoneFlash = 1;
    hideExitHint();
    G.playExitChime(exit.type === 'restaurant');
    openExitMenu(exit);
  }

  const exitPool = [];
  const deliveryMarker = new THREE.Group();

  function createExitObject() {
    const group = new THREE.Group();

    const spurMat = new THREE.MeshStandardMaterial({ color: 0x1d232e, roughness: 0.95, metalness: 0.05 });
    const spur = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.14, 30), spurMat);
    spur.position.y = 0.07;
    spur.receiveShadow = true;
    group.add(spur);

    const lineMat = new THREE.MeshStandardMaterial({
      color: 0x9a9a8a, emissive: 0x2a2a22, emissiveIntensity: 0.35, roughness: 0.7
    });
    for (const off of [-3.25, 3.25]) {
      const ln = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 28), lineMat);
      ln.position.set(off, 0.16, 0);
      group.add(ln);
    }
    for (const z of [-9, 0, 9]) {
      const chev = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.04, 0.6), lineMat);
      chev.position.set(0, 0.17, z);
      group.add(chev);
    }

    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c3440, roughness: 0.7, metalness: 0.45 });
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.22, 4.4, 0.22), poleMat);
    pole.position.set(0, 2.2, 5.5);
    group.add(pole);

    const back = new THREE.Mesh(
      new THREE.BoxGeometry(6.3, 2.15, 0.14),
      new THREE.MeshStandardMaterial({ color: 0x141a24, roughness: 0.8 })
    );
    back.position.set(0, 4.0, 5.44);
    group.add(back);

    const signMat = new THREE.MeshBasicMaterial({ map: exitSignTextures.restaurant.right });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 1.95), signMat);
    sign.position.set(0, 4.0, 5.52);
    group.add(sign);

    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.14, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xc8a05a, emissive: 0x8a6a2a, emissiveIntensity: 0.8 })
    );
    lamp.position.set(0, 5.25, 5.5);
    group.add(lamp);

    const markerParts = createExitMarker();
    G.scene.add(group);
    return { group, signMat, ...markerParts };
  }

  function updateExitSign(exit) {
    exit.signMat.map = exitSignTextures[exit.type][exit.side > 0 ? 'right' : 'left'];
    exit.signMat.needsUpdate = true;

    // Маркерная зона: цвет по типу точки интереса + своя иконка и подпись
    const isFood = exit.type === 'restaurant';
    exit.zoneMat.color.setHex(isFood ? EXIT_MARKER_COLORS.food : EXIT_MARKER_COLORS.service);
    exit.iconSprite.material.map = exitMarkerTextures.icons[exit.type];
    exit.iconSprite.material.needsUpdate = true;
    exit.labelSprite.material.map = exitMarkerTextures.labels[exit.type];
    exit.labelSprite.material.needsUpdate = true;
  }

  function chooseExitType() {
    const ahead = exitPool.filter(o => o.s > G.playerS - 10).map(o => o.type);
    if (!ahead.includes('fuel')) return 'fuel';
    if (!activeOrder && !ahead.includes('restaurant')) return 'restaurant';
    if (!ahead.includes('sto')) return 'sto';
    if (!ahead.includes('tuning')) return 'tuning';
    return EXIT_TYPES[Math.floor(Math.random() * EXIT_TYPES.length)];
  }

  function resetExits() {
    let s = G.playerS + 360;
    for (let i = 0; i < exitPool.length; i++) {
      const e = exitPool[i];
      e.type = EXIT_TYPES[i % EXIT_TYPES.length];
      e.side = (i % 2 === 0) ? 1 : -1;
      e.s = s;
      e.used = false;
      e.zoneFlash = 0;
      e.pulsePhase = Math.random() * Math.PI * 2;
      updateExitSign(e);
      s += EXIT_MIN_GAP + Math.random() * (EXIT_MAX_GAP - EXIT_MIN_GAP);
    }
  }

  let exitPrevS = null;
  let armedExit = null;
  let armedS = NaN;

  function exitIsArmed(exit) {
    return !!exit && armedExit === exit && armedS === exit.s && !exit.used;
  }

  function clearArmedExit() {
    armedExit = null;
    armedS = NaN;
  }

  function syncExitTrack() {
    exitPrevS = G.playerS;
  }
  G.debugStampExitTrack = syncExitTrack;

  function updateExitWorld(dt = 0) {
    exitPulseT += dt;
    const fromS = exitPrevS == null ? G.playerS : exitPrevS;
    const glow = getExitGlowLevel();

    let maxS = G.playerS;
    for (const e of exitPool) if (e.s > maxS) maxS = e.s;

    for (const e of exitPool) {
      if (e.s < G.playerS - 50) {
        maxS += EXIT_MIN_GAP + Math.random() * (EXIT_MAX_GAP - EXIT_MIN_GAP);
        e.s = maxS;
        e.side = Math.random() < 0.5 ? 1 : -1;
        e.type = chooseExitType();
        e.used = false;
        e.zoneFlash = 0;
        e.pulsePhase = Math.random() * Math.PI * 2;
        updateExitSign(e);
      }
      const zoneS = e.s - EXIT_ZONE_OFFSET;
      e.placedS = placeIfMoved(e.placedS, e.s, () => {
        G.placeOnRoad(e.group, e.s, e.side * 12.6, 0);
        G.placeOnRoad(e.marker, zoneS, e.side * G.START_LANE, 0.07);
      });

      // Маркерная зона в полосе съезда: пульсирует, к ночи светится ярче
      const dist = zoneS - G.playerS;
      e.marker.visible = dist > -35 && dist < 270;

      if (e.marker.visible) {
        const pulse = 0.5 + 0.5 * Math.sin(exitPulseT * 3.2 + e.pulsePhase);
        e.zoneMat.opacity = Math.min(0.95,
          (0.24 + 0.22 * glow) * (0.85 + 0.3 * pulse) + e.zoneFlash * 0.45);
        const iconScale = 2.1 * (1 + pulse * 0.05 + e.zoneFlash * 0.28);
        e.iconSprite.scale.set(iconScale, iconScale, 1);
        e.iconSprite.material.opacity = Math.min(1, 0.82 + 0.18 * glow);

        e.labelSprite.visible = dist > -8 && dist < 105;
        if (e.labelSprite.visible) {
          e.labelSprite.material.opacity = clamp((105 - dist) / 38, 0, 1) * (0.78 + 0.22 * glow);
        }
      } else {
        e.labelSprite.visible = false;
      }
      if (e.zoneFlash > 0) e.zoneFlash = Math.max(0, e.zoneFlash - dt * 1.7);

      if (exitIsArmed(e) && G.started && !G.ended && !G.uiModal && !G.paused
        && crossedExitBox(fromS, G.playerS, G.laneOffset, e.s, e.side, G.START_LANE)) {
        clearArmedExit();
        openExitFromBox(e);
        break;
      }
    }

    if (armedExit && (armedExit.s !== armedS || armedExit.used
      || G.playerS > exitBoxCenter(armedExit.s) + EXIT_ZONE_LENGTH * 0.5)) {
      clearArmedExit();
    }

    exitPrevS = G.playerS;
    refreshExitHint();
  }

  function armExit() {
    if (!G.started || G.ended || G.uiModal || G.paused) return false;
    const ahead = nearestExitAhead();
    if (!ahead) return false;
    if (exitIsArmed(ahead.exit)) return true;
    armedExit = ahead.exit;
    armedS = ahead.exit.s;
    exitHintKey = '';
    refreshExitHint();
    return true;
  }
  G.armExit = armExit;
  G.updateExitWorld = updateExitWorld;

  G.debugPlaceAtExit = (inside) => {
    let best = null;
    let bestDist = Infinity;
    for (const e of exitPool) {
      const dist = exitBoxCenter(e.s) - G.playerS;
      if (dist < -EXIT_ZONE_LENGTH || dist >= bestDist) continue;
      best = e;
      bestDist = dist;
    }
    if (!best) best = exitPool[0];
    if (!best) return null;
    if (G.uiModal) closeOverlayToGame();
    best.used = false;
    G.speed = 0;
    const where = inside === 'before' ? 'before' : (inside ? 'inside' : 'beside');
    G.playerS = exitBoxCenter(best.s) - (where === 'before' ? 30 : 0);
    G.laneOffset = where === 'beside' ? 0 : best.side * G.START_LANE;
    G.lateralVelocity = 0;
    G.slipDriftVel = 0;
    syncExitTrack();
    return { type: best.type, side: best.side, s: best.s, inside: where === 'inside', where };
  };

  // Маркер точки доставки заказа
  (function buildDeliveryMarker() {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c3440, roughness: 0.7, metalness: 0.45 });
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.6, 0.18), poleMat);
    pole.position.y = 2.3;
    deliveryMarker.add(pole);

    const flagTex = G.createCanvasTexture(256, 128, (ctx, w, h) => {
      ctx.fillStyle = '#16304a';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#c8a05a';
      ctx.lineWidth = 7;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      ctx.fillStyle = '#ffe0a8';
      ctx.font = '900 40px system-ui,Segoe UI,Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ЗАКАЗ', w / 2, h / 2 + 2);
    });
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 1.2),
      new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide })
    );
    flag.position.set(1.3, 4.0, 0);
    deliveryMarker.add(flag);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 2.1, 24),
      new THREE.MeshBasicMaterial({ color: 0xc8a05a, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    deliveryMarker.add(ring);

    deliveryMarker.visible = false;
    G.scene.add(deliveryMarker);
  })();

  let deliveryParkS = NaN;
  function updateDeliveryMarker() {
    if (activeOrder && activeOrder.targetS != null) {
      deliveryMarker.visible = true;
      deliveryParkS = placeIfMoved(deliveryParkS, activeOrder.targetS, (s) => {
        G.placeOnRoad(deliveryMarker, s, G.START_LANE, 0);
      });
    } else {
      deliveryMarker.visible = false;
      deliveryParkS = NaN;
    }
  }
  G.updateDeliveryMarker = updateDeliveryMarker;

  /* ---------- Модальные окна ---------- */
  function openModal(html, kind) {
    G.uiModal = true;
    G.modalKind = kind || 'exit';
    const overlay = $('overlay');
    overlay.style.display = 'flex';
    overlay.className = 'mode-shop';
    overlay.innerHTML = html;
  }

  function closeOverlayToGame() {
    G.uiModal = false;
    G.modalKind = '';
    const overlay = $('overlay');
    overlay.style.display = 'none';
    overlay.innerHTML = '';
    if (G.started && !G.ended) {
      $('hud').hidden = false;
      $('controls').hidden = false;
    }
    G.lastTime = performance.now();
  }
  G.closeOverlayToGame = closeOverlayToGame;

  function exitMenuBackButton() {
    return button({ id: 'poi-close', label: '← ПРОДОЛЖИТЬ ПУТЬ' });
  }

  function bindExitClose() {
    const btn = $('poi-close');
    if (btn) btn.addEventListener('click', () => closeOverlayToGame());
  }

  function openExitMenu(exit) {
    if (exit.type === 'restaurant') renderRestaurantMenu();
    else if (exit.type === 'fuel') renderFuelMenu();
    else if (exit.type === 'sto') renderServiceMenu();
    else renderExitTuning();
  }

  /* ---------- Рестораны и заказы ---------- */
  function renderRestaurantMenu(message = '') {
    const list = RESTAURANTS.map((r, i) => {
      const busy = !!activeOrder;
      return listItem({
        icon: r.badge,
        title: r.name,
        detail: busy ? 'Сначала доставьте текущий заказ' : 'Взять заказ на доставку',
        price: busy ? '—' : 'ЗАКАЗ',
        disabled: busy,
        data: { rest: i }
      });
    }).join('');

    openModal(panel(`
        ${heading('🍔 РЕСТОРАНЫ', 'СЪЕЗД · ДОСТАВКА ЕДЫ')}
        ${activeOrder ? callout(`Активный заказ: <b>${activeOrder.restaurant}</b><br>Осталось ${formatClock(activeOrder.timeLeft)} · ${meters(Math.max(0, activeOrder.remainingM))} до заказчика.`) : ''}
        ${message ? callout(message) : ''}
        ${rows(list)}
        ${exitMenuBackButton()}
    `, { size: 'narrow' }), 'exit');

    $('overlay').querySelectorAll('[data-rest]').forEach(btn => {
      if (!(btn instanceof HTMLElement)) return;
      btn.addEventListener('click', () => {
        if (activeOrder) return;
        const r = RESTAURANTS[Number(btn.dataset.rest)];
        if (!r) return;
        createOrder(r.name);
        closeOverlayToGame();
        showEcoToast(`🍔 Заказ принят: ${r.name} · ${meters(activeOrder.remainingM)} · ${formatClock(activeOrder.timeLimit)}`);
      });
    });
    bindExitClose();
  }

  function createOrder(restaurantName) {
    const dist = Math.round(ORDER_MIN_M + Math.random() * (ORDER_MAX_M - ORDER_MIN_M));
    const ratio = (dist - ORDER_MIN_M) / (ORDER_MAX_M - ORDER_MIN_M);
    const timeLimit = Math.round(ORDER_MIN_TIME + ratio * (ORDER_MAX_TIME - ORDER_MIN_TIME));
    const baseReward = Math.round(300 + ratio * 700);
    activeOrder = {
      restaurant: restaurantName,
      targetS: G.playerS + dist,
      remainingM: dist,
      timeLimit,
      timeLeft: timeLimit,
      baseReward,
      penaltyApplied: false
    };
    saveEco();
  }

  function tickOrder(dt) {
    if (!activeOrder) return;
    if (activeOrder.targetS == null) activeOrder.targetS = G.playerS + activeOrder.remainingM;

    activeOrder.timeLeft -= dt;
    if (activeOrder.timeLeft <= 0 && !activeOrder.penaltyApplied) {
      const penalty = latePenalty(G.bankPoints, activeOrder.baseReward);
      G.bankPoints -= penalty;
      activeOrder.penaltyApplied = true;
      G.saveGarage();
      saveEco();
      showEcoToast(`⏱ ПРОСРОЧКА! Штраф −${rubles(penalty)} · заказ всё равно нужно доставить`, true);
    }

    activeOrder.remainingM = Math.max(0, activeOrder.targetS - G.playerS);
    if (activeOrder.remainingM <= 0) deliverOrder();
  }
  G.tickOrder = tickOrder;

  function deliverOrder() {
    if (!activeOrder) return;
    const reward = orderPayout(activeOrder);
    const name = activeOrder.restaurant;
    G.score += reward;
    // Награда сразу зачисляется на баланс: её можно потратить на этом же заезде.
    // bankedOrderRun не даёт зачислить её повторно в конце заезда.
    G.bankPoints += reward;
    G.bankedOrderRun += reward;
    activeOrder = null;
    deliveryMarker.visible = false;
    G.saveGarage();
    saveEco();
    showEcoToast(`✅ Заказ «${name}» доставлен · +${rubles(reward)} на баланс`);
  }

  /* ---------- АЗС ---------- */
  function spawnEmergencyFuelExit() {
    let best = null;
    for (const e of exitPool) {
      if (e.s < G.playerS + 20) continue;
      if (!best || e.s < best.s) best = e;
    }
    if (!best) best = exitPool[0];
    best.type = 'fuel';
    best.side = 1;
    best.s = G.playerS + 70;
    best.used = false;
    updateExitSign(best);
  }

  function renderFuelMenu(opts = {}) {
    const pct = Math.round(fuelPercent());
    const full = G.fuelM >= FUEL_RANGE_M - 1;
    const canPay = G.bankPoints >= REFUEL_PRICE;

    openModal(panel(`
        ${heading('⛽ АЗС', 'СЪЕЗД · ЗАПРАВКА')}
        ${balance('БАЛАНС', rubles(G.bankPoints))}
        ${opts.message ? callout(opts.message) : ''}
        ${callout(`${opts.viaTow ? 'Эвакуатор доставил вас на ближайшую АЗС.<br>' : ''}Бак: <b>${pct}%</b> · запас хода ≈ <b>${meters(G.fuelM)}</b>.<br>Полного бака хватает на ${meters(FUEL_RANGE_M)}.`)}
        ${button({
          id: 'fuel-fill',
          variant: 'primary',
          label: full ? 'БАК ПОЛОН' : `ЗАЛИТЬ ПОЛНЫЙ БАК — ${REFUEL_PRICE} ₽`,
          disabled: !canPay || full
        })}
        ${(!canPay && !full) ? callout(`Не хватает ${rubles(shortfall(REFUEL_PRICE, G.bankPoints))}.`) : ''}
        ${exitMenuBackButton()}
    `, { size: 'narrow' }), 'exit');

    $('fuel-fill').addEventListener('click', () => {
      if (G.bankPoints < REFUEL_PRICE || G.fuelM >= FUEL_RANGE_M - 1) return;
      G.bankPoints -= REFUEL_PRICE;
      G.fuelM = FUEL_RANGE_M;
      G.limpMode = false;
      G.saveGarage();
      saveEco();
      renderFuelMenu({ message: '✅ Бак заправлен полностью. Можно ехать дальше!' });
    });

    $('poi-close').addEventListener('click', () => {
      if (G.fuelM <= 0 && !opts.viaTow) {
        G.limpMode = true;
        saveEco();
        spawnEmergencyFuelExit();
        closeOverlayToGame();
        showEcoToast('⛽ Топлива нет: максимум 5 км/ч. Доедьте до АЗС', true);
      } else if (G.fuelM <= 0 && opts.viaTow) {
        G.limpMode = true;
        saveEco();
        spawnEmergencyFuelExit();
        closeOverlayToGame();
        showEcoToast('⛽ Бак пуст: максимум 5 км/ч. Ближайшая АЗС отмечена на трассе', true);
      } else {
        closeOverlayToGame();
      }
    });
  }

  function openFuelEmpty() {
    if (G.uiModal || G.ended) return;
    G.speed = 0;
    G.keys.gas = false;
    const canPay = G.bankPoints >= TOW_PRICE;

    openModal(panel(`
        ${heading('⛽ БЕНЗИН ЗАКОНЧИЛСЯ', 'МОТОЦИКЛ ЗАГЛОХ · ВЫБЕРИТЕ ДЕЙСТВИЕ')}
        ${balance('БАЛАНС', rubles(G.bankPoints))}
        ${callout(`Можно вызвать эвакуатор до ближайшей АЗС за <b>${TOW_PRICE} ₽</b> (заправка на месте — ещё ${REFUEL_PRICE} ₽) или отказаться и ехать своим ходом с ограничением <b>${G.LIMP_MAX_SPEED} км/ч</b>.`)}
        ${button({
          id: 'fuel-tow',
          variant: 'primary',
          icon: '🚐',
          label: `ЭВАКУАТОР ДО АЗС — ${TOW_PRICE} ₽`,
          disabled: !canPay
        })}
        ${canPay ? '' : callout(`Не хватает ${rubles(shortfall(TOW_PRICE, G.bankPoints))} на эвакуатор.`)}
        ${button({ id: 'fuel-selftow', label: `ОТКАЗАТЬСЯ · ЕХАТЬ СВОИМ ХОДОМ (${G.LIMP_MAX_SPEED} КМ/Ч)` })}
    `, { size: 'narrow' }), 'critical');

    $('fuel-tow').addEventListener('click', () => {
      if (G.bankPoints < TOW_PRICE) return;
      G.bankPoints -= TOW_PRICE;
      G.saveGarage();
      G.playerS += 120;
      G.laneOffset = G.START_LANE;
      G.lateralVelocity = 0;
      syncExitTrack();
      G.speed = 0;
      G.accidentCooldown = 2.0;
      saveEco();
      renderFuelMenu({ viaTow: true });
    });

    $('fuel-selftow').addEventListener('click', () => {
      G.limpMode = true;
      saveEco();
      spawnEmergencyFuelExit();
      closeOverlayToGame();
      showEcoToast(`⛽ Режим «своим ходом»: максимум ${G.LIMP_MAX_SPEED} км/ч до АЗС`, true);
    });
  }

  /* ---------- СТО ---------- */
  function renderServiceMenu(message = '') {
    const bike = G.selectedBike();
    const list = ['pads', 'oil', 'plugs'].map(part => {
      const left = getWearLeftPct(part);
      const price = getServicePrice(part);
      const needed = wearM[part] >= 300;
      const canPay = G.bankPoints >= price;
      const disabled = !needed || !canPay;
      const detail = `Осталось ${Math.round(left)}% · замена каждые ${meters(WEAR_LIMITS[part])}`
        + (!needed ? ' · пока не требуется' : (!canPay ? ' · не хватает денег' : ''));
      return listItem({
        icon: WEAR_ICONS[part],
        title: WEAR_LABELS[part],
        detail,
        price: needed ? rubles(price) : 'НОРМА',
        disabled,
        data: { service: part }
      });
    }).join('');

    openModal(panel(`
        ${heading('🔧 СТО', 'СЪЕЗД · РЕМОНТ И ОБСЛУЖИВАНИЕ')}
        ${balance('БАЛАНС', `${rubles(G.bankPoints)} · ${bike.name}`)}
        ${message ? callout(message) : ''}
        ${callout('Изношенные детали ухудшают торможение, динамику и максимальную скорость. После замены ресурс сбрасывается на 100%.')}
        ${rows(list)}
        ${exitMenuBackButton()}
    `, { size: 'narrow' }), 'exit');

    $('overlay').querySelectorAll('[data-service]').forEach(btn => {
      if (!(btn instanceof HTMLElement)) return;
      btn.addEventListener('click', () => {
        const part = btn.dataset.service;
        if (part !== 'pads' && part !== 'oil' && part !== 'plugs') return;
        const price = getServicePrice(part);
        if (wearM[part] < 300 || G.bankPoints < price) return;
        G.bankPoints -= price;
        wearM[part] = 0;
        G.saveGarage();
        saveEco();
        renderServiceMenu(`✅ ${WEAR_LABELS[part]}: деталь заменена, ресурс восстановлен.`);
      });
    });
    bindExitClose();
  }

  /* ---------- Тюнинг на съезде ---------- */
  function renderExitTuning(message = '', statusType = '') {
    const bike = G.selectedBike();
    const eff = G.getBikeEffectiveStats(bike.id);

    const cardsHtml = G.tuningCatalog.map(upg => {
      const price = G.getUpgradePrice(bike, upg);
      const installed = G.hasUpgradeInstalled(bike.id, upg.id);
      const owned = G.hasUpgradeOwned(bike.id, upg.id);
      const status = installed
        ? tag('✓ Установлено', 'good')
        : owned
          ? tag('Куплено')
          : tag(rubles(price), 'warm');
      const actionBtn = installed
        ? button({ variant: 'compact', label: 'УСТАНОВЛЕНО ✓', data: { 'toggle-upg': upg.id } })
        : owned
          ? button({ variant: 'compact', label: 'УСТАНОВИТЬ', data: { 'toggle-upg': upg.id } })
          : button({ variant: 'compact', label: 'КУПИТЬ', data: { 'buy-upg': upg.id } });
      return card({
        on: installed,
        mark: upg.icon,
        title: upg.name,
        meta: tag(upg.effectLabel, upg.isWarn ? 'warn' : 'plain'),
        detail: upg.desc,
        aside: status + actionBtn
      });
    }).join('');

    openModal(panel(`
        ${heading('🔧 ТЮНИНГ', 'СЪЕЗД · ДОВОДКА ТЕКУЩЕГО МОТОЦИКЛА')}
        ${balance('БАЛАНС', `${rubles(G.bankPoints)} · ${bike.name} · макс. ${eff.maxSpeed} км/ч`)}
        ${message ? callout(message, statusType === 'err' ? 'err' : 'ok') : ''}
        ${rows(cardsHtml)}
        ${exitMenuBackButton()}
    `, { size: 'narrow' }), 'exit');

    const tuningRoot = $('overlay');
    tuningRoot.querySelectorAll('[data-buy-upg]').forEach(btn => {
      if (!(btn instanceof HTMLElement)) return;
      btn.addEventListener('click', () => {
        const upg = G.tuningCatalog.find(u => u.id === btn.dataset.buyUpg);
        if (!upg) return;
        const bought = G.purchaseUpgrade(bike, upg);
        if (!bought.ok) {
          G.pushFeed(`Не хватает ${rubles(bought.missing)} на «${upg.shortName}»`, 'bad');
          renderExitTuning(`⚠ Не хватает ${rubles(bought.missing)} на «${upg.shortName}»`, 'err');
          return;
        }
        G.syncVehicleAndCameraVisibility(true);
        G.pushFeed(`«${upg.shortName}» установлено`, 'upgrade');
        renderExitTuning(`✓ «${upg.shortName}» куплено и установлено!`, 'ok');
      });
    });

    tuningRoot.querySelectorAll('[data-toggle-upg]').forEach(btn => {
      if (!(btn instanceof HTMLElement)) return;
      btn.addEventListener('click', () => {
        const upg = G.tuningCatalog.find(u => u.id === btn.dataset.toggleUpg);
        if (!upg) return;
        const toggled = G.toggleUpgrade(bike, upg);
        if (!toggled.ok) return;
        G.syncVehicleAndCameraVisibility(true);
        const msg = toggled.installed
          ? `✓ Деталь «${upg.shortName}» установлена`
          : `Деталь «${upg.shortName}» снята (остаётся в гараже)`;
        G.pushFeed(
          toggled.installed ? `«${upg.shortName}» установлено` : `«${upg.shortName}» снято`,
          toggled.installed ? 'upgrade' : 'remove'
        );
        renderExitTuning(msg, 'ok');
      });
    });
    bindExitClose();
  }

  /* ---------- ДТП ---------- */
  function handleAccident(car) {
    if (G.ended || G.uiModal) return;
    if (!activeOrder) {
      G.crashGame();
      return;
    }

    pendingAccidentCar = car || null;
    G.speed = Math.max(0, G.speed * 0.2);
    const canPay = G.bankPoints >= MEDKIT_PRICE;

    openModal(panel(`
        ${heading('💥 ДТП', 'У ВАС АКТИВНЫЙ ЗАКАЗ · ВЫБЕРИТЕ ДЕЙСТВИЕ')}
        ${balance('БАЛАНС', rubles(G.bankPoints))}
        ${callout(`Скорая помощь и лекарства стоят <b>${MEDKIT_PRICE} ₽</b>. После оплаты заезд продолжается, заказ «${activeOrder.restaurant}» сохраняется.`)}
        ${button({
          id: 'acc-med',
          variant: 'primary',
          icon: '🚑',
          label: `СКОРАЯ + ЛЕКАРСТВА — ${MEDKIT_PRICE} ₽`,
          disabled: !canPay
        })}
        ${canPay ? '' : callout(`Недостаточно денег на лекарства (${rubles(shortfall(MEDKIT_PRICE, G.bankPoints))}). Остаётся только закончить заезд.`)}
        ${button({ id: 'acc-end', label: 'ОТКАЗАТЬСЯ · ЗАЕЗД ЗАКОНЧИТСЯ' })}
    `, { size: 'narrow' }), 'critical');

    $('acc-med').addEventListener('click', () => {
      if (G.bankPoints < MEDKIT_PRICE) return;
      G.bankPoints -= MEDKIT_PRICE;
      G.saveGarage();
      if (pendingAccidentCar) {
        pendingAccidentCar.s = G.playerS + 120;
        pendingAccidentCar.lateralOffset = G.LANE_OFFSETS[pendingAccidentCar.laneIdx];
        pendingAccidentCar.changingLane = false;
      }
      for (const c of G.trafficPool) {
        if (Math.abs(c.s - G.playerS) < 32 && Math.abs(c.lateralOffset - G.laneOffset) < 6) {
          c.s = G.playerS + 130 + Math.random() * 40;
        }
      }
      pendingAccidentCar = null;
      G.accidentCooldown = 2.5;
      G.speed = 0;
      saveEco();
      closeOverlayToGame();
      showEcoToast(`🚑 Лекарства куплены (−${rubles(MEDKIT_PRICE)}). Заказ сохранён`, false);
    });

    $('acc-end').addEventListener('click', () => {
      pendingAccidentCar = null;
      activeOrder = null;
      saveEco();
      G.uiModal = false;
      G.modalKind = '';
      G.crashGame();
    });
  }
  G.handleAccident = handleAccident;

  /* ---------- Пауза ---------- */
  function renderPauseMenu(showSettings = false) {
    const overlay = $('overlay');
    overlay.style.display = 'flex';
    overlay.className = 'mode-shop';

    const orderValue = activeOrder
      ? `${activeOrder.restaurant} · ${formatClock(activeOrder.timeLeft)}`
      : 'нет';

    overlay.innerHTML = panel(`
        ${heading('ПАУЗА', 'ЗАЕЗД ПРИОСТАНОВЛЕН · ТАЙМЕРЫ СТОЯТ')}
        ${stats([
          { label: 'Пробег', value: runDistance(G.distance) },
          { label: 'Заработано за заезд', value: rubles(creditRun(G.score, G.bankedOrderRun)) },
          { label: 'Баланс', value: rubles(G.bankPoints) },
          { label: 'Топливо', value: `${Math.round(fuelPercent())}%` },
          { label: 'Заказ', value: orderValue }
        ])}
        ${showSettings ? `
          ${inline('Графика', button({ id: 'pause-graphics', variant: 'compact', label: G.graphicsLabel }))}
          ${inline('Камера', button({ id: 'pause-cam', variant: 'compact', label: G.cameraMode === 'cockpit' ? 'Кокпит' : '3-е лицо' }))}
          ${button({ id: 'pause-settings-back', label: '← НАЗАД' })}
        ` : button({ id: 'pause-settings', icon: '⚙', label: 'НАСТРОЙКИ' })}
        ${button({ id: 'pause-resume', variant: 'primary', icon: '▶', label: 'ПРОДОЛЖИТЬ' })}
        ${button({ id: 'pause-menu', label: 'В ГЛАВНОЕ МЕНЮ' })}
    `, { size: 'narrow' });

    $('pause-resume').addEventListener('click', resumeGame);
    $('pause-menu').addEventListener('click', exitToMenuFromPause);
    if (showSettings) {
      $('pause-settings-back').addEventListener('click', () => renderPauseMenu(false));
      $('pause-graphics').addEventListener('click', () => G.renderGraphics('pause'));
      $('pause-cam').addEventListener('click', () => {
        G.toggleCameraMode();
        renderPauseMenu(true);
      });
    } else {
      $('pause-settings').addEventListener('click', () => renderPauseMenu(true));
    }
  }
  G.renderPauseMenu = renderPauseMenu;

  function togglePause() {
    if (!G.started || G.ended) return;
    if (G.paused) {
      resumeGame();
      return;
    }
    G.paused = true;
    G.keys.gas = G.keys.brake = G.keys.left = G.keys.right = false;
    renderPauseMenu(false);
  }
  G.togglePause = togglePause;

  function resumeGame() {
    G.paused = false;
    const overlay = $('overlay');
    overlay.style.display = 'none';
    overlay.innerHTML = '';
    $('hud').hidden = false;
    $('controls').hidden = false;
    G.lastTime = performance.now();
  }

  function exitToMenuFromPause() {
    G.paused = false;
    G.bankPoints += creditRun(G.score, G.bankedOrderRun);
    G.bankedOrderRun = 0;
    G.score = 0;
    G.started = false;
    G.ended = false;
    G.speed = 0;
    G.saveGarage();
    saveEco();
    const overlay = $('overlay');
    overlay.style.display = 'none';
    overlay.innerHTML = '';
    G.renderMainMenu();
  }

  /* ---------- Подготовка заезда и HUD ---------- */
  function prepareRunEconomy() {
    G.paused = false;
    G.uiModal = false;
    G.modalKind = '';
    G.accidentCooldown = 0;
    pendingAccidentCar = null;
    ecoSaveTimer = 0;
    G.bankedOrderRun = 0;
    $('eco-toast').className = '';

    for (let i = 0; i < EXIT_COUNT; i++) {
      if (!exitPool[i]) {
        const obj = createExitObject();
        exitPool.push({
          group: obj.group,
          signMat: obj.signMat,
          marker: obj.marker,
          zoneMat: obj.zoneMat,
          iconSprite: obj.iconSprite,
          labelSprite: obj.labelSprite,
          s: 0,
          side: 1,
          type: 'restaurant',
          used: false,
          zoneFlash: 0,
          pulsePhase: Math.random() * Math.PI * 2
        });
      }
    }
    resetExits();
    // Если заезд начинается с пустым баком, ближайшая АЗС должна быть рядом
    if (G.fuelM <= 0) spawnEmergencyFuelExit();

    if (activeOrder) {
      activeOrder.targetS = G.playerS + Math.max(60, activeOrder.remainingM || 60);
    }
    deliveryMarker.visible = !!activeOrder;
    clearArmedExit();
    syncExitTrack();
    updateEcoHud(performance.now());
    saveEco();
  }
  G.prepareRunEconomy = prepareRunEconomy;

  function tickEconomy(dt, traveled) {
    if (traveled > 0) {
      if (G.fuelM > 0) G.fuelM = Math.max(0, G.fuelM - traveled);
      for (const part of Object.keys(WEAR_LIMITS)) {
        wearM[part] = Math.min(WEAR_LIMITS[part] * WEAR_CAP, wearM[part] + traveled);
      }
    }
    ecoSaveTimer += dt;
    if (ecoSaveTimer >= 3) {
      ecoSaveTimer = 0;
      saveEco();
    }
    if (G.fuelM <= 0 && !G.limpMode && !G.uiModal) {
      G.speed = 0;
      G.keys.gas = false;
      openFuelEmpty();
    }
  }
  G.tickEconomy = tickEconomy;

  function updateEcoHud(now) {
    if (now - lastEcoHudDraw < 100) return;
    lastEcoHudDraw = now;
    if (!$('eco-fuel-val')) return;

    const fuelPct = fuelPercent();
    $('eco-fuel-val').textContent = Math.round(fuelPct) + '%';
    const fuelBar = $('eco-fuel-bar');
    fuelBar.style.width = fuelPct.toFixed(1) + '%';
    fuelBar.className = fuelPct < 12 ? 'low' : (fuelPct < 32 ? 'mid' : '');

    for (const p of ['pads', 'oil', 'plugs']) {
      const left = getWearLeftPct(p);
      const val = $('wear-' + p + '-val');
      const bar = $('wear-' + p + '-bar');
      if (val) val.textContent = `${WEAR_ICONS[p]} ${Math.round(left)}%`;
      if (bar) {
        bar.style.width = Math.max(2, left).toFixed(0) + '%';
        bar.className = left < 20 ? 'low' : (left < 45 ? 'mid' : '');
      }
    }

    $('eco-bank').textContent = rubles(G.bankPoints);

    const orderHud = $('order-hud');
    if (activeOrder) {
      orderHud.hidden = false;
      orderHud.classList.toggle('late', activeOrder.timeLeft <= 0);
      $('order-title').textContent = `🍔 ЗАКАЗ · ${activeOrder.restaurant}`;
      $('order-time').textContent = activeOrder.timeLeft >= 0
        ? formatClock(activeOrder.timeLeft)
        : '−' + formatClock(-activeOrder.timeLeft);
      $('order-dist').textContent = meters(Math.max(0, activeOrder.remainingM));
      const est = orderPayout(activeOrder);
      $('order-reward').textContent = '~' + rubles(est);
    } else {
      orderHud.hidden = true;
    }
  }
  G.updateEcoHud = updateEcoHud;

  $('btn-take-exit').addEventListener('click', e => {
    e.preventDefault();
    armExit();
  });

  $('btn-pause').addEventListener('click', e => {
    e.preventDefault();
    if (G.started && !G.ended && !G.uiModal) togglePause();
  });
}
