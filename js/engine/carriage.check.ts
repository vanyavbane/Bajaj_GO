/**
 * Стык проезжей части: открытая лента, сужение старой дороги и новая дорога после въезда.
 * Мир байка, ось разметки и кромки в каждой фазе читаются из одного кадра.
 */
import { BIOMES, laneLayoutOf } from './biomes.ts';
import { accidentArrival, approachExit, arrivalMove, birthLane, canStartExitJoin, carFollowsRibbon, carriageAt, carriageHolds, carriagePhase, drivenIsExit, forwardArrival, laneFit, laneMarks, repairQueue, ribbonApproachLat, ribbonDirection, ribbonTrailLat, riderCarriage, sameCarriage, sideRibbon, solidMarks } from './carriage.ts';
import { EXIT_LANE_HALF, exitClock, exitRibbonCenter, sampleRoad } from './fork.ts';
import { EXIT_LANE_WIDTH, laneGapOffsets } from './lanes.ts';
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

assert(EXIT_LANE_HALF * 2 === EXIT_LANE_WIDTH, 'съезд шириной в одну полосу');

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
assert(openRoad.lanes.count === city.count + 1 && openRoad.way === 'two-way', 'съезд — ещё одна полоса справа, дорога остаётся двусторонней');
const openExit = openRoad.lanes.lanes.find((lane) => lane.exit);
if (!openExit || openExit.direction !== 'with') throw new Error('полоса съезда едет вперёд');
assert(Math.abs(openRoad.axis + openExit.offset * openRoad.scale - (ribbon ?? 0)) < 1e-6, 'полоса съезда стоит на середине ленты');
assert(openRoad.lanes.lanes.filter((lane) => !lane.exit).length === city.count, 'полосы биома остаются на месте');
assert(openRoad.scale === 1, 'полосы биома уже лежат на своей ширине, масштаб не нужен');
assert(Math.abs(openRoad.axis) < 1e-6, 'ось разметки прямой — центр кадра');
assert(covers(open, openRoad.axis), 'ось прямой внутри её кромок');

const openRider = riderCarriage(openRoad, open, 'exit');
assert(openRider.lanes.count === openRoad.lanes.count && openRider.axis === openRoad.axis, 'сиденье байка не заводит вторую дорогу');

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
assert(early.phase === 'ribbon' && mid.phase === 'ribbon', 'пока старая дорога ещё есть, въезд — её правая полоса');
assert(early.lanes.count === city.count + 1 && early.way === 'two-way', 'полосы старой дороги остаются, справа добавлен съезд');
assert(Math.abs(early.axis) < 0.2 && Math.abs(mid.axis) < 0.2, 'старая дорога сужается на своей оси');
const earlyRibbon = exitRibbonCenter(earlySeal.local);
const midRibbon = exitRibbonCenter(midReturn.local);
assert(earlyRibbon != null && midRibbon != null && Math.abs(midRibbon - earlyRibbon) < 0.5, 'въезд остаётся на своей линии');
assert(midReturn.local.leftInner - midReturn.local.leftOuter < half * 2 - 1, 'старая дорога на въезде уже уже');
const grown = riderCarriage(early, earlySeal, 'exit');
assert(grown.lanes.lanes.some((lane) => lane.exit) && grown.way === 'two-way', 'взятый въезд остаётся правой полосой этой дороги');
assert(grown.scale === 1, 'полосы старой дороги не сжимаются из-за съезда');
assert(exitRibbonCenter(lateSeal.local) == null && late.phase === 'road', 'к концу закрытия полоса съезда кончилась');
assert(late.lanes.count === city.count && !late.lanes.lanes.some((lane) => lane.exit) && late.way === 'two-way', 'на месте съезда новая дорога без отдельной полосы');
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

const roadGaps = laneGapOffsets(openRoad.lanes);
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
assert(sideRibbon(openRoad, open) == null, 'съезд — полоса дороги, не вторая проезжая часть');
assert(sideRibbon(early, earlySeal) == null, 'на въезде второй дороги тоже нет');
const roadSolids = solidMarks(openRoad);
assert(roadSolids.length === 2, 'у двусторонней две жёлтые линии');
assert(Math.abs((roadSolids[0].lat + roadSolids[1].lat) * 0.5 - openRoad.axis) < 1e-6, 'жёлтая ось стоит на границе хода шоссе');
assert(solidMarks(early).length === 2, 'у сужающейся дороги своя жёлтая ось');
assert(ribbonDirection(true, 'against') === 'with', 'на ленте въезда встречная полоса едет вперёд');
assert(ribbonDirection(false, 'against') === 'against', 'на дороге встречный ход остаётся встречным');
const cityRoad = early.lanes;
assert(forwardArrival(cityRoad, -7) > 0, 'машина с ленты садится на попутную полосу новой дороги');
assert(accidentArrival(true, false, cityRoad, -7) > 0, 'авария с ленты сажает на попутную новой дороги');
assert(accidentArrival(true, true, cityRoad, -7) < 0, 'пока лента жива авария оставляет полосу ленты');
assert(accidentArrival(false, false, cityRoad, -7) < 0, 'встречная на своей дороге после аварии остаётся встречной');
const hop = arrivalMove(cityRoad, -7);
assert(hop.changing && hop.target > 0 && hop.offset === -7, 'с левой полосы ленты машина доезжает до попутной');
const seated = arrivalMove(cityRoad, hop.target);
assert(!seated.changing && seated.offset === hop.target, 'уже на попутной машина остаётся');
assert(!carriageHolds(32, 0, 9.5), 'съезд, от которого отказались, шоссе уже не держит');
assert(carriageHolds(25, 32, 9.5), 'левая полоса новой дороги ещё на ней');
assert(cityRoad.lanes[birthLane(cityRoad, true, 0)]?.direction === 'with', 'на ленте машина рождается на попутной');
assert(birthLane(cityRoad, false, 0) === cityRoad.lanes[0]?.index, 'на дороге первый бросок остаётся своей полосой');
assert(repairQueue(true, true) && repairQueue(false, false), 'очередь ремонта стоит на дороге ямы');
assert(!repairQueue(true, false) && !repairQueue(false, true), 'чужая дорога в очередь ремонта не встаёт');
assert(sameCarriage(32, 32.2) && !sameCarriage(0, 32), 'шоссе и съезд — разные оси');
assert(drivenIsExit(32, 32.2) && !drivenIsExit(32, 0) && !drivenIsExit(null, 0), 'байк на съезде только когда оси совпали');
assert(sideRibbon(late, lateSeal) == null, 'после въезда боковой ленты нет');
assert(ribbonApproachLat(false, true, 2, 32, 1) == null, 'пока байк не пришёл, точка позади остаётся на своей дороге');
assert(ribbonApproachLat(true, false, 2, 32, 1) == null, 'на уже пришедшей дороге полоса считается от её центра');
assert(ribbonApproachLat(true, true, 2, 32, 0.5) === 33, 'камера позади пришедшего байка остаётся на ленте въезда');
assert(ribbonTrailLat(true, false, 0, 0, 32, 2, 1) === 34, 'камера позади байка на ленте не садится на ось прямой');
assert(ribbonTrailLat(true, false, 32, 0, 32, 2, 1) == null, 'новая дорога после въезда держит свою ось');
assert(ribbonTrailLat(true, false, 20, 0, 32, 2, 1) == null, 'скользящая ось новой дороги не заменяется осью ленты');
assert(ribbonTrailLat(false, false, 0, 0, 32, 2, 1) == null, 'пока байк не на ленте, камера остаётся на прямой');
assert(sideRibbon(carriageAt({ frame: frameAt(-10, 0), biome: city }), frameAt(-10, 0)) == null, 'до развилки боковой ленты нет');

assert(!carFollowsRibbon({ hasExit: true, following: false }), 'с шоссе на съезд одним кадром не садятся');
assert(carFollowsRibbon({ hasExit: true, following: true }), 'машина остаётся на съезде, пока эта дорога есть');
assert(!carFollowsRibbon({ hasExit: false, following: true }), 'без дороги съезда машина едет по основной');
const peel = { changingLane: false, lane: 3, lastLane: 3, roadRight: 10, ribbonLeft: 12 };
assert(canStartExitJoin(peel), 'пока ленты вместе, крайняя попутная начинает переезд');
assert(!canStartExitJoin({ ...peel, ribbonLeft: 28 }), 'через раскрытый клин машина не стартует');
assert(!canStartExitJoin({ ...peel, lane: 2 }), 'не крайняя полоса остаётся на шоссе');
assert(!canStartExitJoin({ ...peel, changingLane: true }), 'перестраивающаяся машина на съезд не сходит');
const far = approachExit(8, 20, 29, 0.016);
assert(!far.arrived && far.lat - 8 < 0.2, 'за кадр машина не перепрыгивает клин');
const near = approachExit(19.5, 20, 29, 0.2);
assert(near.arrived && near.lat >= 20, 'у кромки машина садится на асфальт съезда');
