import { RIGHT_EXIT, builtChain, compileExit, placedBlock } from './blocks.ts';
import type { ExitRecipe } from './blocks.ts';
import { exitCarryOrigin, exitChain, exitClock, sampleRoad } from './fork.ts';
import type { AsphaltEdges, ChosenSide } from './fork.ts';

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

function rejects(recipe: ExitRecipe): boolean {
  try {
    compileExit(recipe);
    return false;
  } catch {
    return true;
  }
}

const plan = compileExit(RIGHT_EXIT);
assert(plan.diverge === 110 && plan.run === 150 && plan.seal === 70 && plan.margin === 100, 'блоки правого съезда держат прежние длины');
assert(plan.choiceAt === 260 && plan.length === 430, 'выбор стоит в конце общего подхода, рецепт кончается у границы зоны');
assert(plan.straight[0]?.start === plan.exit[0]?.start && plan.straight[1]?.length === plan.exit[1]?.length, 'стык двух цепочек на одной метке');
const clock = exitClock();
const carry = plan.exit.find((span) => span.kind === 'carry');
assert(clock.lead === plan.length && clock.turn === plan.diverge && clock.choiceAt === plan.choiceAt && clock.spread === plan.spread, 'курс берёт длины из рецепта');
assert(carry != null && clock.ownAfter === carry.start, 'вектор становится дорогой ровно в начале блока carry');

const nose = placedBlock(plan, 20, 0);
assert(nose?.id === 'split' && nose.built, 'подход уже построен, выбор его не ждёт');
const open = placedBlock(plan, 300, 0);
assert(open?.id === 'open' && open.built === false, 'до выбора хвост не строится');
const taken = placedBlock(plan, 300, 1);
assert(taken?.id === 'seal-main' && taken.built, 'выбор съезда ставит его цепочку');
const kept = placedBlock(plan, 400, -1);
assert(kept?.id === 'ahead' && kept.kind === 'road' && kept.built, 'прямой выбор оставляет обычную дорогу');
const carried = placedBlock(plan, 400, 1);
assert(carried?.id === 'carry' && carried.kind === 'carry', 'съезд заканчивается блоком, где он сам стал дорогой');
assert(placedBlock(plan, 0, 1) == null && placedBlock(plan, 430, 1) == null, 'вне рецепта блока нет');
assert(builtChain(plan, 0).join() === 'split,fork', 'до выбора построено только подход');
assert(builtChain(plan, 1).join() === 'split,fork,seal-main,carry', 'съезд достраивает свою цепочку');
assert(exitChain(1).join() === builtChain(plan, 1).join(), 'игра читает ту же цепочку, что рецепт');

const broken: ExitRecipe = {
  id: 'broken',
  spread: 22,
  approach: RIGHT_EXIT.approach,
  choices: [
    RIGHT_EXIT.choices[0],
    [
      { id: 'short', kind: 'seal', length: 40 },
      { id: 'carry', kind: 'carry', length: 100 },
    ],
  ],
};
assert(rejects(broken), 'цепочки разной длины не собираются');

function frameAt(d: number, chosen: ChosenSide) {
  return frameAtWeighted(d, chosen, 1);
}

function frameAtWeighted(d: number, chosen: ChosenSide, endWeight: number) {
  return sampleRoad({
    forkDistance: d,
    half: 10,
    chosen,
    baseOrigin: 0,
    carriedOrigin: chosen === 1 ? exitCarryOrigin(10, 0) : null,
    endWeight,
  });
}

function close(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.08;
}

function mainHolds(before: AsphaltEdges, after: AsphaltEdges): boolean {
  return close(before.leftOuter, after.leftOuter) && close(before.leftInner, after.leftInner);
}

for (const joint of [110, 260, 330]) {
  const before = frameAt(joint - 0.02, -1).world;
  const after = frameAt(joint + 0.02, -1).world;
  assert(mainHolds(before, after), `прямая дорога непрерывна на стыке ${joint}`);
}

const exitBefore = frameAt(330 - 0.02, 1).world;
const exitAfter = frameAt(330 + 0.02, 1).world;
assert(
  close(exitBefore.rightInner, exitAfter.leftOuter) && close(exitBefore.rightOuter, exitAfter.leftInner),
  'блок carry продолжает ленту съезда, без скачка',
);

(globalThis as { console?: { log: (message: string) => void } }).console?.log('exit blocks ok');
