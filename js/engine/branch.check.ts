import { BRANCH_YAW, branchYaw, frameFromSpline, stepBranch } from './branch.ts';

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

const step = 2;
const turn = 110;
const nose = 0;
let frame = frameFromSpline(0, 0, nose);
let frozen: { fx: number; fz: number } | null = null;
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

const held = frame.fx;
let later = frame;
let laterFrozen = frozen;
let at = cursor;
while (at < 400 - 1e-6) {
  // Сплайн после поворота уходит влево. Ветка не должна за ним последовать.
  const base = frameFromSpline(-40, -0.4, at + step * 0.5);
  const next = stepBranch(later, at, nose, step, base, turn, BRANCH_YAW, laterFrozen);
  later = next.frame;
  laterFrozen = next.frozen;
  at += step;
}
assert(Math.abs(later.fx - held) < 1e-6, 'замороженный вектор не повторяет новый изгиб маршрута');
assert(Math.abs(later.curvature) < 1e-6, 'после поворота прямая ветка больше не крутит байк');
assert(branchYaw(0, turn) === 0 && Math.abs(branchYaw(turn, turn) - BRANCH_YAW) < 1e-9, 'угол растёт только на повороте');

(globalThis as { console?: { log: (message: string) => void } }).console?.log('branch ok');
