/** Правила заезда без Three.js и без DOM. Новые механики берут числа отсюда. */

import type { LaneDirection } from './lanes.ts';

/** Светящаяся коробка на полосе. Меню открывается внутри неё только медленнее этого порога. */
export const EXIT_ENTER_SPEED = 50;
export const EXIT_ZONE_WIDTH = 4.8;
export const EXIT_ZONE_LENGTH = 5.4;
export const EXIT_ZONE_OFFSET = 12.5;

export function exitBoxCenter(exitS: number): number {
  return exitS - EXIT_ZONE_OFFSET;
}

/** Отрезок fromS→toS пересёк коробку, и байк стоит в её ширине. */
export function crossedExitBox(fromS: number, toS: number, lane: number, exitS: number, targetLane: number): boolean {
  const center = exitBoxCenter(exitS);
  const halfL = EXIT_ZONE_LENGTH * 0.5;
  const lo = Math.min(fromS, toS);
  const hi = Math.max(fromS, toS);
  const along = hi >= center - halfL && lo <= center + halfL;
  const across = Math.abs(lane - targetLane) <= EXIT_ZONE_WIDTH * 0.5;
  return along && across;
}

/** Двойные очки, пока байк на встречном направлении этой дороги. */
export function oncomingMultiplier(direction: LaneDirection): number {
  return direction === 'against' ? 2 : 1;
}

export function comboDistanceMultiplier(comboCount: number): number {
  if (comboCount <= 0) return 1;
  return 1 + Math.min(comboCount, 5) * 0.2;
}

export function overflyMultiplier(count: number): number {
  if (count >= 3) return 2;
  if (count === 2) return 1.5;
  return 1;
}

export const HARD_LANDING_PITCH = 0.34;
export const HARD_LANDING_WOBBLE = 0.55;

export function hardLandingSpeed(speed: number): number {
  return speed * 0.72;
}

export function jumpBonus(count: number, jumpDist: number, softLanding: boolean): number {
  const base = count * 50 * overflyMultiplier(count);
  const distBonus = Math.max(0, Math.floor((jumpDist - 12) / 10) * 20);
  let total = base + distBonus;
  if (softLanding && count > 0) total = Math.round(total * 1.1);
  return total;
}

export function distancePoints(speed: number, dt: number, direction: LaneDirection, comboCount: number): number {
  return (speed * dt / 6) * oncomingMultiplier(direction) * comboDistanceMultiplier(comboCount);
}

export const COMBO_WINDOW = 4;

export function nearMissPoints(comboCount: number, direction: LaneDirection): number {
  return 25 * comboCount * oncomingMultiplier(direction);
}

export function scrapeSpeed(speed: number, dt: number): number {
  return Math.max(0, speed - (22 + speed * 0.28) * dt);
}

export interface BlankJump {
  airborne: boolean;
  height: number;
  vy: number;
  pitch: number;
  startS: number;
  carsJumped: number;
  liveBonus: number;
  wobbleTimer: number;
}

export interface RunKeys {
  left: boolean;
  right: boolean;
  gas: boolean;
  brake: boolean;
}

export interface RunTarget {
  speed: number;
  distance: number;
  score: number;
  totalJumpBonusRun: number;
  totalCarsJumpedRun: number;
  comboCount: number;
  comboTimer: number;
  playerS: number;
  laneOffset: number;
  lateralVelocity: number;
  steerVisual: number;
  slipDriftVel: number;
  accelPitchOffset: number;
  highBeamTimer: number;
  highBeamCooldown: number;
  jumpState: BlankJump;
  keys?: RunKeys;
}

export function blankJumpState(): BlankJump {
  return {
    airborne: false,
    height: 0,
    vy: 0,
    pitch: 0,
    startS: 0,
    carsJumped: 0,
    liveBonus: 0,
    wobbleTimer: 0,
  };
}

/** Обнуляет поля одного заезда. Полосу старта передают снаружи: это крайняя попутная. */
export function resetRun(target: RunTarget, startLane: number): void {
  target.speed = 0;
  target.distance = 0;
  target.score = 0;
  target.totalJumpBonusRun = 0;
  target.totalCarsJumpedRun = 0;
  target.comboCount = 0;
  target.comboTimer = 0;
  target.playerS = 0;
  target.laneOffset = startLane;
  target.lateralVelocity = 0;
  target.steerVisual = 0;
  target.slipDriftVel = 0;
  target.accelPitchOffset = 0;
  target.highBeamTimer = 0;
  target.highBeamCooldown = 0;
  target.jumpState = blankJumpState();
  if (target.keys) {
    target.keys.left = false;
    target.keys.right = false;
    target.keys.gas = false;
    target.keys.brake = false;
  }
}
