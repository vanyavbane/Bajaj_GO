/**
 * Настоящее ответвление.
 * Съезд поворачивает вправо относительно касательной дороги и после поворота
 * держит этот вектор: дальше он не повторяет изгибы маршрута.
 */

/** Радианы вправо. Около 24°. */
export const BRANCH_YAW = 0.42;

export interface PathFrame {
  x: number;
  z: number;
  fx: number;
  fz: number;
  rx: number;
  rz: number;
  /** Изменение курса, рад/м. Вправо положительное. */
  curvature: number;
}

export interface RoadEmbed extends PathFrame {
  y: number;
  /** Точка лежит на ветке, а не на исходном сплайне. */
  branched: boolean;
}

/** Кадр прямой дороги. dx — dX/ds сплайна, вперёд по −Z. */
export function frameFromSpline(x: number, dx: number, s: number): PathFrame {
  const lh = Math.hypot(dx, 1) || 1;
  const fx = dx / lh;
  const fz = -1 / lh;
  return { x, z: -s, fx, fz, rx: -fz, rz: fx, curvature: 0 };
}

/** 0 до носа, полный угол после поворота. */
export function branchYaw(distance: number, turn: number, yaw = BRANCH_YAW): number {
  if (!(distance > 0) || !(turn > 0) || !(yaw > 0)) return 0;
  const t = Math.max(0, Math.min(1, distance / turn));
  const s = t * t * (3 - 2 * t);
  return yaw * s;
}

/** Поворот вправо: касательная смешивается с правым вектором. */
export function yawRight(frame: PathFrame, yaw: number): PathFrame {
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const fx = frame.fx * c + frame.rx * sn;
  const fz = frame.fz * c + frame.rz * sn;
  const len = Math.hypot(fx, fz) || 1;
  const nfx = fx / len;
  const nfz = fz / len;
  return { x: frame.x, z: frame.z, fx: nfx, fz: nfz, rx: -nfz, rz: nfx, curvature: frame.curvature };
}

export function signedAngle(ax: number, az: number, bx: number, bz: number): number {
  return Math.atan2(ax * bz - az * bx, ax * bx + az * bz);
}

export interface BranchStep {
  frame: PathFrame;
  frozen: { fx: number; fz: number } | null;
}

/** Шаг интеграции. После поворота курс берётся из frozen и больше не следует за сплайном. */
export function stepBranch(
  from: PathFrame,
  cursor: number,
  nose: number,
  ds: number,
  base: PathFrame,
  turn: number,
  yaw: number,
  frozen: { fx: number; fz: number } | null,
): BranchStep {
  const mid = cursor + ds * 0.5;
  const distance = mid - nose;
  let fx: number;
  let fz: number;
  let nextFrozen = frozen;
  if (frozen && distance >= turn) {
    fx = frozen.fx;
    fz = frozen.fz;
  } else {
    const turned = yawRight(base, branchYaw(distance, turn, yaw));
    fx = turned.fx;
    fz = turned.fz;
    if (distance >= turn) nextFrozen = { fx, fz };
  }
  const curvature = ds > 0 ? signedAngle(from.fx, from.fz, fx, fz) / ds : 0;
  return {
    frame: {
      x: from.x + fx * ds,
      z: from.z + fz * ds,
      fx,
      fz,
      rx: -fz,
      rz: fx,
      curvature,
    },
    frozen: nextFrozen,
  };
}
