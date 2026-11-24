/**
 * Карта съезда. Один кадр — одна жизнь.
 * Если полосы, сиденье или трафик видят съезд иначе, чинить readExit,
 * а не заводить второе чтение кромок.
 */
import { EXIT_LANE_HALF, exitClock, logicalRoadLimits, sampleRoad, type ChosenSide } from './fork.ts';
import { arrivalTrail, carryLane, readExit, riddenCenter, type ExitLife } from './exit.ts';

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
assert(
  Math.abs(steerMid - ((sealingSpot.ribbon?.center ?? 0) - sealingSpot.main.center)) < 1e-6,
  'руль закрытия стоит на ленте, а не на оси шоссе',
);
assert(Math.abs(riddenCenter(besideSpot, true, 1) - ((besideSpot.ribbon?.center ?? 0) - besideSpot.main.center)) < 1e-6, 'камера тянется к середине той же ленты');
assert(riddenCenter(besideSpot, false, 1) === 0, 'с шоссе камера тянется к оси дороги');

const carried = carryLane(32, 32, 1, 32);
assert(Math.abs(carried) < 1e-9, 'въезд переписывает полосу из мира, старое смещение ленты не едет дальше');
assert(carryLane(Number.NaN, 0, 1, 4) === 4, 'без прошлого мира полоса остаётся');

const trail = arrivalTrail('arrived', true, 32, 0, carried, 1);
assert(trail === 32, 'точка позади на закрытии остаётся на линии новой дороги');
assert(arrivalTrail('sealing', true, 32, 0, 0, 1) == null, 'пока въезд ещё лента, точка позади считается своей осью');
assert(arrivalTrail('arrived', false, 32, 0, 0, 1) == null, 'после закрытия точка позади уже на новой дороге');

(globalThis as { console?: { log: (message: string) => void } }).console?.log('exit map ok');
