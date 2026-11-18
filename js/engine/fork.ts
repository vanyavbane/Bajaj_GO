/**
 * Съезд справа от прямой дороги. Основная лента не сдвигается с оси:
 * не заехал на съезд — едешь вперёд по той же дороге.
 *
 * ChosenSide здесь про съезд, не про две равноправные ветки:
 * -1 съезд закрывается, +1 съезд оставлен, 0 решение ещё не принято.
 */

/** -1 съезд не взят, +1 взят, 0 пока развилка открыта. */
export type ChosenSide = -1 | 0 | 1;

/**
 * Слот на баннере развилки. 0 — левый вариант пары, 1 — правый.
 * Это индекс выбора, не метры. 0 — ехать прямо, 1 — съезд.
 */
export type BranchPick = 0 | 1;

/**
 * Выбор на баннере. -1 — развилка ещё не зафиксирована, 0 и 1 — слоты.
 * Ноль здесь — прямой ход, а не «ось по центру».
 */
export type SplitPick = -1 | BranchPick;

export function branchPick(value: number): BranchPick {
  return value === 1 ? 1 : 0;
}

export function splitPick(value: number): SplitPick {
  if (value === 1) return 1;
  if (value === 0) return 0;
  return -1;
}

/** Прямой ход закрывает съезд, правый слот его оставляет. */
export function pickToSide(pick: BranchPick): -1 | 1 {
  return pick === 1 ? 1 : -1;
}

/** Только точные -1 и 1 остаются стороной оси. Остальное — выбор ещё не сдвинул дорогу. */
export function chosenSideOf(value: number): ChosenSide {
  if (value === 1) return 1;
  if (value === -1) return -1;
  return 0;
}

/** Кромки двух лент, метры от оси. Слева числа отрицательные. */
export interface AsphaltEdges {
  leftOuter: number;
  leftInner: number;
  rightInner: number;
  rightOuter: number;
}

export interface ShoulderProfile {
  /** Номинальная кромка откоса на прямой, метры от оси. Лента считает свою кромку от асфальта. */
  lip: number;
  berm: number;
  far: number;
  lipY: number;
  bermY: number;
  farY: number;
  /** Бордюр и тротуар. На вес города отодвигает откос от асфальта. */
  cityEdge: number;
}

export interface ShoulderLats {
  lip: number;
  berm: number;
  far: number;
}

export interface RoadLimits {
  min: number;
  max: number;
}

/** Метры, за которые съезд отходит от прямой дороги и открывает клин. */
export const EXIT_DIVERGE = 110;
/** Участок, где ветки уже разделены. Здесь выбирают прямую или съезд. */
export const EXIT_RUN = 150;
/** Ненужная ветка заканчивается на месте и не вливается в оставшуюся. */
export const EXIT_END = 70;
/** Запас до границы зоны: за ней уже другой биом, дома и деревья. */
export const EXIT_MARGIN = 100;
/** Нос съезда стоит на столько метров раньше границы зоны. */
export const FORK_LEAD = EXIT_DIVERGE + EXIT_RUN + EXIT_END + EXIT_MARGIN;
/** Расстояние от носа до точки, где выбор уже должен быть сделан. */
export const EXIT_CHOICE = EXIT_DIVERGE + EXIT_RUN;
export const FORK_SPREAD = 22;
/** Нахлёст половин асфальта, чтобы на прямой не было щели по оси. */
export const FORK_SEAM = 0.16;

function smooth01(v: number): number {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
}

/** Метры до центра развилки текущей зоны. Отрицательные — ещё не доехали. */
export function forkOffset(meters: number, zoneLength: number, lead = FORK_LEAD): number {
  const m = Number.isFinite(meters) ? meters : 0;
  const zone = Math.floor(m / zoneLength);
  const splitM = (zone + 1) * zoneLength - lead;
  return m - splitM;
}

/** 0, пока ветки ещё обе живы. 1, когда ненужная ветка уже закончилась. */
export function forkClose(meters: number, zoneLength: number, lead = FORK_LEAD): number {
  const phase = exitPhase(forkOffset(meters, zoneLength, lead));
  if (phase.kind === 'settle') return 1;
  if (phase.kind === 'end') return phase.t;
  return 0;
}

/** 0 на границе зоны, 1 когда прошлое решение уже отпустило ось. */
export function forkHandoff(local: number, fadeLength: number): number {
  const span = fadeLength > 0 ? fadeLength : 1;
  const u = Math.max(0, Math.min(1, local / span));
  return u * u * (3 - 2 * u);
}

/** Ось маршрута не переезжает. Съезд — отдельная лента, прямая дорога остаётся на месте. */
export function forkCenterShift(
  meters: number,
  zoneLength: number,
  side: ChosenSide,
  lead = FORK_LEAD,
  peak = FORK_SPREAD,
): number {
  void meters;
  void zoneLength;
  void side;
  void lead;
  void peak;
  return 0;
}

/**
 * Насколько съезд уже отошёл, метры.
 * От носа растёт до пика, держится всю ветку и сходит только в запасе
 * перед границей зоны. Обратно к прямой дороге он не прилипает.
 */
export function forkSpreadAt(
  meters: number,
  zoneLength: number,
  lead = FORK_LEAD,
  peak = FORK_SPREAD,
): number {
  const phase = exitPhase(forkOffset(meters, zoneLength, lead));
  if (phase.kind === 'none' || FORK_SPREAD <= 0) return 0;
  return phase.spread * (peak / FORK_SPREAD);
}

/** 0…1 той же кривой. Пороги геймплея больше не живут на другой форме. */
export function forkAmountAt(meters: number, zoneLength: number, lead = FORK_LEAD): number {
  return forkSpreadAt(meters, zoneLength, lead, 1);
}

/** -1 слева, включая ровно ноль. */
export function forkSide(lateralOffset: number): -1 | 1 {
  return lateralOffset <= 0 ? -1 : 1;
}

/** Участок жизни съезда. `t` — 0…1 внутри этой фазы. */
export type ExitKind = 'none' | 'diverge' | 'run' | 'end' | 'settle';

export interface ExitPhase {
  kind: ExitKind;
  t: number;
  spread: number;
}

/** Фаза по метрам от носа. До носа и после границы зоны съезда нет. */
export function exitPhase(d: number): ExitPhase {
  if (!(d > 0) || d >= FORK_LEAD) return { kind: 'none', t: 0, spread: 0 };
  if (d < EXIT_DIVERGE) {
    const t = d / EXIT_DIVERGE;
    return { kind: 'diverge', t, spread: FORK_SPREAD * smooth01(t) };
  }
  if (d < EXIT_CHOICE) return { kind: 'run', t: 1, spread: FORK_SPREAD };
  if (d < EXIT_CHOICE + EXIT_END) {
    return { kind: 'end', t: smooth01((d - EXIT_CHOICE) / EXIT_END), spread: FORK_SPREAD };
  }
  const tail = Math.max(1, FORK_LEAD - (EXIT_CHOICE + EXIT_END));
  return { kind: 'settle', t: smooth01((d - EXIT_CHOICE - EXIT_END) / tail), spread: FORK_SPREAD };
}

/** Земля справа занята съездом: дома и деревья туда не ставятся. */
export function exitReserved(d: number): boolean {
  return d > 0.4 && d < FORK_LEAD - 0.4;
}

function pinchSpan(from: number, to: number, keep: number): [number, number] {
  const mid = (from + to) * 0.5;
  return [mid + (from - mid) * keep, mid + (to - mid) * keep];
}

/**
 * Кромки с учётом фазы и выбора.
 * Невыбранная ветка сходится в свою точку и пропадает.
 * Взятый съезд после этого переезжает на ось и становится дорогой следующего биома,
 * прямая ветка при этом уже нулевой ширины и не появляется обратно.
 */
export function exitEdges(half: number, phase: ExitPhase, chosen: ChosenSide): AsphaltEdges {
  const road = Math.max(0, Number.isFinite(half) ? half : 0);
  if (phase.kind === 'none') return branchEdges(road, 0);
  if (phase.kind === 'diverge' || phase.kind === 'run') return branchEdges(road, phase.spread);
  if (phase.kind === 'end') {
    const edge = branchEdges(road, phase.spread);
    if (chosen === 0) return edge;
    const keep = 1 - Math.max(0, Math.min(1, phase.t));
    if (chosen === -1) {
      [edge.rightInner, edge.rightOuter] = pinchSpan(edge.rightInner, edge.rightOuter, keep);
    } else {
      [edge.leftOuter, edge.leftInner] = pinchSpan(edge.leftOuter, edge.leftInner, keep);
    }
    return edge;
  }
  if (chosen !== 1) return branchEdges(road, 0);
  const center = (road + phase.spread) * (1 - Math.max(0, Math.min(1, phase.t)));
  return {
    leftOuter: 0,
    leftInner: 0,
    rightInner: center - road,
    rightOuter: center + road,
  };
}

export function exitGap(edges: AsphaltEdges): number {
  return edges.rightInner - edges.leftInner;
}

export function exitWidth(edges: AsphaltEdges): number {
  return Math.max(0, edges.rightOuter - edges.rightInner);
}

/** Прямая лента ещё накрывает ось, а не сжата в точку. */
export function mainRoadOpen(edges: AsphaltEdges): boolean {
  return edges.leftOuter < -0.5 && edges.leftInner > 0.5 && edges.leftInner - edges.leftOuter > 1;
}

/** Кромка дороги, по которой едут. Пока прямая жива — это она, даже если справа открыт съезд.
 *  Когда прямая сжата в точку, кромки берёт съезд, ставший дорогой. */
export function carriageEdge(edges: AsphaltEdges, side: -1 | 1): number {
  if (mainRoadOpen(edges)) return side < 0 ? edges.leftOuter : edges.leftInner;
  if (edges.leftInner - edges.leftOuter < 1 && exitWidth(edges) > 1) {
    return side < 0 ? edges.rightInner : edges.rightOuter;
  }
  return side < 0 ? edges.leftOuter : edges.rightOuter;
}

/** Дальний асфальт для откоса. Узкая умирающая лента не отодвигает землю. */
export function worldEdge(edges: AsphaltEdges, side: -1 | 1): number {
  const leftGone = edges.leftInner - edges.leftOuter < 1;
  if (side < 0) {
    if (mainRoadOpen(edges)) return edges.leftOuter;
    if (leftGone && exitWidth(edges) > 1) return edges.rightInner;
    return edges.leftOuter;
  }
  if (exitWidth(edges) > 1 && (mainRoadOpen(edges) || leftGone)) return edges.rightOuter;
  if (mainRoadOpen(edges)) return edges.leftInner;
  return Math.max(edges.leftInner, edges.rightOuter);
}

const ENTER_INSET = 1.15;
const RELEASE_INSET = 2.6;
const ATTACHED_GAP = 2.4;
const RIDEABLE = 2.4;

/** Съезд ещё приклеен к кромке и уже достаточно широк, байк стоит у правого края. */
export function canGrabExit(logical: number, edges: AsphaltEdges): boolean {
  return exitGap(edges) < ATTACHED_GAP && exitWidth(edges) > RIDEABLE && logical >= edges.rightInner - ENTER_INSET;
}

/** Пока клин не открылся, уход влево отпускает съезд. */
export function canReleaseExit(logical: number, edges: AsphaltEdges): boolean {
  return exitGap(edges) < ATTACHED_GAP && logical < edges.rightInner - RELEASE_INSET;
}

/**
 * Пока прямая дорога ещё широкая, левее этой точки байка возвращает к правой кромке.
 * null — ограничение не нужно: клин ещё закрыт или прямая ветка уже закончилась.
 */
export function holdLaneMin(edges: AsphaltEdges, roadHalf: number): number | null {
  if (exitGap(edges) < ATTACHED_GAP) return null;
  if (edges.leftInner - edges.leftOuter < Math.max(roadHalf, 1)) return null;
  return edges.leftInner - 1.5;
}

function riderOnExit(logical: number, roadHalf: number, edges: AsphaltEdges): number | null {
  const width = exitWidth(edges);
  if (width < 1) return null;
  const center = (edges.rightInner + edges.rightOuter) * 0.5;
  const anchor = Math.max(roadHalf, 0.001);
  const parked = center + (logical - anchor);
  const pad = Math.min(0.7, width * 0.25);
  const inner = edges.rightInner + pad;
  const outer = Math.max(inner, edges.rightOuter - pad);
  return Math.max(inner, Math.min(outer, parked));
}

/**
 * Сдвиг на ленту съезда. Байк остаётся на ветке всё время, пока она сбоку:
 * его не тянет обратно к полосе прямой дороги.
 */
export function exitRiderShift(logical: number, roadHalf: number, edges: AsphaltEdges): number {
  const world = riderOnExit(logical, roadHalf, edges);
  if (world == null) return 0;
  return world - logical;
}

/**
 * Когда ветка уже легла на ось, это новое значение полосы.
 * Его надо записать вместо сдвига в том же кадре, иначе байк прыгнет.
 * null — ветка ещё сбоку, сдвиг остаётся.
 */
export function exitRebaseLane(logical: number, roadHalf: number, edges: AsphaltEdges): number | null {
  const width = exitWidth(edges);
  if (width < 1) return null;
  const center = (edges.rightInner + edges.rightOuter) * 0.5;
  const anchor = Math.max(roadHalf, 0.001);
  if (!(Math.abs(center) < anchor * 0.2 && edges.rightInner < 0)) return null;
  return riderOnExit(logical, roadHalf, edges);
}

/**
 * Прямая дорога на оси и съезд справа.
 * Пока разъезд меньше ширины полотна, съезд ещё приклеен к правой кромке:
 * на него можно перестроиться. Дальше между ними открывается клин.
 * При нулевом разъезде правая лента имеет нулевую ширину.
 */
export function branchEdges(half: number, spread: number, seam = FORK_SEAM): AsphaltEdges {
  const road = Math.max(0, Number.isFinite(half) ? half : 0);
  const open = Math.max(0, Number.isFinite(spread) ? spread : 0);
  if (open <= 0.001) {
    return {
      leftOuter: -road,
      leftInner: road,
      rightInner: road,
      rightOuter: road,
    };
  }
  const grow = Math.min(1, open / Math.max(road, 0.001));
  const exitHalf = road * grow;
  const exitCenter = road + open;
  let rightInner = exitCenter - exitHalf;
  let rightOuter = exitCenter + exitHalf;
  const nose = road - seam;
  if (rightInner < nose) rightInner = nose;
  if (rightOuter < rightInner) rightOuter = rightInner;
  return {
    leftOuter: -road,
    leftInner: road,
    rightInner,
    rightOuter,
  };
}

const RIBBON_MARGIN = 0.7;
const RIBBON_FLOOR = 2.2;

/**
 * Пределы руля. Пока съезд ещё приклеен к прямой, правый предел — его дальний край,
 * иначе кромка прямой дороги становится стеной ровно там, где надо перестроиться.
 * Когда клин уже открыт, за стену пускает только тот, кто уже на съезде.
 */
export function logicalRoadLimits(edge: AsphaltEdges, scale: number, riding = false): RoadLimits {
  const span = Math.max(scale, 0.05);
  const onExit = !mainRoadOpen(edge) && exitWidth(edge) > 1;
  let minEdge: number;
  let maxEdge: number;
  if (onExit) {
    const halfW = exitWidth(edge) * 0.5;
    minEdge = -halfW / span;
    maxEdge = halfW / span;
  } else {
    minEdge = (edge.leftOuter + RIBBON_MARGIN) / span;
    maxEdge = (edge.leftInner - RIBBON_MARGIN) / span;
    const joined = exitGap(edge) < ATTACHED_GAP && exitWidth(edge) > RIDEABLE;
    if (joined) maxEdge = Math.max(maxEdge, (edge.rightOuter - RIBBON_MARGIN) / span);
    else if (riding) maxEdge = Math.max(maxEdge, (edge.leftInner + 1.2) / span);
  }
  if (!Number.isFinite(minEdge) || !Number.isFinite(maxEdge)) return { min: 0, max: 0 };
  if (minEdge > -RIBBON_FLOOR) minEdge = -RIBBON_FLOOR;
  if (maxEdge < RIBBON_FLOOR) maxEdge = RIBBON_FLOOR;
  if (maxEdge < minEdge) {
    const mid = (minEdge + maxEdge) * 0.5;
    return { min: mid, max: mid };
  }
  return { min: minEdge, max: maxEdge };
}

/** Откос начинается снаружи кромки асфальта и не складывается внутрь неё. */
export function shoulderLats(asphaltAbs: number, cityOuter: number, shoulder: ShoulderProfile): ShoulderLats {
  const lip = Math.abs(asphaltAbs) + cityOuter;
  const berm = Math.max(shoulder.berm, lip + 1.5);
  const far = Math.max(shoulder.far, berm + (shoulder.far - shoulder.berm));
  return { lip, berm, far };
}

/**
 * Высота земли на удалении от оси. Те же три точки, что у ленты откоса:
 * между ними отрезок, за дальней точкой — её высота.
 */
export function shoulderHeight(absLat: number, lats: ShoulderLats, shoulder: ShoulderProfile): number {
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
