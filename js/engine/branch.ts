/**
 * Настоящее ответвление.
 * Съезд поворачивает вправо относительно касательной дороги. После поворота
 * он держит этот угол к шоссе и дальше повторяет его изгибы.
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

/**
 * Скорость поворота касательной, рад на метр параметра s.
 * Угол от −Z равен atan(dx), поэтому dθ/ds = ddx / (1 + dx²), а не сама вторая производная.
 */
export function headingRate(dx: number, ddx: number): number {
  if (!Number.isFinite(dx) || !Number.isFinite(ddx)) return 0;
  return ddx / (1 + dx * dx);
}

/** Кадр прямой дороги. dx — dX/ds сплайна, ddx — d²X/ds². curvature уже в рад/м. */
export function frameFromSpline(x: number, dx: number, s: number, ddx = 0): PathFrame {
  const slope = Number.isFinite(dx) ? dx : 0;
  const lh = Math.hypot(slope, 1) || 1;
  const fx = slope / lh;
  const fz = -1 / lh;
  return { x, z: -s, fx, fz, rx: -fz, rz: fx, curvature: headingRate(slope, ddx) };
}

/** 0 до носа, полный угол после поворота. Отрицательный угол — влево. */
export function branchYaw(distance: number, turn: number, yaw = BRANCH_YAW): number {
  if (!(distance > 0) || !(turn > 0) || !Number.isFinite(yaw)) return 0;
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

/** Угол съезда к шоссе в момент, когда поворот закончился. */
export interface FrozenYaw {
  fx: number;
  fz: number;
  bx: number;
  bz: number;
}

export interface BranchStep {
  frame: PathFrame;
  frozen: FrozenYaw | null;
}

/** Шаг интеграции. После поворота угол к шоссе фиксирован, изгиб шоссе остаётся. */
export function stepBranch(
  from: PathFrame,
  cursor: number,
  nose: number,
  ds: number,
  base: PathFrame,
  turn: number,
  yaw: number,
  frozen: FrozenYaw | null,
): BranchStep {
  const mid = cursor + ds * 0.5;
  const distance = mid - nose;
  let fx: number;
  let fz: number;
  let nextFrozen = frozen;
  if (frozen && distance >= turn) {
    const offset = signedAngle(frozen.bx, frozen.bz, frozen.fx, frozen.fz);
    const turned = yawRight(base, offset);
    fx = turned.fx;
    fz = turned.fz;
  } else {
    const turned = yawRight(base, branchYaw(distance, turn, yaw));
    fx = turned.fx;
    fz = turned.fz;
    if (distance >= turn) nextFrozen = { fx, fz, bx: base.fx, bz: base.fz };
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
