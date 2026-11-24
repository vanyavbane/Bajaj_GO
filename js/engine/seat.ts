/**
 * Сиденье байка на кадре дороги.
 * Ось одна — ось дороги. Съезд это её правая полоса, не вторая ось.
 * Когда лента кончилась, байк садится на ту дорогу, что осталась.
 * Отказ сажает на край прямой, не оставляет байка в стороне.
 */

import {
  canReleaseExit,
  exitRibbonCenter,
  landOnCarriage,
  laneAnchor,
  onExitRibbon,
  roadsJoined,
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
 * Съезд — полоса этой дороги, поэтому ось та же, что у остальных полос.
 */
export function seatAxis(frame: RoadFrame, kind: SeatKind): number {
  return kind === 'exit' ? laneAnchor(frame) : laneAnchor(frame);
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
 * Чужой кадр не тащит ось съезда, если ленты там нет.
 * Пока центр тот же, сиденье остаётся съездом: посадку делает stepSeat.
 */
export function seatOnFrame(frame: RoadFrame, seat: RiderSeat, homeOrigin: number): RiderSeat {
  if (seat.kind !== 'exit') return seat;
  if (exitRibbonCenter(frame.local) != null) return seat;
  const home = Number.isFinite(homeOrigin) ? homeOrigin : 0;
  if (Math.abs(frame.origin - home) < 0.5) return seat;
  return { kind: 'road', lane: seat.lane };
}

/**
 * Один шаг сиденья. Мир не прыгает, кроме посадки, когда лента исчезла.
 * Въезд сажает байка туда, где он уже ехал по новой дороге.
 * Отказанная лента сажает на край прямой, а не оставляет байка в стороне.
 */
export function stepSeat(frame: RoadFrame, seat: RiderSeat, span: number): RiderSeat {
  const scale = spanOf(span);
  const world = seatWorld(frame, seat, scale);
  const ribbon = exitRibbonCenter(frame.local);
  if (ribbon == null) {
    if (seat.kind !== 'exit') return seat;
    return { kind: 'road', lane: landOnCarriage(frame.origin, frame.local, world, scale) };
  }
  const logical = world - frame.origin;
  const onRibbon = onExitRibbon(logical, frame.local);
  const hold = onRibbon || (seat.kind === 'exit' && !canReleaseExit(logical, frame.local));
  if (!hold) {
    if (seat.kind !== 'exit') return seat;
    return { kind: 'road', lane: (world - laneAnchor(frame)) / scale };
  }
  const axis = laneAnchor(frame);
  const lane = (world - axis) / scale;
  // Пока +1 полоса прижата, это одно полотно: байк не дёргается к её левому
  // краю в момент перестроения. Кромка ленты ещё не ограничение руля.
  if (roadsJoined(frame.local)) return { kind: 'exit', lane };
  const center = (frame.origin + ribbon - axis) / scale;
  const halfW = (frame.local.rightOuter - frame.local.rightInner) * 0.5;
  const limit = Math.max(0, (halfW - 0.7) / Math.max(scale, 0.05));
  if (lane < center - limit) return { kind: 'exit', lane: center - limit };
  if (lane > center + limit) return { kind: 'exit', lane: center + limit };
  return { kind: 'exit', lane };
}
