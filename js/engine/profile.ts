/**
 * Профиль дороги — сумма волн. Значение и обе производные считаются из одних
 * и тех же амплитуд и частот, поэтому изгиб не может разойтись с касательной.
 * Смешивание двух профилей на стыке зоны тоже одно: значение, первая и вторая
 * производные используют общий вес.
 */

export interface Wave {
  kind: 'sin' | 'cos';
  amp: number;
  freq: number;
}

export interface RoadProfile {
  x: (s: number) => number;
  dx: (s: number) => number;
  ddx: (s: number) => number;
  y: (s: number) => number;
  dy: (s: number) => number;
  ddy: (s: number) => number;
}

function evalWave(wave: Wave, s: number, deriv: number): number {
  const phase = wave.freq * s;
  const sn = Math.sin(phase);
  const cs = Math.cos(phase);
  const w = wave.freq;
  if (wave.kind === 'sin') {
    if (deriv === 0) return wave.amp * sn;
    if (deriv === 1) return wave.amp * w * cs;
    return -wave.amp * w * w * sn;
  }
  if (deriv === 0) return wave.amp * cs;
  if (deriv === 1) return -wave.amp * w * sn;
  return -wave.amp * w * w * cs;
}

function evalSum(waves: Wave[], s: number, deriv: number): number {
  let value = 0;
  for (const wave of waves) value += evalWave(wave, s, deriv);
  return value;
}

/** Профиль с полями x/dx/ddx и y/dy/ddy, как ждут биом и камера. */
export function makeProfile(xWaves: Wave[], yWaves: Wave[]): RoadProfile {
  return {
    x: (s) => evalSum(xWaves, s, 0),
    dx: (s) => evalSum(xWaves, s, 1),
    ddx: (s) => evalSum(xWaves, s, 2),
    y: (s) => evalSum(yWaves, s, 0),
    dy: (s) => evalSum(yWaves, s, 1),
    ddy: (s) => evalSum(yWaves, s, 2),
  };
}

export function sin(amp: number, freq: number): Wave {
  return { kind: 'sin', amp, freq };
}

export function cos(amp: number, freq: number): Wave {
  return { kind: 'cos', amp, freq };
}

/** Линейная склейка двух значений. */
export function mixValue(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

/** Первая производная склейки: вес ещё меняется вдоль дороги. */
export function mixDeriv(a: number, b: number, da: number, db: number, t: number, t1: number): number {
  return da + t1 * (b - a) + t * (db - da);
}

/** Вторая производная склейки. */
export function mixSecond(
  a: number,
  b: number,
  da: number,
  db: number,
  dda: number,
  ddb: number,
  t: number,
  t1: number,
  t2: number,
): number {
  return dda + t2 * (b - a) + 2 * t1 * (db - da) + t * (ddb - dda);
}
