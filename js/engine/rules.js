/** Правила заезда без Three.js и без DOM. Новые механики берут числа отсюда. */

export const ONCOMING_EDGE = -0.15;

/** Полоса, с которой срабатывает съезд: чуть снаружи крайней полосы, не у самого отбойника. */
export const EXIT_TRIGGER = 7.45;

export function atExitShoulder(lane, side) {
  return side > 0 ? lane > EXIT_TRIGGER : lane < -EXIT_TRIGGER;
}

export function oncomingMultiplier(lane) {
  return lane < ONCOMING_EDGE ? 2 : 1;
}

export function comboDistanceMultiplier(comboCount) {
  if (comboCount <= 0) return 1;
  return 1 + Math.min(comboCount, 5) * 0.2;
}

export function overflyMultiplier(count) {
  if (count >= 3) return 2;
  if (count === 2) return 1.5;
  return 1;
}

export function overflyCarPoints(count) {
  return Math.round(50 * overflyMultiplier(count));
}

export const HARD_LANDING_PITCH = 0.34;
export const HARD_LANDING_WOBBLE = 0.55;

export function hardLandingSpeed(speed) {
  return speed * 0.72;
}

export function jumpBonus(count, jumpDist, softLanding) {
  const base = count * 50 * overflyMultiplier(count);
  const distBonus = Math.max(0, Math.floor((jumpDist - 12) / 10) * 20);
  let total = base + distBonus;
  if (softLanding && count > 0) total = Math.round(total * 1.1);
  return total;
}

export function distancePoints(speed, dt, lane, comboCount) {
  return (speed * dt / 6) * oncomingMultiplier(lane) * comboDistanceMultiplier(comboCount);
}

export const COMBO_WINDOW = 4;

export function nearMissPoints(comboCount, lane) {
  return 25 * comboCount * oncomingMultiplier(lane);
}

export function scrapeSpeed(speed, dt) {
  return Math.max(0, speed - (22 + speed * 0.28) * dt);
}

export function blankJumpState() {
  return {
    airborne: false,
    height: 0,
    vy: 0,
    pitch: 0,
    startS: 0,
    carsJumped: 0,
    liveBonus: 0,
    wobbleTimer: 0
  };
}

/** Обнуляет поля одного заезда. Полосу старта передают снаружи: это крайняя попутная. */
export function resetRun(target, startLane) {
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
  target.jumpState = blankJumpState();
}
