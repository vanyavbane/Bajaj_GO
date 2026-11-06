/** Тип кузова. Qute и Юра делят кабину, Юра — отдельная ветка внутри неё. */

export function isYuraType(vType) {
  return vType === 'yura';
}

export function isQuteBody(vType) {
  return vType === 'qute' || isYuraType(vType);
}

/** Заводской цвет каталога остаётся на месте. Выбранная окраска только перекрывает его. */
export function bikePaint(bike, customColors) {
  if (!bike) return 0;
  const custom = customColors && customColors[bike.id];
  return custom || bike.color;
}
