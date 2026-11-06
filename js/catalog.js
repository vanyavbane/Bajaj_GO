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

  // Фиксированные цены и характеристики строго по ТЗ
  G.bikeCatalog = [
    { id: 'ns125',      name: 'Bajaj Pulsar NS125',       vType: 'bike', typeLabel: 'Мотоцикл',               maxSpeed: 127, price: 0,     color: 0xcbd0d6, accent: 0xd9363e, accel: 26, massFactor: 1.0 },
    { id: 'ns200',      name: 'Bajaj Pulsar NS200',       vType: 'bike', typeLabel: 'Мотоцикл',               maxSpeed: 140, price: 1000,  color: 0xc62832, accent: 0xff5252, accel: 31, massFactor: 1.0 },
    { id: 'n250',       name: 'Bajaj Pulsar N250',        vType: 'bike', typeLabel: 'Мотоцикл',               maxSpeed: 155, price: 1500,  color: 0x17191d, accent: 0xe53935, accel: 36, massFactor: 1.0 },
    { id: 'dominar400', name: 'Bajaj Dominar 400',        vType: 'bike', typeLabel: 'Мотоцикл',               maxSpeed: 180, price: 3000,  color: 0x1b5e3a, accent: 0x69f0ae, accel: 44, massFactor: 1.0 },
    { id: 'dominar1000',name: 'Bajaj Dominar 1000RR',     vType: 'bike', typeLabel: 'Мотоцикл',               maxSpeed: 380, price: 10000, color: 0x10141d, accent: 0xffab00, accel: 82, massFactor: 1.0 },
    { id: 'qute',       name: 'Bajaj Qute',               vType: 'qute', typeLabel: 'Квадрицикл',             maxSpeed: 120, price: 1800,  color: 0xffca28, accent: 0x263238, accel: 22, massFactor: 0.84, swatches: quteColorSwatches },
    { id: 'qute_yura',  name: 'Bajaj Qute ЮРЫ ВОЛКОВА',   vType: 'yura', typeLabel: 'Квадрицикл (заряженный)',maxSpeed: 350, price: 15000, color: 0x161224, accent: 0x00e5ff, accel: 78, massFactor: 1.08, swatches: yuraColorSwatches }
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

  const storedBank = Number(localStorage.getItem('bajajGO_bank'));
  G.bankPoints = Number.isFinite(storedBank) && storedBank > 0 ? Math.floor(storedBank) : 0;
  G.ownedBikes = [];
  try {
    G.ownedBikes = JSON.parse(localStorage.getItem('bajajGO_owned') || '["ns125"]');
    if (!Array.isArray(G.ownedBikes) || !G.ownedBikes.length) G.ownedBikes = ['ns125'];
  } catch {
    G.ownedBikes = ['ns125'];
  }
  G.selectedBikeId = localStorage.getItem('bajajGO_selected') || 'ns125';
  if (!G.bikeCatalog.some(b => b.id === G.selectedBikeId)) G.selectedBikeId = 'ns125';

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
