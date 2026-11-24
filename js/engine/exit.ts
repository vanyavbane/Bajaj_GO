/**
 * Съезд в одной точке. Это единственное чтение кадра.
 *
 * Кромки считает fork.ts. Здесь из кадра собирается ответ, который читают
 * полосы, сиденье и трафик. Второй ответ — «есть ли лента», «это уже новая
 * дорога» — в игре не выводится заново из ширины.
 *
 * life идёт по блоку рецепта:
 *   plain    — съезда нет, одна дорога
 *   opening  — лента отходит от шоссе и ещё склеена с ним
 *   beside   — две ленты, между ними клин, здесь выбор
 *   sealing  — выбранная лента остаётся, чужая сходится
 *   arrived  — взятый въезд стал дорогой, отдельной ленты нет
 *
 * ribbon — правая лента, пока у неё есть ширина. На plain и arrived её нет.
 * main — левый слот. На arrived это уже новая дорога, не остаток старой.
 * Если life говорит «лента есть», а ribbon пуст, кромки и рецепт разошлись:
 * чинить надо здесь, а не в вызывающем коде.
 */

import { exitRibbonCenter, exitWidth, roadsJoined, type ChosenSide, type ExitKind, type RoadFrame } from './fork.ts';

export type ExitLife = 'plain' | 'opening' | 'beside' | 'sealing' | 'arrived';

export interface ExitRibbon {
  /** Середина ленты, в тех же метрах, что и кромки кадра. */
  center: number;
  half: number;
  /** Лента ещё одно полотно с шоссе: на неё можно перестроиться. */
  joined: boolean;
}

export interface ExitSlot {
  /** Середина слота относительно центра кадра. Лево отрицательное. */
  center: number;
  half: number;
}

export interface ExitRead {
  life: ExitLife;
  /** -1 прямая, 0 выбор открыт, 1 съезд взят. */
  chosen: ChosenSide;
  /** 0…1 внутри этой жизни. У plain это 0. */
  t: number;
  main: ExitSlot;
  ribbon: ExitRibbon | null;
}

function lifeOf(kind: ExitKind, chosen: ChosenSide): ExitLife {
  if (kind === 'diverge') return 'opening';
  if (kind === 'run') return 'beside';
  if (kind === 'end') return 'sealing';
  if (kind === 'settle' && chosen === 1) return 'arrived';
  return 'plain';
}

/**
 * Середина дороги, по которой едут, в смещении от main.
 * На ленте это её середина. На шоссе и после въезда это ноль.
 * Камера тянется сюда, а не к нулю шоссе.
 */
export function riddenCenter(spot: ExitRead, onRibbon: boolean, scale: number): number {
  if (!onRibbon || spot.ribbon == null) return 0;
  const span = Number.isFinite(scale) && Math.abs(scale) > 1e-4 ? scale : 1;
  return (spot.ribbon.center - spot.main.center) / span;
}

/**
 * Полоса на оси этого кадра из прошлого мира.
 * Пока ось та же, полоса прежняя. На въезде ось переезжает на линию ленты,
 * и полоса собирается из мира, а не из старого смещения.
 */
export function carryLane(world: number, axis: number, scale: number, fallback: number): number {
  if (!Number.isFinite(world) || !Number.isFinite(axis)) {
    return Number.isFinite(fallback) ? fallback : 0;
  }
  const span = Number.isFinite(scale) && scale !== 0 ? scale : 1;
  return (world - axis) / span;
}

/**
 * Точка позади байка, который уже на новой дороге, пока сама точка ещё на закрытии.
 * Ось точки — старая. Мир остаётся на линии въезда.
 */
export function arrivalTrail(
  playerLife: ExitLife,
  sampleHasRibbon: boolean,
  playerAxis: number,
  sampleAxis: number,
  lane: number,
  scale: number,
): number | null {
  if (playerLife !== 'arrived' || !sampleHasRibbon) return null;
  if (!Number.isFinite(playerAxis) || !Number.isFinite(sampleAxis)) return null;
  if (Math.abs(playerAxis - sampleAxis) <= 4) return null;
  const span = Number.isFinite(scale) && scale !== 0 ? scale : 1;
  const at = Number.isFinite(lane) ? lane : 0;
  return playerAxis + at * span;
}

/** Единственное чтение съезда из кадра. */
export function readExit(frame: RoadFrame): ExitRead {
  const edges = frame.local;
  const center = exitRibbonCenter(edges);
  const ribbon = center == null
    ? null
    : { center, half: exitWidth(edges) * 0.5, joined: roadsJoined(edges) };
  return {
    life: lifeOf(frame.phase.kind, frame.chosen),
    chosen: frame.chosen,
    t: frame.phase.t,
    main: {
      center: (edges.leftOuter + edges.leftInner) * 0.5,
      half: Math.max(0, edges.leftInner - edges.leftOuter) * 0.5,
    },
    ribbon,
  };
}
