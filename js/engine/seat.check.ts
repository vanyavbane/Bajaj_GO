/**
 * Сиденье байка: захват ленты, отпуск и вливание съезда в дорогу.
 * Мировая точка до и после шага одна, пока лента не исчезла из-под отказа.
 */
import { exitCarryOrigin, exitClock, exitRibbonCenter, sampleRoad } from './fork.ts';
import { exitCarriage } from './lanes.ts';
import { mergeExitIntoRoad, rescaleSeat, seatWorld, stepSeat, type RiderSeat } from './seat.ts';

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

const clock = exitClock();
const span = 4.75;

function frameAt(distance: number, chosen: -1 | 0 | 1, carried: number | null = null) {
  return sampleRoad({
    forkDistance: distance,
    half: 10,
    chosen,
    baseOrigin: 0,
    carriedOrigin: carried,
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
const stayed = stepSeat(open, onRoad, span, false);
assert(stayed.kind === 'road' && stayed.lane === 0, 'байк на прямой не пересаживается на съезд');

const grabbing: RiderSeat = { kind: 'road', lane: (ribbon ?? 0) / span };
const grabbedWorld = seatWorld(open, grabbing, span);
const grabbed = stepSeat(open, grabbing, span, false);
assert(grabbed.kind === 'exit', 'байк на асфальте ленты садится на съезд');
sameWorld(grabbedWorld, open, grabbed);

const heldWorld = seatWorld(open, grabbed, span);
const held = stepSeat(open, grabbed, span, false);
assert(held.kind === 'exit', 'сиденье съезда остаётся, пока лента есть');
sameWorld(heldWorld, open, held);

const carriedOrigin = exitCarryOrigin(10, 0);
const mergeFrame = frameAt(clock.ownAfter + 5, 1, carriedOrigin);
assert(Math.abs(mergeFrame.origin - carriedOrigin) < 1e-6, 'влитый съезд стоит на центре своей ленты');
assert(exitRibbonCenter(mergeFrame.local) == null, 'после захвата лента уже не отдельная: она стала дорогой');
const exiting: RiderSeat = { kind: 'exit', lane: 0.4 };
const mergeWorld = seatWorld(mergeFrame, exiting, span);
const merged = stepSeat(mergeFrame, exiting, span, true);
assert(merged.kind === 'road', 'взятый съезд вливается в дорогу');
assert(Math.abs(merged.lane - 0.4) < 1e-6, 'полоса после вливания считается от нового центра');
sameWorld(mergeWorld, mergeFrame, merged);
assert(
  mergeExitIntoRoad(mergeWorld, mergeFrame.origin, span).lane === merged.lane,
  'шаг вливания и явная функция дают одну полосу',
);

const declined = frameAt(clock.ownAfter + 5, -1);
assert(exitRibbonCenter(declined.local) == null, 'отказанная лента к концу зоны исчезла');
const stranded: RiderSeat = { kind: 'exit', lane: 6 };
const landed = stepSeat(declined, stranded, span, false);
assert(landed.kind === 'road', 'пропавшая лента возвращает байка на дорогу');
assert(landed.lane < stranded.lane, 'байк садится на край прямой, а не остаётся в стороне');

const widened = rescaleSeat({ kind: 'exit', lane: 1.2 }, 0.5, 0.8, 12);
assert(widened.kind === 'exit', 'смена масштаба не снимает байка со съезда');
assert(Math.abs(12 + 1.2 * 0.5 - (12 + widened.lane * 0.8)) < 1e-9, 'пока лента растёт, мир байка не ползёт');
assert(rescaleSeat({ kind: 'road', lane: 3 }, NaN, 1, 0).lane === 3, 'первый кадр не пересчитывает полосу');

const exitLanes = exitCarriage('city');
assert(exitLanes.count === 2 && exitLanes.oncomingCount === 0 && exitLanes.way === 'one-way', 'съезд — две попутные полосы');
assert(exitLanes.offsets[0] === -exitLanes.laneWidth * 0.5 && exitLanes.width === exitLanes.laneWidth * 2, 'ось съезда между его двумя полосами');
