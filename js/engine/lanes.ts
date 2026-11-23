/**
 * Полосы читаются только из конфига, который выставил биом.
 * Городские «4 полосы и 2 встречные» больше нигде не подставляются молча:
 * если конфига нет или он разошёлся сам с собой, игра падает сразу.
 */

import type { LaneLayout } from './biomes.ts';

export interface LaneSource {
  laneCount?: number;
  oncomingCount?: number;
  LANE_OFFSETS?: number[];
  LANE_SPEEDS?: number[];
  START_LANE?: number;
}

/** Односторонняя — только попутные. Двусторонняя — есть встречные. */
export type RoadWay = 'one-way' | 'two-way';

/** По ходу дороги, в сторону роста s, или навстречу. */
export type LaneDirection = 'with' | 'against';

/** Сторона этой дороги. Лево — отрицательное смещение от её оси. */
export type LaneSide = 'left' | 'right';

/**
 * Одна полоса одной дороги.
 * Направление и сторона — свойства полосы, а не догадка по номеру.
 * На съезде обе полосы едут вперёд, но одна остаётся левой, другая правой.
 */
export interface Lane {
  index: number;
  /** Метры от оси этой дороги. Лево отрицательное. */
  offset: number;
  speed: number;
  direction: LaneDirection;
  side: LaneSide;
}

/**
 * Полосы в конкретной точке дороги, не каталог биома.
 * `oncomingCount` — сколько рядов сейчас встречные.
 * `biomeOncoming` — сколько их у биома, даже когда съезд обнулил живые встречные.
 */
export interface CarriageLayout extends LaneLayout {
  biomeOncoming: number;
  way: RoadWay;
}

type CarriageInput = {
  oncomingCount: number;
  biomeOncoming?: number;
  way?: RoadWay;
};

/** Съезд — одна попутная полоса. Полотно шире полосы города, чтобы в него попасть на скорости. */
export const EXIT_LANE_WIDTH = 9;

export function exitCarriage(id: LaneLayout['id']): CarriageLayout {
  return {
    id,
    count: 1,
    oncomingCount: 0,
    biomeOncoming: 0,
    way: 'one-way',
    laneWidth: EXIT_LANE_WIDTH,
    width: EXIT_LANE_WIDTH,
    offsets: [0],
    speeds: [65],
    startLane: 0,
  };
}

/**
 * Полосы дороги слева направо.
 * Двусторонняя: левые `oncomingCount` полос едут навстречу, остальные по ходу.
 * Односторонняя: все по ходу, левая и правая стороны не пропадают.
 * Сторона — знак смещения. Ноль лежит на правой стороне.
 */
export function lanesOf(layout: {
  offsets?: readonly number[] | null;
  speeds?: readonly number[] | null;
  oncomingCount?: number;
  way?: RoadWay;
}): Lane[] {
  const offsets = layout.offsets ?? [];
  const speeds = layout.speeds ?? [];
  const way = layout.way === 'one-way' ? 'one-way' : 'two-way';
  const against = way === 'one-way' ? 0 : Math.max(0, layout.oncomingCount ?? 0);
  const lanes: Lane[] = [];
  for (let index = 0; index < offsets.length; index++) {
    const offset = offsets[index];
    const speed = speeds[index];
    if (typeof offset !== 'number' || !Number.isFinite(offset)) continue;
    lanes.push({
      index,
      offset,
      speed: typeof speed === 'number' && Number.isFinite(speed) ? speed : 0,
      direction: index < against ? 'against' : 'with',
      side: offset < 0 ? 'left' : 'right',
    });
  }
  return lanes;
}

/** Полосы одного направления, слева направо. */
export function lanesGoing(lanes: readonly Lane[], direction: LaneDirection): Lane[] {
  return lanes.filter((lane) => lane.direction === direction);
}

/**
 * Попутная полоса по умолчанию.
 * Если есть встречные, это ближайшая к оси попутная. Иначе крайняя правая.
 */
export function defaultRunOffset(lanes: readonly Lane[]): number {
  const forward = lanesGoing(lanes, 'with');
  if (forward.length === 0) return lanes[lanes.length - 1]?.offset ?? 0;
  if (directionEdge(lanes) == null) {
    return outerLane(lanes, 'right', 'with')?.offset ?? forward[forward.length - 1]?.offset ?? 0;
  }
  return forward[0]?.offset ?? 0;
}

/** Ближайшая полоса заданного направления. Если таких нет, ближайшая из всех. */
export function nearestLaneOffset(lanes: readonly Lane[], lateral: number, direction: LaneDirection = 'with'): number {
  const pool = lanesGoing(lanes, direction);
  const use = pool.length > 0 ? pool : lanes;
  let best = use[0]?.offset ?? 0;
  let bestDist = Infinity;
  const target = Number.isFinite(lateral) ? lateral : 0;
  for (const lane of use) {
    const dist = Math.abs(lane.offset - target);
    if (dist < bestDist) {
      bestDist = dist;
      best = lane.offset;
    }
  }
  return best;
}

/** Случайная полоса направления. roll — 0…1. */
export function laneIndexByRoll(lanes: readonly Lane[], direction: LaneDirection, roll: number): number {
  const pool = lanesGoing(lanes, direction);
  const use = pool.length > 0 ? pool : lanes;
  if (use.length === 0) return 0;
  const span = Math.max(0, Math.min(0.999999, Number.isFinite(roll) ? roll : 0));
  return use[Math.floor(span * use.length)]?.index ?? 0;
}

/** Соседняя попутная полоса: с крайней правой шаг внутрь, с остальных — наружу. */
export function besideWithLane(lanes: readonly Lane[], index: number): Lane | null {
  const forward = lanesGoing(lanes, 'with');
  const pos = forward.findIndex((lane) => lane.index === index);
  if (pos < 0 || forward.length < 2) return null;
  return pos >= forward.length - 1 ? forward[pos - 1] ?? null : forward[pos + 1] ?? null;
}

/** Крайняя полоса заданной стороны и направления. */
export function outerLane(lanes: readonly Lane[], side: LaneSide, direction: LaneDirection): Lane | null {
  let found: Lane | null = null;
  for (const lane of lanes) {
    if (lane.side !== side || lane.direction !== direction) continue;
    if (!found || Math.abs(lane.offset) > Math.abs(found.offset)) found = lane;
  }
  return found;
}

/**
 * Направление в точке смещения.
 * Левее границы хода — навстречу. На дороге без встречных всё едет вперёд.
 */
export function offsetDirection(lanes: readonly Lane[], offset: number): LaneDirection {
  const edge = directionEdge(lanes);
  if (edge == null) return 'with';
  const at = Number.isFinite(offset) ? offset : 0;
  return at < edge ? 'against' : 'with';
}

/** Граница встречного и попутного хода. null, если вся дорога едет в одну сторону. */
export function directionEdge(lanes: readonly Lane[]): number | null {
  for (let i = 0; i < lanes.length - 1; i++) {
    const left = lanes[i];
    const right = lanes[i + 1];
    if (!left || !right || left.direction === right.direction) continue;
    return (left.offset + right.offset) * 0.5;
  }
  return null;
}

/** На односторонней встречная полоса становится попутной. Смещения полос те же. */
export function carriageLanes<T extends CarriageInput>(
  lanes: T,
  way: RoadWay,
): Omit<T, 'oncomingCount' | 'biomeOncoming' | 'way'> & CarriageStamp {
  const biomeOncoming = lanes.biomeOncoming ?? lanes.oncomingCount;
  const oncomingCount = way === 'one-way' ? 0 : biomeOncoming;
  return { ...lanes, oncomingCount, biomeOncoming, way };
}

/** То, что carriageLanes всегда дописывает к конфигу биома. */
export interface CarriageStamp {
  oncomingCount: number;
  biomeOncoming: number;
  way: RoadWay;
}

export interface LaneConfig {
  count: number;
  oncoming: number;
  offsets: number[];
  speeds: number[];
  startLane: number;
}

function finiteNumbers(values: readonly unknown[], count: number): number[] | null {
  if (values.length !== count) return null;
  const out: number[] = [];
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    out.push(value);
  }
  return out;
}

export function readLanes(state: LaneSource | null | undefined): LaneConfig {
  const offsets = state?.LANE_OFFSETS;
  const count = state?.laneCount;
  const oncoming = state?.oncomingCount;
  const speeds = state?.LANE_SPEEDS;
  const laneOffsets = Array.isArray(offsets) && typeof count === 'number' && Number.isInteger(count) && count >= 1
    ? finiteNumbers(offsets, count)
    : null;
  if (!laneOffsets || typeof count !== 'number') {
    throw new Error('Полосы дороги не заданы. Их выставляет applyLaneConfig в js/biome.js до остальной сцены.');
  }
  if (typeof oncoming !== 'number' || !Number.isInteger(oncoming) || oncoming < 0 || oncoming >= count) {
    throw new Error(`Встречных полос ${oncoming} при ${count} полосах. Проверь oncoming в BIOMES.`);
  }
  const laneSpeeds = Array.isArray(speeds) ? finiteNumbers(speeds, count) : null;
  if (!laneSpeeds) {
    throw new Error('LANE_SPEEDS должен совпадать с числом полос текущего биома.');
  }
  const start = state?.START_LANE;
  const fallback = laneOffsets[count - 1] ?? 0;
  const startLane = typeof start === 'number' && Number.isFinite(start) ? start : fallback;
  return { count, oncoming, offsets: laneOffsets, speeds: laneSpeeds, startLane };
}

/** Штрих между соседними полосами одного направления. Смена направления — жёлтая ось, не штрих. */
export function laneGapOffsets(lanes: readonly Lane[]): number[] {
  const marks: number[] = [];
  for (let i = 0; i < lanes.length - 1; i++) {
    const left = lanes[i];
    const right = lanes[i + 1];
    if (!left || !right || left.direction !== right.direction) continue;
    marks.push((left.offset + right.offset) * 0.5);
  }
  return marks;
}

/** Одна и та же полоса, даже если у соседних биомов разный номер. Шаг полос от 4.3 м. */
export function sameLaneOffset(a: number, b: number): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1.6;
}

/** Индекс полосы, чей центр ближе всего к смещению. Номер из другого биома не переносится. */
export function nearestLaneIndex(offsets: number[], lateral: number): number {
  let best = 0;
  let bestDist = Infinity;
  const target = Number.isFinite(lateral) ? lateral : 0;
  for (let i = 0; i < offsets.length; i++) {
    const offset = offsets[i];
    if (typeof offset !== 'number' || !Number.isFinite(offset)) continue;
    const dist = Math.abs(offset - target);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/** Индекс полосы внутри текущего конфига. Дробное и пустое значение прижимается к диапазону. */
export function clampLaneIndex(index: number, count: number): number {
  const n = Math.round(Number(index));
  const raw = Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(count - 1, raw));
}
