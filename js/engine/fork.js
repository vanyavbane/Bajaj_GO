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

/** 0 на границе зоны, 1 когда прошлое решение уже отпустило ось. */
export function forkHandoff(local, fadeLength) {
  const span = fadeLength > 0 ? fadeLength : 1;
  const u = Math.max(0, Math.min(1, local / span));
  return u * u * (3 - 2 * u);
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

/** Те же кромки после схлопывания невыбранной ленты. close 0 — обе на месте, 1 — чужая исчезла.
 *  Когда ветки сливаются (spread → 0), схлопывание теряет смысл — дорога становится
 *  единой, поэтому эффект гасим вместе с разъездом, иначе после развязки кромка
 *  «раскрывается» сотни метров и декорации оказываются на полотне. */
export function collapsedEdges(half, spread, chosenSide, close, seam = FORK_SEAM) {
  const edge = branchEdges(half, spread, seam);
  const sep = Math.max(0, Math.min(1, (Number.isFinite(spread) ? spread : 0) / 1.0));
  const shut = Math.max(0, Math.min(1, Number.isFinite(close) ? close : 0)) * sep;
  if ((chosenSide === -1 || chosenSide === 1) && shut > 0) {
    const keep = 1 - shut;
    if (chosenSide > 0) edge.leftOuter = edge.leftInner - (edge.leftInner - edge.leftOuter) * keep;
    else edge.rightOuter = edge.rightInner + (edge.rightOuter - edge.rightInner) * keep;
  }
  return edge;
}

const RIBBON_MARGIN = 0.7;
const RIBBON_FLOOR = 2.2;

/**
 * Логические пределы байка по лентам, которые ещё шире двух отступов.
 * Ноль — левая ветка. Промежуток между ветками в пределы не входит.
 */
export function logicalRoadLimits(edge, scale, spread) {
  const span = Math.max(scale, 0.05);
  const gap = Math.max(0, spread);
  const ribbons = ribbonSpans(edge);
  let minEdge = Infinity;
  let maxEdge = -Infinity;
  const include = (pre) => {
    const logical = preToLogical(pre, span, gap);
    if (logical == null) return;
    minEdge = Math.min(minEdge, logical);
    maxEdge = Math.max(maxEdge, logical);
  };
  for (const [from, to] of ribbons) {
    include(from);
    include(to);
  }
  if (!Number.isFinite(minEdge) || !Number.isFinite(maxEdge)) return { min: 0, max: 0 };
  if (minEdge > -RIBBON_FLOOR && preOnRibbon(-RIBBON_FLOOR, span, gap, ribbons)) minEdge = -RIBBON_FLOOR;
  if (maxEdge < RIBBON_FLOOR && preOnRibbon(RIBBON_FLOOR, span, gap, ribbons)) maxEdge = RIBBON_FLOOR;
  if (maxEdge < minEdge) {
    const mid = (minEdge + maxEdge) * 0.5;
    return { min: mid, max: mid };
  }
  return { min: minEdge, max: maxEdge };
}

function ribbonSpans(edge) {
  const spans = [];
  const minWidth = RIBBON_MARGIN * 2;
  if (edge.leftInner - edge.leftOuter > minWidth) {
    spans.push([edge.leftOuter + RIBBON_MARGIN, edge.leftInner - RIBBON_MARGIN]);
  }
  if (edge.rightOuter - edge.rightInner > minWidth) {
    spans.push([edge.rightInner + RIBBON_MARGIN, edge.rightOuter - RIBBON_MARGIN]);
  }
  return spans;
}

function preToLogical(pre, scale, spread) {
  if (pre <= -spread) return Math.min(0, (pre + spread) / scale);
  if (pre >= spread) return Math.max(0, (pre - spread) / scale);
  return null;
}

function preOnRibbon(logical, scale, spread, ribbons) {
  const pre = logical * scale + (logical <= 0 ? -spread : spread);
  return ribbons.some(([from, to]) => pre >= from - 0.05 && pre <= to + 0.05);
}

/** Откос начинается снаружи кромки асфальта и не складывается внутрь неё. */
export function shoulderLats(asphaltAbs, cityOuter, shoulder) {
  const lip = Math.abs(asphaltAbs) + cityOuter;
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
