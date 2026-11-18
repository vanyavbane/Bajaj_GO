/** Тип кузова. Qute и Юра делят кабину, Юра — отдельная ветка внутри неё. */

export function isYuraType(vType: string): vType is 'yura' {
  return vType === 'yura';
}

export function isQuteBody(vType: string): vType is 'qute' | 'yura' {
  return vType === 'qute' || vType === 'yura';
}

export interface PaintBike {
  id: string;
  color: number;
}

/** Заводской цвет каталога остаётся на месте. Выбранная окраска только перекрывает его. */
export function bikePaint(
  bike: PaintBike | null | undefined,
  customColors: Record<string, number> | null | undefined,
): number {
  if (!bike) return 0;
  const custom = customColors?.[bike.id];
  if (typeof custom === 'number' && Number.isFinite(custom)) return custom;
  return bike.color;
}
