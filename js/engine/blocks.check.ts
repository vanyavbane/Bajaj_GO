import { RIGHT_EXIT, compileExit, placedBlock } from './blocks.ts';
import type { ExitRecipe } from './blocks.ts';
import { EXIT_LANE_HALF, exitClock, exitRibbonMid, sampleRoad } from './fork.ts';
import type { AsphaltEdges, ChosenSide } from './fork.ts';
import { followAsphalt, innerTrackEdge, pinchAsphalt, pinchShell } from './asphalt.ts';
import type { AsphaltSpan } from './asphalt.ts';

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
assert(plan.diverge === 50 && plan.run === 140 && plan.seal === 120 && plan.margin === 80, 'блоки правого съезда: короткий отход, участок рядом, чистое отделение');
const noseBlock = placedBlock(plan, 0, 0);
assert(noseBlock != null && noseBlock.kind === 'split' && noseBlock.u === 0, 'ноль метров от носа — это начало отхода');
const noseEdges = frameAt(0, 0).world;
assert(Math.abs(noseEdges.rightOuter - noseEdges.rightInner) < 0.05, '+1 полоса в носу ещё нулевой ширины');
assert(Math.abs(noseEdges.rightInner - noseEdges.leftInner) < 0.05, '+1 полоса прижата к кромке дороги');
const growing = frameAt(12, 0).world;
assert(growing.rightOuter > growing.rightInner + 0.5 && growing.rightOuter < growing.rightInner + EXIT_LANE_HALF * 2, '+1 полоса набирает ширину на подходе');
assert(Math.abs(growing.rightInner - growing.leftInner) < 0.05, 'до выбора полоса остаётся прижатой');
let approachMid: number | null = null;
for (let distance = -2; distance <= plan.diverge + 2; distance += 2) {
  const mid = exitRibbonMid(frameAt(distance, 0).world);
  if (approachMid != null) assert(Math.abs(mid - approachMid) < 0.5, '+1 полоса не появляется целиком в носу');
  approachMid = mid;
}
const attached = frameAt(plan.diverge + 20, 0).world;
assert(Math.abs(attached.rightOuter - attached.rightInner - EXIT_LANE_HALF * 2) < 0.05, 'подход держит полную ширину до выбора');
assert(Math.abs(attached.rightInner - attached.leftInner) < 0.05, 'до выбора полоса остаётся прижатой');
assert(plan.choiceAt === 190 && plan.length === 390, 'выбор стоит в конце общего подхода, рецепт кончается у границы зоны');
assert(plan.straight[0]?.start === plan.exit[0]?.start && plan.straight[1]?.length === plan.exit[1]?.length, 'стык двух цепочек на одной метке');
const clock = exitClock();
const seal = plan.exit.find((span) => span.kind === 'seal');
assert(clock.lead === plan.length && clock.turn === plan.seal && clock.choiceAt === plan.choiceAt && clock.spread === plan.spread, 'курс берёт длины из рецепта');
assert(seal != null && clock.ownAfter === seal.start + seal.length, 'съезд приходит в дорогу ровно к концу закрытия');

const nose = placedBlock(plan, 20, 0);
assert(nose?.id === 'split' && nose.built, 'подход уже построен, выбор его не ждёт');
const open = placedBlock(plan, plan.choiceAt + 40, 0);
assert((open?.id === 'seal-exit' || open?.id === 'seal-main') && open.built, 'до выбора обе цепочки уже построены');
const taken = placedBlock(plan, plan.choiceAt + 40, 1);
assert(taken?.id === 'seal-main' && taken.built, 'выбор съезда ставит его цепочку');
const kept = placedBlock(plan, plan.choiceAt + plan.seal + 40, -1);
assert(kept?.id === 'ahead' && kept.kind === 'road' && kept.built, 'прямой выбор оставляет обычную дорогу');
const carried = placedBlock(plan, plan.choiceAt + plan.seal + 40, 1);
assert(carried?.id === 'arrived' && carried.kind === 'road', 'после въезда цепочка заканчивается новой дорогой');
assert(placedBlock(plan, -1, 1) == null && placedBlock(plan, plan.length, 1) == null, 'вне рецепта блока нет');
assert(plan.approach.map((span) => span.id).join() === 'split,fork', 'общий подход общий для обеих ветвей');
assert([...plan.approach, ...plan.exit].map((span) => span.id).join() === 'split,fork,seal-main,arrived', 'съездная цепочка готова заранее');
assert([...plan.approach, ...plan.straight].map((span) => span.id).join() === 'split,fork,seal-exit,ahead', 'прямая цепочка готова заранее');

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
for (const joint of [plan.diverge, plan.choiceAt, clock.ownAfter]) {
  const before = frameAt(joint - 0.02, 1).world;
  const after = frameAt(joint + 0.02, 1).world;
  assert(mainHolds(before, after), `съезд непрерывен на стыке ${joint}`);
}
const anyChoice = frameAt(plan.choiceAt + 40, 0).world;
const leftChoice = frameAt(plan.choiceAt + 40, -1).world;
const rightChoice = frameAt(plan.choiceAt + 40, 1).world;
assert(
  Math.abs(anyChoice.leftOuter - leftChoice.leftOuter) < 1e-9
  && Math.abs(anyChoice.rightOuter - rightChoice.rightOuter) < 1e-9,
  'форма полотна не зависит от выбора игрока',
);

for (const joint of [plan.diverge, plan.choiceAt]) {
  const before = frameAt(joint - 0.02, 1).world;
  const after = frameAt(joint + 0.02, 1).world;
  assert(mainHolds(before, after), `асфальт непрерывен на стыке въезда ${joint}`);
}
const seamBefore = frameAt(clock.ownAfter - 0.02, 1).world;
const seamAfter = frameAt(clock.ownAfter + 0.02, 1).world;
assert(
  Math.abs(exitRibbonMid(seamBefore) - exitRibbonMid(seamAfter)) < 0.5,
  'лента съезда продолжается без скачка',
);
const openFork = frameAt(plan.choiceAt - 10, 1).world;
const midSeal = frameAt(plan.choiceAt + plan.seal * 0.5, 1).world;
const arrived = frameAt(clock.ownAfter + 2, 1).world;
assert(openFork.leftOuter === -10 && openFork.leftInner === 10, 'до расхождения обе ленты на своих линиях');
const oldWidth = midSeal.leftInner - midSeal.leftOuter;
assert(Math.abs(oldWidth - 20) < 0.01, 'невыбранная дорога держит полную ширину');
assert(midSeal.leftInner < 0, 'невыбранная дорога уходит влево от выбранной');
assert(exitRibbonMid(midSeal) > exitRibbonMid(openFork), 'съезд плавно уходит с +1 полосы на линию курса');
assert(midSeal.rightOuter > midSeal.rightInner + 1, 'выбранная лента остаётся отдельной');
const home = exitRibbonMid(frameAt(clock.ownAfter - 0.02, 1).world);
assert(Math.abs(exitRibbonMid(arrived) - home) < 1, 'съезд продолжает свою линию без скачка');
assert(arrived.rightOuter - arrived.rightInner > 1, 'после въезда невыбранная лента всё ещё жива');
assert(arrived.leftOuter < -10 && arrived.leftInner < 10, 'после въезда старая дорога уходит влево, а не пропадает');

let tracks: [AsphaltSpan | null, AsphaltSpan | null] = [null, null];
let entrance: number | null = null;
for (let distance = plan.choiceAt - 10; distance <= plan.length - 2; distance += 2) {
  tracks = followAsphalt(tracks, frameAt(distance, 1).world);
  const spans = tracks.filter((span): span is AsphaltSpan => span != null);
  const right = spans.reduce((best, span) => (span.left + span.right > best.left + best.right ? span : best));
  const mid = (right.left + right.right) * 0.5;
  // +1 полоса прижата к кромке, на закрытии уходит на линию курса, а после
  // въезда возвращается к центру. Всё это плавно: скачок за 2 м быть не должен.
  if (entrance != null) assert(Math.abs(mid - entrance) < 1.5, 'въезд не прыгает между дорогами');
  entrance = mid;
}
const left = tracks.find((span) => span != null);
if (!left) throw new Error('после въезда обе ленты остаются');
assert(tracks.filter((span) => span != null).length === 2, 'обе ленты продолжаются и после въезда');
assert(Math.abs((left.left + left.right) * 0.5 + EXIT_LANE_HALF) > 1, 'невыбранная лента ушла от линии въезда');
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
