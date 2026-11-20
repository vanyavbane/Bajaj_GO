import { RIGHT_EXIT, compileExit, placedBlock } from './blocks.ts';
import type { ExitRecipe } from './blocks.ts';
import { exitCarryOrigin, exitClock, exitRibbonMid, followAsphalt, innerTrackEdge, pinchAsphalt, pinchShell, sampleRoad } from './fork.ts';
import type { AsphaltEdges, AsphaltSpan, ChosenSide } from './fork.ts';

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
assert(plan.approach.map((span) => span.id).join() === 'split,fork', 'до выбора построено только подход');
assert([...plan.approach, ...plan.exit].map((span) => span.id).join() === 'split,fork,seal-main,carry', 'съезд достраивает свою цепочку');

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
const declinedBefore = frameAt(330 - 0.02, -1).local;
const declinedAfter = frameAt(330 + 0.02, -1).local;
assert(exitRibbonMid(declinedBefore) > 12, 'закрытие отказа уводит съезд в сторону');
assert(
  declinedAfter.rightInner === declinedAfter.leftInner && declinedAfter.rightOuter === declinedAfter.rightInner,
  'после закрытия кончика уже нет',
);

let tracks: [AsphaltSpan | null, AsphaltSpan | null] = [null, null];
const followed = [];
for (const distance of [250, 329.9, 330.1]) {
  tracks = followAsphalt(tracks, frameAt(distance, 1).world);
  followed.push(tracks);
}
const openTracks = followed[0];
const exitTrack = openTracks[1] && openTracks[0]
  && (openTracks[1].left + openTracks[1].right) > (openTracks[0].left + openTracks[0].right) ? 1 : 0;
const sealSpan = followed[1][exitTrack];
const carrySpan = followed[2][exitTrack];
if (!sealSpan || !carrySpan) throw new Error('съезд остаётся на одной ленте через carry');
assert(
  Math.abs((sealSpan.left + sealSpan.right) - (carrySpan.left + carrySpan.right)) < 1,
  'лента съезда не перескакивает в другой слот',
);
assert(followed[2][1 - exitTrack] == null, 'прямая к carry уже не сидит на ленте съезда');
const pinched = pinchAsphalt([
  [{ left: -10, right: 10 }, { left: 20, right: 30 }],
  [null, { left: 20.2, right: 30.2 }],
]);
assert(pinched[0][1].left === pinched[0][1].right, 'оборванная прямая не тянется на съезд');
assert(Math.abs(pinched[1][0].left - 20) < 1e-6 && Math.abs(pinched[1][1].left - 20.2) < 1e-6, 'съезд продолжается своей лентой');
const shell = pinchShell([
  { left: -10, right: 10 },
  { left: -10, right: 10 },
  { left: 20, right: 30 },
  { left: 20, right: 30 },
]);
assert(shell[1]?.left === shell[1]?.right && Math.abs(shell[1]?.left ?? 1) < 1e-6, 'оболочка прямой схлопывается перед прыжком');
assert(shell[2]?.left === shell[2]?.right && Math.abs((shell[2]?.left ?? 0) - 25) < 1e-6, 'оболочка съезда начинается с точки, не с моста');
assert(Math.abs((shell[0]?.left ?? 0) + 10) < 1e-6 && Math.abs((shell[3]?.left ?? 0) - 20) < 1e-6, 'до и после разрыва кромки остаются своими');
assert(innerTrackEdge({ left: -10, right: 10 }, -1, 0.2) === 9.8, 'цветная линия прямой стоит у клина');
assert(innerTrackEdge({ left: 22, right: 32 }, 1, 0.2) === 22.2, 'цветная линия съезда стоит у его внутренней кромки');
assert(innerTrackEdge({ left: 5, right: 5.2 }, 1, 0.2) == null, 'узкая лента цветной линии не рисует');

(globalThis as { console?: { log: (message: string) => void } }).console?.log('exit blocks ok');
