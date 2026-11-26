/**
 * Сиденье байка на кадре дороги.
 * Пока лента прижата, съезд — правая полоса шоссе и считается от его оси.
 * Отделившись, это другая дорога: номер полосы — метры от середины ленты.
 * Когда ленты больше нет, байк уже на новой дороге, которая её продолжила.
 * Отказ сажает на край прямой, не оставляет байка в стороне.
 */

import { readExit } from './exit.ts';
import { carriageLat, laneAtWorld, rideRuler } from './carriage.ts';
import {
  RIBBON_MARGIN,
  canReleaseExit,
  landOnCarriage,
  onExitRibbon,
  roadsJoined,
  type RoadFrame,
} from './fork.ts';

/** road — шоссе. exit — съезд: его полоса, пока ленты одно полотно, и его дорога после отрыва. */
export type SeatKind = 'road' | 'exit';

export interface RiderSeat {
  kind: SeatKind;
  /** Смещение от оси сиденья, в единицах полосы. */
  lane: number;
}

function spanOf(span: number): number {
  return Number.isFinite(span) && span !== 0 ? span : 1;
}

/** Мировая точка сиденья. Камера, байк и проверка вливания читают её. */
export function seatWorld(frame: RoadFrame, seat: RiderSeat, span: number): number {
  const ruler = rideRuler(frame, seat.kind === 'exit', span);
  return carriageLat(ruler.axis, ruler.scale, seat.lane);
}

/**
 * Чужой кадр не тащит ось съезда, если ленты там нет.
 * Пока центр тот же, сиденье остаётся съездом: посадку делает stepSeat.
 */
export function seatOnFrame(frame: RoadFrame, seat: RiderSeat, homeOrigin: number): RiderSeat {
  if (seat.kind !== 'exit') return seat;
  if (readExit(frame).ribbon != null) return seat;
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
  const ribbon = readExit(frame).ribbon;
  if (ribbon == null) {
    if (seat.kind !== 'exit') return seat;
    return { kind: 'road', lane: landOnCarriage(frame.origin, frame.local, world, scale) };
  }
  const logical = world - frame.origin;
  const onRibbon = onExitRibbon(logical, frame.local);
  const hold = onRibbon || (seat.kind === 'exit' && !canReleaseExit(logical, frame.local));
  const road = rideRuler(frame, false, scale);
  const lane = laneAtWorld(world, road.axis, road.scale);
  if (!hold) {
    if (seat.kind !== 'exit') return seat;
    return { kind: 'road', lane };
  }
  // Пока +1 полоса прижата, это одно полотно: байк не дёргается к её левому
  // краю в момент перестроения. Кромка ленты ещё не ограничение руля.
  if (roadsJoined(frame.local)) return { kind: 'exit', lane };
  const exit = rideRuler(frame, true, scale);
  const along = laneAtWorld(world, exit.axis, exit.scale);
  const limit = Math.max(0, (ribbon.half - RIBBON_MARGIN) / exit.scale);
  if (along < -limit) return { kind: 'exit', lane: -limit };
  if (along > limit) return { kind: 'exit', lane: limit };
  return { kind: 'exit', lane: along };
}

/**
 * Посадка из уже сглаженной мировой точки. Руль и лента меняют ось в этом
 * кадре, но сиденье читает ту же точку, что и байк в прошлом кадре.
 */
export function seatFromWorld(frame: RoadFrame, world: number, seat: RiderSeat, span: number): RiderSeat {
  const scale = spanOf(span);
  const ruler = rideRuler(frame, seat.kind === 'exit', scale);
  const lane = laneAtWorld(world, ruler.axis, ruler.scale);
  return stepSeat(frame, { kind: seat.kind, lane }, scale);
}
