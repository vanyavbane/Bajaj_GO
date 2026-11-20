import { BRANCH_YAW, branchYaw, frameFromSpline, headingRate, signedAngle, stepBranch, turnToward } from './branch.ts';
import type { FrozenYaw } from './branch.ts';

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

const step = 2;
const turn = 110;
const nose = 0;
let frame = frameFromSpline(0, 0, nose);
let frozen: FrozenYaw | null = null;
let cursor = nose;
let peak = 0;
while (cursor < 220 - 1e-6) {
  const base = frameFromSpline(0, 0, cursor + step * 0.5);
  const next = stepBranch(frame, cursor, nose, step, base, turn, BRANCH_YAW, frozen);
  frame = next.frame;
  frozen = next.frozen;
  peak = Math.max(peak, frame.curvature);
  cursor += step;
}
assert(peak > 0.003 && peak < 0.02, 'поворот съезда той же силы, что изгиб обычной дороги');
assert(frame.x > 18, 'после поворота ветка ушла вправо от сплайна');
assert(Math.abs(frame.fx - Math.sin(BRANCH_YAW)) < 0.08, 'курс держит угол поворота, а не касательную прямой');
assert(frozen != null, 'после поворота курс заморожен');

let straight = frame;
let straightFrozen = frozen;
let at = cursor;
while (at < 400 - 1e-6) {
  const base = frameFromSpline(0, 0, at + step * 0.5);
  const next = stepBranch(straight, at, nose, step, base, turn, BRANCH_YAW, straightFrozen);
  straight = next.frame;
  straightFrozen = next.frozen;
  at += step;
}
assert(Math.abs(straight.fx - Math.sin(BRANCH_YAW)) < 0.08, 'на прямом шоссе угол после поворота не растёт');
assert(Math.abs(straight.curvature) < 1e-6, 'на прямом шоссе съезд больше не крутит байк');

let later = frame;
let laterFrozen = frozen;
let bend = 0;
at = cursor;
while (at < 400 - 1e-6) {
  bend -= 0.004;
  const base = frameFromSpline(0, bend, at + step * 0.5, -0.004);
  const next = stepBranch(later, at, nose, step, base, turn, BRANCH_YAW, laterFrozen);
  later = next.frame;
  laterFrozen = next.frozen;
  at += step;
}
const parentNow = frameFromSpline(0, bend, at);
const rel = signedAngle(parentNow.fx, parentNow.fz, later.fx, later.fz);
assert(Math.abs(rel - BRANCH_YAW) < 0.05, 'после поворота съезд держит угол к шоссе');
assert(later.curvature < -0.001, 'изгиб шоссе крутит съезд вместе с собой');
assert(branchYaw(0, turn) === 0 && Math.abs(branchYaw(turn, turn) - BRANCH_YAW) < 1e-9, 'угол растёт только на повороте');
assert(headingRate(0, 0.01) === 0.01, 'на прямой изгиб совпадает со второй производной');
assert(Math.abs(headingRate(1, 0.02) - 0.01) < 1e-12, 'наклон уменьшает скорость поворота относительно второй производной');
const bent = frameFromSpline(4, 1, 10, 0.02);
assert(Math.abs(bent.curvature - 0.01) < 1e-12, 'кадр сплайна хранит рад/м, не сырую вторую производную');
const ahead = turnToward(0, -1, 0, -1, 1);
assert(Math.abs(ahead.fx) < 1e-9 && ahead.fz < -0.99, 'нулевой угол оставляет курс');
const flipped = turnToward(0, -1, 0, 1, 1);
assert(Math.abs(flipped.fx) > 0.99 && flipped.fz <= 0.001, 'разворот больше прямого угла обрезается до него');

(globalThis as { console?: { log: (message: string) => void } }).console?.log('branch ok');
