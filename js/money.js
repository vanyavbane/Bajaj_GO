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

export function shortfall(price, bank) {
  return Math.max(0, Math.ceil(price - bank));
}