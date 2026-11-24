/**
 * Ножная коробка без Three.js и DOM: discrete 1–6, нейтраль и обороты.
 * Переключения идут по скорости/оборотам, но физику заезда модуль не трогает —
 * он отдаёт только передачу и долю оборотов для тахометра и звука двигателя.
 */

export const GEAR_COUNT = 6;

/** Верх границы передачи в долях от эффективной максимальной скорости байка. */
export const GEAR_UPSHIFT = Object.freeze([0.16, 0.32, 0.49, 0.66, 0.84, 1]);

/** Низ границы с гистерезисом: у порога передача не дёргается туда-сюда. */
export const GEAR_DOWNSHIFT = Object.freeze([0, 0.12, 0.27, 0.43, 0.6, 0.77]);

/** Ниже этой скорости байк стоит на нейтрали. */
export const NEUTRAL_SPEED = 1.5;

/** Тахометр: холостые, низ передачи, красная зона. */
export const RPM_IDLE = 0.13;
export const RPM_LOW = 0.26;
export const RPM_REDLINE = 1;

/** Пауза между переключениями, чтобы не было серии щелчков за один кадр. */
export const SHIFT_COOLDOWN = 0.3;

export interface GearboxState {
  /** 0 — нейтраль, 1…6 — передачи. */
  gear: number;
  /** 0…1, доля оборотов до красной зоны. */
  rpmFrac: number;
  /** Оставшееся время до следующего переключения, с. */
  cooldown: number;
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function initialGearboxState(): GearboxState {
  return { gear: 0, rpmFrac: RPM_IDLE, cooldown: 0 };
}

/**
 * Обороты внутри передачи: от RPM_LOW сразу после включения до красной зоны
 * на верхней границе. На нейтрали — почти постоянный холостой ход.
 */
export function gearRpmFrac(gear: number, speedFrac: number): number {
  const fraction = clamp(finite(speedFrac, 0), 0, 1);
  if (!Number.isFinite(gear) || gear <= 0) return RPM_IDLE;
  const g = Math.min(GEAR_COUNT, Math.floor(gear));
  const lower = g === 1 ? 0 : GEAR_UPSHIFT[g - 2];
  const upper = GEAR_UPSHIFT[g - 1];
  const span = Math.max(0.001, upper - lower);
  return RPM_LOW + (RPM_REDLINE - RPM_LOW) * clamp((fraction - lower) / span, 0, 1);
}

/**
 * Один шаг коробки. Скорость и максималка приходят из заезда; результат
 * используются и приборкой, и AudioManager, поэтому они всегда синхронны.
 */
export function stepGearbox(
  prev: GearboxState | null | undefined,
  speed: number,
  maxSpeed: number,
  dt: number,
): GearboxState {
  const safeSpeed = Math.max(0, finite(speed, 0));
  const limit = Math.max(1, finite(maxSpeed, 1));
  const fraction = Math.min(1, safeSpeed / limit);
  const step = clamp(finite(dt, 0), 0, 0.1);
  const cooldown = Math.max(0, finite(prev && prev.cooldown, 0) - step);

  let gear = finite(prev && prev.gear, 0);
  gear = clamp(Math.round(gear), 0, GEAR_COUNT);
  if (safeSpeed < NEUTRAL_SPEED) {
    // Нейтраль доступна всегда, даже во время задержки переключения.
    gear = 0;
  } else {
    if (gear === 0) gear = 1;
    if (cooldown <= 0) {
      if (gear < GEAR_COUNT && fraction >= GEAR_UPSHIFT[gear - 1]) gear += 1;
      else if (gear > 1 && fraction < GEAR_DOWNSHIFT[gear - 1]) gear -= 1;
    }
  }

  const shifted = !!prev && gear !== prev.gear;
  return {
    gear,
    rpmFrac: gearRpmFrac(gear, fraction),
    cooldown: shifted ? SHIFT_COOLDOWN : cooldown,
  };
}
