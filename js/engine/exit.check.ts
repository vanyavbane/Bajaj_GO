/**
 * Карта съезда. Один кадр — одна жизнь.
 * Если полосы, сиденье или трафик видят съезд иначе, чинить readExit,
 * а не заводить второе чтение кромок.
 */
import { BIOMES, laneLayoutOf } from './biomes.ts';
import { carriageAt, carriageLat, laneAtWorld, rideRuler } from './carriage.ts';
import { EXIT_LANE_HALF, exitClock, logicalRoadLimits, sampleRoad, type ChosenSide } from './fork.ts';
import { emptyRideHold, followRide, readExit, retargetRide, rideCenter, sampleRide, surfaceWorld, type ExitLife } from './exit.ts';
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
assert(sealing.main.half === 10, 'невыбранная дорога держит свою ширину');
assert(sealing.main.center < 0, 'невыбранная дорога уходит влево');
assert((sealing.ribbon?.center ?? 0) > 12, 'выбранная лента остаётся на своей линии');

const declined = expect(clock.choiceAt + 40, -1, 'sealing', true);
assert(declined.main.half === 10, 'прямая не сужается');
assert((declined.ribbon?.center ?? 0) > (beside.ribbon?.center ?? 0), 'отказанная лента уходит вправо');

const settled = expect(clock.ownAfter + 5, 1, 'settle', true, 8);
assert(settled.main.half === 10, 'после въезда невыбранная лента сохраняет ширину');
assert(settled.main.center < 0, 'невыбранная лента продолжается левее');
assert((settled.ribbon?.center ?? 0) > 12, 'выбранная лента стоит на своей линии');

const straight = expect(clock.ownAfter + 5, -1, 'settle', true);
assert(straight.main.half === 10 && straight.main.center < 0, 'после отказа обе дороги продолжаются');

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
assert(sealingSpot.ribbon != null && sealingSpot.ribbon.joined === false, 'на расхождении между дорогами уже клин');
assert(Math.abs(steerMid) < 1e-6, 'руль на отделённой ленте считается от её середины');
assert(besideSpot.ribbon != null && rideCenter(besideSpot, true) === besideSpot.ribbon.center, 'камера тянется к середине ленты');
assert(rideCenter(besideSpot, false) === besideSpot.main.center, 'с шоссе камера тянется к оси дороги');

const settledSpot = readExit(frame(clock.ownAfter + 5, 1, 8));
const behind = sampleRide(sealingSpot, settledSpot, false, settledSpot.ribbon!.center, 0, 0, 1);
assert(Math.abs(behind - settledSpot.ribbon!.center) < 1e-6, 'точка позади остаётся на линии выбранной ленты');
assert(sampleRide(settledSpot, settledSpot, false, 3, 0, 0, 1) === 3, 'на своей ленте точка считается от её середины');

const followed = retargetRide(15, 14, true, 18);
assert(followed.along === 1 && followed.world === 19, 'байк едет вместе со своей лентой и держит место в ней');
const swapped = retargetRide(32, 32, false, 32);
assert(swapped.world === 32 && swapped.along === 0, 'смена дороги оставляет байка там, где середины совпали');

const hold = emptyRideHold();
const holdStart = readExit(frame(clock.choiceAt - 10, 0));
const centerStart = surfaceWorld(0, holdStart, true);
let heldWorld = followRide(hold, centerStart + 0.4, holdStart, 0, true);
assert(Math.abs(heldWorld - (centerStart + 0.4)) < 1e-6, 'первый кадр посадки держит байка на ленте');
const holdNext = readExit(frame(clock.choiceAt + 40, 1));
const centerNext = surfaceWorld(0, holdNext, true);
const nextWorld = followRide(hold, heldWorld, holdNext, 0, true);
assert(
  Math.abs((nextWorld - heldWorld) - (centerNext - centerStart)) < 1e-6,
  'память посадки везёт смещение вместе с лентой, как у трафика',
);
heldWorld = nextWorld;

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

for (const id of ['city', 'mkad', 'embankment']) {
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
  let ribbonHalf = Number.NaN;
  let inset = Number.NaN;
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
    const openRibbon = still && spot.ribbon != null && !spot.ribbon.joined ? spot.ribbon : null;
    const grown = openRibbon && Number.isFinite(ribbonHalf) ? openRibbon.half - ribbonHalf : 0;
    const merged = placed.world + grown;
    ribbonHalf = openRibbon ? openRibbon.half : Number.NaN;
    const incoming = rideRuler(at, kind === 'exit', live.scale);
    const laneIn = laneAtWorld(merged, incoming.axis, incoming.scale);
    const seat = stepSeat(at, { kind, lane: laneIn }, live.scale);
    const used = rideRuler(at, seat.kind === 'exit', live.scale);
    const seated = carriageLat(used.axis, used.scale, seat.lane);
    if (spot.ribbon != null && !spot.ribbon.joined) {
      const right = at.origin + spot.ribbon.center + spot.ribbon.half;
      if (!Number.isFinite(inset)) inset = right - seated;
      assert(Math.abs((right - seated) - inset) < 0.6, `${id} ${distance} м: въезд не вливает байка по правой кромке`);
      assert(seated > at.origin + spot.ribbon.center - spot.ribbon.half && seated < right, `${id} ${distance} м: байк сошёл с ленты въезда`);
      assert(Math.abs(seated) > spot.main.half + 1, `${id} ${distance} м: байк сидит в центре старой дороги`);
      assert(seat.kind === 'exit', `${id} ${distance} м: съезд перестал быть своей дорогой`);
    }
    if (spot.life === 'settle') {
      const ribbon = spot.ribbon;
      if (!ribbon) throw new Error(`${id} ${distance} м: на continue-ленте нет полосы`);
      assert(seat.kind === 'exit', `${id} ${distance} м: лента продолжается, байк остаётся на ней`);
      assert(seated > at.origin + ribbon.center - ribbon.half && seated < at.origin + ribbon.center + ribbon.half, `${id} ${distance} м: байк сошёл с выбранной ленты`);
    }
    kind = seat.kind;
    lane = seat.lane;
    ruler = used;
    surface = center;
    onRibbon = still;
  }
}

(globalThis as { console?: { log: (message: string) => void } }).console?.log('exit map ok');
