/**
 * Съезд в одной точке. Это единственное чтение кадра.
 *
 * Кромки считает fork.ts. Здесь из кадра собирается ответ, который читают
 * полосы, сиденье и трафик. Второй ответ — «есть ли лента», «это уже новая
 * дорога» — в игре не выводится заново из ширины.
 *
 * life идёт по блоку рецепта:
 *   plain    — съезда нет, одна дорога
 *   opening  — справа нарастает +1 полоса, она ещё одно полотно с шоссе
 *   beside   — полоса полной ширины и всё ещё прижата, здесь выбор
 *   sealing  — выбранная полоса отделяется, чужая сходится
 *   arrived  — взятый въезд стал дорогой и садится на ось пути, отдельной ленты нет
 *
 * ribbon — правая лента, пока у неё есть ширина. На plain и arrived её нет.
 * main — левый слот. На arrived это уже новая дорога, не остаток старой.
 * Если life говорит «лента есть», а ribbon пуст, кромки и рецепт разошлись:
 * чинить надо здесь, а не в вызывающем коде.
 */

import { exitRibbonCenter, exitWidth, mainCenter, mainHalf, roadsJoined, type ChosenSide, type ExitKind, type RoadFrame } from './fork.ts';

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

/** Байк на правой ленте, пока чтение съезда её ещё держит. */
export function ridingRibbon(spot: ExitRead, kind: string): boolean {
  return kind === 'exit' && spot.ribbon != null;
}

/** Мир середины дороги. axis — ось полос, в ней уже сидит середина main. */
export function surfaceWorld(axis: number, spot: ExitRead, onRibbon: boolean): number {
  const at = Number.isFinite(axis) ? axis : 0;
  return at + rideCenter(spot, onRibbon) - rideCenter(spot, false);
}

/** Середина дороги, на которой сидит байк, в метрах кадра. */
export function rideCenter(spot: ExitRead, onRibbon: boolean): number {
  if (onRibbon && spot.ribbon != null) return spot.ribbon.center;
  return spot.main.center;
}

/**
 * Мир точки маршрута для байка, который сидит на своей дороге.
 * Смещение берётся от середины его дороги и кладётся на середину дороги в этой точке.
 * Пока точка ещё на закрытии, а байк уже на новой дороге, середина остаётся его.
 */
export function sampleRide(
  sample: ExitRead,
  player: ExitRead,
  onRibbon: boolean,
  playerWorld: number,
  sampleOrigin: number,
  playerOrigin: number,
  factor = 1,
): number {
  const f = Number.isFinite(factor) ? factor : 1;
  const playerCenter = playerOrigin + rideCenter(player, onRibbon);
  const world = Number.isFinite(playerWorld) ? playerWorld : playerCenter;
  const along = (world - playerCenter) * f;
  if (player.life === 'arrived' && sample.life !== 'arrived') return playerCenter + along;
  return sampleOrigin + rideCenter(sample, onRibbon && sample.ribbon != null) + along;
}

/**
 * Байк едет со своей дорогой.
 * Пока это та же дорога, смещение внутри неё сохраняется, даже если середина уехала.
 * Смена дороги оставляет мир на месте: в этот метр середины совпадают.
 */
export function retargetRide(
  steeredWorld: number,
  previousCenter: number,
  sameRoad: boolean,
  nextCenter: number,
): { along: number; world: number } {
  const next = Number.isFinite(nextCenter) ? nextCenter : 0;
  const worldIn = Number.isFinite(steeredWorld) ? steeredWorld : next;
  if (!sameRoad || !Number.isFinite(previousCenter)) {
    return { along: worldIn - next, world: worldIn };
  }
  const along = worldIn - previousCenter;
  return { along, world: next + along };
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
    main: { center: mainCenter(edges), half: mainHalf(edges) },
    ribbon,
  };
}
