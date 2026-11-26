/**
 * Сиденье байка: захват ленты, отпуск и посадка, когда въезд стал новой дорогой.
 * Мировая точка до и после шага одна, пока лента не исчезла из-под отказа.
 */
import { readExit } from './exit.ts';
import { bridgeEdges, exitClock, exitRibbonCenter, laneAnchor, sampleRoad } from './fork.ts';
import { seatFromWorld, seatWorld, stepSeat, type RiderSeat } from './seat.ts';

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

const clock = exitClock();
const span = 4.75;

function frameAt(distance: number, chosen: -1 | 0 | 1) {
  return sampleRoad({
    forkDistance: distance,
    half: 10,
    chosen,
    baseOrigin: 0,
    endWeight: 1,
  });
}

function sameWorld(before: number, frame: ReturnType<typeof frameAt>, seat: RiderSeat): void {
  assert(Math.abs(seatWorld(frame, seat, span) - before) < 1e-6, 'мировая точка сиденья не прыгает');
}

const open = frameAt(clock.choiceAt - 40, 0);
const ribbon = exitRibbonCenter(open.local);
assert(ribbon != null && ribbon > 10, 'на раздельном участке лента съезда справа от оси');

const onRoad: RiderSeat = { kind: 'road', lane: 0 };
const stayed = stepSeat(open, onRoad, span);
assert(stayed.kind === 'road' && stayed.lane === 0, 'байк на прямой не пересаживается на съезд');

const grabbing: RiderSeat = { kind: 'road', lane: (ribbon ?? 0) / span };
const grabbedWorld = seatWorld(open, grabbing, span);
const grabbed = stepSeat(open, grabbing, span);
assert(grabbed.kind === 'exit', 'байк на асфальте ленты садится на съезд');
sameWorld(grabbedWorld, open, grabbed);
const regrabbed = seatFromWorld(open, grabbedWorld, grabbed, span);
assert(regrabbed.kind === 'exit', 'посадка из сглаженной точки сохраняет съезд');
sameWorld(grabbedWorld, open, regrabbed);

const heldWorld = seatWorld(open, grabbed, span);
const held = stepSeat(open, grabbed, span);
assert(held.kind === 'exit', 'сиденье съезда остаётся, пока лента есть');
sameWorld(heldWorld, open, held);

const mergeFrame = frameAt(clock.ownAfter + 5, 1);
assert(mergeFrame.origin === 0, 'въезд не переносит центр новой дороги');
assert(exitRibbonCenter(mergeFrame.local) == null, 'после въезда лента уже не отдельная');
const exiting: RiderSeat = { kind: 'exit', lane: 0.4 };
const merged = stepSeat(mergeFrame, exiting, span);
assert(merged.kind === 'road', 'въезд сажает байка на новую дорогу');
const landedAt = seatWorld(mergeFrame, merged, span);
assert(
  landedAt > mergeFrame.local.leftOuter + 0.2 && landedAt < mergeFrame.local.leftInner - 0.2,
  'байк остаётся на новой дороге, а не на кромке старой',
);

const declined = frameAt(clock.ownAfter + 5, -1);
assert(exitRibbonCenter(declined.local) == null, 'отказанная лента к концу зоны исчезла');
const stranded: RiderSeat = { kind: 'exit', lane: 6 };
const landed = stepSeat(declined, stranded, span);
assert(landed.kind === 'road', 'пропавшая лента возвращает байка на дорогу');
assert(landed.lane < stranded.lane, 'байк садится на край прямой, а не остаётся в стороне');

// Мост — одно полотно. Если разделить его щелью посредине, readExit примет
// правую половину за съезд, laneAnchor уедет на 9.55 м и попутная полоса
// на въезде окажется встречной. Полосы читаются в метрах, поэтому span = 1.
const bridgeFrame: ReturnType<typeof sampleRoad> = {
  origin: 0,
  local: bridgeEdges(),
  world: bridgeEdges(),
  phase: { kind: 'settle', t: 1, open: 0 },
  chosen: 0,
  block: null,
};
assert(readExit(bridgeFrame).ribbon == null, 'на мосту нет ленты съезда из правой половины полотна');
assert(Math.abs(laneAnchor(bridgeFrame)) < 1e-6, 'ось полос моста стоит на центре полотна');

for (const lane of [-7.125, -2.375, 2.375, 7.125]) {
  const seat: RiderSeat = { kind: 'road', lane };
  const world = seatWorld(bridgeFrame, seat, 1);
  assert(Math.abs(world - lane) < 1e-6, `мост не сдвигает полосу ${lane}`);
  const seated = seatFromWorld(bridgeFrame, world, seat, 1);
  assert(seated.kind === 'road' && Math.abs(seated.lane - lane) < 1e-6, `посадка на мосту сохраняет полосу ${lane}`);
  assert(Math.abs(seatWorld(bridgeFrame, seated, 1) - world) < 1e-6, `посадка на мосту не двигает мир полосы ${lane}`);
}
