/**
 * Проезжая часть в одной точке.
 * Фазу читает кадр дороги. Полосы, встречные и ось выходят из этой фазы.
 * Лента сбоку не подменяет полосы остальной дороги.
 * Закрытие прямой, блок carry и хвост следующей зоны — один съезд:
 * две попутные полосы. Хвост расширяет и кромки, и эти полосы одной шкалой.
 * Разметка переключается, когда шкала дошла до ширины биома.
 */

import { exitLaneOpen, exitRibbonCenter, exitWidth, laneAnchor, type RoadFrame } from './fork.ts';
import { carriageLanes, exitCarriage, laneDashOffsets, type CarriageLayout, type RoadWay } from './lanes.ts';
import type { LaneLayout } from './biomes.ts';
import type { SeatKind } from './seat.ts';

/** Сколько метров унаследованный съезд расширяется до дороги биома. */
export const CARRY_IN_M = 100;

/**
 * ribbon — лента ещё сбоку, полосы дороги остаются биомом.
 * seal — выбранный съезд закрывает прямую, полосы уже его и едут к центру ленты.
 * carry — съезд стал дорогой.
 * widen — первые метры следующей зоны: те же две полосы растут до биома.
 * road — обычная дорога биома.
 */
export type CarriagePhase = 'road' | 'ribbon' | 'seal' | 'carry' | 'widen';

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
  /**
   * 0…1 — прошлая зона взяла съезд, и эта точка ещё в хвосте.
   * null — хвоста нет.
   */
  widen: number | null;
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

function spreadExit(id: LaneLayout['id'], half: number): CarriageLayout {
  const base = exitCarriage(id);
  const nominal = base.width * 0.5;
  const span = Math.max(0, half);
  const fit = nominal > 0.05 ? span / nominal : 1;
  if (fit <= 1.001) return { ...base, width: span * 2 };
  const offsets = base.offsets.map((off) => off * fit);
  return {
    ...base,
    offsets,
    width: span * 2,
    laneWidth: base.laneWidth * fit,
  };
}

/** Фаза кадра. Хвост не перебивает живую ленту и уже построенный блок. */
export function carriagePhase(frame: RoadFrame, widen: number | null): CarriagePhase {
  const block = frame.block;
  if (block && block.built && block.kind === 'carry') return 'carry';
  if (block && block.built && block.kind === 'seal' && frame.chosen === 1) return 'seal';
  if (exitRibbonCenter(frame.local) != null) return 'ribbon';
  if (widen != null && widen < 1) return 'widen';
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

/**
 * 0…1 в начале зоны, если прошлая взяла съезд. null — хвоста нет.
 * Свой съезд этой зоны, уже доехавший до выбора, хвост не перекрывает.
 */
export function inheritedWiden(args: {
  meters: number;
  zoneLength: number;
  /** Нос текущей зоны в тех же метрах, что и meters. */
  nose: number;
  choiceAt: number;
  previousTookExit: boolean;
  tookExit: boolean;
}): number | null {
  const length = args.zoneLength;
  const meters = args.meters;
  if (!(length > 0) || !Number.isFinite(meters) || meters < length) return null;
  const zone = Math.floor(meters / length);
  if (zone <= 0) return null;
  const local = meters - zone * length;
  if (!(local >= 0 && local < CARRY_IN_M)) return null;
  if (!args.previousTookExit) return null;
  if (args.tookExit && meters - args.nose >= args.choiceAt) return null;
  return local / CARRY_IN_M;
}

/** Полосы, встречные, ось и ширина одной точки. */
export function carriageAt(query: CarriageQuery): LiveCarriage {
  const phase = carriagePhase(query.frame, query.widen);
  const half = carriageHalf(query.frame, phase);
  if (phase === 'seal' || phase === 'carry') {
    return finish(phase, exitCarriage(query.biome.id), query.frame, half);
  }
  if (phase === 'widen') {
    return finish(phase, spreadExit(query.biome.id, half), query.frame, half);
  }
  return finish(phase, carriageLanes(query.biome, 'two-way'), query.frame, half);
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

/** Штрихи наследуются от полос этой проезжей части и стоят на её оси. */
export function laneMarks(road: LiveCarriage): LaneMark[] {
  const scale = Number.isFinite(road.scale) && road.scale !== 0 ? road.scale : 1;
  return laneDashOffsets(road.lanes.offsets, road.lanes.oncomingCount).map((offset) => ({
    lat: road.axis + offset * scale,
    w: 1,
  }));
}

/**
 * Проезжая часть байка.
 * Пока он сидит на боковой ленте, его полосы — съезд, а ось — середина ленты.
 * Дорога вокруг этого не меняется: её по-прежнему описывает carriageAt.
 */
export function riderCarriage(road: LiveCarriage, frame: RoadFrame, seat: SeatKind): LiveCarriage {
  if (seat !== 'exit') return road;
  if (road.phase === 'seal' || road.phase === 'carry' || road.phase === 'widen') return road;
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
