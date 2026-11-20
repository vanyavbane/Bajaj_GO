/**
 * Стык проезжей части: открытая лента, сужение старой дороги и новая дорога после въезда.
 * Мир байка, ось разметки и кромки в каждой фазе читаются из одного кадра.
 */
import { BIOMES, laneLayoutOf } from './biomes.ts';
import { carFollowsRibbon, carriageAt, carriagePhase, laneFit, laneMarks, ribbonApproachLat, riderCarriage, sideRibbon, solidMarks } from './carriage.ts';
import { EXIT_LANE_HALF, exitClock, exitRibbonCenter, sampleRoad } from './fork.ts';
import { EXIT_LANE_WIDTH, laneGapOffsets, lanesOf } from './lanes.ts';
import { seatWorld, stepSeat, type RiderSeat } from './seat.ts';
import { RIGHT_FORK, courseLayoutOf, createVectorField, openCourse } from './vectors.ts';

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

const cityDef = BIOMES.find((biome) => biome.id === 'city');
if (!cityDef) throw new Error('в каталоге нет города');
const city = laneLayoutOf(cityDef);
const clock = exitClock();
const half = city.width * 0.5;

assert(EXIT_LANE_HALF === EXIT_LANE_WIDTH, 'полуширина съезда и ширина его полосы — одно число');

function frameAt(
  distance: number,
  chosen: -1 | 0 | 1,
  origin: number | null = null,
) {
  return sampleRoad({
    forkDistance: distance,
    half,
    chosen,
    baseOrigin: origin ?? 0,
    endWeight: 1,
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
const openRoad = carriageAt({ frame: open, biome: city });
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
const grabbed = stepSeat(open, grabbing, openRider.scale);
assert(grabbed.kind === 'exit', 'байк на асфальте ленты садится на съезд');
assert(Math.abs(seatWorld(open, grabbed, openRider.scale) - grabbedWorld) < 1e-6, 'захват не двигает мир байка');

const earlySeal = frameAt(clock.choiceAt + 1, 1);
const midReturn = frameAt(clock.choiceAt + 35, 1);
const lateSeal = frameAt(clock.ownAfter + 0.5, 1);
const early = carriageAt({ frame: earlySeal, biome: city });
const mid = carriageAt({ frame: midReturn, biome: city });
const late = carriageAt({ frame: lateSeal, biome: city });
assert(early.phase === 'ribbon' && mid.phase === 'ribbon', 'пока старая дорога ещё есть, въезд сбоку и не подменяет её полосы');
assert(early.lanes.count === city.count && early.way === 'two-way', 'полосы старой дороги остаются её биомом');
assert(Math.abs(early.axis) < 0.2 && Math.abs(mid.axis) < 0.2, 'старая дорога сужается на своей оси');
const earlyRibbon = exitRibbonCenter(earlySeal.local);
const midRibbon = exitRibbonCenter(midReturn.local);
assert(earlyRibbon != null && midRibbon != null && Math.abs(midRibbon - earlyRibbon) < 0.5, 'въезд остаётся на своей линии');
assert(midReturn.local.leftInner - midReturn.local.leftOuter < half * 2 - 1, 'старая дорога на въезде уже уже');
const grown = riderCarriage(early, earlySeal, 'exit', city);
assert(grown.lanes.count === city.count && grown.way === 'two-way', 'взятый въезд носит полосы новой дороги');
assert(grown.scale < 1, 'полосы новой дороги растут вместе с шириной ленты');
assert(exitRibbonCenter(lateSeal.local) == null && late.phase === 'road', 'к концу закрытия въезд уже новая дорога');
assert(late.lanes.count === city.count && late.way === 'two-way', 'полосы кадра читает переданный биом');
assert(Math.abs(late.half - EXIT_LANE_HALF) < 1e-6 && late.axis > half, 'новая дорога стоит на линии въезда и на его ширине');
assert(covers(earlySeal, early.axis), 'ось дороги внутри её кромок');

const exiting: RiderSeat = { kind: 'exit', lane: 0.4 };
const merged = stepSeat(lateSeal, exiting, late.scale);
assert(merged.kind === 'road', 'въезд сажает байка на новую дорогу');
const landed = seatWorld(lateSeal, merged, late.scale);
assert(landed > lateSeal.local.leftOuter && landed < lateSeal.local.leftInner, 'байк остаётся на новой дороге');

const nextZone = carriageAt({ frame: frameAt(-10, 0), biome: city });
assert(nextZone.phase === 'road' && nextZone.way === 'two-way' && nextZone.lanes.count === city.count, 'следующая зона — своя дорога');
assert(Math.abs(nextZone.half - half) < 1e-6 && Math.abs(nextZone.axis) < 1e-6, 'следующая зона стоит на центре и ширине биома');
assert(carriagePhase(frameAt(-10, 0)) === 'road', 'до развилки съезда нет');

const plain = carriageAt({ frame: frameAt(-10, 0), biome: city });
assert(plain.phase === 'road' && plain.scale === 1, 'обычная дорога не сжимает полосы');
assert(laneFit(5, [-10, 10]) === 0.5, 'масштаб — это кромка, делённая на крайнее смещение');

const field = createVectorField();
const course = courseLayoutOf(clock, 1500, 0);
const nose = course.zoneLength - course.lead;
const straight = () => ({ x: 0, dx: 0 });

function pose(frame: ReturnType<typeof frameAt>, lat: number, distance: number) {
  const s = nose + distance;
  return field.embed({
    s,
    lat,
    y: 0,
    nose,
    edges: frame.world,
    owned: [],
    branches: openCourse(RIGHT_FORK, s, course),
    origin: frame.origin,
    turn: course.turn,
    ownedHere: false,
  }, straight);
}

function apart(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

const roadPose = pose(earlySeal, early.axis, clock.choiceAt + 1);
const parent = field.frame([], nose + clock.choiceAt + 1, straight, course.turn);
assert(apart(roadPose, parent) < 0.5, 'ось дороги остаётся на её курсе');
const ribbonPose = pose(earlySeal, earlySeal.origin + (earlyRibbon ?? 0), clock.choiceAt + 1);
assert(ribbonPose.x > roadPose.x + 2, 'лента съезда справа от курса дороги');

const roadGaps = laneGapOffsets(lanesOf(openRoad.lanes));
const roadMarks = laneMarks(openRoad);
assert(roadMarks.length === roadGaps.length && roadMarks.every((mark) => mark.w === 1), 'штрихи шоссе — промежутки его полос');
roadMarks.forEach((mark, index) => {
  assert(Math.abs(mark.lat - (openRoad.axis + roadGaps[index] * openRoad.scale)) < 1e-9, 'штрих шоссе стоит на его оси');
});
const returnMarks = laneMarks(early);
assert(returnMarks.length === roadMarks.length, 'пока старая дорога есть, её штрихи остаются её штрихами');
returnMarks.forEach((mark) => {
  assert(mark.lat > earlySeal.world.leftOuter - 0.05 && mark.lat < earlySeal.world.leftInner + 0.05, 'штрих дороги стоит на её ширине');
});
const side = sideRibbon(openRoad, open);
if (!side) throw new Error('отделённая лента — отдельная проезжая часть');
assert(Math.abs(side.axis - openRider.axis) < 1e-6, 'ось ленты совпадает с её проезжей частью');
const sideMarks = laneMarks(side);
assert(sideMarks.length === 1 && Math.abs(sideMarks[0].lat - side.axis) < 1e-6, 'штрих ленты стоит на её оси, не на оси шоссе');
const returningSide = sideRibbon(early, earlySeal);
if (!returningSide) throw new Error('пока въезд не пришёл, он ещё отдельная проезжая часть');
assert(solidMarks(returningSide).length === 0, 'у боковой ленты двойной сплошной нет');
const roadSolids = solidMarks(openRoad);
assert(roadSolids.length === 2, 'у двусторонней две жёлтые линии');
assert(Math.abs((roadSolids[0].lat + roadSolids[1].lat) * 0.5 - openRoad.axis) < 1e-6, 'жёлтая ось стоит на границе хода шоссе');
assert(solidMarks(early).length === 2, 'у сужающейся дороги своя жёлтая ось');
assert(solidMarks(side).length === 0, 'у боковой ленты двойной сплошной нет');
assert(sideRibbon(late, lateSeal) == null, 'после въезда боковой ленты нет');
assert(ribbonApproachLat(false, true, 2, 32, 1) == null, 'пока байк не пришёл, точка позади остаётся на своей дороге');
assert(ribbonApproachLat(true, false, 2, 32, 1) == null, 'на уже пришедшей дороге полоса считается от её центра');
assert(ribbonApproachLat(true, true, 2, 32, 0.5) === 33, 'камера позади пришедшего байка остаётся на ленте въезда');
assert(sideRibbon(carriageAt({ frame: frameAt(-10, 0), biome: city }), frameAt(-10, 0)) == null, 'до развилки боковой ленты нет');

const join = { hasExit: true, mainPhase: 'ribbon' as const, following: false, changingLane: false, lane: 3, lastLane: 3, runLanes: 2 };
assert(carFollowsRibbon(join), 'крайняя попутная переходит на съезд');
assert(carFollowsRibbon({ ...join, following: true }), 'машина остаётся на съезде, пока эта дорога есть');
assert(!carFollowsRibbon({ ...join, hasExit: false, following: true }), 'без дороги съезда машина едет по основной');
assert(!carFollowsRibbon({ ...join, mainPhase: 'road', following: false }), 'когда ленты уже нет, на съезд не пересаживаются');
assert(!carFollowsRibbon({ ...join, changingLane: true }), 'перестраивающаяся машина на съезд не прыгает');
assert(!carFollowsRibbon({ ...join, lane: 2 }), 'не крайняя полоса остаётся на своей дороге');
