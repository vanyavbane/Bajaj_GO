/** Деньги на экране. Баланс, цена и «не хватает» больше не форматируются каждый по-своему. */

export function grouped(amount) {
  const n = Number(amount);
  const whole = Number.isFinite(n) ? Math.floor(n) : 0;
  return whole.toLocaleString('ru-RU');
}

export function rubles(amount) {
  return `${grouped(amount)} ₽`;
}

export function meters(amount) {
  const n = Number(amount);
  const whole = Number.isFinite(n) ? Math.round(n) : 0;
  return `${whole.toLocaleString('ru-RU')} м`;
}

/** Пробег заезда: до километра в метрах, дальше с сотыми километра. */
export function runDistance(km) {
  const n = Number(km);
  const safe = Number.isFinite(n) ? Math.max(0, n) : 0;
  const wholeMeters = safe * 1000;
  if (wholeMeters < 1000) return `${Math.round(wholeMeters)} м`;
  return `${safe.toFixed(2)} км`;
}

/** Сколько из заезда ещё не положено в банк. Заказ уже зачислен отдельно. */
export function creditRun(score, alreadyBanked) {
  return Math.max(0, Math.floor(Number(score) || 0) - (Number(alreadyBanked) || 0));
}

/** Штраф за просроченный заказ: четверть базы, не меньше 100 и не больше банка. */
export function latePenalty(bank, baseReward) {
  const quarter = Math.round((Number(baseReward) || 0) * 0.25);
  return Math.min(Math.floor(Number(bank) || 0), Math.max(100, quarter));
}

export function shortfall(price, bank) {
  return Math.max(0, Math.ceil(price - bank));
}