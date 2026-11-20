/**
 * Дорога и съезд вправо.
 * Форма съезда — рецепт блоков в blocks.ts. Здесь только кромки одного блока.
 * Кромки считаются относительно центра дороги. Взятый съезд переносит этот
 * центр на свою линию и больше не возвращает его на ось маршрута.
 * Прямой ход центр не двигает: съезд заканчивается сбоку.
 *
 * ChosenSide: -1 съезд закрыт, +1 съезд стал дорогой, 0 выбор ещё открыт.
 */

import { RIGHT_EXIT, builtChain, compileExit, placedBlock, spanAt } from './blocks.ts';
import type { BuildChoice, PlacedBlock } from './blocks.ts';

export type { PlacedBlock };

const EXIT_PLAN = compileExit(RIGHT_EXIT);

/** -1 съезд не взят, +1 взят, 0 пока развилка открыта. То же значение, что BuildChoice. */
export type ChosenSide = BuildChoice;

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

/** Метры блока, за которые съезд отходит от прямой дороги и открывает клин. */
export const EXIT_DIVERGE = EXIT_PLAN.diverge;
/** Блок, где ветки уже разделены. Здесь игрок выбирает, что строить дальше. */
export const EXIT_RUN = EXIT_PLAN.run;
/** Последний блок цепочки: запас до границы зоны. */
export const EXIT_MARGIN = EXIT_PLAN.margin;
/** Нос съезда стоит на столько метров раньше границы зоны. */
export const FORK_LEAD = EXIT_PLAN.length;
/** Конец общего подхода: дальше строится только выбранная цепочка. */
export const EXIT_CHOICE = EXIT_PLAN.choiceAt;
export const FORK_SPREAD = EXIT_PLAN.spread;

/** Линейка съезда для курса. Курс не складывает длины блоков сам. */
export interface ExitClock {
  /** Нос стоит на столько метров раньше конца зоны. */
  lead: number;
  /** Сколько метров курс поворачивает. Это блок отхода. */
  turn: number;
  /** С этой метки после носа взятый съезд уже является дорогой. Начало блока carry. */
  ownAfter: number;
  /** Конец общего подхода: здесь фиксируется выбор. */
  choiceAt: number;
  spread: number;
}

/** Единственные метры, по которым курс понимает, когда сечение уже стало его дорогой. */
export function exitClock(): ExitClock {
  const carry = EXIT_PLAN.exit.find((span) => span.kind === 'carry');
  if (!carry) throw new Error('Съезд без блока carry: курс не знает, когда лента стала дорогой');
  return {
    lead: EXIT_PLAN.length,
    turn: EXIT_PLAN.diverge,
    ownAfter: carry.start,
    choiceAt: EXIT_PLAN.choiceAt,
    spread: EXIT_PLAN.spread,
  };
}

/** Выбор зоны для центра дороги. Прямая не несёт центр. Съезд может оставить уже сверенный. */
export type ZoneRoad =
  | { tookExit: false; half: number }
  | { tookExit: true; half: number; keptOrigin?: number };

/** Центр дороги перед переданными зонами. Прямой ход его не двигает. */
export function originBeforeZones(previous: readonly ZoneRoad[]): number {
  let origin = 0;
  for (const zone of previous) {
    if (!zone.tookExit) continue;
    if (zone.keptOrigin != null) {
      origin = zone.keptOrigin;
      continue;
    }
    origin = exitCarryOrigin(zone.half, origin);
  }
  return origin;
}

/** Центр зоны. null, если съезд не взят: прямая остаётся на прежнем центре. */
export function carriedOriginAt(previous: readonly ZoneRoad[], zone: ZoneRoad): number | null {
  if (!zone.tookExit) return null;
  if (zone.keptOrigin != null) return zone.keptOrigin;
  return exitCarryOrigin(zone.half, originBeforeZones(previous));
}

/** Нахлёст половин асфальта, чтобы на прямой не было щели по оси. */
export const FORK_SEAM = 0.16;

function smooth01(v: number): number {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
}

/** Метры до центра развилки текущей зоны. Отрицательные — ещё не доехали. */
export function forkOffset(meters: number, zoneLength: number, lead = FORK_LEAD): number {
  const m = Number.isFinite(meters) ? meters : 0;
  const length = Number.isFinite(zoneLength) && zoneLength > 0 ? zoneLength : 0;
  if (length === 0) return 0;
  const shift = Number.isFinite(lead) ? lead : FORK_LEAD;
  const zone = Math.floor(m / length);
  const splitM = (zone + 1) * length - shift;
  return m - splitM;
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
  if (phase.kind === 'none' || !(peak > 0)) return 0;
  return phase.open * peak;
}

/**
 * Занятость развилки для барьера, трамплинов и сервиса.
 * До выбора хвост ещё рисует обе ленты. После выбора блок settle — уже одна дорога,
 * поэтому флаг гаснет там, а не скачком на границе зоны.
 */
export function liveForkAmount(amount: number, phase: ExitKind, chosen: ChosenSide): number {
  const raw = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  if (chosen !== 0 && (phase === 'settle' || phase === 'none')) return 0;
  return raw;
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
  /** 0…1, насколько лента съезда открыта. Метры получаются умножением на разъезд. */
  open: number;
}

/** Фаза по блоку под этой меткой. До носа и после последнего блока съезда нет. */
export function exitPhase(d: number): ExitPhase {
  const span = spanAt(EXIT_PLAN, d);
  if (!span) return { kind: 'none', t: 0, open: 0 };
  if (span.kind === 'split') return { kind: 'diverge', t: span.u, open: smooth01(span.u) };
  if (span.kind === 'fork') return { kind: 'run', t: 1, open: 1 };
  if (span.kind === 'seal') return { kind: 'end', t: smooth01(span.u), open: 1 };
  return { kind: 'settle', t: smooth01(span.u), open: 1 };
}

/** Какой блок стоит в этой метке и выбран ли уже его хвост. */
export function exitBlockAt(d: number, chosen: ChosenSide): PlacedBlock | null {
  return placedBlock(EXIT_PLAN, d, chosen);
}

/** Имена блоков, которые выбор уже поставил. До выбора в списке только подход. */
export function exitChain(chosen: ChosenSide): readonly string[] {
  return builtChain(EXIT_PLAN, chosen);
}

/** Кромки поставленного блока. Непостроенный хвост остаётся развилкой, его ещё не закрывают. */
function blockEdges(half: number, block: PlacedBlock | null, chosen: ChosenSide, endWeight: number): AsphaltEdges {
  const road = Math.max(0, Number.isFinite(half) ? half : 0);
  if (!block) return branchEdges(road, 0);
  if (!block.built) return branchEdges(road, FORK_SPREAD);
  if (block.kind === 'split') return branchEdges(road, FORK_SPREAD * smooth01(block.u));
  if (block.kind === 'fork') return branchEdges(road, FORK_SPREAD);
  if (block.kind === 'seal') {
    const edge = branchEdges(road, FORK_SPREAD);
    const t = smooth01(block.u) * Math.max(0, Math.min(1, endWeight));
    // Невыбранная ветка уходит в сторону и исчезает, не схлопываясь к выбранной.
    const away = t * FORK_SPREAD * 1.5;
    if (chosen === -1) {
      const w = exitWidth(edge) * (1 - t);
      const mid = exitRibbonMid(edge) + away;
      edge.rightInner = mid - w * 0.5;
      edge.rightOuter = mid + w * 0.5;
    } else if (chosen === 1) {
      const w = Math.max(0, edge.leftInner - edge.leftOuter) * (1 - t);
      const mid = (edge.leftOuter + edge.leftInner) * 0.5 - away;
      edge.leftOuter = mid - w * 0.5;
      edge.leftInner = mid + w * 0.5;
    }
    return edge;
  }
  if (block.kind === 'carry') {
    // Съезд стал дорогой: 2-полосная лента той же ширины до конца зоны.
    const eh = Math.max(1.8, Math.min(road, EXIT_LANE_HALF));
    return {
      leftOuter: -eh,
      leftInner: eh,
      rightInner: eh,
      rightOuter: eh,
    };
  }
  if (block.kind === 'road') {
    // Съезд уже сошёл на нет в закрытии. Дальше одна прямая, без кончика в стороне.
    return branchEdges(road, 0);
  }
  return branchEdges(road, 0);
}

/** Земля справа занята съездом: дома и деревья туда не ставятся. */
export function exitReserved(d: number): boolean {
  return d > 0.4 && d < FORK_LEAD - 0.4;
}

/** Середина правой ленты. Одна формула и для полос, и для курса. */
export function exitRibbonMid(edges: AsphaltEdges): number {
  return (edges.rightInner + edges.rightOuter) * 0.5;
}

/**
 * Стык сечения и курса.
 * В конце закрытия прямой центр ленты в мире, в начале carry — центр дороги.
 * Это одно число: курс вычитает его и до захвата, и после.
 */
export interface ExitSeamPoint {
  /** Середина ленты в конце закрытия прямой. */
  ribbon: number;
  /** Центр дороги в начале carry. */
  origin: number;
}

export function exitSeam(half: number, base = 0): ExitSeamPoint {
  const clock = exitClock();
  const carriedOrigin = exitCarryOrigin(half, base);
  const seal = sampleRoad({
    forkDistance: clock.ownAfter - 0.02,
    half,
    chosen: 1,
    baseOrigin: base,
    carriedOrigin,
    endWeight: 1,
  });
  const carry = sampleRoad({
    forkDistance: clock.ownAfter,
    half,
    chosen: 1,
    baseOrigin: base,
    carriedOrigin,
    endWeight: 1,
  });
  return { ribbon: exitRibbonMid(seal.world), origin: carry.origin };
}

/** Старый сохранённый центр можно оставить, только если он уже равен формуле. */
export function storedOriginHolds(stored: number, fresh: number | null): boolean {
  if (fresh == null || typeof stored !== 'number' || !Number.isFinite(stored)) return false;
  return Math.abs(stored - fresh) <= 0.05;
}

/** Центр дороги после взятого съезда. Это середина полной ленты, не отдельный сдвиг. */
export function exitCarryOrigin(roadHalf: number, base = 0): number {
  const half = Math.max(0, Number.isFinite(roadHalf) ? roadHalf : 0);
  const from = Number.isFinite(base) ? base : 0;
  return from + exitRibbonMid(branchEdges(half, FORK_SPREAD));
}

/** Один кадр дороги: локальные кромки, мировой центр и те же кромки в мире. */
export interface RoadFrame {
  origin: number;
  local: AsphaltEdges;
  world: AsphaltEdges;
  phase: ExitPhase;
  chosen: ChosenSide;
  /** Блок рецепта в этой точке. null — съезда здесь нет. */
  block: PlacedBlock | null;
}

export interface RoadQuery {
  forkDistance: number;
  half: number;
  chosen: ChosenSide;
  baseOrigin: number;
  carriedOrigin: number | null;
  endWeight?: number;
}

function finiteOrigin(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function translateEdges(edges: AsphaltEdges, origin: number): AsphaltEdges {
  if (origin === 0) return edges;
  return {
    leftOuter: edges.leftOuter + origin,
    leftInner: edges.leftInner + origin,
    rightInner: edges.rightInner + origin,
    rightOuter: edges.rightOuter + origin,
  };
}

/** Единственная сборка дороги в точке. Кромки берёт поставленный блок. */
export function sampleRoad(query: RoadQuery): RoadFrame {
  const chosen = query.chosen;
  const givenWeight = query.endWeight;
  const endWeight = typeof givenWeight === 'number' && Number.isFinite(givenWeight)
    ? Math.max(0, Math.min(1, givenWeight))
    : 1;
  const block = exitBlockAt(query.forkDistance, chosen);
  const phase = exitPhase(query.forkDistance);
  const weighted: ExitPhase = phase.kind === 'end' && chosen !== 0
    ? { ...phase, t: phase.t * endWeight }
    : phase;
  const stored = query.carriedOrigin;
  const onCarry = block != null && block.built && block.kind === 'carry';
  // До носа фазы тоже none: уже записанный выбор не должен переносить центр заранее.
  const afterFork = query.forkDistance >= EXIT_PLAN.length;
  const carried = chosen === 1 && stored != null && Number.isFinite(stored) && (onCarry || afterFork);
  const origin = finiteOrigin(carried && stored != null ? stored : query.baseOrigin);
  const local = blockEdges(query.half, block, chosen, endWeight);
  return {
    origin,
    local,
    world: translateEdges(local, origin),
    phase: weighted,
    chosen,
    block,
  };
}

/** Центр курса. После захвата его вычитают и полосы, и заголовок. */
export function roadCenter(frame: RoadFrame): number {
  return frame.origin;
}

/** Откуда вычитать боковой метр. Середину ленты и центр дороги нельзя перепутать. */
export type CoursePlace =
  | { kind: 'ribbon'; ribbon: number }
  | { kind: 'owned'; center: number }
  | { kind: 'free' };

/**
 * Боковой метр на курсе.
 * На открытой ленте вычитается её середина. После захвата — roadCenter.
 * На стыке это одно число, поэтому смена ширины не разводит ряд и полотно.
 */
export function courseLocal(lat: number, place: CoursePlace): number {
  if (place.kind === 'ribbon') return lat - place.ribbon;
  if (place.kind === 'owned') return lat - place.center;
  return lat;
}

/**
 * Центр, от которого считаются полосы машин и разметки.
 * Пока съезд закрывает прямую, полосы переезжают к roadCenter ленты.
 * К блоку carry они приходят уже в него, без скачка.
 */
export function laneAnchor(frame: RoadFrame): number {
  const center = roadCenter(frame);
  if (frame.chosen !== 1 || frame.block == null || !frame.block.built || frame.block.kind !== 'seal') {
    return center;
  }
  const local = exitRibbonCenter(frame.local);
  if (local == null) return center;
  const t = frame.phase.kind === 'end' ? Math.max(0, Math.min(1, frame.phase.t)) : 1;
  return center + local * t;
}

/** Полоса в мировых метрах. riding оставляет байка на боковой ленте старым сдвигом. */
export function laneMeters(lane: number, scale: number, half: number, frame: RoadFrame, riding: boolean): number {
  const span = Number.isFinite(scale) && scale !== 0 ? scale : 1;
  const logical = (Number.isFinite(lane) ? lane : 0) * span;
  if (riding) return frame.origin + roadLateral(logical, half, frame.local, true);
  return laneAnchor(frame) + logical;
}

export function exitGap(edges: AsphaltEdges): number {
  return edges.rightInner - edges.leftInner;
}

export function exitWidth(edges: AsphaltEdges): number {
  return Math.max(0, edges.rightOuter - edges.rightInner);
}

/** Центр ленты съезда в тех же метрах, что и кромки. null, если съезда нет. */
export function exitRibbonCenter(edges: AsphaltEdges): number | null {
  if (exitWidth(edges) < 1) return null;
  return exitRibbonMid(edges);
}

const RIBBON_MARGIN = 0.7;

/** Лента ещё достаточно широкая, чтобы по ней ехала машина. */
export function exitLaneOpen(edges: AsphaltEdges): boolean {
  return exitWidth(edges) > 0.05 && exitGap(edges) > 0.8;
}

/**
 * Полоса в единицах руля, когда боковая лента пропала.
 * Далеко справа сажает на край оставшейся дороги. Кто уже на ней — остаётся.
 */
export function landOnCarriage(origin: number, edges: AsphaltEdges, world: number, span: number): number {
  const scale = Number.isFinite(span) && span !== 0 ? span : 1;
  const axis = Number.isFinite(origin) ? origin : 0;
  const edge = axis + edges.leftInner - RIBBON_MARGIN;
  const at = Number.isFinite(world) ? world : axis;
  return (Math.min(at, edge) - axis) / scale;
}

/**
 * Полоса на ленте съезда. laneZero — нулевая полоса прямой в тех же метрах.
 * Пока съезд приклеен, машина остаётся на прямой. Пока лента сходится,
 * машина возвращается на свою полосу, а не прыгает в последний момент.
 */
export function exitLaneWorld(edges: AsphaltEdges, laneWorld: number, laneZero: number): number {
  if (!exitLaneOpen(edges) || !Number.isFinite(laneWorld) || !Number.isFinite(laneZero)) {
    return laneWorld;
  }
  const mainWidth = Math.max(1, edges.leftInner - edges.leftOuter);
  const keep = Math.max(0, Math.min(1, exitWidth(edges) / mainWidth));
  return laneWorld + (exitRibbonMid(edges) - laneZero) * keep;
}

/**
 * Прямая лента ещё накрывает центр дороги, а не сжата в точку.
 * Центр — ось этой ленты. После съезда это уже не ноль маршрута.
 */
export function mainRoadOpen(edges: AsphaltEdges, center = 0): boolean {
  const axis = Number.isFinite(center) ? center : 0;
  return edges.leftOuter < axis - 0.5
    && edges.leftInner > axis + 0.5
    && edges.leftInner - edges.leftOuter > 1;
}

/** Кромка дороги, по которой едут. Пока прямая жива — это она, даже если справа открыт съезд.
 *  Когда прямая сжата в точку, кромки берёт съезд, ставший дорогой. */
export function carriageEdge(edges: AsphaltEdges, side: -1 | 1, center = 0): number {
  if (mainRoadOpen(edges, center)) return side < 0 ? edges.leftOuter : edges.leftInner;
  if (edges.leftInner - edges.leftOuter < 1 && exitWidth(edges) > 1) {
    return side < 0 ? edges.rightInner : edges.rightOuter;
  }
  return side < 0 ? edges.leftOuter : edges.rightOuter;
}

/** Точка снаружи кромки. Сторона берётся от центра дороги, не от нуля маршрута. */
export function outwardFrom(edge: number, origin: number, gap: number): number {
  if (!Number.isFinite(edge)) return Number.isFinite(origin) ? origin : 0;
  const center = Number.isFinite(origin) ? origin : 0;
  const outward = edge < center ? -1 : 1;
  const clearance = Number.isFinite(gap) ? Math.max(0, gap) : 0;
  return edge + outward * clearance;
}

/** Весь живой асфальт в точке: прямая и съезд вместе. Узкая прямая остаётся, пока у неё есть ширина. */
export function asphaltSpan(edges: AsphaltEdges, _center = 0): { left: number; right: number; mid: number; width: number } {
  void _center;
  const shell = roadShell(edges);
  return {
    left: shell.left,
    right: shell.right,
    mid: (shell.left + shell.right) * 0.5,
    width: Math.max(0, shell.right - shell.left),
  };
}

/** Кусок асфальта одной ленты. Левый и правый слот кадра сюда не входят. */
export interface AsphaltSpan {
  left: number;
  right: number;
}

/** Скачок дальше этого — уже другая лента, а не продолжение той же. */
const TRACK_JUMP = 6;

function spanCenter(span: AsphaltSpan): number {
  return (span.left + span.right) * 0.5;
}

/** Живые куски кадра: прямая и съезд, если у них есть ширина. */
export function asphaltSpans(edges: AsphaltEdges): AsphaltSpan[] {
  const spans: AsphaltSpan[] = [];
  if (edges.leftInner - edges.leftOuter > 0.05) spans.push({ left: edges.leftOuter, right: edges.leftInner });
  if (edges.rightOuter - edges.rightInner > 0.05) spans.push({ left: edges.rightInner, right: edges.rightOuter });
  return spans;
}

/**
 * Две ленты асфальта.
 * Лента держится за свой кусок, даже если carry переложил его в другой слот.
 * Кусок, который прыгнул дальше порога, начинает другую ленту.
 */
export function followAsphalt(
  previous: readonly (AsphaltSpan | null)[],
  edges: AsphaltEdges,
): [AsphaltSpan | null, AsphaltSpan | null] {
  const spans = asphaltSpans(edges);
  const next: [AsphaltSpan | null, AsphaltSpan | null] = [null, null];
  const used = spans.map(() => false);
  for (let track = 0; track < 2; track++) {
    const prev = previous[track] ?? null;
    if (!prev) continue;
    let best = -1;
    let bestD = TRACK_JUMP;
    const at = spanCenter(prev);
    for (let i = 0; i < spans.length; i++) {
      if (used[i]) continue;
      const span = spans[i];
      if (!span) continue;
      const distance = Math.abs(spanCenter(span) - at);
      if (distance < bestD) {
        bestD = distance;
        best = i;
      }
    }
    if (best >= 0) {
      next[track] = spans[best] ?? null;
      used[best] = true;
    }
  }
  for (let i = 0; i < spans.length; i++) {
    if (used[i]) continue;
    const span = spans[i];
    if (!span) continue;
    if (!next[0]) next[0] = span;
    else if (!next[1]) next[1] = span;
  }
  return next;
}

function collapsedSpan(span: AsphaltSpan): AsphaltSpan {
  const mid = spanCenter(span);
  return { left: mid, right: mid };
}

/**
 * Пустые ряды ленты схлопываются в точку на её конце.
 * Следующий кусок не тянет полотно через разрыв.
 */
export function pinchAsphalt(rows: readonly (readonly (AsphaltSpan | null)[])[]): [AsphaltSpan[], AsphaltSpan[]] {
  const count = rows.length;
  const drawn: [AsphaltSpan[], AsphaltSpan[]] = [[], []];
  for (let track = 0; track < 2; track++) {
    const samples = rows.map((row) => row[track] ?? null);
    const out: AsphaltSpan[] = new Array(count);
    const runs: { start: number; end: number }[] = [];
    let index = 0;
    while (index < count) {
      if (!samples[index]) {
        index += 1;
        continue;
      }
      let end = index + 1;
      while (end < count && samples[end]) end += 1;
      runs.push({ start: index, end });
      index = end;
    }
    if (runs.length === 0) {
      const point = { left: 0, right: 0 };
      for (let row = 0; row < count; row++) out[row] = point;
      drawn[track] = out;
      continue;
    }
    for (let runIndex = 0; runIndex < runs.length; runIndex++) {
      const run = runs[runIndex];
      if (!run) continue;
      const first = samples[run.start];
      const last = samples[run.end - 1];
      if (!first || !last) continue;
      const lead = collapsedSpan(first);
      const tail = collapsedSpan(last);
      const from = runIndex === 0 ? 0 : runs[runIndex - 1]?.end ?? 0;
      const previous = runIndex === 0 ? null : samples[(runs[runIndex - 1]?.end ?? 1) - 1];
      for (let row = from; row < run.start; row++) {
        const bridge = previous && row < run.start - 1 ? collapsedSpan(previous) : lead;
        out[row] = bridge;
      }
      for (let row = run.start; row < run.end; row++) {
        const span = samples[row];
        if (span) out[row] = span;
      }
      if (runIndex === runs.length - 1) {
        for (let row = run.end; row < count; row++) out[row] = tail;
      }
    }
    for (let row = 0; row < count; row++) {
      if (!out[row]) out[row] = { left: 0, right: 0 };
    }
    drawn[track] = out;
  }
  return drawn;
}

/**
 * Внутренняя кромка ленты для цветной линии развилки.
 * У левой ленты это правый край, у правой — левый. Узкая лента линию не держит.
 */
export function innerTrackEdge(span: AsphaltSpan | null, side: -1 | 1, inset = 0.2): number | null {
  if (!span || span.right - span.left < 0.7) return null;
  const pad = Math.min(Math.max(0, inset), (span.right - span.left) * 0.25);
  return side < 0 ? span.right - pad : span.left + pad;
}

/**
 * Клин между двумя живыми лентами.
 * Узкая или увезённая в сторону лента клин не открывает: парк за ней не едет.
 */
export function goreSpan(edges: AsphaltEdges): AsphaltSpan | null {
  const tracks = followAsphalt([null, null], edges);
  const first = tracks[0];
  const second = tracks[1];
  if (!first || !second) return null;
  if (first.right - first.left < 2 || second.right - second.left < 2) return null;
  const left = first.left + first.right <= second.left + second.right ? first : second;
  const right = left === first ? second : first;
  const gap = right.left - left.right;
  if (gap < 1 || gap > FORK_SPREAD + 2) return null;
  return { left: left.right, right: right.left };
}

/** Оболочка кадра: внешние кромки живых лент. Центр слота для этого не нужен. */
export function roadShell(edges: AsphaltEdges): AsphaltSpan {
  return asphaltShell(followAsphalt([null, null], edges)) ?? { left: 0, right: 0 };
}

/** Внешняя кромка оболочки. Декор и земля стоят снаружи неё. */
export function shellEdge(edges: AsphaltEdges, side: -1 | 1): number {
  const shell = roadShell(edges);
  return side < 0 ? shell.left : shell.right;
}

/** Внешние кромки живого асфальта. Схлопнутая лента в оболочку не входит. */
export function asphaltShell(spans: readonly (AsphaltSpan | null)[]): AsphaltSpan | null {
  let left = Infinity;
  let right = -Infinity;
  for (const span of spans) {
    if (!span || span.right - span.left < 0.5) continue;
    if (span.left < left) left = span.left;
    if (span.right > right) right = span.right;
  }
  if (!(left < right)) return null;
  return { left, right };
}

/**
 * Оболочка по рядам.
 * Кромка, перескочившая на другую ленту, схлопывается в точку с обеих сторон разрыва.
 * Откос не тянет полотно через этот разрыв.
 */
export function pinchShell(shells: readonly (AsphaltSpan | null)[]): AsphaltSpan[] {
  const pinched = pinchAsphalt(shells.map((shell) => [shell, null]))[0];
  for (let i = 1; i < pinched.length; i++) {
    const prev = pinched[i - 1];
    const here = pinched[i];
    if (!prev || !here) continue;
    if (Math.abs(spanCenter(here) - spanCenter(prev)) <= TRACK_JUMP) continue;
    pinched[i - 1] = collapsedSpan(prev);
    pinched[i] = collapsedSpan(here);
  }
  return pinched;
}

const RELEASE_INSET = 2.6;
const ATTACHED_GAP = 2.4;
const RIDEABLE = 2.4;
/** Насколько раньше внутренней кромки точка уже считается лентой. Одна цифра и для сиденья, и для курса. */
const RIBBON_ENTER = 0.35;

/** Где начинается курс съезда: чуть раньше внутренней кромки. */
export function exitCourseStart(edges: AsphaltEdges): number {
  return edges.rightInner - RIBBON_ENTER;
}

/**
 * Курс съезда. Лента должна быть достаточно широкой, чтобы по ней ехали.
 * Справа от асфальта курс тот же: обочина едет вместе с лентой.
 */
export function followsExit(lateral: number, edges: AsphaltEdges): boolean {
  if (!(exitWidth(edges) > RIDEABLE) || !Number.isFinite(lateral)) return false;
  return lateral >= exitCourseStart(edges);
}

/** Точка уже на асфальте съезда, даже если клин между лентами уже открыт. */
export function onExitRibbon(logical: number, edges: AsphaltEdges): boolean {
  if (!followsExit(logical, edges)) return false;
  return logical <= edges.rightOuter + RIBBON_ENTER;
}

/** Байк стоит на асфальте съезда — захватываем его. */
export function canGrabExit(logical: number, edges: AsphaltEdges): boolean {
  return onExitRibbon(logical, edges);
}

/** Пока клин не открылся, уход влево отпускает съезд. */
export function canReleaseExit(logical: number, edges: AsphaltEdges): boolean {
  return exitGap(edges) < ATTACHED_GAP && logical < edges.rightInner - RELEASE_INSET;
}

function riderOnExit(logical: number, _roadHalf: number, edges: AsphaltEdges): number | null {
  const width = exitWidth(edges);
  if (width < 1) return null;
  const pad = Math.min(0.7, width * 0.25);
  const inner = edges.rightInner + pad;
  const outer = Math.max(inner, edges.rightOuter - pad);
  // Уже на ленте — остаёмся в этой точке. Лента уехала — держимся за ближайшую кромку,
  // а не прыгаем в её центр и не возвращаемся на прямую.
  if (logical >= inner && logical <= outer) return logical;
  return logical < inner ? inner : outer;
}

/**
 * Метры от оси для полосы `logical`.
 * Без съезда это сама полоса. На съезде — точка на его ленте.
 * Другого бокового сдвига в игре нет.
 */
export function roadLateral(
  logical: number,
  roadHalf: number,
  edges: AsphaltEdges,
  riding: boolean,
): number {
  if (!Number.isFinite(logical)) return 0;
  if (!riding) return logical;
  return logical + exitRiderShift(logical, roadHalf, edges);
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
 * Прямая дорога на оси и съезд справа.
 * Пока разъезд меньше ширины полотна, съезд ещё приклеен к правой кромке:
 * на него можно перестроиться. Дальше между ними открывается клин.
 * При нулевом разъезде правая лента имеет нулевую ширину.
 * Съезд — отдельная лента шириной в 2 полосы.
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
  const targetHalf = Math.max(1.8, Math.min(road, EXIT_LANE_HALF));
  const grow = Math.min(1, open / Math.max(targetHalf, 0.001));
  const exitHalf = targetHalf * grow;
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

/**
 * Пределы руля в координатах полосы вокруг центра той дороги, по которой едут.
 * На съезде это его полуширина с тем же запасом, что у прямой дороги.
 * Пока ленты соединены и байк ещё на прямой, можно заехать на нос рампы.
 */
export function logicalRoadLimits(edge: AsphaltEdges, scale: number, riding = false): RoadLimits {
  const span = Math.max(scale, 0.05);
  const exitHalf = exitWidth(edge) * 0.5;
  const onExit = riding && exitHalf > 0.5;
  let minEdge: number;
  let maxEdge: number;
  if (onExit) {
    const joined = exitGap(edge) < ATTACHED_GAP;
    const center = exitRibbonCenter(edge) ?? 0;
    // Пока асфальт один, съезд — правая лента: держим байк на ней.
    if (joined) {
      minEdge = (edge.rightInner + RIBBON_MARGIN - center) / span;
      maxEdge = (edge.rightOuter - RIBBON_MARGIN - center) / span;
    } else {
      minEdge = (-exitHalf + RIBBON_MARGIN) / span;
      maxEdge = (exitHalf - RIBBON_MARGIN) / span;
    }
  } else {
    minEdge = (edge.leftOuter + RIBBON_MARGIN) / span;
    maxEdge = (edge.leftInner - RIBBON_MARGIN) / span;
    // Пока ленты действительно слиты, можно заехать на съезд.
    if (exitWidth(edge) > RIDEABLE && exitGap(edge) <= 0.01) {
      maxEdge = Math.max(maxEdge, (edge.rightOuter - RIBBON_MARGIN) / span);
    }
  }
  if (!Number.isFinite(minEdge) || !Number.isFinite(maxEdge)) return { min: 0, max: 0 };
  if (maxEdge < minEdge) {
    const mid = (minEdge + maxEdge) * 0.5;
    return { min: mid, max: mid };
  }
  return { min: minEdge, max: maxEdge };
}

/** Ширина съезда: две полосы в одну сторону. */
export const EXIT_LANE_HALF = 4.75;

/**
 * Полуширина дороги после взятого съезда.
 * На границе зоны она равна ширине съезда и за `fade` метров дорастает до биома.
 * К ширине шоссе, с которого съехали, не возвращается.
 */
export function arrivalHalf(local: number, fade: number, exitHalf: number, biomeHalf: number): number {
  const from = Number.isFinite(exitHalf) ? exitHalf : 0;
  const to = Number.isFinite(biomeHalf) ? biomeHalf : from;
  if (!(fade > 0) || !(local < fade)) return to;
  const u = Math.max(0, local / fade);
  const t = u * u * (3 - 2 * u);
  return from + (to - from) * t;
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
