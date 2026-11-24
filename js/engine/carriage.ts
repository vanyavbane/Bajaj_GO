/**
 * Проезжая часть в одной точке.
 * Фазу читает кадр дороги. Полосы, встречные и ось выходят из этой фазы.
 * Съезд — правая полоса этой дороги. Когда лента кончается, полосы нет:
 * на её месте уже новая дорога, без второй проезжей части.
 */

import { readExit, surfaceWorld, type ExitRead } from './exit.ts';
import { laneAnchor, mainHalf, type RoadFrame } from './fork.ts';
import { carriageLanes, directionEdge, laneGapOffsets, nearestLaneOffset, withExitLane, type CarriageLayout, type Road, type RoadWay } from './lanes.ts';
import type { LaneLayout } from './biomes.ts';

/**
 * ribbon — лента ещё сбоку, полосы старой дороги остаются её биомом.
 * road — одна дорога. После въезда это новая, старой ленты рядом нет.
 */
export type CarriagePhase = 'road' | 'ribbon';

export interface LiveCarriage {
  phase: CarriagePhase;
  lanes: CarriageLayout;
  /** Мировая ось полос разметки и трафика. */
  axis: number;
  /** 1, если смещения уже лежат внутри кромок. Иначе кромка делённая на крайнее смещение. */
  scale: number;
  /** Полуширина живого асфальта этой проезжей части, метры. */
  half: number;
  /** Полуширина асфальта полосы съезда. 0, если этой полосы нет. */
  exitHalf: number;
  /** Съезд этой точки. Лента есть только у spot.ribbon. */
  spot: ExitRead;
  way: RoadWay;
}

export interface CarriageQuery {
  frame: RoadFrame;
  /** Полосы биома в этой точке. На стыке это доминирующий биом. */
  biome: LaneLayout;
}

/**
 * Сжать смещения, чтобы внешний край крайней полосы не вылезал за кромку.
 * Край — это центр плюс полшага до соседней полосы. На своей ширине масштаб 1.
 * Сошедшая дорога сжимает полосы к оси, а не возвращает их на полный шаг.
 */
export function laneFit(half: number, offsets: readonly number[]): number {
  const sorted: number[] = [];
  let maxAbs = 0;
  for (const off of offsets) {
    if (typeof off !== 'number' || !Number.isFinite(off)) continue;
    sorted.push(off);
    maxAbs = Math.max(maxAbs, Math.abs(off));
  }
  const span = Math.max(0, Number.isFinite(half) ? half : 0);
  if (maxAbs <= 0.001) return 1;
  sorted.sort((a, b) => a - b);
  let pitch = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i]! - sorted[i - 1]!;
    if (gap > pitch) pitch = gap;
  }
  const edge = maxAbs + pitch * 0.5;
  if (!(edge > 0.001)) return 1;
  if (span <= 0.001) return 0.001;
  return Math.min(1, span / edge);
}

/** Смещение от оси, в котором мировая точка остаётся на месте. Нулевой масштаб сажает на ось. */
export function laneAtWorld(world: number, axis: number, scale: number): number {
  const span = Number.isFinite(scale) ? scale : 1;
  if (span === 0) return 0;
  const at = Number.isFinite(world) ? world : 0;
  const origin = Number.isFinite(axis) ? axis : 0;
  return (at - origin) / span;
}

/** Полосы, встречные, ось и ширина одной точки. Съезд дописывается правой полосой. */
export function carriageAt(query: CarriageQuery): LiveCarriage {
  const frame = query.frame;
  const spot = readExit(frame);
  const phase: CarriagePhase = spot.ribbon != null ? 'ribbon' : 'road';
  const half = mainHalf(frame.local);
  const base = carriageLanes(query.biome, 'two-way');
  const axis = laneAnchor(frame);
  const scale = laneFit(half, base.offsets);
  const span = scale !== 0 ? scale : 1;
  const ribbon = spot.ribbon;
  const lanes = ribbon == null ? base : withExitLane(base, (frame.origin + ribbon.center - axis) / span);
  return {
    phase,
    lanes,
    axis,
    scale,
    half,
    exitHalf: ribbon == null ? 0 : ribbon.half,
    spot,
    way: lanes.way,
  };
}

/** Штрих между полосами проезжей части. lat — мировая точка её оси. */
export interface LaneMark {
  lat: number;
  w: number;
}

/** Машина с ленты въезда садится на попутную полосу новой дороги и не разворачивается. */
export function forwardArrival(road: Road, lateral: number): number {
  const at = Number.isFinite(lateral) ? lateral : 0;
  return nearestLaneOffset(road, at, 'with');
}

/** Очередь ремонта держит машину только на той дороге, где нарисована яма. */
export function repairQueue(carOnExit: boolean, holeOnExit: boolean): boolean {
  return carOnExit === holeOnExit;
}

/** На ленте въезда новая машина рождается на попутной полосе. На дороге бросок берёт любую. */
export function birthLane(road: Road, onRibbon: boolean, roll: number): number {
  const pool = onRibbon ? road.lanes.filter((lane) => lane.direction === 'with') : road.lanes;
  const use = pool.length > 0 ? pool : road.lanes;
  const n = use.length;
  if (n === 0) return 0;
  const raw = Number.isFinite(roll) ? Math.floor(roll) : 0;
  const i = ((raw % n) + n) % n;
  return use[i]?.index ?? 0;
}

export interface ArrivalMove {
  offset: number;
  target: number;
  changing: boolean;
}

/** На новой дороге машина доезжает до попутной полосы. Место на ленте не прыгает. */
export function arrivalMove(road: Road, lateral: number): ArrivalMove {
  const at = Number.isFinite(lateral) ? lateral : 0;
  const target = forwardArrival(road, at);
  const changing = Math.abs(target - at) > 0.06;
  return { offset: changing ? at : target, target, changing };
}

/** Мир ещё на этой проезжей части. Лента, ушедшая в сторону, её уже не держит. */
export function carriageHolds(world: number, axis: number, half: number, slack = 6): boolean {
  if (!Number.isFinite(world) || !Number.isFinite(axis)) return false;
  const width = Number.isFinite(half) && half > 0 ? half : 0;
  const extra = Number.isFinite(slack) && slack > 0 ? slack : 0;
  return Math.abs(world - axis) <= width + extra;
}

/**
 * После аварии машина встаёт на ту же дорогу.
 * С ленты, которая уже стала дорогой, садится на попутную и едет вперёд.
 * Встречная на своей дороге остаётся встречной.
 */
export function accidentArrival(
  wasOnExit: boolean,
  exitRemains: boolean,
  road: Road,
  lateral: number,
): number {
  if (wasOnExit && !exitRemains) return forwardArrival(road, lateral);
  return Number.isFinite(lateral) ? lateral : 0;
}

/**
 * На боковой ленте все едут вперёд, даже если у нового биома есть встречные.
 * Встречный ход начинается, когда эта лента уже стала дорогой.
 */
export function ribbonDirection(
  onRibbon: boolean,
  direction: 'with' | 'against' | undefined,
): 'with' | 'against' {
  if (onRibbon) return 'with';
  return direction === 'against' ? 'against' : 'with';
}

/** Пока клин ещё не раскрылся, крайняя попутная может начать переезд на съезд. */
export function canStartExitJoin(args: {
  changingLane: boolean;
  lane: number;
  lastLane: number;
  roadRight: number;
  ribbonLeft: number;
}): boolean {
  if (args.changingLane || args.lane !== args.lastLane) return false;
  const roadRight = Number.isFinite(args.roadRight) ? args.roadRight : 0;
  const ribbonLeft = Number.isFinite(args.ribbonLeft) ? args.ribbonLeft : roadRight;
  return ribbonLeft - roadRight <= 2.4;
}

/** Шаг к ленте съезда, м/с. За один кадр клин не перепрыгивается. */
const EXIT_JOIN_SPEED = 8;

/**
 * Мир машины к ближайшей кромке ленты.
 * `arrived` — точка уже на асфальте съезда.
 */
export function approachExit(
  worldLat: number,
  ribbonLeft: number,
  ribbonRight: number,
  dt: number,
): { lat: number; arrived: boolean } {
  const left = Math.min(ribbonLeft, ribbonRight);
  const right = Math.max(ribbonLeft, ribbonRight);
  const lat = Number.isFinite(worldLat) ? worldLat : left;
  if (lat >= left - 0.05 && lat <= right + 0.05) {
    const seated = Math.min(right, Math.max(left, lat));
    return { lat: seated, arrived: true };
  }
  const aim = lat < left ? left : right;
  const room = aim - lat;
  const step = Math.max(0, Number.isFinite(dt) ? dt : 0) * EXIT_JOIN_SPEED;
  const next = lat + Math.sign(room) * Math.min(Math.abs(room), step);
  return { lat: next, arrived: next >= left && next <= right };
}

/**
 * Линейка той дороги, на которой сидят.
 * Пока лента прижата к шоссе, это ось шоссе. Отделившись, съезд — другая
 * дорога: ось на середине ленты, номер полосы в метрах от неё. Масштаб
 * сходящей дороги сюда не входит. Когда лента кончилась, это уже новая дорога.
 */
export function rideRuler(frame: RoadFrame, onExit: boolean, mainScale: number): { axis: number; scale: number } {
  const ribbon = readExit(frame).ribbon;
  if (onExit && ribbon != null && !ribbon.joined) {
    return { axis: frame.origin + ribbon.center, scale: 1 };
  }
  const scale = Number.isFinite(mainScale) && mainScale > 0 ? mainScale : 0.001;
  return { axis: laneAnchor(frame), scale };
}

/**
 * Мир машины. На отделившемся съезде смещение — метры от середины ленты.
 * На шоссе это по-прежнему полоса его списка.
 */
export function vehicleLat(road: LiveCarriage, offset: number, onExit = false): number {
  const ribbon = road.spot.ribbon;
  const lane = Number.isFinite(offset) ? offset : 0;
  if (onExit && ribbon != null && !ribbon.joined) {
    return surfaceWorld(road.axis, road.spot, true) + lane;
  }
  return carriageLat(road.axis, road.scale, lane);
}

/** Мир полосы на оси проезжей части. offset — смещение из её списка полос. */
export function carriageLat(axis: number, scale: number, offset: number): number {
  const span = Number.isFinite(scale) && scale !== 0 ? scale : 1;
  const lane = Number.isFinite(offset) ? offset : 0;
  const origin = Number.isFinite(axis) ? axis : 0;
  return origin + lane * span;
}

/** Штрихи наследуются от полос этой проезжей части и стоят на её оси. */
export function laneMarks(road: LiveCarriage): LaneMark[] {
  const scale = Number.isFinite(road.scale) && road.scale !== 0 ? road.scale : 1;
  return laneGapOffsets(road.lanes).map((offset) => ({
    lat: road.axis + offset * scale,
    w: 1,
  }));
}

/** Зазор между двумя жёлтыми линиями, метры. Они стоят по бокам границы хода. */
const SOLID_GAP = 0.22;

/**
 * Двойная сплошная этой дороги.
 * Она есть только там, где ход меняется. На съезде и на любой односторонней её нет.
 * Линии не едут за клином развилки: середина — граница хода на оси этой дороги.
 */
export function solidMarks(road: LiveCarriage): LaneMark[] {
  const edge = directionEdge(road.lanes);
  if (edge == null) return [];
  const scale = Number.isFinite(road.scale) && road.scale !== 0 ? road.scale : 1;
  const mid = road.axis + edge * scale;
  return [
    { lat: mid - SOLID_GAP, w: 1 },
    { lat: mid + SOLID_GAP, w: 1 },
  ];
}
