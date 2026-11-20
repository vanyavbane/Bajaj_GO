/**
 * Проезжая часть в одной точке.
 * Фазу читает кадр дороги. Полосы, встречные и ось выходят из этой фазы.
 * Лента сбоку не подменяет полосы старой дороги.
 * Въезд становится новой дорогой, когда старая уже сошла. До этого съезд остаётся съездом.
 */

import { exitLaneOpen, exitRibbonCenter, exitWidth, laneAnchor, type RoadFrame } from './fork.ts';
import type { RouteChoice } from './route.ts';
import { carriageLanes, directionEdge, exitCarriage, laneGapOffsets, lanesOf, type CarriageLayout, type RoadWay } from './lanes.ts';
import type { LaneLayout } from './biomes.ts';
import type { SeatKind } from './seat.ts';

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
  way: RoadWay;
}

export interface CarriageQuery {
  frame: RoadFrame;
  /** Полосы биома в этой точке. На стыке это доминирующий биом. */
  biome: LaneLayout;
}

function mainHalf(frame: RoadFrame): number {
  return Math.max(0, frame.local.leftInner - frame.local.leftOuter) * 0.5;
}

/** Полуширина асфальта дороги. Лента съезда свою ширину считает отдельно. */
function carriageHalf(frame: RoadFrame): number {
  return mainHalf(frame);
}

/** Сжать смещения, только если крайняя полоса уже за кромкой. */
export function laneFit(half: number, offsets: readonly number[]): number {
  let maxAbs = 0;
  for (const off of offsets) {
    if (typeof off === 'number' && Number.isFinite(off)) maxAbs = Math.max(maxAbs, Math.abs(off));
  }
  const span = Math.max(0, Number.isFinite(half) ? half : 0);
  if (maxAbs <= 0.001 || span <= 0.001) return 1;
  return Math.min(1, span / maxAbs);
}

/** Фаза кадра. Пока у съезда есть лента, она сбоку. Дорогу она не заменяет. */
export function carriagePhase(frame: RoadFrame): CarriagePhase {
  if (exitRibbonCenter(frame.local) != null) return 'ribbon';
  return 'road';
}

function finish(phase: CarriagePhase, lanes: CarriageLayout, frame: RoadFrame, half: number): LiveCarriage {
  return {
    phase,
    lanes,
    axis: laneAnchor(frame),
    scale: laneFit(half, lanes.offsets),
    half,
    way: lanes.way,
  };
}

/** Полосы, встречные, ось и ширина одной точки. */
export function carriageAt(query: CarriageQuery): LiveCarriage {
  const phase = carriagePhase(query.frame);
  return finish(phase, carriageLanes(query.biome, 'two-way'), query.frame, carriageHalf(query.frame));
}

/** Штрих между полосами проезжей части. lat — мировая точка её оси. */
export interface LaneMark {
  lat: number;
  w: number;
}

/**
 * Боковая лента как своя проезжая часть.
 * Пока она склеена с шоссе, штрихов у неё нет: это ещё не отдельная дорога.
 * Когда съезд уже пришёл в дорогу, отдельной ленты нет.
 */
export function sideRibbon(road: LiveCarriage, frame: RoadFrame): LiveCarriage | null {
  if (road.phase !== 'ribbon' || !exitLaneOpen(frame.local)) return null;
  const ribbon = riderCarriage(road, frame, 'exit');
  if (ribbon.way !== 'one-way') return null;
  return ribbon;
}

/** Дороги в точке. main есть всегда. exit — боковая лента, пока она ещё не пришла в дорогу. */
export interface DriveRoads {
  main: LiveCarriage;
  exit: LiveCarriage | null;
}

/** Прямая убирает съезд из списка дорог. Пока выбор открыт или взят, лента — вторая дорога. */
export function roadsAt(main: LiveCarriage, frame: RoadFrame, choice: RouteChoice): DriveRoads {
  return {
    main,
    exit: choice === 'straight' ? null : sideRibbon(main, frame),
  };
}

/**
 * Машина едет по одной дороге из списка.
 * На съезд садится только крайняя попутная, и только пока съезд ещё боковая дорога.
 * Кто уже на нём, остаётся, пока эта дорога есть в списке.
 */
export function carFollowsRibbon(args: {
  hasExit: boolean;
  mainPhase: CarriagePhase;
  following: boolean;
  changingLane: boolean;
  lane: number;
  lastLane: number;
  runLanes: number;
}): boolean {
  if (!args.hasExit) return false;
  if (args.following) return true;
  if (args.mainPhase !== 'ribbon') return false;
  if (args.changingLane || args.runLanes < 1 || args.lane !== args.lastLane) return false;
  return true;
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
  return laneGapOffsets(lanesOf(road.lanes)).map((offset) => ({
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
  const edge = directionEdge(lanesOf(road.lanes));
  if (edge == null) return [];
  const scale = Number.isFinite(road.scale) && road.scale !== 0 ? road.scale : 1;
  const mid = road.axis + edge * scale;
  return [
    { lat: mid - SOLID_GAP, w: 1 },
    { lat: mid + SOLID_GAP, w: 1 },
  ];
}

/**
 * Проезжая часть байка.
 * Пока он сидит на боковой ленте, его полосы — съезд, а ось — середина ленты.
 * Дорога вокруг этого не меняется: её по-прежнему описывает carriageAt.
 */
export function riderCarriage(road: LiveCarriage, frame: RoadFrame, seat: SeatKind): LiveCarriage {
  if (seat !== 'exit') return road;
  const ribbon = exitRibbonCenter(frame.local);
  if (ribbon == null) return road;
  const half = Math.max(0, exitWidth(frame.local) * 0.5);
  const lanes = exitCarriage(road.lanes.id);
  return {
    phase: 'ribbon',
    lanes,
    axis: frame.origin + ribbon,
    scale: laneFit(half, lanes.offsets),
    half,
    way: 'one-way',
  };
}
