/**
 * Дорога собирается из полос. Смещения, скорости и ход — проекция этих полос.
 * Полосы читаются только из конфига, который выставил биом.
 * Городские «4 полосы и 2 встречные» больше нигде не подставляются молча:
 * если конфига нет или он разошёлся сам с собой, игра падает сразу.
 */

import type { BiomeId, LaneLayout } from './biomes.ts';

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
 * Полоса своей дороги. Отдельно от дороги её нет:
 * собрать можно только через `roadFrom`, читать — только с дороги.
 * Направление и сторона — свойства полосы, а не догадка по номеру.
 * На съезде обе полосы едут вперёд, но одна остаётся левой, другая правой.
 * `home` — направление, с которым полосу положили в дорогу.
 * Односторонний ход может временно пустить всех вперёд, `home` при этом не меняется.
 */
export interface Lane {
  index: number;
  /** Метры от оси этой дороги. Лево отрицательное. */
  offset: number;
  speed: number;
  direction: LaneDirection;
  /** Направление при сборке дороги. */
  home: LaneDirection;
  side: LaneSide;
  /** Правая полоса съезда. Пока лента есть, она принадлежит этой дороге. Когда лента кончается, полосы нет: на её месте уже новая дорога. */
  exit: boolean;
}

/** Полоса до сборки: где стоит, как быстро, куда едет. Индекс и сторону назначает дорога. */
export interface LanePiece {
  /** Метры от оси. Лево отрицательное. */
  offset: number;
  speed: number;
  direction: LaneDirection;
}

/**
 * Дорога — это её полосы слева направо.
 * Число, смещения, скорости, ширина и встречный ряд считаются из полос.
 */
export interface Road {
  lanes: Lane[];
  way: RoadWay;
  laneWidth: number;
  /** Число полос × ширина полосы. */
  width: number;
  count: number;
  /** Сколько полос слева подряд едут навстречу. Направление каждой полосы лежит на ней. */
  oncomingCount: number;
  offsets: number[];
  speeds: number[];
  startLane: number;
}

/**
 * Полосы в конкретной точке дороги, не каталог биома.
 * `oncomingCount` — сколько рядов сейчас встречные.
 * `biomeOncoming` — сколько их у биома, даже когда съезд обнулил живые встречные.
 */
export interface CarriageLayout extends LaneLayout {
  biomeOncoming: number;
}

type CarriageInput = Road & {
  biomeOncoming?: number;
};

/** Съезд — одна попутная полоса. Полотно шире полосы города, чтобы в него попасть на скорости. */
export const EXIT_LANE_WIDTH = 9;

/** Съезд собирается из одной попутной полосы на его оси. */
export function exitCarriage(id: BiomeId): CarriageLayout {
  const road = roadFrom([{ offset: 0, speed: 65, direction: 'with' }], EXIT_LANE_WIDTH);
  return { id, ...road, biomeOncoming: 0 };
}

/** Скорость правой полосы съезда, км/ч. */
const EXIT_LANE_SPEED = 65;

/**
 * Дорога с новой полосой справа.
 * Это и есть съезд: полоса той же дороги, не вторая дорога.
 * `offset` — метры от оси этой дороги до середины ленты.
 */
export function withExitLane(layout: CarriageLayout, offset: number): CarriageLayout {
  const pieces: LanePiece[] = [];
  for (const lane of layout.lanes) {
    if (lane.exit) continue;
    pieces.push({ offset: lane.offset, speed: lane.speed, direction: lane.home });
  }
  pieces.push({ offset, speed: EXIT_LANE_SPEED, direction: 'with' });
  const road = roadFrom(pieces, layout.laneWidth);
  for (const lane of road.lanes) lane.exit = lane.offset === offset;
  return {
    ...layout,
    ...road,
    startLane: layout.startLane,
    biomeOncoming: layout.biomeOncoming,
  };
}

function laneDirection(value: LaneDirection | undefined): LaneDirection {
  if (value !== 'against' && value !== 'with') throw new Error('У полосы нет направления');
  return value;
}

function pieceSpeed(speed: number): number {
  if (typeof speed !== 'number' || !Number.isFinite(speed)) {
    throw new Error('У полосы нет скорости');
  }
  return speed;
}

/**
 * Собрать дорогу из полос.
 * Полосы встают слева направо по смещению. Ход читается из их направлений.
 * Пустой набор дорогой не становится.
 */
export function roadFrom(pieces: readonly LanePiece[], laneWidth: number): Road {
  if (!(laneWidth > 0) || !Number.isFinite(laneWidth)) {
    throw new Error('Ширина полосы должна быть больше нуля');
  }
  if (pieces.length < 1) throw new Error('Дорогу собирают из полос');
  const sorted = pieces.slice().sort((a, b) => a.offset - b.offset);
  const lanes: Lane[] = [];
  for (let index = 0; index < sorted.length; index++) {
    const piece = sorted[index];
    if (!piece || typeof piece.offset !== 'number' || !Number.isFinite(piece.offset)) {
      throw new Error('У полосы нет смещения');
    }
    const direction = laneDirection(piece.direction);
    lanes.push({
      index,
      offset: piece.offset,
      speed: pieceSpeed(piece.speed),
      direction,
      home: direction,
      side: piece.offset < 0 ? 'left' : 'right',
      exit: false,
    });
  }
  let oncomingCount = 0;
  for (const lane of lanes) {
    if (lane.home !== 'against') break;
    oncomingCount += 1;
  }
  const offsets = lanes.map((lane) => lane.offset);
  const speeds = lanes.map((lane) => lane.speed);
  const way: RoadWay = lanes.some((lane) => lane.home === 'against') ? 'two-way' : 'one-way';
  return {
    lanes,
    way,
    laneWidth,
    width: lanes.length * laneWidth,
    count: lanes.length,
    oncomingCount,
    offsets,
    speeds,
    startLane: offsets[offsets.length - 1] ?? 0,
  };
}

/** Текущий ход: на односторонней все едут вперёд, `home` остаётся направлением сборки. */
function lanesInWay(rows: readonly Lane[], way: RoadWay): Lane[] {
  return rows.map((lane) => ({
    ...lane,
    direction: way === 'one-way' ? 'with' : lane.home,
  }));
}

/** Полосы одного направления этой дороги, слева направо. */
function lanesGoing(road: Road, direction: LaneDirection): readonly Lane[] {
  return road.lanes.filter((lane) => lane.direction === direction);
}

/**
 * Попутная полоса по умолчанию.
 * Если есть встречные, это ближайшая к оси попутная. Иначе крайняя правая.
 */
export function defaultRunOffset(road: Road): number {
  const forward = lanesGoing(road, 'with');
  if (forward.length === 0) return road.lanes[road.lanes.length - 1]?.offset ?? 0;
  if (directionEdge(road) == null) {
    return outerLane(road, 'right', 'with')?.offset ?? forward[forward.length - 1]?.offset ?? 0;
  }
  return forward[0]?.offset ?? 0;
}

/** Ближайшая полоса заданного направления. Если таких нет, ближайшая из всех. */
export function nearestLaneOffset(road: Road, lateral: number, direction: LaneDirection = 'with'): number {
  const pool = lanesGoing(road, direction);
  const use = pool.length > 0 ? pool : road.lanes;
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
export function laneIndexByRoll(road: Road, direction: LaneDirection, roll: number): number {
  const pool = lanesGoing(road, direction);
  const use = pool.length > 0 ? pool : road.lanes;
  if (use.length === 0) return 0;
  const span = Math.max(0, Math.min(0.999999, Number.isFinite(roll) ? roll : 0));
  return use[Math.floor(span * use.length)]?.index ?? 0;
}

/** Соседняя попутная полоса: с крайней правой шаг внутрь, с остальных — наружу. */
export function besideWithLane(road: Road, index: number): Lane | null {
  const forward = lanesGoing(road, 'with');
  const pos = forward.findIndex((lane) => lane.index === index);
  if (pos < 0 || forward.length < 2) return null;
  return pos >= forward.length - 1 ? forward[pos - 1] ?? null : forward[pos + 1] ?? null;
}

/** Крайняя полоса заданной стороны и направления. */
export function outerLane(road: Road, side: LaneSide, direction: LaneDirection): Lane | null {
  let found: Lane | null = null;
  for (const lane of road.lanes) {
    if (lane.exit || lane.side !== side || lane.direction !== direction) continue;
    if (!found || Math.abs(lane.offset) > Math.abs(found.offset)) found = lane;
  }
  return found;
}

/**
 * Направление в точке смещения.
 * Левее границы хода — навстречу. На дороге без встречных всё едет вперёд.
 */
export function offsetDirection(road: Road, offset: number): LaneDirection {
  const edge = directionEdge(road);
  if (edge == null) return 'with';
  const at = Number.isFinite(offset) ? offset : 0;
  return at < edge ? 'against' : 'with';
}

/** Граница встречного и попутного хода. null, если вся дорога едет в одну сторону. */
export function directionEdge(road: Road): number | null {
  const lanes = road.lanes;
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
  road: T,
  way: RoadWay,
): Omit<T, 'oncomingCount' | 'biomeOncoming' | 'way' | 'lanes'> & CarriageStamp & { lanes: Lane[] } {
  if (road.lanes.length < 1) throw new Error('У дороги нет полос');
  const biomeOncoming = road.biomeOncoming ?? road.oncomingCount;
  const oncomingCount = way === 'one-way' ? 0 : biomeOncoming;
  return {
    ...road,
    oncomingCount,
    biomeOncoming,
    way,
    lanes: lanesInWay(road.lanes, way),
  };
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
export function laneGapOffsets(road: Road): number[] {
  const marks: number[] = [];
  const lanes = road.lanes;
  for (let i = 0; i < lanes.length - 1; i++) {
    const left = lanes[i];
    const right = lanes[i + 1];
    if (!left || !right || left.exit || right.exit || left.direction !== right.direction) continue;
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
