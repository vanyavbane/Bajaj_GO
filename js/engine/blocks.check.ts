import { RIGHT_EXIT, compileExit, placedBlock } from './blocks.ts';
import type { ExitRecipe } from './blocks.ts';
import { EXIT_LANE_HALF, exitClock, exitRibbonMid, followAsphalt, innerTrackEdge, pinchAsphalt, pinchShell, sampleRoad } from './fork.ts';
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
assert(plan.diverge === 80 && plan.run === 480 && plan.seal === 160 && plan.margin === 180, 'блоки правого съезда: короткий отход, длинный участок рядом');
const noseBlock = placedBlock(plan, 0, 0);
assert(noseBlock != null && noseBlock.kind === 'split' && noseBlock.u === 0, 'ноль метров от носа — это начало отхода');
const noseEdges = frameAt(0, 0).world;
assert(noseEdges.rightOuter - noseEdges.rightInner < 0.05, 'на носе съезд ещё не отдельная полоса');
assert(Math.abs(noseEdges.rightInner - noseEdges.leftInner) < 0.05, 'на носе съезд лежит на кромке дороги');
const growing = frameAt(12, 0).world;
assert(growing.rightOuter - growing.rightInner > 1, 'сразу после носа съезд растёт из кромки');
assert(growing.rightInner - growing.leftInner < 0.5, 'пока он растёт, он ещё держится за дорогу');
assert(plan.choiceAt === 560 && plan.length === 900, 'выбор стоит в конце общего подхода, рецепт кончается у границы зоны');
assert(plan.straight[0]?.start === plan.exit[0]?.start && plan.straight[1]?.length === plan.exit[1]?.length, 'стык двух цепочек на одной метке');
const clock = exitClock();
const seal = plan.exit.find((span) => span.kind === 'seal');
assert(clock.lead === plan.length && clock.turn === plan.diverge && clock.choiceAt === plan.choiceAt && clock.spread === plan.spread, 'курс берёт длины из рецепта');
assert(seal != null && clock.ownAfter === seal.start + seal.length, 'съезд приходит в дорогу ровно к концу закрытия');

const nose = placedBlock(plan, 20, 0);
assert(nose?.id === 'split' && nose.built, 'подход уже построен, выбор его не ждёт');
const open = placedBlock(plan, plan.choiceAt + 40, 0);
assert(open?.id === 'open' && open.built === false, 'до выбора хвост не строится');
const taken = placedBlock(plan, plan.choiceAt + 40, 1);
assert(taken?.id === 'seal-main' && taken.built, 'выбор съезда ставит его цепочку');
const kept = placedBlock(plan, plan.choiceAt + plan.seal + 40, -1);
assert(kept?.id === 'ahead' && kept.kind === 'road' && kept.built, 'прямой выбор оставляет обычную дорогу');
const carried = placedBlock(plan, plan.choiceAt + plan.seal + 40, 1);
assert(carried?.id === 'arrived' && carried.kind === 'road', 'после въезда цепочка заканчивается новой дорогой');
assert(placedBlock(plan, -1, 1) == null && placedBlock(plan, plan.length, 1) == null, 'вне рецепта блока нет');
assert(plan.approach.map((span) => span.id).join() === 'split,fork', 'до выбора построено только подход');
assert([...plan.approach, ...plan.exit].map((span) => span.id).join() === 'split,fork,seal-main,arrived', 'съезд достраивает свою цепочку');

const broken: ExitRecipe = {
  id: 'broken',
  spread: 22,
  approach: RIGHT_EXIT.approach,
  choices: [
    RIGHT_EXIT.choices[0],
    [
      { id: 'short', kind: 'seal', length: 40 },
      { id: 'arrived', kind: 'road', length: 100 },
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
    endWeight,
  });
}

function close(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.08;
}

function mainHolds(before: AsphaltEdges, after: AsphaltEdges): boolean {
  return close(before.leftOuter, after.leftOuter) && close(before.leftInner, after.leftInner);
}

for (const joint of [plan.diverge, plan.choiceAt, clock.ownAfter]) {
  const before = frameAt(joint - 0.02, -1).world;
  const after = frameAt(joint + 0.02, -1).world;
  assert(mainHolds(before, after), `прямая дорога непрерывна на стыке ${joint}`);
}

for (const joint of [plan.diverge, plan.choiceAt]) {
  const before = frameAt(joint - 0.02, 1).world;
  const after = frameAt(joint + 0.02, 1).world;
  assert(mainHolds(before, after), `асфальт непрерывен на стыке въезда ${joint}`);
}
const seamBefore = frameAt(clock.ownAfter - 0.02, 1).world;
const seamAfter = frameAt(clock.ownAfter + 0.02, 1).world;
assert(
  Math.abs(exitRibbonMid(seamBefore) - (seamAfter.leftOuter + seamAfter.leftInner) * 0.5) < 0.5,
  'лента въезда переходит в новую дорогу без скачка',
);
const openFork = frameAt(plan.choiceAt - 10, 1).world;
const midSeal = frameAt(plan.choiceAt + plan.seal * 0.5, 1).world;
const arrived = frameAt(clock.ownAfter + 10, 1).world;
assert(openFork.leftOuter === -10 && openFork.leftInner === 10, 'до закрытия старая дорога ещё своей ширины');
const oldWidth = midSeal.leftInner - midSeal.leftOuter;
assert(oldWidth < 16 && oldWidth > 1, 'на закрытии старая дорога сужается');
assert(Math.abs((midSeal.leftOuter + midSeal.leftInner) * 0.5) < 0.2, 'старая дорога сужается на месте');
assert(Math.abs(exitRibbonMid(midSeal) - exitRibbonMid(openFork)) < 0.5, 'въезд остаётся на своей линии');
assert(midSeal.rightOuter > midSeal.rightInner + 1, 'на закрытии въезд ещё отдельная лента');
const home = exitRibbonMid(openFork);
assert(Math.abs((arrived.leftOuter + arrived.leftInner) * 0.5 - home) < 1, 'сразу после въезда дорога на линии съезда');
assert(arrived.rightInner === arrived.leftInner && arrived.rightOuter === arrived.rightInner, 'после въезда старой ленты нет');
const declinedBefore = frameAt(clock.ownAfter - 0.02, -1).local;
const declinedAfter = frameAt(clock.ownAfter + 0.02, -1).local;
assert(exitRibbonMid(declinedBefore) > 12, 'закрытие отказа уводит съезд в сторону');
assert(
  declinedAfter.rightInner === declinedAfter.leftInner && declinedAfter.rightOuter === declinedAfter.rightInner,
  'после закрытия кончика уже нет',
);

let tracks: [AsphaltSpan | null, AsphaltSpan | null] = [null, null];
let entrance = 40;
for (let distance = plan.choiceAt - 10; distance <= plan.length - 2; distance += 2) {
  tracks = followAsphalt(tracks, frameAt(distance, 1).world);
  const spans = tracks.filter((span): span is AsphaltSpan => span != null);
  const right = spans.reduce((best, span) => (span.left + span.right > best.left + best.right ? span : best));
  const mid = (right.left + right.right) * 0.5;
  assert(mid <= entrance + 0.05, 'въезд не прыгает обратно на старую дорогу');
  entrance = mid;
}
const left = tracks.find((span) => span != null);
if (!left) throw new Error('после въезда новая дорога остаётся');
assert(Math.abs(left.left + EXIT_LANE_HALF) < 0.2 && Math.abs(left.right - EXIT_LANE_HALF) < 0.2, 'лента въезда приходит в новую дорогу');
assert(tracks.filter((span) => span != null).length === 1, 'старая дорога к концу въезда уже сошла');
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
