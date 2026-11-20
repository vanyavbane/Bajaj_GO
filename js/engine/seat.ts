/**
 * Сиденье байка на кадре дороги.
 * Дорога и съезд — два сиденья. Ось каждого читается из RoadFrame.
 * Полоса — смещение от этой оси. Второй оси в игре нет.
 * Вливание: лента съезда исчезла, а центр кадра уже на её середине.
 * Полоса пересчитывается от этого центра, мировая точка не меняется.
 */

import {
  canReleaseExit,
  exitRibbonCenter,
  landOnCarriage,
  laneAnchor,
  onExitRibbon,
  type RoadFrame,
} from './fork.ts';

/** road — ось кадра. exit — середина ленты съезда. */
export type SeatKind = 'road' | 'exit';

export interface RiderSeat {
  kind: SeatKind;
  /** Смещение от оси сиденья, в единицах полосы. */
  lane: number;
}

function spanOf(span: number): number {
  return Number.isFinite(span) && span !== 0 ? span : 1;
}

/**
 * Ось сиденья в мировых метрах.
 * На дороге это laneAnchor: при закрытии прямой она доезжает до центра ленты.
 * На съезде это середина ленты. Когда ленты уже нет, ось совпадает с центром кадра.
 */
export function seatAxis(frame: RoadFrame, kind: SeatKind): number {
  if (kind === 'exit') {
    const ribbon = exitRibbonCenter(frame.local);
    return frame.origin + (ribbon ?? 0);
  }
  return laneAnchor(frame);
}

/** Мировая точка сиденья. Камера, байк и проверка вливания читают её. */
export function seatWorld(frame: RoadFrame, seat: RiderSeat, span: number): number {
  return seatAxis(frame, seat.kind) + seat.lane * spanOf(span);
}

/**
 * Та же мировая точка при новом масштабе полосы.
 * Пока лента растёт, масштаб меняется каждый кадр. Полоса пересчитывается,
 * мир байка остаётся.
 * `from` не число и не ноль — масштаб ещё не запомнен, полоса не трогается.
 */
export function rescaleSeat(seat: RiderSeat, from: number, to: number, axis: number): RiderSeat {
  const toScale = spanOf(to);
  const fromScale = Number.isFinite(from) && from !== 0 ? from : toScale;
  if (fromScale === toScale) return seat;
  const origin = Number.isFinite(axis) ? axis : 0;
  const lane = Number.isFinite(seat.lane) ? seat.lane : 0;
  return { kind: seat.kind, lane: (origin + lane * fromScale - origin) / toScale };
}

/**
 * Чужой кадр не тащит ось съезда, если ленты там нет и центр уже другой.
 * Пока центр тот же, сиденье остаётся съездом: вливание делает stepSeat.
 */
export function seatOnFrame(frame: RoadFrame, seat: RiderSeat, homeOrigin: number): RiderSeat {
  if (seat.kind !== 'exit') return seat;
  if (exitRibbonCenter(frame.local) != null) return seat;
  const home = Number.isFinite(homeOrigin) ? homeOrigin : 0;
  if (Math.abs(frame.origin - home) < 0.5) return seat;
  return { kind: 'road', lane: seat.lane };
}

/**
 * Съезд вливается в дорогу.
 * `world` — точка до вливания. `origin` — центр кадра, уже стоящий на середине бывшей ленты.
 */
export function mergeExitIntoRoad(world: number, origin: number, span: number): RiderSeat {
  const scale = spanOf(span);
  const axis = Number.isFinite(origin) ? origin : 0;
  const at = Number.isFinite(world) ? world : axis;
  return { kind: 'road', lane: (at - axis) / scale };
}

/**
 * Один шаг сиденья. Мир не прыгает, кроме посадки на край прямой,
 * когда отказанная лента исчезла из-под байка.
 * `merged` — съезд этой зоны уже выбран, или зона унаследовала его центр.
 * Тогда пропавшая лента вливается в ось кадра, а не сажает байка на обочину.
 */
export function stepSeat(frame: RoadFrame, seat: RiderSeat, span: number, merged: boolean): RiderSeat {
  const scale = spanOf(span);
  const world = seatWorld(frame, seat, scale);
  const ribbon = exitRibbonCenter(frame.local);
  if (ribbon == null) {
    if (seat.kind !== 'exit') return seat;
    if (merged) return mergeExitIntoRoad(world, frame.origin, scale);
    return { kind: 'road', lane: landOnCarriage(frame.origin, frame.local, world, scale) };
  }
  const logical = world - frame.origin;
  const onRibbon = onExitRibbon(logical, frame.local);
  const hold = onRibbon || (seat.kind === 'exit' && !canReleaseExit(logical, frame.local));
  if (!hold) {
    if (seat.kind !== 'exit') return seat;
    return { kind: 'road', lane: (world - frame.origin) / scale };
  }
  let lane = (world - (frame.origin + ribbon)) / scale;
  if (onRibbon && seat.kind !== 'exit') {
    const halfW = (frame.local.rightOuter - frame.local.rightInner) * 0.5;
    const limit = Math.max(0, (halfW - 0.7) / Math.max(scale, 0.05));
    if (lane < -limit) lane = -limit;
    if (lane > limit) lane = limit;
  }
  return { kind: 'exit', lane };
}
