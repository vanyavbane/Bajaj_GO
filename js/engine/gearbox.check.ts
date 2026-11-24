/**
 * Коробка: нейтраль, переключения по оборотам, гистерезис и сброс оборотов.
 * Чистые проверки — без DOM, WebAudio и localStorage.
 */
declare const console: { log(message: string): void };

import {
  GEAR_COUNT,
  GEAR_DOWNSHIFT,
  GEAR_UPSHIFT,
  NEUTRAL_SPEED,
  RPM_IDLE,
  RPM_LOW,
  RPM_REDLINE,
  SHIFT_COOLDOWN,
  gearRpmFrac,
  initialGearboxState,
  stepGearbox,
  type GearboxState,
} from './gearbox.ts';

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

function near(a: number, b: number, message: string, eps = 1e-9): void {
  assert(Math.abs(a - b) < eps, `${message}: ${a} != ${b}`);
}

/** Несколько кадров снимают задержку переключения. */
function advance(state: GearboxState, speed: number, maxSpeed = 100): GearboxState {
  let next = state;
  for (let i = 0; i < 4; i++) next = stepGearbox(next, speed, maxSpeed, 0.1);
  return next;
}

assert(GEAR_COUNT === 6, 'шесть передач');
assert(GEAR_UPSHIFT.length === GEAR_COUNT && GEAR_DOWNSHIFT.length === GEAR_COUNT, 'пороги для каждой передачи');
for (let gear = 1; gear <= GEAR_COUNT; gear++) {
  assert(GEAR_DOWNSHIFT[gear - 1] < GEAR_UPSHIFT[gear - 1] || gear === 1, 'гистерезис передач');
}

const idle = initialGearboxState();
assert(idle.gear === 0 && idle.rpmFrac === RPM_IDLE, 'старт на нейтрали с холостыми');
near(gearRpmFrac(0, 0), RPM_IDLE, 'нейтраль не крутит тахометр');
near(gearRpmFrac(1, 0), RPM_LOW, 'первая передача начинается с низких оборотов');
near(gearRpmFrac(1, GEAR_UPSHIFT[0]), RPM_REDLINE, 'первая передача доходит до красной зоны');
near(gearRpmFrac(3, GEAR_UPSHIFT[2]), RPM_REDLINE, 'третья передача доходит до красной зоны');
near(gearRpmFrac(6, 1), RPM_REDLINE, 'шестая передача доходит до красной зоны');
assert(gearRpmFrac(2, 0.2) > gearRpmFrac(2, 0.17), 'обороты растут внутри передачи');
assert(gearRpmFrac(3, 0.3) < gearRpmFrac(2, 0.3), 'высшая передача на той же скорости крутит тише');

const stopped = advance(idle, NEUTRAL_SPEED - 0.1);
assert(stopped.gear === 0, 'ниже порога — нейтраль');
const creepingStep = stepGearbox(stopped, NEUTRAL_SPEED + 0.1, 100, 0.1);
assert(creepingStep.gear === 1, 'трогание включает первую');
assert(creepingStep.cooldown === SHIFT_COOLDOWN, 'переключение ставит задержку');
const creeping = advance(creepingStep, NEUTRAL_SPEED + 0.1);

const first = advance(creeping, 10);
assert(first.gear === 1 && first.rpmFrac > 0.7, 'скорость внутри первой поднимает обороты');
const secondStep = stepGearbox(first, 17, 100, 0.1);
assert(secondStep.gear === 2 && secondStep.cooldown === SHIFT_COOLDOWN, 'достижение границы включает вторую и даёт задержку');
assert(secondStep.rpmFrac < 0.4, 'после переключения обороты падают');
const locked = stepGearbox(secondStep, 32.5, 100, 0.1);
assert(locked.gear === 2 && locked.cooldown > 0, 'во время задержки передача не меняется');
const second = advance(locked, 17);
assert(second.gear === 2 && second.cooldown === 0, 'задержка прошла, передача та же');
const third = advance(second, 32.5);
assert(third.gear === 3 && third.rpmFrac < 0.4, 'третья включается и снова сбрасывает обороты');

const aboveDownshift = advance(third, 30);
assert(aboveDownshift.gear === 3, 'гистерезис держит передачу ниже порога повышения');
const downshifted = advance(aboveDownshift, 26);
assert(downshifted.gear === 2 && downshifted.rpmFrac > 0.7, 'понижение поднимает обороты');

let top = initialGearboxState();
for (const speed of [10, 17, 33, 50, 67, 85]) top = advance(top, speed);
assert(top.gear === 6, 'на высокой скорости включается шестая');
const overdrive = advance(top, 100);
assert(overdrive.gear === GEAR_COUNT && overdrive.rpmFrac === RPM_REDLINE, 'шестая не переключается выше и уходит в красную зону');

const braked = advance(overdrive, 0);
assert(braked.gear === 0 && braked.rpmFrac === RPM_IDLE, 'остановка возвращает нейтраль и холостые');
const broken = stepGearbox(braked, Number.NaN, 0, Number.NaN);
assert(Number.isFinite(broken.gear) && Number.isFinite(broken.rpmFrac) && Number.isFinite(broken.cooldown), 'битые входные данные не дают NaN');
assert(broken.gear === 0, 'битая скорость оставляет нейтраль');

console.log('gearbox.check: ok');
