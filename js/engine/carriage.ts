/**
 * Проезжая часть в одной точке.
 * Фазу читает кадр дороги. Полосы, встречные и ось выходят из этой фазы.
 * Лента сбоку не подменяет полосы остальной дороги.
 * Закрытие прямой и блок carry — один съезд: две попутные полосы.
 * Съезд не расширяется обратно в исходную дорогу. У каждой дороги свои кромки.
 */

import { exitLaneOpen, exitRibbonCenter, exitWidth, laneAnchor, type RoadFrame } from './fork.ts';
import type { RouteChoice } from './route.ts';
import { carriageLanes, directionEdge, exitCarriage, laneGapOffsets, lanesOf, outerLane, type CarriageLayout, type RoadWay } from './lanes.ts';
import type { LaneLayout } from './biomes.ts';
import type { SeatKind } from './seat.ts';

/**
 * ribbon — лента ещё сбоку, полосы дороги остаются биомом.
 * seal — выбранный съезд закрывает прямую, полосы уже его.
 * carry — съезд стал дорогой и своей ширины не отдаёт.
 * road — обычная дорога биома.
 */
export type CarriagePhase = 'road' | 'ribbon' | 'seal' | 'carry';

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

/** Полуширина асфальта, на котором сейчас стоят полосы этой фазы. */
export function carriageHalf(frame: RoadFrame, phase: CarriagePhase): number {
  if (phase === 'seal') return Math.max(0, exitWidth(frame.local) * 0.5);
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

/** Фаза кадра. Съезд не переписывает кромки в кромки исходной дороги. */
export function carriagePhase(frame: RoadFrame): CarriagePhase {
  const block = frame.block;
  if (block && block.built && block.kind === 'carry') return 'carry';
  if (block && block.built && block.kind === 'seal' && frame.chosen === 1) return 'seal';
  if (exitRibbonCenter(frame.local) != null) return 'ribbon';
  return 'road';
}

function finish(phase: CarriagePhase, lanes: CarriageLayout, frame: RoadFrame, half: number): LiveCarriage {
  // Закрытие прямой: дорога уже лента съезда. Ось не едет с шоссе на ленту.
  let axis = laneAnchor(frame);
  if (phase === 'seal') {
    const ribbon = exitRibbonCenter(frame.local);
    if (ribbon != null) axis = frame.origin + ribbon;
  }
  return {
    phase,
    lanes,
    axis,
    scale: laneFit(half, lanes.offsets),
    half,
    way: lanes.way,
  };
}

/** Полосы, встречные, ось и ширина одной точки. */
export function carriageAt(query: CarriageQuery): LiveCarriage {
  const phase = carriagePhase(query.frame);
  const half = carriageHalf(query.frame, phase);
  if (phase === 'seal' || phase === 'carry') {
    return finish(phase, exitCarriage(query.biome.id), query.frame, half);
  }
  return finish(phase, carriageLanes(query.biome, 'two-way'), query.frame, half);
}

/**
 * Прямая, пока выбранный съезд её закрывает.
 * У неё своя ширина и свои полосы. В кромки съезда она не вписывается.
 */
export function departedRoad(frame: RoadFrame, biome: LaneLayout): LiveCarriage | null {
  if (frame.chosen !== 1 || frame.block == null || !frame.block.built || frame.block.kind !== 'seal') return null;
  const half = Math.max(0, (frame.local.leftInner - frame.local.leftOuter) * 0.5);
  if (half < 0.4) return null;
  const lanes = carriageLanes(biome, 'two-way');
  const mid = (frame.local.leftOuter + frame.local.leftInner) * 0.5;
  return {
    phase: 'road',
    lanes,
    axis: frame.origin + mid,
    scale: laneFit(half, lanes.offsets),
    half,
    way: 'two-way',
  };
}

/** Штрих между полосами проезжей части. lat — мировая точка её оси. */
export interface LaneMark {
  lat: number;
  w: number;
}

/**
 * Боковая лента как своя проезжая часть.
 * Пока она склеена с шоссе, штрихов у неё нет: это ещё не отдельная дорога.
 * Когда съезд уже стал дорогой, его штрихи читает сама дорога.
 */
export function sideRibbon(road: LiveCarriage, frame: RoadFrame): LiveCarriage | null {
  if (road.phase !== 'ribbon' || !exitLaneOpen(frame.local)) return null;
  const ribbon = riderCarriage(road, frame, 'exit');
  if (ribbon.way !== 'one-way') return null;
  return ribbon;
}

/** Дороги в точке. main есть всегда. exit — боковая лента, пока она ещё не стала main. */
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

/** Мир крайней правой полосы, которая едет по ходу этой дороги. */
export function ribbonCarLat(ribbon: LiveCarriage): number {
  const lane = outerLane(lanesOf(ribbon.lanes), 'right', 'with');
  return carriageLat(ribbon.axis, ribbon.scale, lane ? lane.offset : 0);
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
  if (road.phase === 'seal' || road.phase === 'carry') return road;
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
