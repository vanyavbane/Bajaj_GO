import * as THREE from 'three';
import { G } from './state.js';

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
    restaurant: { title: 'РЕСТОРАНЫ', sub: 'ДОСТАВКА ЕДЫ', badge: 'FOOD' },
    fuel:       { title: 'АЗС',       sub: 'ЗАПРАВКА · 500 ₽', badge: 'FUEL' },
    sto:        { title: 'СТО',       sub: 'РЕМОНТ И ОБСЛУЖИВАНИЕ', badge: 'STO' },
    tuning:     { title: 'ТЮНИНГ',    sub: 'УЛУЧШЕНИЯ МОТОЦИКЛА', badge: 'TUNE' }
  };

  /* ---------- Персистентное состояние экономики ---------- */
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
        wearM[p] = Number.isFinite(v) ? clamp(v, 0, WEAR_LIMITS[p] * 3) : 0;
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
  // Зона стоит в полосе съезда перед указателем; длина 5.4 м (ТЗ: 3–6 м)
  const EXIT_ZONE_WIDTH = 4.8;
  const EXIT_ZONE_LENGTH = 5.4;
  const EXIT_ZONE_OFFSET = 12.5; // центр зоны на 12.5 м раньше центра съезда
  let exitPulseT = 0;
  let exitHintTimer = null;

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
      ctx.font = '900 54px system-ui,"Segoe UI",Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(EXIT_HINT_LABELS[type], w / 2, h / 2 + 2);
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
    label.position.set(0, 1.42, 0);
    label.scale.set(3.8, 0.95, 1);
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

  function showExitHint(exit) {
    const el = $('exit-hint');
    if (!el) return;
    const isFood = exit.type === 'restaurant';
    $('exit-hint-ico').textContent = EXIT_HINT_ICONS[exit.type];
    $('exit-hint-text').textContent = EXIT_HINT_LABELS[exit.type] + ' · СЪЕЗД';
    $('exit-hint-arr').textContent = exit.side > 0 ? '→' : '←';
    el.className = 'show' + (isFood ? '' : ' service');
    if (exitHintTimer) clearTimeout(exitHintTimer);
    exitHintTimer = setTimeout(() => {
      el.className = isFood ? '' : 'service';
    }, 1900);
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
      e.zoneEntered = false;
      e.zoneFlash = 0;
      e.pulsePhase = Math.random() * Math.PI * 2;
      updateExitSign(e);
      s += EXIT_MIN_GAP + Math.random() * (EXIT_MAX_GAP - EXIT_MIN_GAP);
    }
  }

  function updateExitWorld(dt = 0) {
    exitPulseT += dt;
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
        e.zoneEntered = false;
        e.zoneFlash = 0;
        e.pulsePhase = Math.random() * Math.PI * 2;
        updateExitSign(e);
      }
      G.placeOnRoad(e.group, e.s, e.side * 12.6, 0);

      // Маркерная зона в полосе съезда: пульсирует, к ночи светится ярче
      const zoneS = e.s - EXIT_ZONE_OFFSET;
      G.placeOnRoad(e.marker, zoneS, e.side * 7.1, 0.07);
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

      // Отклик при въезде в зону: вспышка, подсказка и короткий звук
      if (G.started && !G.ended && !G.uiModal && !G.paused && !e.used) {
        const aligned = Math.abs(G.laneOffset - e.side * 7.1) < 2.6;
        const dx = G.playerS - zoneS;
        if (!e.zoneEntered && aligned && Math.abs(dx) < EXIT_ZONE_LENGTH * 0.5) {
          e.zoneEntered = true;
          e.zoneFlash = 1;
          showExitHint(e);
          G.playExitChime(e.type === 'restaurant');
        }
        if (Math.abs(dx) > EXIT_ZONE_LENGTH * 0.5 + 10) e.zoneEntered = false;
      }
    }

    // Съезд срабатывает, когда игрок прижимается к нужному краю дороги
    if (G.started && !G.ended && !G.uiModal && !G.paused) {
      for (const e of exitPool) {
        if (e.used) continue;
        const onSide = e.side > 0 ? G.laneOffset > 7.45 : G.laneOffset < -7.45;
        if (onSide && Math.abs(G.playerS - e.s) < 11) {
          e.used = true;
          openExitMenu(e);
          break;
        }
      }
    }
  }
  G.updateExitWorld = updateExitWorld;

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

  function updateDeliveryMarker() {
    if (activeOrder && activeOrder.targetS != null) {
      deliveryMarker.visible = true;
      G.placeOnRoad(deliveryMarker, activeOrder.targetS, 7.1, 0);
    } else {
      deliveryMarker.visible = false;
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
    return `<button class="secondary" id="poi-close">← ПРОДОЛЖИТЬ ПУТЬ</button>`;
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
    const rows = RESTAURANTS.map((r, i) => {
      const busy = !!activeOrder;
      return `
        <button class="poi-row ${busy ? 'disabled' : ''}" data-rest="${i}" ${busy ? 'disabled' : ''}>
          <div class="poi-ico">${r.badge}</div>
          <div class="poi-body">
            <span>${r.name}</span>
            <small>${busy ? 'Сначала доставьте текущий заказ' : 'Взять заказ на доставку'}</small>
          </div>
          <div class="poi-price">${busy ? '—' : 'ЗАКАЗ'}</div>
        </button>`;
    }).join('');

    openModal(`
      <div class="modal-card poi-card">
        <h2 class="poi-title">🍔 РЕСТОРАНЫ</h2>
        <div class="poi-sub">СЪЕЗД · ДОСТАВКА ЕДЫ</div>
        ${activeOrder ? `<div class="poi-note">Активный заказ: <b>${activeOrder.restaurant}</b><br>Осталось ${formatClock(activeOrder.timeLeft)} · ${Math.max(0, Math.ceil(activeOrder.remainingM))} м до заказчика.</div>` : ''}
        ${message ? `<div class="tuning-msg ok">${message}</div>` : ''}
        <div class="poi-list">${rows}</div>
        ${exitMenuBackButton()}
      </div>
    `, 'exit');

    document.querySelectorAll('[data-rest]').forEach(btn => {
      if (!(btn instanceof HTMLElement)) return;
      btn.addEventListener('click', () => {
        if (activeOrder) return;
        const r = RESTAURANTS[Number(btn.dataset.rest)];
        createOrder(r.name);
        closeOverlayToGame();
        showEcoToast(`🍔 Заказ принят: ${r.name} · ${Math.round(activeOrder.remainingM)} м · ${formatClock(activeOrder.timeLimit)}`);
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
      const penalty = Math.min(Math.floor(G.bankPoints), Math.max(100, Math.round(activeOrder.baseReward * 0.25)));
      G.bankPoints -= penalty;
      activeOrder.penaltyApplied = true;
      G.saveGarage();
      saveEco();
      showEcoToast(`⏱ ПРОСРОЧКА! Штраф −${penalty} ₽ · заказ всё равно нужно доставить`, true);
    }

    activeOrder.remainingM = Math.max(0, activeOrder.targetS - G.playerS);
    if (activeOrder.remainingM <= 0) deliverOrder();
  }
  G.tickOrder = tickOrder;

  function deliverOrder() {
    if (!activeOrder) return;
    const frac = clamp(activeOrder.timeLeft / activeOrder.timeLimit, 0, 1);
    const reward = Math.round(activeOrder.baseReward * (0.45 + 0.55 * frac));
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
    showEcoToast(`✅ Заказ «${name}» доставлен · +${reward} ₽ на баланс`);
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
    const pct = Math.round(clamp(G.fuelM / FUEL_RANGE_M, 0, 1) * 100);
    const full = G.fuelM >= FUEL_RANGE_M - 1;
    const canPay = G.bankPoints >= REFUEL_PRICE;

    openModal(`
      <div class="modal-card poi-card">
        <h2 class="poi-title">⛽ АЗС</h2>
        <div class="poi-sub">СЪЕЗД · ЗАПРАВКА</div>
        <div class="poi-balance">Баланс: ${Math.floor(G.bankPoints).toLocaleString('ru-RU')} ₽</div>
        ${opts.message ? `<div class="tuning-msg ok">${opts.message}</div>` : ''}
        <div class="poi-note">
          ${opts.viaTow ? 'Эвакуатор доставил вас на ближайшую АЗС.<br>' : ''}
          Бак: <b>${pct}%</b> · запас хода ≈ <b>${Math.round(G.fuelM).toLocaleString('ru-RU')} м</b>.<br>
          Полного бака хватает на ${FUEL_RANGE_M.toLocaleString('ru-RU')} м.
        </div>
        <button class="primary ${(!canPay || full) ? 'disabled' : ''}" id="fuel-fill" ${(!canPay || full) ? 'disabled' : ''}>
          ${full ? 'БАК ПОЛОН' : `ЗАЛИТЬ ПОЛНЫЙ БАК — ${REFUEL_PRICE} ₽`}
        </button>
        ${(!canPay && !full) ? `<div class="poi-note">Не хватает ${Math.ceil(REFUEL_PRICE - G.bankPoints).toLocaleString('ru-RU')} ₽.</div>` : ''}
        ${exitMenuBackButton()}
      </div>
    `, 'exit');

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

    openModal(`
      <div class="modal-card poi-card">
        <h2 class="poi-title">⛽ БЕНЗИН ЗАКОНЧИЛСЯ</h2>
        <div class="poi-sub">МОТОЦИКЛ ЗАГЛОХ · ВЫБЕРИТЕ ДЕЙСТВИЕ</div>
        <div class="poi-balance">Баланс: ${Math.floor(G.bankPoints).toLocaleString('ru-RU')} ₽</div>
        <div class="poi-note">
          Можно вызвать эвакуатор до ближайшей АЗС за <b>${TOW_PRICE} ₽</b> (заправка на месте — ещё ${REFUEL_PRICE} ₽)
          или отказаться и ехать своим ходом с ограничением <b>${G.LIMP_MAX_SPEED} км/ч</b>.
        </div>
        <button class="primary ${canPay ? '' : 'disabled'}" id="fuel-tow" ${canPay ? '' : 'disabled'}>
          🚐 ЭВАКУАТОР ДО АЗС — ${TOW_PRICE} ₽
        </button>
        ${canPay ? '' : `<div class="poi-note">Не хватает ${Math.ceil(TOW_PRICE - G.bankPoints).toLocaleString('ru-RU')} ₽ на эвакуатор.</div>`}
        <button class="secondary" id="fuel-selftow">ОТКАЗАТЬСЯ · ЕХАТЬ СВОИМ ХОДОМ (${G.LIMP_MAX_SPEED} КМ/Ч)</button>
      </div>
    `, 'critical');

    $('fuel-tow').addEventListener('click', () => {
      if (G.bankPoints < TOW_PRICE) return;
      G.bankPoints -= TOW_PRICE;
      G.saveGarage();
      G.playerS += 120;
      G.laneOffset = 7.1;
      G.lateralVelocity = 0;
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
    const rows = ['pads', 'oil', 'plugs'].map(part => {
      const left = getWearLeftPct(part);
      const price = getServicePrice(part);
      const needed = wearM[part] >= 300;
      const canPay = G.bankPoints >= price;
      const disabled = !needed || !canPay;
      return `
        <button class="poi-row ${disabled ? 'disabled' : ''}" data-service="${part}" ${disabled ? 'disabled' : ''}>
          <div class="poi-ico">${WEAR_ICONS[part]}</div>
          <div class="poi-body">
            <span>${WEAR_LABELS[part]}</span>
            <small>Осталось ${Math.round(left)}% · замена каждые ${WEAR_LIMITS[part].toLocaleString('ru-RU')} м${(!needed ? ' · пока не требуется' : (!canPay ? ' · не хватает денег' : ''))}</small>
          </div>
          <div class="poi-price">${needed ? price.toLocaleString('ru-RU') + ' ₽' : 'НОРМА'}</div>
        </button>`;
    }).join('');

    openModal(`
      <div class="modal-card poi-card">
        <h2 class="poi-title">🔧 СТО</h2>
        <div class="poi-sub">СЪЕЗД · РЕМОНТ И ОБСЛУЖИВАНИЕ</div>
        <div class="poi-balance">Баланс: ${Math.floor(G.bankPoints).toLocaleString('ru-RU')} ₽ · ${bike.name}</div>
        ${message ? `<div class="tuning-msg ok">${message}</div>` : ''}
        <div class="poi-note">Изношенные детали ухудшают торможение, динамику и максимальную скорость. После замены ресурс сбрасывается на 100%.</div>
        <div class="poi-list">${rows}</div>
        ${exitMenuBackButton()}
      </div>
    `, 'exit');

    document.querySelectorAll('[data-service]').forEach(btn => {
      if (!(btn instanceof HTMLElement)) return;
      btn.addEventListener('click', () => {
        const part = btn.dataset.service;
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
      let statusBadge = '';
      let actionBtn = '';
      if (installed) {
        statusBadge = `<span class="tune-price" style="color:#69f0ae">✓ Установлено</span>`;
        actionBtn = `<button class="tune-btn installed-btn" data-toggle-upg="${upg.id}">УСТАНОВЛЕНО ✓</button>`;
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
        </div>`;
    }).join('');

    openModal(`
      <div class="modal-card poi-card">
        <h2 class="poi-title">🔧 ТЮНИНГ</h2>
        <div class="poi-sub">СЪЕЗД · ДОВОДКА ТЕКУЩЕГО МОТОЦИКЛА</div>
        <div class="poi-balance">Баланс: ${Math.floor(G.bankPoints).toLocaleString('ru-RU')} ₽ · ${bike.name} · макс. ${eff.maxSpeed} км/ч</div>
        ${message ? `<div class="tuning-msg ${statusType}">${message}</div>` : ''}
        <div class="poi-list">${cardsHtml}</div>
        ${exitMenuBackButton()}
      </div>
    `, 'exit');

    document.querySelectorAll('[data-buy-upg]').forEach(btn => {
      if (!(btn instanceof HTMLElement)) return;
      btn.addEventListener('click', () => {
        const upg = G.tuningCatalog.find(u => u.id === btn.dataset.buyUpg);
        if (!upg) return;
        const price = G.getUpgradePrice(bike, upg);
        if (G.bankPoints < price) {
          renderExitTuning(`⚠ Не хватает ${Math.ceil(price - G.bankPoints).toLocaleString('ru-RU')} ₽ на «${upg.shortName}»`, 'err');
          return;
        }
        G.bankPoints -= price;
        const rec = G.getBikeTuningRecord(bike.id);
        if (!rec.owned.includes(upg.id)) rec.owned.push(upg.id);
        if (!rec.installed.includes(upg.id)) rec.installed.push(upg.id);
        G.saveGarage();
        G.syncVehicleAndCameraVisibility(true);
        renderExitTuning(`✓ «${upg.shortName}» куплено и установлено!`, 'ok');
      });
    });

    document.querySelectorAll('[data-toggle-upg]').forEach(btn => {
      if (!(btn instanceof HTMLElement)) return;
      btn.addEventListener('click', () => {
        const upg = G.tuningCatalog.find(u => u.id === btn.dataset.toggleUpg);
        if (!upg) return;
        const rec = G.getBikeTuningRecord(bike.id);
        if (!rec.owned.includes(upg.id)) return;
        const idx = rec.installed.indexOf(upg.id);
        let msg = '';
        if (idx >= 0) {
          rec.installed.splice(idx, 1);
          msg = `Деталь «${upg.shortName}» снята (остаётся в гараже)`;
        } else {
          rec.installed.push(upg.id);
          msg = `✓ Деталь «${upg.shortName}» установлена`;
        }
        G.saveGarage();
        G.syncVehicleAndCameraVisibility(true);
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

    openModal(`
      <div class="modal-card poi-card">
        <h2 class="poi-title">💥 ДТП</h2>
        <div class="poi-sub">У ВАС АКТИВНЫЙ ЗАКАЗ · ВЫБЕРИТЕ ДЕЙСТВИЕ</div>
        <div class="poi-balance">Баланс: ${Math.floor(G.bankPoints).toLocaleString('ru-RU')} ₽</div>
        <div class="poi-note">
          Скорая помощь и лекарства стоят <b>${MEDKIT_PRICE} ₽</b>. После оплаты заезд продолжается,
          заказ «${activeOrder.restaurant}» сохраняется.
        </div>
        <button class="primary ${canPay ? '' : 'disabled'}" id="acc-med" ${canPay ? '' : 'disabled'}>
          🚑 СКОРАЯ + ЛЕКАРСТВА — ${MEDKIT_PRICE} ₽
        </button>
        ${canPay ? '' : `<div class="poi-note">Недостаточно денег на лекарства (${Math.ceil(MEDKIT_PRICE - G.bankPoints).toLocaleString('ru-RU')} ₽). Остаётся только закончить заезд.</div>`}
        <button class="secondary" id="acc-end">ОТКАЗАТЬСЯ · ЗАЕЗД ЗАКОНЧИТСЯ</button>
      </div>
    `, 'critical');

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
      showEcoToast(`🚑 Лекарства куплены (−${MEDKIT_PRICE} ₽). Заказ сохранён`, false);
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

    const isDlss = G.lightingQuality === 'dlss';
    const orderLine = activeOrder
      ? `<div><span>Заказ:</span><b>${activeOrder.restaurant} · ${formatClock(activeOrder.timeLeft)}</b></div>`
      : `<div><span>Заказ:</span><b>нет</b></div>`;

    overlay.innerHTML = `
      <div class="modal-card pause-card">
        <h2 class="poi-title">⏸ ПАУЗА</h2>
        <div class="poi-sub">ЗАЕЗД ПРИОСТАНОВЛЕН · ТАЙМЕРЫ СТОЯТ</div>
        <div class="pause-stats">
          <div><span>Пробег:</span><b>${G.distance.toFixed(2)} км</b></div>
          <div><span>Заработано за заезд:</span><b>${Math.floor(G.score).toLocaleString('ru-RU')} ₽</b></div>
          <div><span>Баланс:</span><b>${Math.floor(G.bankPoints).toLocaleString('ru-RU')} ₽</b></div>
          <div><span>Топливо:</span><b>${Math.round(clamp(G.fuelM / FUEL_RANGE_M, 0, 1) * 100)}%</b></div>
          ${orderLine}
        </div>
        ${showSettings ? `
          <div class="pause-stats">
            <div>
              <span>Качество освещения</span>
              <button class="secondary" id="pause-quality" style="width:auto;margin:0;padding:5px 10px;font-size:11px">${isDlss ? 'DLSS-стиль' : 'Обычное'}</button>
            </div>
            <div>
              <span>Камера</span>
              <button class="secondary" id="pause-cam" style="width:auto;margin:0;padding:5px 10px;font-size:11px">${G.cameraMode === 'cockpit' ? 'Кокпит' : '3-е лицо'}</button>
            </div>
          </div>
          <button class="secondary" id="pause-settings-back">← НАЗАД</button>
        ` : `
          <button class="secondary" id="pause-settings">⚙ НАСТРОЙКИ</button>
        `}
        <button class="primary" id="pause-resume">▶ ПРОДОЛЖИТЬ</button>
        <button class="secondary" id="pause-menu">В ГЛАВНОЕ МЕНЮ</button>
      </div>
    `;

    $('pause-resume').addEventListener('click', resumeGame);
    $('pause-menu').addEventListener('click', exitToMenuFromPause);
    if (showSettings) {
      $('pause-settings-back').addEventListener('click', () => renderPauseMenu(false));
      $('pause-quality').addEventListener('click', () => {
        G.lightingQuality = (G.lightingQuality === 'dlss') ? 'normal' : 'dlss';
        G.saveGarage();
        G.applyLightingSettings();
        renderPauseMenu(true);
      });
      $('pause-cam').addEventListener('click', () => {
        G.toggleCameraMode();
        renderPauseMenu(true);
      });
    } else {
      $('pause-settings').addEventListener('click', () => renderPauseMenu(true));
    }
  }

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
    G.bankPoints += Math.max(0, Math.floor(G.score) - G.bankedOrderRun);
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
          zoneEntered: false,
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
    updateEcoHud(performance.now());
    saveEco();
  }
  G.prepareRunEconomy = prepareRunEconomy;

  function tickEconomy(dt, meters) {
    if (meters > 0) {
      if (G.fuelM > 0) G.fuelM = Math.max(0, G.fuelM - meters);
      wearM.pads = Math.min(WEAR_LIMITS.pads * 3, wearM.pads + meters);
      wearM.oil = Math.min(WEAR_LIMITS.oil * 3, wearM.oil + meters);
      wearM.plugs = Math.min(WEAR_LIMITS.plugs * 3, wearM.plugs + meters);
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

    const fuelPct = clamp(G.fuelM / FUEL_RANGE_M, 0, 1) * 100;
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

    $('eco-bank').textContent = Math.floor(G.bankPoints).toLocaleString('ru-RU') + ' ₽';

    const orderHud = $('order-hud');
    if (activeOrder) {
      orderHud.hidden = false;
      orderHud.classList.toggle('late', activeOrder.timeLeft <= 0);
      $('order-title').textContent = `🍔 ЗАКАЗ · ${activeOrder.restaurant}`;
      $('order-time').textContent = activeOrder.timeLeft >= 0
        ? formatClock(activeOrder.timeLeft)
        : '−' + formatClock(-activeOrder.timeLeft);
      $('order-dist').textContent = Math.max(0, Math.ceil(activeOrder.remainingM)) + ' м';
      const est = Math.round(activeOrder.baseReward * (0.45 + 0.55 * clamp(activeOrder.timeLeft / activeOrder.timeLimit, 0, 1)));
      $('order-reward').textContent = '~' + est.toLocaleString('ru-RU') + ' ₽';
    } else {
      orderHud.hidden = true;
    }
  }
  G.updateEcoHud = updateEcoHud;

  $('btn-pause').addEventListener('click', e => {
    e.preventDefault();
    if (G.started && !G.ended && !G.uiModal) togglePause();
  });
}
