/**
 * Стык проезжей части: открытая лента, захват, carry и хвост следующей зоны.
 * Мир байка, ось разметки и кромки в каждой фазе читаются из одного кадра.
 */
import { BIOMES, laneLayoutOf } from './biomes.ts';
import { carFollowsRibbon, carriageAt, carriagePhase, inheritedWiden, laneFit, laneMarks, ribbonCarLat, riderCarriage, sideRibbon } from './carriage.ts';
import { EXIT_LANE_HALF, exitCarryOrigin, exitClock, exitRibbonCenter, exitRibbonMid, laneAnchor, sampleRoad } from './fork.ts';
import { EXIT_LANE_WIDTH, laneDashOffsets } from './lanes.ts';
import { seatWorld, stepSeat, type RiderSeat } from './seat.ts';
import { RIGHT_FORK, courseLayoutOf, courseOwns, createVectorField, openCourse, ownedCourse } from './vectors.ts';

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

const cityDef = BIOMES.find((biome) => biome.id === 'city');
if (!cityDef) throw new Error('в каталоге нет города');
const city = laneLayoutOf(cityDef);
const clock = exitClock();
const half = city.width * 0.5;
const carried = exitCarryOrigin(half, 0);

assert(EXIT_LANE_HALF === EXIT_LANE_WIDTH, 'полуширина съезда и ширина его полосы — одно число');

function frameAt(
  distance: number,
  chosen: -1 | 0 | 1,
  carryIn: number | null = null,
  origin: number | null = null,
) {
  return sampleRoad({
    forkDistance: distance,
    half,
    chosen,
    baseOrigin: origin ?? 0,
    carriedOrigin: chosen === 1 ? carried : null,
    endWeight: 1,
    carryIn: carryIn == null ? 1 : carryIn,
  });
}

function covers(frame: ReturnType<typeof frameAt>, axis: number): boolean {
  const left = Math.min(frame.world.leftOuter, frame.world.rightInner);
  const right = Math.max(frame.world.leftInner, frame.world.rightOuter);
  return axis >= left - 0.05 && axis <= right + 0.05;
}

const open = frameAt(clock.choiceAt - 40, 0);
const ribbon = exitRibbonCenter(open.local);
assert(ribbon != null && ribbon > 10, 'на раздельном участке лента съезда справа от оси');
const openRoad = carriageAt({ frame: open, biome: city, widen: null });
assert(openRoad.phase === 'ribbon', 'открытая лента не подменяет полосы дороги');
assert(openRoad.lanes.count === city.count && openRoad.way === 'two-way', 'пока лента сбоку, дорога остаётся биомом');
assert(openRoad.scale === 1, 'полосы биома уже лежат на своей ширине, масштаб не нужен');
assert(Math.abs(openRoad.axis) < 1e-6, 'ось разметки прямой — центр кадра');
assert(covers(open, openRoad.axis), 'ось прямой внутри её кромок');

const openRider = riderCarriage(openRoad, open, 'exit');
assert(openRider.way === 'one-way' && openRider.lanes.count === 2, 'байк на ленте едет по двум попутным полосам');
assert(Math.abs(openRider.axis - (ribbon ?? 0)) < 1e-6, 'ось байка на ленте — её середина');
assert(openRoad.lanes.count === city.count, 'сиденье байка не меняет полосы дороги');

const grabbing: RiderSeat = { kind: 'road', lane: (ribbon ?? 0) / openRoad.scale };
const grabbedWorld = seatWorld(open, grabbing, openRider.scale);
const grabbed = stepSeat(open, grabbing, openRider.scale, false);
assert(grabbed.kind === 'exit', 'байк на асфальте ленты садится на съезд');
assert(Math.abs(seatWorld(open, grabbed, openRider.scale) - grabbedWorld) < 1e-6, 'захват не двигает мир байка');

const earlySeal = frameAt(clock.choiceAt + 1, 1);
const lateSeal = frameAt(clock.ownAfter - 0.5, 1);
const early = carriageAt({ frame: earlySeal, biome: city, widen: null });
const late = carriageAt({ frame: lateSeal, biome: city, widen: null });
assert(early.phase === 'seal' && late.phase === 'seal', 'закрытие прямой — фаза съезда, не биом');
assert(early.lanes.count === 2 && early.way === 'one-way', 'на закрытии прямой полосы уже две попутные');
assert(late.axis > early.axis + 5, 'ось полос доезжает до середины ленты');
assert(Math.abs(late.axis - carried) < 0.5, 'к концу закрытия ось уже на центре будущего carry');
assert(covers(lateSeal, late.axis), 'ось закрытия внутри живого асфальта');

const carry = frameAt(clock.ownAfter + 5, 1);
assert(exitRibbonCenter(carry.local) == null, 'в carry лента уже не отдельная');
const carriedRoad = carriageAt({ frame: carry, biome: city, widen: null });
assert(carriedRoad.phase === 'carry', 'блок carry — проезжая часть съезда');
assert(carriedRoad.lanes.count === 2 && carriedRoad.way === 'one-way', 'carry остаётся двумя попутными полосами');
assert(Math.abs(carriedRoad.axis - carry.origin) < 1e-6, 'ось carry — центр кадра');
assert(Math.abs(laneAnchor(carry) - carriedRoad.axis) < 1e-6, 'разметка и проезжая часть стоят на одной оси');
assert(Math.abs(carriedRoad.half - EXIT_LANE_HALF) < 1e-6, 'ширина carry читается из кромок, не из константы в биоме');
assert(covers(carry, carriedRoad.axis), 'ось carry внутри кромок');

const exiting: RiderSeat = { kind: 'exit', lane: 0.4 };
const mergeWorld = seatWorld(carry, exiting, carriedRoad.scale);
const merged = stepSeat(carry, exiting, carriedRoad.scale, carriedRoad.phase === 'carry');
assert(merged.kind === 'road', 'пропавшая лента carry вливает байка в дорогу');
assert(Math.abs(seatWorld(carry, merged, carriedRoad.scale) - mergeWorld) < 1e-6, 'вливание не двигает мир байка');
assert(
  Math.abs(carriedRoad.axis + merged.lane * carriedRoad.scale - mergeWorld) < 1e-6,
  'после вливания мир байка совпадает с осью разметки',
);

function widened(t: number) {
  const frame = frameAt(-10, 0, t, carried);
  return { frame, live: carriageAt({ frame, biome: city, widen: t < 1 ? t : null }) };
}

const at0 = widened(0);
const atHalf = widened(0.5);
const atOldCut = widened(0.85);
const atEnd = widened(1);
assert(at0.live.phase === 'widen' && atHalf.live.phase === 'widen', 'хвост прошлой зоны — одна фаза расширения');
assert(at0.live.way === 'one-way' && atHalf.live.way === 'one-way' && atOldCut.live.way === 'one-way', 'полосы не становятся двусторонними раньше полотна');
assert(at0.live.lanes.count === 2 && atHalf.live.lanes.count === 2 && atOldCut.live.lanes.count === 2, 'число полос съезда держится до конца шкалы');
assert(atHalf.live.half > at0.live.half + 1 && atHalf.live.half < half - 0.5, 'кромки растут той же шкалой');
assert(
  Math.abs((atHalf.live.lanes.offsets[1] ?? 0)) > Math.abs(at0.live.lanes.offsets[1] ?? 0) + 0.5,
  'две полосы съезда разъезжаются вместе с кромками',
);
assert(atEnd.live.phase === 'road' && atEnd.live.way === 'two-way' && atEnd.live.lanes.count === city.count, 'в конце шкалы дорога становится биомом');
assert(Math.abs(atEnd.live.half - half) < 1e-6, 'в конце шкалы кромки равны ширине биома');
assert(carriagePhase(atEnd.frame, null) === 'road', 'закончившийся хвост больше не фаза расширения');

const held = atOldCut.live.axis + 1.2 * atOldCut.live.scale;
const laneAfter = (held - atEnd.live.axis) / atEnd.live.scale;
const heldAfter = atEnd.live.axis + laneAfter * atEnd.live.scale;
assert(Math.abs(heldAfter - held) < 1e-6, 'смена полос в конце шкалы сохраняет мир байка');
assert(covers(atHalf.frame, atHalf.live.axis), 'ось хвоста внутри растущих кромок');

const plain = carriageAt({ frame: frameAt(-10, 0), biome: city, widen: null });
assert(plain.phase === 'road' && plain.scale === 1, 'обычная дорога не сжимает полосы');
assert(laneFit(5, [-10, 10]) === 0.5, 'масштаб — это кромка, делённая на крайнее смещение');

const field = createVectorField();
const course = courseLayoutOf(clock, 1500, 0);
const nose = course.zoneLength - course.lead;
const straight = () => ({ x: 0, dx: 0 });

function pose(frame: ReturnType<typeof frameAt>, lat: number, distance: number, withHold: boolean) {
  const s = nose + distance;
  const live = carriageAt({ frame, biome: city, widen: null });
  const pick = frame.chosen === 1 ? 1 : 0;
  return field.embed({
    s,
    lat,
    y: 0,
    nose,
    edges: frame.world,
    owned: ownedCourse(RIGHT_FORK, s, course, (zone) => (zone === 0 ? pick : 0)),
    branches: openCourse(RIGHT_FORK, s, course),
    origin: frame.origin,
    turn: course.turn,
    ownedHere: courseOwns(RIGHT_FORK, pick, s, nose, course.ownAfter),
    hold: withHold && live.phase === 'seal'
      ? { t: frame.phase.t, axis: live.axis, half: live.half }
      : null,
  }, straight);
}

function apart(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function markToRibbon(frame: ReturnType<typeof frameAt>, distance: number): number {
  const live = carriageAt({ frame, biome: city, widen: null });
  const mark = pose(frame, live.axis, distance, true);
  const ribbon = pose(frame, exitRibbonMid(frame.world), distance, true);
  return apart(mark, ribbon);
}

const midSeal = frameAt(clock.choiceAt + 35, 1);
const fromRibbonEarly = markToRibbon(earlySeal, clock.choiceAt + 1);
const fromRibbonMid = markToRibbon(midSeal, clock.choiceAt + 35);
const fromRibbonLate = markToRibbon(lateSeal, clock.ownAfter - 0.5);
assert(fromRibbonEarly > fromRibbonMid && fromRibbonMid > fromRibbonLate, 'штрих оси приближается к ленте тем же t, что и ось');
assert(fromRibbonLate < 1.5, 'к концу закрытия штрих уже на курсе ленты');

const ribbonLat = exitRibbonMid(earlySeal.world);
const bikeHeld = pose(earlySeal, ribbonLat, clock.choiceAt + 1, true);
const bikeFree = pose(earlySeal, ribbonLat, clock.choiceAt + 1, false);
assert(apart(bikeHeld, bikeFree) < 0.05, 'байк на ленте не сходит с её курса, пока ось ещё едет');

const carryDistance = clock.ownAfter + 1;
const carryS = nose + carryDistance;
const carryPose = pose(carry, carriedRoad.axis, carryDistance, true);
const carryPath = field.frame(
  ownedCourse(RIGHT_FORK, carryS, course, () => 1),
  carryS,
  straight,
  course.turn,
);
assert(apart(carryPose, carryPath) < 0.5, 'после захвата ось лежит на курсе съезда');

assert(inheritedWiden({
  meters: 40, zoneLength: 1500, nose: 1070, choiceAt: 260, previousTookExit: false, tookExit: false,
}) == null, 'в первой зоне хвоста нет');
assert(inheritedWiden({
  meters: 1550, zoneLength: 1500, nose: 2570, choiceAt: 260, previousTookExit: true, tookExit: false,
}) === 0.5, 'середина хвоста — половина шкалы');
assert(inheritedWiden({
  meters: 1600, zoneLength: 1500, nose: 2570, choiceAt: 260, previousTookExit: true, tookExit: false,
}) == null, 'после 100 м хвост закончился');
assert(inheritedWiden({
  meters: 1550, zoneLength: 1500, nose: 2570, choiceAt: 260, previousTookExit: false, tookExit: false,
}) == null, 'без взятого съезда прошлой зоны хвоста нет');
assert(inheritedWiden({
  meters: 410, zoneLength: 400, nose: 360, choiceAt: 20, previousTookExit: true, tookExit: true,
}) == null, 'свой съезд после выбора хвост не перекрывает');

const roadGaps = laneDashOffsets(openRoad.lanes.offsets, openRoad.lanes.oncomingCount);
const roadMarks = laneMarks(openRoad);
assert(roadMarks.length === roadGaps.length && roadMarks.every((mark) => mark.w === 1), 'штрихи шоссе — промежутки его полос');
roadMarks.forEach((mark, index) => {
  assert(Math.abs(mark.lat - (openRoad.axis + roadGaps[index] * openRoad.scale)) < 1e-9, 'штрих шоссе стоит на его оси');
});
const sealMarks = laneMarks(early);
assert(sealMarks.length === 1 && Math.abs(sealMarks[0].lat - early.axis) < 1e-6, 'штрих съезда лежит на оси его полос');
const side = sideRibbon(openRoad, open);
if (!side) throw new Error('отделённая лента — отдельная проезжая часть');
assert(Math.abs(side.axis - openRider.axis) < 1e-6, 'ось ленты совпадает с её проезжей частью');
const sideMarks = laneMarks(side);
assert(sideMarks.length === 1 && Math.abs(sideMarks[0].lat - side.axis) < 1e-6, 'штрих ленты стоит на её оси, не на оси шоссе');
assert(sideRibbon(early, earlySeal) == null, 'когда съезд уже дорога, второй набор штрихов не нужен');
assert(sideRibbon(carriageAt({ frame: frameAt(-10, 0), biome: city, widen: null }), frameAt(-10, 0)) == null, 'до развилки боковой ленты нет');

const join = { phase: 'ribbon' as const, choice: 'open' as const, open: true, following: false, changingLane: false, lane: 3, lastLane: 3, runLanes: 2 };
assert(carFollowsRibbon(join), 'крайняя попутная уходит на ленту, пока та отдельная дорога');
assert(carFollowsRibbon({ ...join, following: true }), 'машина на ленте остаётся, пока лента открыта');
assert(!carFollowsRibbon({ ...join, choice: 'straight', following: true }), 'прямая отпускает машину с ленты');
assert(!carFollowsRibbon({ ...join, following: true, open: false }), 'закрытая лента машину не держит');
assert(!carFollowsRibbon({ ...join, phase: 'seal', choice: 'exit', following: true }), 'когда съезд стал дорогой, машину второй раз к ленте не сдвигает');
assert(!carFollowsRibbon({ ...join, phase: 'carry', choice: 'exit', following: true, open: false }), 'на carry машина едет полосами дороги');
assert(!carFollowsRibbon({ ...join, changingLane: true }), 'перестраивающаяся машина на ленту не прыгает');
assert(!carFollowsRibbon({ ...join, lane: 2 }), 'не крайняя полоса остаётся на шоссе');
const exitLane = openRider.lanes.offsets[openRider.lanes.offsets.length - 1];
assert(Math.abs(ribbonCarLat(openRider) - (openRider.axis + exitLane * openRider.scale)) < 1e-6, 'машина съезда стоит на крайней полосе ленты');
