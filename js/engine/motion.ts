/** Шаг байка без Three.js и без DOM. Кадр только применяет результат и рисует. */

import { besideWithLane, type Lane } from './lanes.ts';

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Мировой метр чуть длиннее реального: и меню, и байк, и трафик едут одним масштабом. */
export const WORLD_SPEED_SCALE = 1.45;

export function worldMeters(speedKmh: number, dt: number): number {
  return (speedKmh / 3.6) * dt * WORLD_SPEED_SCALE;
}

export interface SpeedSpec {
  gas: boolean;
  brake: boolean;
  maxSpeed: number;
  accel: number;
  brakeDecel: number;
  isQute: boolean;
}

export interface SpeedStep {
  speed: number;
  accelDelta: number;
}

export function stepSpeed(speed: number, dt: number, spec: SpeedSpec): SpeedStep {
  const { gas, brake, maxSpeed, accel, brakeDecel, isQute } = spec;
  let next = speed;
  if (gas && !brake) {
    const speedRatio = speed / maxSpeed;
    const accelCurve = accel * (1.05 - 0.65 * speedRatio * speedRatio);
    next = Math.min(maxSpeed, speed + accelCurve * dt);
  } else {
    const dragDecel = (isQute ? 7.2 : 8.5) + speed * 0.14;
    next = Math.max(0, speed - dragDecel * dt);
  }
  if (brake) next = Math.max(0, next - brakeDecel * dt);
  if (next > maxSpeed) next = Math.max(maxSpeed, next - 60 * dt);
  return {
    speed: next,
    accelDelta: (next - speed) / Math.max(dt, 0.001),
  };
}

export interface SteerBody {
  laneOffset: number;
  lateralVelocity: number;
  steerVisual: number;
  slipDriftVel: number;
  wobbleTimer: number;
}

export interface SteerSpec {
  left: boolean;
  right: boolean;
  steer?: number;
  brake: boolean;
  speed: number;
  airborne: boolean;
  curvature: number;
  isYura: boolean;
  wideTires: boolean;
  upgradedBrakes: boolean;
  roadEdge: number;
  roadEdgeMin?: number;
  roadEdgeMax?: number;
}

export interface SteerStep extends SteerBody {
  scraped: boolean;
}

export function stepSteer(body: SteerBody, dt: number, now: number, spec: SteerSpec): SteerStep {
  // В режиме наклона приходит готовое значение −1…1; кнопки и свайп дают
  // дискретные −1/0/1, поэтому старый расчёт остаётся запасным.
  const steer = spec.steer;
  const analog = typeof steer === 'number' && Number.isFinite(steer) ? clamp(steer, -1, 1) : null;
  const dir = analog !== null ? analog : (spec.right ? 1 : 0) - (spec.left ? 1 : 0);
  const air = spec.airborne ? 0.36 : 1;
  let wobbleTimer = body.wobbleTimer;
  const wobblePenalty = wobbleTimer > 0 ? Math.sin(now * 0.045) * 2.4 : 0;
  if (wobbleTimer > 0) wobbleTimer -= dt;

  const low = spec.speed < 90;
  const lowFactor = clamp((90 - spec.speed) / 90, 0, 1);
  const steerResp = low ? (7.5 + lowFactor * 4.5) : clamp(4.2 - (spec.speed - 90) / 140, 1.85, 4.2);
  const steerVisual = body.steerVisual + (dir - body.steerVisual) * Math.min(1, dt * steerResp);

  const targetLat = dir * (low ? (6.4 + lowFactor * 2.2) : (5.4 + spec.speed * 0.014)) * air;
  const latInertia = low ? 11 : clamp(6.2 - (spec.speed - 90) / 95, 2.1, 6.2);
  const lateralVelocity = body.lateralVelocity + (targetLat - body.lateralVelocity) * Math.min(1, dt * latInertia);

  const grip = (spec.wideTires ? 0.82 : 1) * (spec.brake && spec.upgradedBrakes ? 0.65 : 1);
  const centrifugal = -spec.curvature * spec.speed * spec.speed * (spec.isYura ? 0.055 : 0.042) * grip;
  const slip = (spec.speed > 140 && Math.abs(dir - steerVisual) > 0.32)
    ? dir * (spec.speed - 140) * (spec.isYura ? 0.025 : 0.018) * grip
    : 0;
  const slipDriftVel = lerp(body.slipDriftVel, (centrifugal + slip) * air, dt * 4.5);
  let laneOffset = body.laneOffset + (lateralVelocity + slipDriftVel + wobblePenalty) * dt;

  const minGiven = spec.roadEdgeMin;
  const maxGiven = spec.roadEdgeMax;
  const minEdge = typeof minGiven === 'number' && Number.isFinite(minGiven) ? minGiven : -spec.roadEdge;
  const maxEdge = typeof maxGiven === 'number' && Number.isFinite(maxGiven) ? maxGiven : spec.roadEdge;
  if (laneOffset > maxEdge || laneOffset < minEdge) {
    const side = laneOffset > maxEdge ? 1 : -1;
    return {
      laneOffset: side > 0 ? maxEdge : minEdge,
      lateralVelocity: -side * 4.5,
      steerVisual,
      slipDriftVel: 0,
      wobbleTimer,
      scraped: true,
    };
  }
  return { laneOffset, lateralVelocity, steerVisual, slipDriftVel, wobbleTimer, scraped: false };
}

export interface RampDeck {
  s: number;
  length: number;
  width: number;
  height: number;
  lateralOffset: number;
}

export interface RampContact {
  progress: number;
  height: number;
  launch: boolean;
}

/** null, если байк не на трамплине. launch — нос дошёл до гребня или пересёк его за кадр. */
export function rampUnderBike(playerS: number, prevS: number, lane: number, ramp: RampDeck): RampContact | null {
  const halfL = ramp.length * 0.5;
  const dLat = Math.abs(lane - ramp.lateralOffset);
  if (dLat >= ramp.width * 0.5 + 0.35) return null;
  const from = Math.min(prevS, playerS);
  const to = Math.max(prevS, playerS);
  const start = ramp.s - halfL;
  const end = ramp.s + halfL;
  if (to < start || from > end) return null;
  const along = clamp(playerS - ramp.s, -halfL, halfL);
  const progress = (along + halfL) / ramp.length;
  const launchAt = start + ramp.length * 0.78;
  const onDeck = playerS >= start && playerS <= end;
  return {
    progress: onDeck ? progress : 1,
    height: (onDeck ? progress : 1) * ramp.height,
    launch: to >= launchAt && from <= end,
  };
}

export function jumpLaunchVy(speed: number, massFactor: number): number {
  const speedFactor = clamp((speed - 60) / 140, 0.22, 1.85);
  return (7.4 + speedFactor * 6.4) * (massFactor || 1);
}

export interface JumpMotion {
  vy: number;
  height: number;
  pitch: number;
}

export interface JumpStep extends JumpMotion {
  landed: boolean;
}

export function stepJump(jump: JumpMotion, dt: number, gas: boolean, brake: boolean): JumpStep {
  const vy = jump.vy - 20.5 * dt;
  const height = jump.height + vy * dt;
  const pitchInput = (gas ? 1 : 0) - (brake ? 1 : 0);
  const target = clamp(vy * 0.025 + pitchInput * 0.14, -0.42, 0.38);
  return { vy, height, pitch: lerp(jump.pitch, target, dt * 5.5), landed: height <= 0 };
}

export function stepGroundedPose(jump: JumpMotion, dt: number, surfaceHeight: number, accelPitch: number): { height: number; pitch: number } {
  return {
    height: lerp(jump.height, surfaceHeight, dt * 18),
    pitch: lerp(jump.pitch, surfaceHeight > 0.05 ? 0.15 : accelPitch, dt * 10),
  };
}

export function playerHalfWidth(isQute: boolean): number {
  return isQute ? 0.66 : 0.38;
}

export function crashOverlap(dS: number, dLat: number, halfLength: number, halfWidth: number, halfPlayer: number): boolean {
  return dS < halfLength + 0.85 && dLat < halfWidth + halfPlayer;
}

export function overflyOverlap(dS: number, dLat: number, halfLength: number, halfWidth: number): boolean {
  return dS < halfLength + 1.1 && dLat < halfWidth + 0.95;
}

export function nearMissOverlap(dS: number, dLat: number, halfWidth: number): boolean {
  return dS < 2.2 && dLat < halfWidth + 1.15;
}

export interface CarContact {
  airborne: boolean;
  height: number;
  roofHeight: number;
  oncoming: boolean;
  alreadyJumped: boolean;
  dS: number;
  dLat: number;
  halfLength: number;
  halfWidth: number;
  playerHalfW: number;
  speed: number;
  cooldown: number;
  nearMissAwarded: boolean;
}

export type CarContactKind = 'overfly' | 'crash' | 'near';

/** 'overfly' | 'crash' | 'near' | null. Ветки те же, что были в кадре: высокий прыжок не бьёт машину. */
export function classifyCarContact(hit: CarContact): CarContactKind | null {
  if (hit.airborne && hit.height >= hit.roofHeight * 0.58) {
    if (!hit.oncoming && !hit.alreadyJumped && overflyOverlap(hit.dS, hit.dLat, hit.halfLength, hit.halfWidth)) {
      return 'overfly';
    }
    return null;
  }
  if (crashOverlap(hit.dS, hit.dLat, hit.halfLength, hit.halfWidth, hit.playerHalfW) && hit.speed > 22 && hit.cooldown <= 0) {
    return 'crash';
  }
  if (!hit.airborne && !hit.nearMissAwarded && nearMissOverlap(hit.dS, hit.dLat, hit.halfWidth) && hit.speed > 80) {
    return 'near';
  }
  return null;
}

export interface TrafficMotion {
  laneIdx: number;
  targetLaneIdx: number;
  lateralOffset: number;
  s: number;
  speedKmh: number;
  changingLane: boolean;
  flashReactTimer: number;
  steerAngle: number;
}

export interface TrafficStep {
  s: number;
  lateralOffset: number;
  steerAngle: number;
  laneIdx: number;
  changingLane: boolean;
  flashReactTimer: number;
  move: number;
  oncoming: boolean;
}

/** Шаг чужой машины: ход, перестроение, затухание реакции на свет.
 *  flow задаёт направление явно. Без него его берёт полоса, на которой машина стоит. */
export function stepTrafficCar(
  car: TrafficMotion,
  dt: number,
  lanes: readonly Lane[],
  flow?: 1 | -1,
): TrafficStep {
  const here = lanes[car.laneIdx];
  const oncoming = flow == null ? here?.direction === 'against' : flow < 0;
  const move = worldMeters(car.speedKmh, dt);
  let lateralOffset = car.lateralOffset;
  let steerAngle = car.steerAngle;
  let laneIdx = car.laneIdx;
  let changingLane = car.changingLane;
  const flashReactTimer = car.flashReactTimer > 0 ? car.flashReactTimer - dt : car.flashReactTimer;

  if (changingLane) {
    const target = lanes[car.targetLaneIdx]?.offset ?? Number.NaN;
    const diff = target - lateralOffset;
    lateralOffset += Math.sign(diff) * Math.min(Math.abs(diff), 4.2 * dt);
    steerAngle = clamp(diff * 0.25, -0.35, 0.35);
    if (Math.abs(diff) < 0.06) {
      lateralOffset = target;
      laneIdx = car.targetLaneIdx;
      changingLane = false;
      steerAngle = 0;
    }
  } else {
    steerAngle *= 0.85;
  }

  return {
    s: car.s + (oncoming ? -move : move),
    lateralOffset,
    steerAngle,
    laneIdx,
    changingLane,
    flashReactTimer,
    move,
    oncoming,
  };
}

export interface TrafficRecycle {
  base: number;
  spread: number;
}

/** Куда вернуть машину, если она уехала из окна вокруг игрока. spread добивает случайный разброс. */
export function trafficRecycle(carS: number, playerS: number): TrafficRecycle | null {
  if (carS < playerS - 28) return { base: playerS + 230, spread: 90 };
  if (carS > playerS + 340) return { base: playerS + 190, spread: 80 };
  return null;
}

/** В меню демо-байк не должен врезаться в стоящий в той же точке трафик. */
export function menuTrafficNudge(carS: number, carLat: number, playerS: number, playerLat: number, menuDemo: boolean): number | null {
  if (!menuDemo) return null;
  if (Math.abs(carS - playerS) < 9 && Math.abs(carLat - playerLat) < 2.5) return playerS + 45;
  return null;
}

export interface YieldCar {
  laneIdx: number;
  changingLane: boolean;
  s: number;
  lateralOffset: number;
}

/** Полоса, в которую попутная машина уходит от дальнего света. null — не реагирует. */
export function highbeamYieldLane(
  car: YieldCar,
  playerS: number,
  playerLane: number,
  lanes: readonly Lane[],
  laneWidth: number,
): number | null {
  if (!Number.isFinite(laneWidth) || laneWidth <= 0) {
    throw new Error(`laneWidth должен прийти из биома машины, получено ${laneWidth}`);
  }
  const here = lanes[car.laneIdx];
  if (!here || here.direction !== 'with' || car.changingLane) return null;
  const distAhead = car.s - playerS;
  if (distAhead < 6 || distAhead > 60) return null;
  const limit = laneWidth * 0.5 + 0.15;
  if (Math.abs(car.lateralOffset - playerLane) >= limit) return null;
  return besideWithLane(lanes, here.index)?.index ?? null;
}
