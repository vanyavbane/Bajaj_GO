import { G } from './state.js';

/**
 * Пробег по каждому мотоциклу. Хранится отдельно от гаража в метрах:
 * { ns125: 12345, boxer100es: 670, ... }.
 * Счётчик только прибавляется: крах, выход в меню и pagehide дописывают
 * разницу между текущим G.distance и уже зачисленным куском заезда.
 */
const MILEAGE_KEY = 'bajajGO_mileage';

export function initMileage() {
  let mileage = {};
  let creditedKm = 0;

  try {
    const saved = JSON.parse(localStorage.getItem(MILEAGE_KEY) || '{}');
    if (saved && typeof saved === 'object') {
      for (const [id, value] of Object.entries(saved)) {
        const meters = Number(value);
        if (Number.isFinite(meters) && meters > 0) mileage[id] = meters;
      }
    }
  } catch {
    mileage = {};
  }

  function saveMileage() {
    try {
      localStorage.setItem(MILEAGE_KEY, JSON.stringify(mileage));
    } catch {
      // Приватный режим: пробег живёт до перезагрузки.
    }
  }

  function getBikeMileage(bikeId = G.selectedBikeId) {
    const meters = Number(mileage[bikeId]);
    return Number.isFinite(meters) && meters > 0 ? meters : 0;
  }

  /** Дописывает в счётчик выбранного мотоцикла только новый кусок заезда. */
  function creditRunMileage() {
    const km = Number(G.distance);
    if (!Number.isFinite(km) || km <= 0) {
      creditedKm = 0;
      return 0;
    }
    const deltaKm = km - creditedKm;
    if (deltaKm <= 0.0001) return 0;
    creditedKm = km;
    const id = G.selectedBikeId;
    mileage[id] = getBikeMileage(id) + deltaKm * 1000;
    saveMileage();
    return deltaKm * 1000;
  }

  function resetRunMileage() {
    creditedKm = 0;
  }

  G.getBikeMileage = getBikeMileage;
  G.creditRunMileage = creditRunMileage;
  G.resetRunMileage = resetRunMileage;

  addEventListener('pagehide', creditRunMileage);
  addEventListener('beforeunload', creditRunMileage);
  addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') creditRunMileage();
  });
}
