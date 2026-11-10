import { shortfall } from './engine/money.js';
import { isQuteBody, isYuraType } from './engine/vehicle.js';
import { G } from './state.js';

export function initCatalog() {

  /* =========================================================================
   * 1. КАТАЛОГ ТЕХНИКИ (ФИКСИРОВАННЫЕ ЦЕНЫ) И СИСТЕМА ТЮНИНГА
   * ========================================================================= */
  const quteColorSwatches = [
    { name: 'Жёлтый', hex: 0xffca28 },
    { name: 'Белый',  hex: 0xf5f7fa },
    { name: 'Красный',hex: 0xe53935 },
    { name: 'Синий',  hex: 0x1e88e5 }
  ];

  const yuraColorSwatches = [
    { name: 'Фиолетовый неон', hex: 0x161224 },
    { name: 'Кибер-золото',    hex: 0x1b1f14 },
    { name: 'Кровавый хром',   hex: 0x260c12 }
  ];

  // Фиксированные цены и характеристики строго по ТЗ.
  //
  // Ценовая шкала (ТЗ «Добавление мотоциклов»):
  //  • Pulsar NS125 теперь платный стартовый мотоцикл — 850 ₽.
  //  • Boxer 100 ES — бесплатная альтернатива для новичка (0 ₽).
  //  • Boxer 125 / 150 — рекомендованные абсолютные цены из таблицы ТЗ (150 / 250 ₽).
  //    В ТЗ есть оговорка: «дешевле Pulsar на 150 ₽» при цене Pulsar 850 ₽ дало бы 700 ₽,
  //    но канонической считается таблица рекомендуемых абсолютных цен.
  //  • Pulsar 150 NS / 180 / Avenger 220 — цены из таблицы ТЗ (150 / 180 / 220 ₽):
  //    это «+N ₽ к базовой цене Pulsar» в трактовке ТЗ, где за базу взята отметка 0 ₽.
  //  • Dominar 250 — ровно на 100 ₽ дороже N250 (1500 + 100 = 1600 ₽).
  //  • variant — какую внешнюю модель строить: 'pulsar' | 'boxer' | 'avenger'.
  //  • hudStyle — 'round' рисует аналоговый спидометр + одометр, 'digital' — штатную панель.
  G.bikeCatalog = [
    { id: 'ns125',      name: 'Bajaj Pulsar NS125',       vType: 'bike', typeLabel: 'Мотоцикл',               maxSpeed: 127, price: 850,   color: 0xcbd0d6, accent: 0xd9363e, accel: 26, massFactor: 1.0,  variant: 'pulsar',  hudStyle: 'digital' },
    { id: 'ns200',      name: 'Bajaj Pulsar NS200',       vType: 'bike', typeLabel: 'Мотоцикл',               maxSpeed: 140, price: 1000,  color: 0xc62832, accent: 0xff5252, accel: 31, massFactor: 1.0,  variant: 'pulsar',  hudStyle: 'digital' },
    { id: 'n250',       name: 'Bajaj Pulsar N250',        vType: 'bike', typeLabel: 'Мотоцикл',               maxSpeed: 155, price: 1500,  color: 0x17191d, accent: 0xe53935, accel: 36, massFactor: 1.0,  variant: 'pulsar',  hudStyle: 'digital' },
    { id: 'dominar400', name: 'Bajaj Dominar 400',        vType: 'bike', typeLabel: 'Мотоцикл',               maxSpeed: 180, price: 3000,  color: 0x1b5e3a, accent: 0x69f0ae, accel: 44, massFactor: 1.0,  variant: 'pulsar',  hudStyle: 'digital' },
    { id: 'dominar1000',name: 'Bajaj Dominar 1000RR',     vType: 'bike', typeLabel: 'Мотоцикл',               maxSpeed: 380, price: 10000, color: 0x10141d, accent: 0xffab00, accel: 82, massFactor: 1.0,  variant: 'pulsar',  hudStyle: 'digital' },
    { id: 'qute',       name: 'Bajaj Qute',               vType: 'qute', typeLabel: 'Квадрицикл',             maxSpeed: 120, price: 1800,  color: 0xffca28, accent: 0x263238, accel: 22, massFactor: 0.84, variant: 'pulsar',  hudStyle: 'digital', swatches: quteColorSwatches },
    { id: 'qute_yura',  name: 'Bajaj Qute ЮРЫ ВОЛКОВА',   vType: 'yura', typeLabel: 'Квадрицикл (заряженный)',maxSpeed: 350, price: 15000, color: 0x161224, accent: 0x00e5ff, accel: 78, massFactor: 1.08, variant: 'pulsar',  hudStyle: 'digital', swatches: yuraColorSwatches },

    // --- 7 новых мотоциклов (ТЗ v19) ---
    { id: 'boxer100es', name: 'Bajaj Boxer 100 ES',       vType: 'bike', typeLabel: 'Мотоцикл',               maxSpeed: 90,  price: 0,     color: 0x1a1a1a, accent: 0xd4a017, accel: 18, massFactor: 1.0,  variant: 'boxer',   hudStyle: 'round'   },
    { id: 'boxer125',   name: 'Bajaj Boxer 125',          vType: 'bike', typeLabel: 'Мотоцикл',               maxSpeed: 110, price: 150,   color: 0x1c2b3a, accent: 0xd4a017, accel: 22, massFactor: 1.0,  variant: 'boxer',   hudStyle: 'round'   },
    { id: 'boxer150',   name: 'Bajaj Boxer 150',          vType: 'bike', typeLabel: 'Мотоцикл',               maxSpeed: 127, price: 250,   color: 0x5a1b1b, accent: 0xc9a227, accel: 26, massFactor: 1.0,  variant: 'boxer',   hudStyle: 'round'   },
    { id: 'pulsar150ns',name: 'Bajaj Pulsar 150 NS',      vType: 'bike', typeLabel: 'Мотоцикл',               maxSpeed: 130, price: 150,   color: 0x1f2f4a, accent: 0xff5252, accel: 27, massFactor: 1.0,  variant: 'pulsar',  hudStyle: 'digital' },
    { id: 'pulsar180',  name: 'Bajaj Pulsar 180',         vType: 'bike', typeLabel: 'Мотоцикл',               maxSpeed: 132, price: 180,   color: 0x2a1a2e, accent: 0xffb300, accel: 28, massFactor: 1.0,  variant: 'pulsar',  hudStyle: 'digital' },
    { id: 'avenger220', name: 'Bajaj Avenger 220',        vType: 'bike', typeLabel: 'Мотоцикл',               maxSpeed: 135, price: 220,   color: 0x0a0a0a, accent: 0x8b0000, accel: 30, massFactor: 1.0,  variant: 'avenger', hudStyle: 'round'   },
    { id: 'dominar250', name: 'Bajaj Dominar 250',        vType: 'bike', typeLabel: 'Мотоцикл',               maxSpeed: 155, price: 1600,  color: 0xa5d6a7, accent: 0x66bb6a, accel: 36, massFactor: 1.0,  variant: 'pulsar',  hudStyle: 'digital' }
  ];

  // Каталог из 8 улучшений тюнинга (базовые эталонные цены указаны для Bajaj Pulsar NS125)
  G.tuningCatalog = [
    {
      id: 'zero_filter',
      name: 'Установить нулевик (фильтр нулевого сопротивления)',
      shortName: 'Фильтр-нулевик',
      icon: '🌀',
      basePrice: 500,
      speedBonus: 5,
      accelMult: 0,
      brakeMult: 0,
      effectLabel: '+5 км/ч к макс. скорости',
      desc: 'Спортивный конусный фильтр снижает сопротивление на впуске и добавляет визуальный фильтр сбоку двигателя.'
    },
    {
      id: 'carb_replace',
      name: 'Заменить карбюратор',
      shortName: 'Спортивный карбюратор',
      icon: '⚙️',
      basePrice: 3000,
      speedBonus: 10,
      accelMult: 0,
      brakeMult: 0,
      effectLabel: '+10 км/ч к макс. скорости',
      desc: 'Производительный плоскодроссельный карбюратор увеличенного диффузора. Отображается на блоке двигателя.'
    },
    {
      id: 'carb_tune',
      name: 'Подкрутить карбюратор',
      shortName: 'Настройка карбюратора',
      icon: '🪛',
      basePrice: 300,
      speedBonus: 5,
      accelMult: 0,
      brakeMult: 0,
      effectLabel: '+5 км/ч к макс. скорости',
      desc: 'Точная настройка качества топливно-воздушной смеси и жиклёров под максимальную отдачу.'
    },
    {
      id: 'iridium_plugs',
      name: 'Поставить иридиевые свечи',
      shortName: 'Иридиевые свечи',
      icon: '⚡',
      basePrice: 800,
      speedBonus: 2,
      accelMult: 0,
      brakeMult: 0,
      effectLabel: '+2 км/ч к макс. скорости',
      desc: 'Стабильное искрообразование на высоких оборотах и высоковольтный колпачок свечи.'
    },
    {
      id: 'speed_sprocket',
      name: 'Поставить скоростную звезду',
      shortName: 'Скоростная звезда',
      icon: '⛓️',
      basePrice: 1500,
      speedBonus: 15,
      accelMult: 0,
      brakeMult: 0,
      effectLabel: '+15 км/ч к макс. скорости',
      desc: 'Изменённое передаточное число главной передачи для максимальной скорости на прямых. Видна на заднем колесе.'
    },
    {
      id: 'wide_tires',
      name: 'Поставить более широкую резину',
      shortName: 'Широкая резина',
      icon: '🛞',
      basePrice: 2500,
      speedBonus: 0,
      accelMult: 0.24,
      brakeMult: 0,
      effectLabel: '+24% к динамике разгона',
      desc: 'Увеличенное пятно контакта улучшает старт и динамику набора скорости. Колёса визуально становятся шире.'
    },
    {
      id: 'windshield',
      name: 'Поставить ветровое стекло',
      shortName: 'Дымчатое ветровое стекло',
      icon: '🛡️',
      basePrice: 1200,
      speedBonus: -2,
      accelMult: 0,
      brakeMult: 0,
      effectLabel: '-2 км/ч · Дымчатое стекло',
      isWarn: true,
      desc: 'Добавляет на выбранную модель прозрачное дымчатое ветровое стекло (видно снаружи и из кокпита), снижая максималку на 2 км/ч.'
    },
    {
      id: 'new_brakes',
      name: 'Поставить новые тормоза',
      shortName: 'Усиленные тормоза',
      icon: '🛑',
      basePrice: 900,
      speedBonus: 0,
      accelMult: 0,
      brakeMult: 0.42,
      effectLabel: '+42% к мощности торможения',
      desc: 'Увеличенные перфорированные тормозные диски и усиленные суппорты: значительно короче тормозной путь и увереннее замедление.'
    }
  ];

  // Эталонная стоимость NS125 для расчёта пропорции остальных мотоциклов (750 ₽, так как в магазине NS125 бесплатный — 0 ₽)
  const NS125_REF_PRICE = 750;

  function getUpgradePrice(bike, upgrade) {
    if (!bike || bike.id === 'ns125' || bike.price <= 0) {
      return upgrade.basePrice;
    }
    const ratio = bike.price / NS125_REF_PRICE;
    const raw = upgrade.basePrice * ratio;
    // Округление до 50 рублей (или до 10 при малых суммах)
    return raw >= 200 ? Math.round(raw / 50) * 50 : Math.round(raw / 10) * 10;
  }
  G.getUpgradePrice = getUpgradePrice;

  // Стартовый мотоцикл для новых игроков — бесплатный Boxer 100 ES.
  // Старые сохранения со списком ns125 продолжают работать как есть.
  const STARTER_BIKE_ID = 'boxer100es';
  const storedBank = Number(localStorage.getItem('bajajGO_bank'));
  G.bankPoints = Number.isFinite(storedBank) && storedBank > 0 ? Math.floor(storedBank) : 0;
  G.ownedBikes = [];
  try {
    G.ownedBikes = JSON.parse(localStorage.getItem('bajajGO_owned') || '["boxer100es"]');
    if (!Array.isArray(G.ownedBikes) || !G.ownedBikes.length) G.ownedBikes = [STARTER_BIKE_ID];
  } catch {
    G.ownedBikes = [STARTER_BIKE_ID];
  }
  // Чистим id, которых больше нет в каталоге, и гарантируем хотя бы один доступный байк.
  G.ownedBikes = G.ownedBikes.filter(id => G.bikeCatalog.some(b => b.id === id));
  if (!G.ownedBikes.length) G.ownedBikes = [STARTER_BIKE_ID];
  G.selectedBikeId = localStorage.getItem('bajajGO_selected') || STARTER_BIKE_ID;
  if (!G.bikeCatalog.some(b => b.id === G.selectedBikeId) || !G.ownedBikes.includes(G.selectedBikeId)) {
    G.selectedBikeId = G.ownedBikes[0];
  }

  G.customColors = {};
  try {
    G.customColors = JSON.parse(localStorage.getItem('bajajGO_colors') || '{}') || {};
  } catch {
    G.customColors = {};
  }

  // Хранилище тюнинга по каждому мотоциклу отдельно: { ns125: { owned: [...], installed: [...] }, ... }
  let bikeTuningData = {};
  try {
    bikeTuningData = JSON.parse(localStorage.getItem('bajajGO_tuning') || '{}') || {};
  } catch {
    bikeTuningData = {};
  }

  function getBikeTuningRecord(bikeId) {
    if (!bikeTuningData[bikeId] || typeof bikeTuningData[bikeId] !== 'object') {
      bikeTuningData[bikeId] = { owned: [], installed: [] };
    }
    if (!Array.isArray(bikeTuningData[bikeId].owned)) bikeTuningData[bikeId].owned = [];
    if (!Array.isArray(bikeTuningData[bikeId].installed)) bikeTuningData[bikeId].installed = [];
    return bikeTuningData[bikeId];
  }
  G.getBikeTuningRecord = getBikeTuningRecord;

  function hasUpgradeInstalled(bikeId, upgId) {
    return getBikeTuningRecord(bikeId).installed.includes(upgId);
  }
  G.hasUpgradeInstalled = hasUpgradeInstalled;

  function hasUpgradeOwned(bikeId, upgId) {
    return getBikeTuningRecord(bikeId).owned.includes(upgId);
  }
  G.hasUpgradeOwned = hasUpgradeOwned;

  function purchaseUpgrade(bike, upg) {
    const price = getUpgradePrice(bike, upg);
    if (G.bankPoints < price) return { ok: false, missing: shortfall(price, G.bankPoints) };
    G.bankPoints -= price;
    const rec = getBikeTuningRecord(bike.id);
    if (!rec.owned.includes(upg.id)) rec.owned.push(upg.id);
    if (!rec.installed.includes(upg.id)) rec.installed.push(upg.id);
    G.saveGarage();
    return { ok: true };
  }
  G.purchaseUpgrade = purchaseUpgrade;

  function toggleUpgrade(bike, upg) {
    const rec = getBikeTuningRecord(bike.id);
    if (!rec.owned.includes(upg.id)) return { ok: false, installed: false };
    const idx = rec.installed.indexOf(upg.id);
    if (idx >= 0) rec.installed.splice(idx, 1);
    else rec.installed.push(upg.id);
    G.saveGarage();
    return { ok: true, installed: idx < 0 };
  }
  G.toggleUpgrade = toggleUpgrade;

  // Итоговые характеристики мотоцикла с учётом установленного тюнинга
  function getBikeEffectiveStats(bikeId = G.selectedBikeId) {
    const base = G.bikeCatalog.find(x => x.id === bikeId) || G.bikeCatalog[0];
    const rec = getBikeTuningRecord(base.id);
    let speedDelta = 0;
    let accelBonusMult = 0;
    let brakeBonusMult = 0;
    let wideTires = false;
    let upgradedBrakes = false;

    for (const upg of G.tuningCatalog) {
      if (!rec.installed.includes(upg.id)) continue;
      speedDelta += upg.speedBonus;
      accelBonusMult += upg.accelMult;
      brakeBonusMult += upg.brakeMult;
      if (upg.id === 'wide_tires') wideTires = true;
      if (upg.id === 'new_brakes') upgradedBrakes = true;
    }

    const isYura = isYuraType(base.vType);
    const isQute = isQuteBody(base.vType);
    const baseBrakeDecel = isYura ? 84 : (isQute ? 76 : 95);

    return {
      baseMaxSpeed: base.maxSpeed,
      speedDelta,
      maxSpeed: Math.max(60, base.maxSpeed + speedDelta),
      baseAccel: base.accel,
      accelBonusPct: Math.round(accelBonusMult * 100),
      accel: base.accel * (1 + accelBonusMult),
      baseBrake: baseBrakeDecel,
      brakeBonusPct: Math.round(brakeBonusMult * 100),
      brakeDecel: baseBrakeDecel * (1 + brakeBonusMult),
      vType: base.vType,
      isQute,
      isYura,
      wideTires,
      upgradedBrakes,
      installedCount: rec.installed.length,
      ownedCount: rec.owned.length
    };
  }
  G.getBikeEffectiveStats = getBikeEffectiveStats;

  const savedCamera = localStorage.getItem('bajajGO_camera');
  G.cameraMode = savedCamera === 'third' ? 'third' : 'cockpit';

  function selectedBike() {
    return G.bikeCatalog.find(x => x.id === G.selectedBikeId) || G.bikeCatalog[0];
  }
  G.selectedBike = selectedBike;

  function saveGarage() {
    if (!Number.isFinite(G.bankPoints) || G.bankPoints < 0) G.bankPoints = 0;
    localStorage.setItem('bajajGO_bank', String(Math.floor(G.bankPoints)));
    localStorage.setItem('bajajGO_owned', JSON.stringify(G.ownedBikes));
    localStorage.setItem('bajajGO_selected', G.selectedBikeId);
    localStorage.setItem('bajajGO_lighting', JSON.stringify(G.graphics));
    localStorage.setItem('bajajGO_camera', G.cameraMode);
    localStorage.setItem('bajajGO_colors', JSON.stringify(G.customColors));
    localStorage.setItem('bajajGO_tuning', JSON.stringify(bikeTuningData));
  }
  G.saveGarage = saveGarage;
}
