/**
 * Дорога и съезд вправо.
 * Форма съезда — рецепт блоков в blocks.ts. Здесь только кромки одного блока.
 * Кромки считаются относительно центра новой дороги. Этот центр съезд не переносит.
 * Взятый въезд идёт в новую дорогу, старая сужается и сходит. Прямой ход уводит съезд в сторону.
 *
 * ChosenSide: -1 съезд закрыт, +1 въезд идёт в новую дорогу, 0 выбор ещё открыт.
 */

import { RIGHT_EXIT, compileExit, placedBlock, spanAt } from './blocks.ts';
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
/** Нос съезда стоит на столько метров раньше границы зоны. */
export const FORK_LEAD = EXIT_PLAN.length;
export const FORK_SPREAD = EXIT_PLAN.spread;

/** Линейка съезда для курса. Курс не складывает длины блоков сам. */
export interface ExitClock {
  /** Нос стоит на столько метров раньше конца зоны. */
  lead: number;
  /** Сколько метров курс поворачивает. Это блок отхода. */
  turn: number;
  /** С этой метки после носа въезд уже стал новой дорогой. Конец закрытия. */
  ownAfter: number;
  /** Конец общего подхода: здесь фиксируется выбор. */
  choiceAt: number;
  spread: number;
}

/** Метры рецепта. Курс по ним знает, когда въезд уже пришёл в новую дорогу. */
export function exitClock(): ExitClock {
  const seal = EXIT_PLAN.exit.find((span) => span.kind === 'seal');
  if (!seal) throw new Error('Съезд без закрытия: курс не знает, когда въезд приходит в новую дорогу');
  return {
    lead: EXIT_PLAN.length,
    turn: EXIT_PLAN.diverge,
    ownAfter: seal.start + seal.length,
    choiceAt: EXIT_PLAN.choiceAt,
    spread: EXIT_PLAN.spread,
  };
}

/** Нахлёст половин асфальта, чтобы на прямой не было щели по оси. */
const FORK_SEAM = 0.16;

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
 * Насколько рецепт держит съезд открытым, метры.
 * От носа растёт до пика и держится до конца рецепта.
 * Сужение старой дороги и ход въезда читают кромки кадра, не эта кривая.
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

/**
 * Занятость с учётом кромок.
 * Взятый въезд гасит развилку по мере прихода ленты к новой дороге.
 * Уход старой кромки в сторону эту занятость не держит.
 */
export function forkOccupancy(
  amount: number,
  phase: ExitKind,
  chosen: ChosenSide,
  edges: AsphaltEdges,
  close = 0,
): number {
  const raw = liveForkAmount(amount, phase, chosen);
  if (chosen !== 1 || phase !== 'end') return raw;
  if (!(exitWidth(edges) > 1)) return 0;
  const left = Math.max(0, Math.min(1, close));
  return raw * (1 - left);
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
function exitPhase(d: number): ExitPhase {
  const span = spanAt(EXIT_PLAN, d);
  if (!span) return { kind: 'none', t: 0, open: 0 };
  if (span.kind === 'split') return { kind: 'diverge', t: span.u, open: smooth01(span.u) };
  if (span.kind === 'fork') return { kind: 'run', t: 1, open: 1 };
  if (span.kind === 'seal') return { kind: 'end', t: smooth01(span.u), open: 1 };
  return { kind: 'settle', t: smooth01(span.u), open: 1 };
}

/** Дорога ширины `half` с центром `center`. Правой ленты нет. */
function roadAt(center: number, half: number): AsphaltEdges {
  return {
    leftOuter: center - half,
    leftInner: center + half,
    rightInner: center + half,
    rightOuter: center + half,
  };
}

/** Середина съезда, когда он уже отошёл на полный разъезд. */
function entranceHome(road: number): number {
  return exitRibbonMid(branchEdges(road, FORK_SPREAD));
}

/**
 * Взятый въезд за закрытие.
 * Старая дорога сужается на месте. Въезд остаётся лентой на своей линии до конца закрытия:
 * путь подхватывает её в тот же метр, и полотно не рвётся.
 */
function takenEntrance(road: number, arrive: number, t: number): AsphaltEdges {
  const home = entranceHome(road);
  const fromHalf = exitWidth(branchEdges(road, FORK_SPREAD)) * 0.5;
  const dest = Math.max(0, Number.isFinite(arrive) ? arrive : fromHalf);
  const u = Math.max(0, Math.min(1, t));
  const oldHalf = road * (1 - u);
  const entranceHalf = fromHalf + (dest - fromHalf) * u;
  return {
    leftOuter: -oldHalf,
    leftInner: oldHalf,
    rightInner: home - entranceHalf,
    rightOuter: home + entranceHalf,
  };
}

/** Кромки поставленного блока. Непостроенный хвост остаётся развилкой, его ещё не закрывают. */
function blockEdges(half: number, block: PlacedBlock | null, chosen: ChosenSide, endWeight: number, arrive: number): AsphaltEdges {
  const road = Math.max(0, Number.isFinite(half) ? half : 0);
  const dest = Math.max(0, Number.isFinite(arrive) ? arrive : EXIT_LANE_HALF);
  if (!block) return branchEdges(road, 0);
  if (!block.built) return branchEdges(road, FORK_SPREAD);
  if (block.kind === 'split') return branchEdges(road, FORK_SPREAD * smooth01(block.u));
  if (block.kind === 'fork') return branchEdges(road, FORK_SPREAD);
  if (block.kind === 'seal') {
    const t = smooth01(block.u) * Math.max(0, Math.min(1, endWeight));
    if (chosen === 1) return takenEntrance(road, dest, t);
    const edge = branchEdges(road, FORK_SPREAD);
    // Невыбранная ветка уходит в сторону и исчезает, не схлопываясь к выбранной.
    if (chosen === -1) {
      const away = t * FORK_SPREAD * 1.5;
      const w = exitWidth(edge) * (1 - t);
      const mid = exitRibbonMid(edge) + away;
      edge.rightInner = mid - w * 0.5;
      edge.rightOuter = mid + w * 0.5;
    }
    return edge;
  }
  // Въезд уже стал новой дорогой. За запас она садится на центр пути.
  // Прямой ход оставляет старую.
  if (chosen === 1) return roadAt(entranceHome(road) * (1 - smooth01(block.u)), dest);
  return branchEdges(road, 0);
}

/** Середина правой ленты. Одна формула и для полос, и для курса. */
export function exitRibbonMid(edges: AsphaltEdges): number {
  return (edges.rightInner + edges.rightOuter) * 0.5;
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
  /** Центр новой дороги. Съезд его не переносит. */
  baseOrigin: number;
  endWeight?: number;
  /** Полуширина дороги, в которую приходит въезд. Без числа это ширина самого съезда. */
  arriveHalf?: number;
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
  const block = placedBlock(EXIT_PLAN, query.forkDistance, chosen);
  const phase = exitPhase(query.forkDistance);
  const weighted: ExitPhase = phase.kind === 'end' && chosen !== 0
    ? { ...phase, t: phase.t * endWeight }
    : phase;
  const origin = finiteOrigin(query.baseOrigin);
  const arrive = typeof query.arriveHalf === 'number' ? query.arriveHalf : EXIT_LANE_HALF;
  const local = blockEdges(query.half, block, chosen, endWeight, arrive);
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
 * Обочина от кромки своей дороги.
 * Точка в клине через курс клина не проводится: шаг идёт поперёк курса кромки.
 */
export function besidePoint(
  pose: { x: number; z: number; rx: number; rz: number },
  edge: number,
  lat: number,
): { x: number; z: number } {
  const from = Number.isFinite(edge) ? edge : 0;
  const to = Number.isFinite(lat) ? lat : from;
  const shift = to - from;
  return { x: pose.x + pose.rx * shift, z: pose.z + pose.rz * shift };
}

/** Центр полос той дороги, которая в левом слоте. У ленты съезда своя середина. */
export function laneAnchor(frame: RoadFrame): number {
  const mid = (frame.local.leftOuter + frame.local.leftInner) * 0.5;
  return frame.origin + mid;
}

/** Полоса в мировых метрах. riding оставляет байка на боковой ленте старым сдвигом. */
export function laneMeters(lane: number, scale: number, frame: RoadFrame, riding: boolean): number {
  const span = Number.isFinite(scale) && scale !== 0 ? scale : 1;
  const logical = (Number.isFinite(lane) ? lane : 0) * span;
  if (riding) return frame.origin + roadLateral(logical, frame.local, true);
  return laneAnchor(frame) + logical;
}

function exitGap(edges: AsphaltEdges): number {
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
/** Полоса на левой дороге. Мир за её кромкой садится на край, от центра этой дороги. */
export function landOnCarriage(origin: number, edges: AsphaltEdges, world: number, span: number): number {
  const scale = Number.isFinite(span) && span !== 0 ? span : 1;
  const base = Number.isFinite(origin) ? origin : 0;
  const mid = (edges.leftOuter + edges.leftInner) * 0.5;
  const axis = base + mid;
  const right = base + edges.leftInner - RIBBON_MARGIN;
  const left = base + edges.leftOuter + RIBBON_MARGIN;
  const at = Number.isFinite(world) ? world : axis;
  return (Math.min(Math.max(at, left), right) - axis) / scale;
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
export function asphaltSpan(edges: AsphaltEdges): { left: number; right: number; mid: number; width: number } {
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
function asphaltSpans(edges: AsphaltEdges): AsphaltSpan[] {
  const spans: AsphaltSpan[] = [];
  if (edges.leftInner - edges.leftOuter > 0.05) spans.push({ left: edges.leftOuter, right: edges.leftInner });
  if (edges.rightOuter - edges.rightInner > 0.05) spans.push({ left: edges.rightInner, right: edges.rightOuter });
  return spans;
}

/** Внешняя лента стороны. Обочина меряет её полуширину, а не середину обеих лент. */
export function outerRibbon(edges: AsphaltEdges, side: -1 | 1): { edge: number; center: number; half: number } | null {
  const spans = asphaltSpans(edges);
  let best: AsphaltSpan | null = null;
  for (const span of spans) {
    if (!best || (side < 0 ? span.left < best.left : span.right > best.right)) best = span;
  }
  if (!best) return null;
  const half = (best.right - best.left) * 0.5;
  const center = (best.left + best.right) * 0.5;
  return { edge: side < 0 ? best.left : best.right, center, half };
}

/**
 * Земля у точки lat.
 * `dist` — метры от центра ближайшей ленты. На асфальте это 0.
 * `half` — полуширина этой ленты, откос считается от неё.
 */
export function groundAt(edges: AsphaltEdges, lat: number): { dist: number; half: number } {
  const spans = asphaltSpans(edges);
  if (spans.length === 0) return { dist: Math.abs(lat), half: 0 };
  for (const span of spans) {
    if (lat >= span.left && lat <= span.right) {
      return { dist: 0, half: (span.right - span.left) * 0.5 };
    }
  }
  let best = spans[0];
  let edge = best ? best.left : 0;
  let bestD = Infinity;
  for (const span of spans) {
    const leftD = Math.abs(lat - span.left);
    const rightD = Math.abs(lat - span.right);
    const d = Math.min(leftD, rightD);
    if (d < bestD) {
      bestD = d;
      best = span;
      edge = leftD <= rightD ? span.left : span.right;
    }
  }
  const half = best ? (best.right - best.left) * 0.5 : 0;
  return { dist: half + Math.abs(lat - edge), half };
}

/**
 * Две ленты асфальта.
 * Лента держится за свой кусок.
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

/** Насколько нужно уйти правее кромки прямой, чтобы это уже был ход на съезд. */
const EXIT_INTENT = 1.6;

/**
 * Байк выбрал съезд корпусом: он на ленте или уже правее прямой.
 * Касание кромки ещё не считается.
 */
export function reachedExit(lateral: number, edges: AsphaltEdges): boolean {
  if (!(exitWidth(edges) > RIDEABLE) || !Number.isFinite(lateral)) return false;
  return onExitRibbon(lateral, edges) || lateral > edges.leftInner + EXIT_INTENT;
}

/** Довоз до ленты, м/с. У самой кромки он спадает, чтобы не пронести байк на ту сторону. */
const EXIT_PULL = 16;
const EXIT_PULL_EASE = 8;

/**
 * Скорость к ленте, м/с. Только в клине, когда байк уже ушёл с прямой и ещё не на асфальте.
 * На самой ленте и на прямой догонять нечего.
 * Последние метры до кромки скорость падает до нуля.
 */
export function exitEntryPull(lateral: number, edges: AsphaltEdges): number {
  if (!reachedExit(lateral, edges) || onExitRibbon(lateral, edges)) return 0;
  const gap = edges.rightInner - lateral;
  if (!(gap > 0)) return 0;
  if (gap >= EXIT_PULL_EASE) return EXIT_PULL;
  return EXIT_PULL * (gap / EXIT_PULL_EASE);
}

/** Пока клин не открылся, уход влево отпускает съезд. */
export function canReleaseExit(logical: number, edges: AsphaltEdges): boolean {
  return exitGap(edges) < ATTACHED_GAP && logical < edges.rightInner - RELEASE_INSET;
}

function riderOnExit(logical: number, edges: AsphaltEdges): number | null {
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
export function roadLateral(logical: number, edges: AsphaltEdges, riding: boolean): number {
  if (!Number.isFinite(logical)) return 0;
  if (!riding) return logical;
  return logical + exitRiderShift(logical, edges);
}

/** Сдвиг на ленту съезда. Байк остаётся на ветке, пока она сбоку. */
function exitRiderShift(logical: number, edges: AsphaltEdges): number {
  const world = riderOnExit(logical, edges);
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
 * `enter` — съезд ещё можно взять. Тогда правая стена стоит за его внешней кромкой,
 * даже если между лентами уже есть клин. После отказа стена остаётся на прямой.
 */
export function logicalRoadLimits(edge: AsphaltEdges, scale: number, riding = false, enter = false): RoadLimits {
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
    // Полоса байка считается от центра его дороги, не от нуля сплайна.
    const roadMid = (edge.leftOuter + edge.leftInner) * 0.5;
    minEdge = (edge.leftOuter + RIBBON_MARGIN - roadMid) / span;
    maxEdge = (edge.leftInner - RIBBON_MARGIN - roadMid) / span;
    const reachable = (enter || exitGap(edge) <= 0.01) && exitWidth(edge) > RIDEABLE;
    if (reachable) {
      maxEdge = Math.max(maxEdge, (edge.rightOuter - RIBBON_MARGIN - roadMid) / span);
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
