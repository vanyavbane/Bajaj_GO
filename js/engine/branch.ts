/**
 * Настоящее ответвление.
 * Съезд поворачивает вправо относительно касательной дороги. После поворота
 * он держит этот угол к шоссе и дальше повторяет его изгибы.
 */

/** Радианы вправо. Около 17°: за длину закрытия путь приходит на линию ленты,
 *  а не уезжает на десятки метров правее асфальта. */
export const BRANCH_YAW = 0.3;

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

/**
 * Поворот от одного курса к другому на долю weight.
 * Дальше прямого угла не идём: линейная смесь касательных там разворачивает байк задом.
 */
export function turnToward(ax: number, az: number, bx: number, bz: number, weight: number): { fx: number; fz: number } {
  const angle = signedAngle(ax, az, bx, bz);
  const capped = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, angle));
  const turn = capped * Math.max(0, Math.min(1, Number.isFinite(weight) ? weight : 0));
  const c = Math.cos(turn);
  const sn = Math.sin(turn);
  const fx = ax * c - az * sn;
  const fz = ax * sn + az * c;
  const len = Math.hypot(fx, fz) || 1;
  return { fx: fx / len, fz: fz / len };
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
    const capped = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, offset));
    const turned = yawRight(base, capped);
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
