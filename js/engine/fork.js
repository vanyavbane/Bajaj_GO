/**
 * Одна кривая развилки. Её читают и полотно, и выталкивание байка:
 * отдельные «островок» и «разъезд» больше не расходятся.
 *
 * Ноль на оси — левая ветка, как и авто-выбор (laneOffset <= 0).
 */

export const FORK_LEAD = 120;
export const FORK_SPREAD = 26;
/** Нахлёст половин асфальта, чтобы на прямой не было щели по оси. */
export const FORK_SEAM = 0.16;

function smooth01(v) {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
}

/** Метры до центра развилки текущей зоны. Отрицательные — ещё не доехали. */
export function forkOffset(meters, zoneLength, lead = FORK_LEAD) {
  const m = Number.isFinite(meters) ? meters : 0;
  const zone = Math.floor(m / zoneLength);
  const splitM = (zone + 1) * zoneLength - lead;
  return m - splitM;
}

/** 0 до центра развилки, 1 через lead метров после. Выбранная ветка остаётся в стороне. */
export function forkClose(meters, zoneLength, lead = FORK_LEAD) {
  const d = forkOffset(meters, zoneLength, lead);
  if (d <= 0) return 0;
  if (d >= lead) return 1;
  return smooth01(d / lead);
}

/** Сдвиг оси к выбранной ветке. side: -1 слева, +1 справа, 0 пока выбор не сделан. */
export function forkCenterShift(meters, zoneLength, side, lead = FORK_LEAD, peak = FORK_SPREAD) {
  if (side !== -1 && side !== 1) return 0;
  return side * peak * forkClose(meters, zoneLength, lead);
}
/** Боковой уход одной ветки, метры. Ноль на концах, пик в центре. */
export function forkSpreadAt(meters, zoneLength, lead = FORK_LEAD, peak = FORK_SPREAD) {
  const d = forkOffset(meters, zoneLength, lead);
  if (d <= -lead || d >= lead) return 0;
  const u = 1 - Math.abs(d) / lead;
  return peak * smooth01(u);
}

/** 0…1 той же кривой. Пороги геймплея больше не живут на другой форме. */
export function forkAmountAt(meters, zoneLength, lead = FORK_LEAD) {
  return forkSpreadAt(meters, zoneLength, lead, 1);
}

/** -1 слева, включая ровно ноль. */
export function forkSide(lateralOffset) {
  return lateralOffset <= 0 ? -1 : 1;
}

/**
 * Кромки двух лент. seam заводит их друг на друга, когда разъезда ещё нет,
 * и накрывает край травы, когда разъезд уже есть.
 */
export function branchEdges(half, spread, seam = FORK_SEAM) {
  return {
    leftOuter: -(half + spread),
    leftInner: -spread + seam,
    rightInner: spread - seam,
    rightOuter: half + spread
  };
}

/** Откос начинается снаружи асфальта и не складывается внутрь ветки. */
export function shoulderLats(half, spread, cityOuter, shoulder) {
  const lip = half + spread + cityOuter;
  const berm = Math.max(shoulder.berm, lip + 1.5);
  const far = Math.max(shoulder.far, berm + (shoulder.far - shoulder.berm));
  return { lip, berm, far };
}

/**
 * Высота земли на удалении от оси. Те же три точки, что у ленты откоса:
 * между ними отрезок, за дальней точкой — её высота.
 */
export function shoulderHeight(absLat, lats, shoulder) {
  const a = Math.abs(absLat);
  if (a <= lats.lip) return shoulder.lipY;
  if (a <= lats.berm) {
    const span = lats.berm - lats.lip;
    const t = span > 0 ? (a - lats.lip) / span : 0;
    return shoulder.lipY + t * (shoulder.bermY - shoulder.lipY);
  }
  if (a <= lats.far) {
    const span = lats.far - lats.berm;
    const t = span > 0 ? (a - lats.berm) / span : 0;
    return shoulder.bermY + t * (shoulder.farY - shoulder.bermY);
  }
  return shoulder.farY;
}
