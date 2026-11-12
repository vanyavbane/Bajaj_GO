/** Шаг байка без Three.js и без DOM. Кадр только применяет результат и рисует. */

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Мировой метр чуть длиннее реального: и меню, и байк, и трафик едут одним масштабом. */
export const WORLD_SPEED_SCALE = 1.45;

export function worldMeters(speedKmh, dt) {
  return (speedKmh / 3.6) * dt * WORLD_SPEED_SCALE;
}

export function stepSpeed(speed, dt, spec) {
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
    accelDelta: (next - speed) / Math.max(dt, 0.001)
  };
}

export function stepSteer(body, dt, now, spec) {
  // В режиме наклона приходит готовое значение −1…1; кнопки и свайп дают
  // дискретные −1/0/1, поэтому старый расчёт остаётся запасным.
  const analog = Number.isFinite(spec.steer) ? clamp(spec.steer, -1, 1) : null;
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

  const edgeSide = laneOffset > spec.roadEdge ? 1 : (laneOffset < -spec.roadEdge ? -1 : 0);
  if (edgeSide !== 0) {
    return {
      laneOffset: edgeSide * spec.roadEdge,
      lateralVelocity: -edgeSide * 4.5,
      steerVisual,
      slipDriftVel: 0,
      wobbleTimer,
      scraped: true
    };
  }
  return { laneOffset, lateralVelocity, steerVisual, slipDriftVel, wobbleTimer, scraped: false };
}

/** null, если байк не на трамплине. launch — нос уже на гребне. */
export function rampUnderBike(playerS, lane, ramp) {
  const halfL = ramp.length * 0.5;
  const dS = playerS - ramp.s;
  const dLat = Math.abs(lane - ramp.lateralOffset);
  if (dLat >= ramp.width * 0.5 + 0.35 || dS < -halfL || dS > halfL) return null;
  const progress = clamp((dS + halfL) / ramp.length, 0, 1);
  return { progress, height: progress * ramp.height, launch: progress >= 0.78 };
}

export function jumpLaunchVy(speed, massFactor) {
  const speedFactor = clamp((speed - 60) / 140, 0.22, 1.85);
  return (7.4 + speedFactor * 6.4) * (massFactor || 1);
}

export function stepJump(jump, dt, gas, brake) {
  const vy = jump.vy - 20.5 * dt;
  const height = jump.height + vy * dt;
  const pitchInput = (gas ? 1 : 0) - (brake ? 1 : 0);
  const target = clamp(vy * 0.025 + pitchInput * 0.14, -0.42, 0.38);
  return { vy, height, pitch: lerp(jump.pitch, target, dt * 5.5), landed: height <= 0 };
}

export function stepGroundedPose(jump, dt, surfaceHeight, accelPitch) {
  return {
    height: lerp(jump.height, surfaceHeight, dt * 18),
    pitch: lerp(jump.pitch, surfaceHeight > 0.05 ? 0.15 : accelPitch, dt * 10)
  };
}

export function playerHalfWidth(isQute) {
  return isQute ? 0.66 : 0.38;
}

export function crashOverlap(dS, dLat, halfLength, halfWidth, halfPlayer) {
  return dS < halfLength + 0.85 && dLat < halfWidth + halfPlayer;
}

export function overflyOverlap(dS, dLat, halfLength, halfWidth) {
  return dS < halfLength + 1.1 && dLat < halfWidth + 0.95;
}

export const ONCOMING_LANES = 2;

export function isOncomingLane(laneIdx) {
  return laneIdx < ONCOMING_LANES;
}

export function nearMissOverlap(dS, dLat, halfWidth) {
  return dS < 2.2 && dLat < halfWidth + 1.15;
}

/** 'overfly' | 'crash' | 'near' | null. Ветки те же, что были в кадре: высокий прыжок не бьёт машину. */
export function classifyCarContact(hit) {
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

/** Шаг чужой машины: ход, перестроение, затухание реакции на свет. Направление берётся до смены полосы. */
export function stepTrafficCar(car, dt, laneOffsets) {
  const oncoming = isOncomingLane(car.laneIdx);
  const move = worldMeters(car.speedKmh, dt);
  let lateralOffset = car.lateralOffset;
  let steerAngle = car.steerAngle;
  let laneIdx = car.laneIdx;
  let changingLane = car.changingLane;
  const flashReactTimer = car.flashReactTimer > 0 ? car.flashReactTimer - dt : car.flashReactTimer;

  if (changingLane) {
    const target = laneOffsets[car.targetLaneIdx];
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
    oncoming
  };
}

/** Куда вернуть машину, если она уехала из окна вокруг игрока. spread добивает случайный разброс. */
export function trafficRecycle(carS, playerS) {
  if (carS < playerS - 28) return { base: playerS + 230, spread: 90 };
  if (carS > playerS + 340) return { base: playerS + 190, spread: 80 };
  return null;
}

/** В меню демо-байк не должен врезаться в стоящий в той же точке трафик. */
export function menuTrafficNudge(carS, carLat, playerS, playerLat, menuDemo) {
  if (!menuDemo) return null;
  if (Math.abs(carS - playerS) < 9 && Math.abs(carLat - playerLat) < 2.5) return playerS + 45;
  return null;
}

/** Полоса, в которую попутная машина уходит от дальнего света. null — не реагирует. */
export function highbeamYieldLane(car, playerS, playerLane) {
  if (isOncomingLane(car.laneIdx) || car.changingLane) return null;
  const distAhead = car.s - playerS;
  if (distAhead < 6 || distAhead > 60) return null;
  if (Math.abs(car.lateralOffset - playerLane) >= 2.9) return null;
  return car.laneIdx === 2 ? 3 : 2;
}
