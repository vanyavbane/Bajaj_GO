/** Стоппи, вили, дрифт: конфиг, состояние и чистый шаг без DOM/Three. */

export const STUNT = {
  STOPPIE_MIN_START_SPEED: 105,
  STOPPIE_HOLD_SPEED: 40,
  STOPPIE_BRAKE_MULTIPLIER: 1.5,
  STOPPIE_CHANCE: 0.4,
  STOPPIE_MAX_PITCH: -0.72,
  STOPPIE_RISE_TIME: 0.55,
  STOPPIE_FALL_TIME: 0.45,

  WHEELIE_MIN_MAX_SPEED: 150,
  WHEELIE_CHANCE: 0.3,
  WHEELIE_AUTO_DROP_SPEED: 80,
  WHEELIE_HOLD_MIN: 30,
  WHEELIE_HOLD_MAX: 75,
  WHEELIE_MAX_PITCH: 0.62,
  WHEELIE_RISE_TIME: 0.5,
  WHEELIE_FALL_TIME: 0.45,
  WHEELIE_STEER_SENSITIVITY: 0.58,

  DRIFT_CHANCE: 0.3,
  DRIFT_END_SPEED: 130,
  DRIFT_MAX_SLIP: 0.55,
  DRIFT_STEER_SENSITIVITY: 0.72,
  DRIFT_RISE_TIME: 0.35,
  DRIFT_FALL_TIME: 0.4,
} as const;

export type StuntMode = 'none' | 'stoppie' | 'wheelie' | 'drift';

export interface StuntState {
  mode: StuntMode;
  phase: 'rise' | 'hold' | 'fall';
  pitch: number;
  slip: number;
  smoke: number;
  brakeRollDone: boolean;
  startRollDone: boolean;
  wasStopped: boolean;
  wasBraking: boolean;
}

export function blankStuntState(): StuntState {
  return {
    mode: 'none',
    phase: 'rise',
    pitch: 0,
    slip: 0,
    smoke: 0,
    brakeRollDone: false,
    startRollDone: false,
    wasStopped: true,
    wasBraking: false,
  };
}

export interface StuntBike {
  id: string;
  maxSpeed: number; // effective max speed with tuning
  vType: string;
}

export interface StuntInput {
  dt: number;
  speed: number;
  gas: boolean;
  brake: boolean;
  airborne: boolean;
  bike: StuntBike;
  rand?: () => number;
}

function approach(cur: number, target: number, rate: number): number {
  if (cur < target) return Math.min(target, cur + rate);
  if (cur > target) return Math.max(target, cur - rate);
  return cur;
}

function isQuteOrYura(vType: string): boolean { return vType === 'qute' || vType === 'yura'; }
function isYura(vType: string): boolean { return vType === 'yura'; }

export function stepStunt(state: StuntState, input: StuntInput): StuntState {
  const { dt, speed, gas, brake, airborne, bike } = input;
  const rand = input.rand || Math.random;
  const s: StuntState = { ...state };

  const stopped = speed < 0.5;
  if (stopped) { s.wasStopped = true; s.startRollDone = false; }
  if (!brake) s.brakeRollDone = false;

  // Airborne interrupts active stunt into fall.
  if (airborne && s.mode !== 'none') {
    s.phase = 'fall';
  }

  if (s.mode === 'none') {
    s.pitch = approach(s.pitch, 0, dt * 3.5);
    s.slip = approach(s.slip, 0, dt * 4.5);
    s.smoke = approach(s.smoke, 0, dt * 2.5);

    // Stoppie trigger: brake edge, speed >= threshold
    const brakeEdge = brake && !s.wasBraking;
    if (!airborne && brakeEdge && !s.brakeRollDone) {
      s.brakeRollDone = true;
      if (speed >= STUNT.STOPPIE_MIN_START_SPEED && !isQuteOrYura(bike.vType) && rand() < STUNT.STOPPIE_CHANCE) {
        s.mode = 'stoppie';
        s.phase = 'rise';
      }
    }

    // Start-from-zero triggers
    const startEdge = s.wasStopped && gas && !brake && speed < 5;
    if (!airborne && s.mode === 'none' && startEdge && !s.startRollDone) {
      s.startRollDone = true;
      if (isYura(bike.vType)) {
        if (rand() < STUNT.DRIFT_CHANCE) {
          s.mode = 'drift';
          s.phase = 'rise';
        }
      } else if (!isQuteOrYura(bike.vType) && bike.maxSpeed > STUNT.WHEELIE_MIN_MAX_SPEED) {
        if (rand() < STUNT.WHEELIE_CHANCE) {
          s.mode = 'wheelie';
          s.phase = 'rise';
        }
      }
    }

    if (speed > 5) s.wasStopped = false;
    s.wasBraking = brake;
    return s;
  }

  if (s.mode === 'stoppie') {
    const targetHold = STUNT.STOPPIE_MAX_PITCH; // negative = nose down
    if (s.phase === 'rise') {
      s.pitch = approach(s.pitch, targetHold, (Math.abs(targetHold) / STUNT.STOPPIE_RISE_TIME) * dt);
      if (s.pitch <= targetHold + 0.01) { s.pitch = targetHold; s.phase = 'hold'; }
      if (!brake && speed > STUNT.STOPPIE_HOLD_SPEED + 5) s.phase = 'fall';
    } else if (s.phase === 'hold') {
      s.pitch = approach(s.pitch, targetHold, dt * 1.5);
      // Remain on front wheel if stopped while braking; fall after brake released.
      if (speed < 1 && !brake) s.phase = 'fall';
      if (speed <= STUNT.STOPPIE_HOLD_SPEED && speed > 1) s.phase = 'fall';
      if (!brake && speed > STUNT.STOPPIE_HOLD_SPEED + 8) s.phase = 'fall';
    }
    if (s.phase === 'fall') {
      s.pitch = approach(s.pitch, 0, (Math.abs(STUNT.STOPPIE_MAX_PITCH) / STUNT.STOPPIE_FALL_TIME) * dt);
      if (s.pitch >= -0.001) { s.pitch = 0; s.mode = 'none'; s.phase = 'rise'; }
    }
    if (s.mode === 'stoppie' && speed < 1 && !brake && s.phase !== 'fall') s.phase = 'fall';
    s.slip = approach(s.slip, 0, dt * 4);
    s.smoke = approach(s.smoke, 0, dt * 3);
  }

  if (s.mode === 'wheelie') {
    const target = STUNT.WHEELIE_MAX_PITCH; // positive = nose up
    if (s.phase === 'rise') {
      s.pitch = approach(s.pitch, target, (target / STUNT.WHEELIE_RISE_TIME) * dt);
      if (s.pitch >= target - 0.01) { s.pitch = target; s.phase = 'hold'; }
    }
    if (s.phase === 'hold') {
      s.pitch = approach(s.pitch, target, dt * 1.2);
      const inHoldRange = speed >= STUNT.WHEELIE_HOLD_MIN && speed <= STUNT.WHEELIE_HOLD_MAX;
      const acceleratingToDrop = gas && speed > STUNT.WHEELIE_HOLD_MAX;
      if (speed >= STUNT.WHEELIE_AUTO_DROP_SPEED) s.phase = 'fall';
      else if (!inHoldRange && !acceleratingToDrop && speed < STUNT.WHEELIE_HOLD_MIN) s.phase = 'fall';
      else if (!gas && !inHoldRange) s.phase = 'fall';
      else if (brake) s.phase = 'fall';
    }
    if (s.phase === 'fall') {
      s.pitch = approach(s.pitch, 0, (STUNT.WHEELIE_MAX_PITCH / STUNT.WHEELIE_FALL_TIME) * dt);
      if (s.pitch <= 0.001) { s.pitch = 0; s.mode = 'none'; s.phase = 'rise'; }
    }
    s.slip = approach(s.slip, 0, dt * 4);
    s.smoke = approach(s.smoke, 0, dt * 3);
  }

  if (s.mode === 'drift') {
    if (s.phase === 'rise') {
      s.slip = approach(s.slip, STUNT.DRIFT_MAX_SLIP, (STUNT.DRIFT_MAX_SLIP / STUNT.DRIFT_RISE_TIME) * dt);
      s.smoke = approach(s.smoke, 1, dt * 2.5);
      if (s.slip >= STUNT.DRIFT_MAX_SLIP - 0.01) { s.slip = STUNT.DRIFT_MAX_SLIP; s.phase = 'hold'; }
    }
    if (s.phase === 'hold') {
      s.slip = approach(s.slip, STUNT.DRIFT_MAX_SLIP, dt * 1.5);
      s.smoke = approach(s.smoke, 1, dt * 2);
      if (speed >= STUNT.DRIFT_END_SPEED || !gas || brake) s.phase = 'fall';
    }
    if (s.phase === 'fall') {
      s.slip = approach(s.slip, 0, (STUNT.DRIFT_MAX_SLIP / STUNT.DRIFT_FALL_TIME) * dt);
      s.smoke = approach(s.smoke, 0, dt * 2.5);
      if (s.slip <= 0.001) { s.slip = 0; s.smoke = 0; s.mode = 'none'; s.phase = 'rise'; }
    }
    s.pitch = approach(s.pitch, 0, dt * 3);
  }

  if (speed > 5) s.wasStopped = false;
  s.wasBraking = brake;
  return s;
}
