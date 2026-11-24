/**
 * Карта съезда. Один кадр — одна жизнь.
 * Если полосы, сиденье или трафик видят съезд иначе, чинить readExit,
 * а не заводить второе чтение кромок.
 */
import { BIOMES, laneLayoutOf } from './biomes.ts';
import { carriageAt, carriageLat, laneAtWorld, rideRuler, vehicleLat } from './carriage.ts';
import { EXIT_LANE_HALF, exitClock, logicalRoadLimits, sampleRoad, type ChosenSide } from './fork.ts';
import { readExit, retargetRide, rideCenter, sampleRide, surfaceWorld, type ExitLife } from './exit.ts';
import { stepSeat, type RiderSeat } from './seat.ts';

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

const clock = exitClock();

function frame(distance: number, chosen: ChosenSide, arriveHalf?: number) {
  return sampleRoad({
    forkDistance: distance,
    half: 10,
    chosen,
    baseOrigin: 0,
    endWeight: 1,
    arriveHalf,
  });
}

function expect(distance: number, chosen: ChosenSide, life: ExitLife, ribbon: boolean, arriveHalf?: number) {
  const spot = readExit(frame(distance, chosen, arriveHalf));
  assert(spot.life === life, `${distance} м, выбор ${chosen}: жизнь ${spot.life}, ждали ${life}`);
  assert(spot.chosen === chosen, `${distance} м хранит выбор ${chosen}`);
  assert((spot.ribbon != null) === ribbon, `${distance} м: лента ${spot.ribbon ? 'есть' : 'нет'}`);
  return spot;
}

const before = expect(-10, 0, 'plain', false);
assert(before.main.half === 10 && before.main.center === 0, 'до съезда дорога на своей оси и ширине');

const opening = expect(20, 0, 'opening', true);
assert(opening.ribbon?.joined === true, 'в начале отхода лента ещё склеена с шоссе');

const beside = expect(clock.choiceAt - 10, 0, 'beside', true);
assert(beside.ribbon?.joined === true, 'до выбора +1 полоса ещё одно полотно с шоссе');
assert(beside.main.half === 10, 'пока выбор открыт, старая дорога не сужается');

const sealing = expect(clock.choiceAt + 40, 1, 'sealing', true);
assert(sealing.main.half < 10 && sealing.main.half > 1, 'взятый въезд сужает старую дорогу, пока лента ещё есть');
assert((sealing.ribbon?.center ?? 0) > 12, 'лента въезда на закрытии остаётся на своей линии');

const declined = expect(clock.choiceAt + 40, -1, 'sealing', true);
assert(declined.main.half === 10, 'отказ не сужает прямую');
assert((declined.ribbon?.center ?? 0) > (beside.ribbon?.center ?? 0), 'отказанная лента уходит в сторону');

const arrived = expect(clock.ownAfter + 5, 1, 'arrived', false, 8);
assert(Math.abs(arrived.main.half - 8) < 0.05, 'после въезда ширина — ширина новой дороги');
assert(arrived.main.center > 12, 'сразу после закрытия новая дорога стоит на линии въезда');

const straight = expect(clock.ownAfter + 5, -1, 'plain', false);
assert(straight.main.half === 10 && straight.main.center === 0, 'после отказа остаётся прежняя дорога');

assert(EXIT_LANE_HALF === 4.5, 'съезд без своей ширины назначения — полоса 4.5 м');

const besideFrame = frame(clock.choiceAt - 10, 0);
const besideSpot = readExit(besideFrame);
const openSteer = logicalRoadLimits(besideFrame.local, 1, true);
assert(besideSpot.ribbon?.joined === true, 'до выбора лента склеена');
assert(openSteer.min < 0 && openSteer.max > besideSpot.main.half, 'пока полоса прижата, руль видит и шоссе, и +1 полосу');

const sealingFrame = frame(clock.choiceAt + 40, 1);
const sealingSpot = readExit(sealingFrame);
const steer = logicalRoadLimits(sealingFrame.local, 1, true);
const steerMid = (steer.min + steer.max) * 0.5;
assert(sealingSpot.ribbon != null && sealingSpot.ribbon.joined === false, 'на закрытии взятого въезда между дорогами уже клин');
assert(Math.abs(steerMid) < 1e-6, 'руль закрытия стоит на середине ленты, не на оси старой дороги');
assert(besideSpot.ribbon != null && rideCenter(besideSpot, true) === besideSpot.ribbon.center, 'камера тянется к середине ленты');
assert(rideCenter(besideSpot, false) === besideSpot.main.center, 'с шоссе камера тянется к оси дороги');

const arrivedSpot = readExit(frame(clock.ownAfter + 5, 1, 8));
const behind = sampleRide(sealingSpot, arrivedSpot, false, arrivedSpot.main.center, 0, 0, 1);
assert(Math.abs(behind - arrivedSpot.main.center) < 1e-6, 'точка позади на закрытии остаётся на линии новой дороги');
assert(sampleRide(arrivedSpot, arrivedSpot, false, 3, 0, 0, 1) === 3, 'на новой дороге точка считается от её середины');

const followed = retargetRide(15, 14, true, 18);
assert(followed.along === 1 && followed.world === 19, 'байк едет вместе со своей лентой и держит место в ней');
const swapped = retargetRide(32, 32, false, 32);
assert(swapped.world === 32 && swapped.along === 0, 'смена дороги оставляет байка там, где середины совпали');

let rideD = clock.choiceAt - 10;
let rideSpot = readExit(frame(rideD, 0));
let onRibbon = rideSpot.ribbon != null;
let surface = rideCenter(rideSpot, onRibbon);
let world = surface + 0.4;
for (rideD = clock.choiceAt - 9; rideD <= clock.lead; rideD += 1) {
  const next = readExit(frame(rideD, 1));
  const ride = onRibbon && next.ribbon != null;
  const center = rideCenter(next, ride);
  const placed = retargetRide(world, surface, ride === onRibbon, center);
  if (ride === onRibbon) {
    const slip = (placed.world - world) - (center - surface);
    assert(Math.abs(slip) < 1e-6, `${rideD} м: байк сошёл со своей дороги`);
  } else {
    assert(Math.abs(placed.world - center) < 4, `${rideD} м: новая дорога не под байком`);
  }
  world = placed.world;
  surface = center;
  onRibbon = ride;
}
assert(Math.abs(world) < 1, 'к концу въезда байк приехал вместе с дорогой на ось пути');

for (const id of ['city', 'mkad']) {
  const def = BIOMES.find((biome) => biome.id === id);
  if (!def) throw new Error(`в каталоге нет ${id}`);
  const layout = laneLayoutOf(def);
  const half = layout.width * 0.5;
  let distance = clock.choiceAt - 2;
  let at = sampleRoad({
    forkDistance: distance,
    half,
    chosen: 1,
    baseOrigin: 0,
    endWeight: 1,
    arriveHalf: half,
  });
  let live = carriageAt({ frame: at, biome: layout });
  let spot = readExit(at);
  const ribbon0 = spot.ribbon;
  if (ribbon0 == null) throw new Error(`${id}: на выборе нет ленты`);
  let kind: RiderSeat['kind'] = 'exit';
  let ruler = rideRuler(at, false, live.scale);
  let lane = laneAtWorld(at.origin + ribbon0.center, ruler.axis, ruler.scale);
  let surface = surfaceWorld(live.axis, spot, true);
  let onRibbon = true;
  for (distance = clock.choiceAt - 1; distance <= clock.ownAfter + 8; distance += 0.5) {
    at = sampleRoad({
      forkDistance: distance,
      half,
      chosen: 1,
      baseOrigin: 0,
      endWeight: 1,
      arriveHalf: half,
    });
    live = carriageAt({ frame: at, biome: layout });
    spot = readExit(at);
    const worldIn = carriageLat(ruler.axis, ruler.scale, lane);
    const still: boolean = onRibbon && spot.ribbon != null;
    const center = surfaceWorld(live.axis, spot, still);
    const placed = retargetRide(worldIn, surface, still === onRibbon, center);
    const incoming = rideRuler(at, kind === 'exit', live.scale);
    const laneIn = laneAtWorld(placed.world, incoming.axis, incoming.scale);
    const seat = stepSeat(at, { kind, lane: laneIn }, live.scale);
    const used = rideRuler(at, seat.kind === 'exit', live.scale);
    const seated = carriageLat(used.axis, used.scale, seat.lane);
    const car = vehicleLat(live, seat.kind === 'exit' && spot.ribbon != null && !spot.ribbon.joined ? seat.lane : lane, seat.kind === 'exit' && spot.ribbon != null && !spot.ribbon.joined);
    if (spot.ribbon != null && !spot.ribbon.joined) {
      const mid = at.origin + spot.ribbon.center;
      assert(Math.abs(seated - mid) < 0.5, `${id} ${distance} м: байк сошёл с ленты на сходящую дорогу`);
      assert(Math.abs(seated) > spot.main.half + 1, `${id} ${distance} м: байк сидит в центре старой дороги`);
      assert(Math.abs(car - mid) < 0.5, `${id} ${distance} м: машина съезда едет по линейке старой дороги`);
      assert(seat.kind === 'exit', `${id} ${distance} м: съезд перестал быть своей дорогой`);
    }
    if (spot.life === 'arrived') {
      assert(seat.kind === 'road', `${id} ${distance} м: приезд не сажает байка на новую дорогу`);
      assert(seated > at.local.leftOuter && seated < at.local.leftInner, `${id} ${distance} м: новая дорога не под байком`);
    }
    kind = seat.kind;
    lane = seat.lane;
    ruler = used;
    surface = center;
    onRibbon = still;
  }
}

(globalThis as { console?: { log: (message: string) => void } }).console?.log('exit map ok');
