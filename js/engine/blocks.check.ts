import { RIGHT_EXIT, compileExit, placedBlock } from './blocks.ts';
import type { ExitRecipe } from './blocks.ts';
import { EXIT_LANE_HALF, exitClock, exitRibbonMid, exitWidth, roadsJoined, sampleRoad } from './fork.ts';
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
assert(exitWidth(noseEdges) < 0.5, 'в самом носу лента съезда — только шов, а не полоса');
assert(noseEdges.rightInner < noseEdges.leftInner, 'в носу съезд ещё прижат к кромке прямой');
const joinedNose = frameAt(25, 0).world;
assert(roadsJoined(joinedNose), 'нос — одно полотно: на съезд можно перестроиться');
assert(exitWidth(joinedNose) > 2.4, 'лента набирает ширину уже на носу');
const fullNose = frameAt(plan.diverge - 0.02, 0).world;
assert(Math.abs(exitWidth(fullNose) - EXIT_LANE_HALF * 2) < 0.05, 'к концу носа лента полной ширины');
assert(fullNose.rightInner < fullNose.leftInner + 0.4, 'к концу носа съезд всё ещё прижат к прямой');
let approachMid: number | null = null;
let approachWidth = -1;
for (let distance = 0; distance <= plan.diverge + 2; distance += 2) {
  const edges = frameAt(distance, 0).world;
  const width = exitWidth(edges);
  assert(width >= approachWidth - 0.02, 'лента съезда только раскрывается, без скачков ширины');
  approachWidth = width;
  const mid = exitRibbonMid(edges);
  if (approachMid != null) assert(Math.abs(mid - approachMid) < 1.5, 'съезд не появляется целиком посреди подхода');
  approachMid = mid;
}
const attached = frameAt(plan.diverge + 20, 0).world;
assert(Math.abs(exitWidth(attached) - EXIT_LANE_HALF * 2) < 0.05, 'подход держит полную ширину до выбора');
assert(attached.rightInner < attached.leftInner + 0.4, 'до выбора съезд ещё приклеен к прямой, а не отделён клином');
assert(plan.choiceAt === 190 && plan.length === 390, 'выбор стоит в конце общего подхода, рецепт кончается у границы зоны');
assert(plan.straight[0]?.start === plan.exit[0]?.start && plan.straight[1]?.length === plan.exit[1]?.length, 'стык двух цепочек на одной метке');
const clock = exitClock();
const seal = plan.exit.find((span) => span.kind === 'seal');
assert(clock.lead === plan.length && clock.turn === plan.diverge && clock.choiceAt === plan.choiceAt && clock.spread === plan.spread, 'курс берёт длины из рецепта');
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

function frameAt(d: number, chosen: ChosenSide, arriveHalf?: number) {
  return sampleRoad({
    forkDistance: d,
    half: 10,
    chosen,
    baseOrigin: 0,
    arriveHalf,
  });
}

function tailFrameAt(d: number, chosen: Exclude<ChosenSide, 0>, arriveHalf = 10) {
  return sampleRoad({
    forkDistance: d,
    half: 10,
    chosen,
    baseOrigin: 0,
    arriveHalf,
    tailSide: chosen,
  });
}

function close(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.08;
}

function edgesHold(before: AsphaltEdges, after: AsphaltEdges): boolean {
  return close(before.leftOuter, after.leftOuter)
    && close(before.leftInner, after.leftInner)
    && close(before.rightInner, after.rightInner)
    && close(before.rightOuter, after.rightOuter);
}

for (const joint of [plan.diverge, plan.choiceAt, clock.ownAfter]) {
  for (const side of [-1, 1] as const) {
    const before = frameAt(joint - 0.02, side).world;
    const after = frameAt(joint + 0.02, side).world;
    assert(edgesHold(before, after), `кромки непрерывны на стыке ${joint}, выбор ${side}`);
  }
}

const beforeChoice = frameAt(plan.choiceAt - 10, 0).world;
for (const side of [-1, 0, 1] as const) {
  assert(edgesHold(beforeChoice, frameAt(plan.choiceAt - 10, side).world), 'до выбора форма не зависит от стороны');
}
const undecided = frameAt(plan.choiceAt + 40, 0).world;
const rightChoice = frameAt(plan.choiceAt + 40, 1).world;
const leftChoice = frameAt(plan.choiceAt + 40, -1).world;
assert(edgesHold(undecided, rightChoice), 'выбор съезда не двигает прямую');
assert(close(undecided.rightInner, leftChoice.rightInner) && close(undecided.rightOuter, leftChoice.rightOuter), 'выбор прямой не двигает чужую ленту');
assert(leftChoice.leftInner < undecided.leftInner - 0.5, 'только выбранная прямая готовится к полосам новой зоны');

const wideAt = (d: number, chosen: ChosenSide) => frameAt(d, chosen, 18).world;
const wideUndecided = wideAt(plan.choiceAt + 40, 0);
const wideRight = wideAt(plan.choiceAt + 40, 1);
const wideLeft = wideAt(plan.choiceAt + 40, -1);
assert(exitRibbonMid(wideRight) > exitRibbonMid(wideUndecided) + 1, 'выбранный съезд расширяется заранее до полос нового биома');
assert(close(exitRibbonMid(wideLeft), exitRibbonMid(wideUndecided)), 'выбор прямой оставляет съезд на его линии');
assert(Math.abs(wideLeft.leftInner - wideUndecided.leftInner) > 0.5, 'прямая меняет ширину только после своего выбора');

const openFork = frameAt(plan.choiceAt - 10, 1).world;
const midSeal = frameAt(plan.choiceAt + plan.seal * 0.5, 1).world;
assert(openFork.leftOuter === -10 && openFork.leftInner === 10, 'до расхождения обе ленты на своих линиях');
const oldWidth = midSeal.leftInner - midSeal.leftOuter;
assert(Math.abs(oldWidth - 20) < 0.01, 'невыбранная дорога держит полную ширину');
const midExit = exitRibbonMid(midSeal);
assert(midExit != null && midSeal.leftInner < midExit - 1, 'невыбранная дорога остаётся слева от съезда');
assert(midExit > exitRibbonMid(openFork) + 1, 'съезд уходит всё дальше от прямой');
assert(midSeal.rightOuter > midSeal.rightInner + 1, 'выбранная лента остаётся отдельной');
let sealMid = exitRibbonMid(openFork);
for (let d = plan.choiceAt; d <= clock.ownAfter; d += 2) {
  const next = exitRibbonMid(frameAt(d, 1).world);
  assert(next >= sealMid - 0.01, `съезд не возвращается назад на ${d} м`);
  sealMid = next;
}
const keptStraight = frameAt(plan.choiceAt + plan.seal * 0.5, -1).world;
const keptAtSameD = frameAt(plan.choiceAt + plan.seal * 0.5, 0).world;
assert(close(keptStraight.rightInner, keptAtSameD.rightInner), 'при левом выборе съезд не сдвигается');
assert(keptStraight.leftInner < 10, 'при левом выборе сужается только прямая');

const home = exitRibbonMid(frameAt(clock.ownAfter - 0.02, 1, 10).world);
const arrived = tailFrameAt(clock.ownAfter + 2, 1);
assert(close(exitRibbonMid(arrived.world), home), 'съезд продолжает свою линию без скачка');
assert(arrived.world.rightOuter - arrived.world.rightInner > 1, 'выбранная лента остаётся дорогой полной ширины');
assert(arrived.world.leftOuter === -10 && arrived.world.leftInner === 10, 'невыбранная прямая стоит на своей оси');

// На границе зоны счётчик развилки сбрасывается к новому носу. Хвост должен
// продолжать обе ленты предыдущего рецепта, а не схлопывать правую в точку.
const ZONE_M = 1500;
const resetAt = -(ZONE_M - plan.length);
for (const side of [-1, 1] as const) {
  const before = frameAt(plan.length - 0.02, side, 10).world;
  const at = tailFrameAt(plan.length, side).world;
  const reset = tailFrameAt(resetAt, side).world;
  assert(edgesHold(before, at) && edgesHold(at, reset), `хвост не рвётся на границе зоны, выбор ${side}`);
  let lastWidth = side === 1 ? at.rightOuter - at.rightInner : at.leftInner - at.leftOuter;
  for (let d = resetAt; d <= resetAt + 360; d += 10) {
    const edges = tailFrameAt(d, side).world;
    const width = side === 1 ? edges.rightOuter - edges.rightInner : edges.leftInner - edges.leftOuter;
    assert(Math.abs(width - 20) < 0.01, `выбранная дорога держит ширину в хвосте ${d} м, выбор ${side}`);
    assert(edges.rightInner - edges.leftInner > 0.2, `ленты не сливаются в хвосте ${d} м, выбор ${side}`);
    lastWidth = width;
  }
  assert(Math.abs(lastWidth - 20) < 0.01, 'в конце хвоста остаётся одна полная дорога');
}
const tailEnd = tailFrameAt(resetAt + 350, 1).world;
assert(Math.abs(exitRibbonMid(tailEnd)) < 0.05, 'съезд приходит на ось новой зоны');
assert(tailEnd.leftOuter === tailEnd.leftInner, 'старая дорога к тому моменту сошла на нет');

// Самая широкая ветвь следующей зоны шире разъезда: её лента не должна
// налегать на полотно невыбранной дороги после того, как ленты разошлись.
// Пока они ещё одно полотно, шов перекрывается намеренно.
for (const side of [-1, 0, 1] as const) {
  for (let d = plan.choiceAt; d < plan.length; d += 2) {
    const edges = wideAt(d, side);
    if (roadsJoined(edges)) continue;
    assert(edges.leftInner < edges.rightInner - 0.2, `ленты не налегают друг на друга на ${d} м, выбор ${side}`);
  }
}
const wideTail = sampleRoad({
  forkDistance: plan.length + 20,
  half: 10,
  chosen: 1,
  baseOrigin: 0,
  arriveHalf: 18,
  tailSide: 1,
}).world;
assert(wideTail.leftInner < wideTail.rightInner - 0.2, 'после въезда ленты не налегают друг на друга');

let tracks: [AsphaltSpan | null, AsphaltSpan | null] = [null, null];
let entrance: number | null = null;
for (let distance = plan.choiceAt - 10; distance <= plan.length - 2; distance += 2) {
  tracks = followAsphalt(tracks, frameAt(distance, 1).world);
  const spans = tracks.filter((span): span is AsphaltSpan => span != null);
  const right = spans.reduce((best, span) => (span.left + span.right > best.left + best.right ? span : best));
  const mid = (right.left + right.right) * 0.5;
  // Лента от носа полной ширины и всё время уходит вправо: скачка за 2 м нет.
  if (entrance != null) assert(Math.abs(mid - entrance) < 1.5, 'въезд не прыгает между дорогами');
  entrance = mid;
}
const left = tracks.find((span) => span != null);
if (!left) throw new Error('после въезда обе ленты остаются');
assert(tracks.filter((span) => span != null).length === 2, 'обе ленты продолжаются и после въезда');
assert(Math.abs((left.left + left.right) * 0.5) < 0.5, 'невыбранная лента осталась на своей оси');
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
