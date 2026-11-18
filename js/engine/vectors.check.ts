import { BRANCH_YAW } from './branch.ts';
import { branchEdges, exitCarryOrigin, exitClock, exitRibbonMid } from './fork.ts';
import { EXIT_LEFT, EXIT_RIGHT, RIGHT_FORK, STRAIGHT, branchVectors, carriageWay, courseLayoutOf, courseOwns, courseVector, createVectorField, openCourse, ownedCourse, zoneNose } from './vectors.ts';
import type { CoursePick, ForkCourse, VectorSpawn } from './vectors.ts';

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

const straight = (_s: number) => ({ x: 0, dx: 0 });
const field = createVectorField();
const right: VectorSpawn = { key: '0:exit', nose: 0, yaw: EXIT_RIGHT.yaw, ownsFrom: 0 };
const at = field.frame([right], 220, straight, 110);
assert(at.x > 18, 'правый вектор уходит вправо');
assert(Math.abs(at.fx - Math.sin(BRANCH_YAW)) < 0.08, 'правый вектор держит свой курс');

const left: VectorSpawn = { key: 'left', nose: 0, yaw: -EXIT_RIGHT.yaw, ownsFrom: 0 };
const leftField = createVectorField();
const leftAt = leftField.frame([left], 220, straight, 110);
assert(leftAt.x < -18, 'левый вектор уходит влево');

const second: VectorSpawn = { key: '1:exit', nose: 250, yaw: EXIT_RIGHT.yaw, ownsFrom: 250 };
const later = field.frame([right, second], 500, straight, 110);
assert(later.fx > at.fx + 0.15, 'второй вектор поворачивает дальше первого');
assert(later.x > at.x, 'цепочка векторов не возвращается на старый сплайн');
assert(STRAIGHT.yaw === 0 && EXIT_RIGHT.id === 'exit', 'каталог различает прямую и съезд');
assert(courseVector(RIGHT_FORK, 0).id === 'straight' && courseVector(RIGHT_FORK, 1).yaw === BRANCH_YAW, 'выбор 0 — прямая, выбор 1 — правый съезд');
const three: ForkCourse = { id: 'three', vectors: [STRAIGHT, EXIT_RIGHT, EXIT_LEFT] };
assert(courseVector(three, 2).id === 'exit-left' && branchVectors(three).length === 2, 'третий слот курса — отдельный левый вектор');
const clock = exitClock();
const layout = courseLayoutOf(clock, 1500, 0);
const nose = zoneNose(0, layout);
assert(nose === layout.zoneLength - layout.lead, 'нос зоны считается от конца зоны, не от биома');
const owned = ownedCourse(RIGHT_FORK, nose + clock.ownAfter, layout, (zone) => (zone === 0 ? 1 : 0));
assert(owned.length === 1 && owned[0]?.key === '0:exit', 'взятый съезд попадает в путь только когда стал дорогой');
assert(ownedCourse(RIGHT_FORK, nose + 10, layout, () => 1).length === 0, 'до конца поворота вектор ещё не владеет дорогой');
assert(openCourse(RIGHT_FORK, nose + 20, layout).length === 1, 'после носа открыто ответвление курса');
assert(openCourse(RIGHT_FORK, nose - 5, layout).length === 0, 'до носа ответвлений нет');
assert(courseOwns(RIGHT_FORK, 1, nose + clock.ownAfter, nose, clock.ownAfter) && !courseOwns(RIGHT_FORK, 0, nose + clock.ownAfter, nose, clock.ownAfter), 'прямой выбор дорогу не перехватывает');
assert(EXIT_RIGHT.way === 'one-way' && STRAIGHT.way === 'inherit', 'съезд односторонний, прямая наследует дорогу биома');
const ramp: { course: ForkCourse; pick: CoursePick; s: number; nose: number; ownAfter: number; zoneEnd: number; onRamp: boolean } = {
  course: RIGHT_FORK, pick: 0, s: nose + clock.turn, nose, ownAfter: clock.ownAfter, zoneEnd: nose + clock.lead, onRamp: true,
};
assert(carriageWay(ramp) === 'one-way', 'лента съезда односторонняя ещё до выбора');
assert(carriageWay({ ...ramp, onRamp: false, pick: 1, s: nose + clock.ownAfter + 1 }) === 'one-way', 'после поворота съезд ещё односторонний');
assert(carriageWay({ ...ramp, onRamp: false, pick: 1, s: nose + clock.lead }) === 'two-way', 'на границе зоны съезд вливается в двустороннюю дорогу');
assert(carriageWay({ ...ramp, onRamp: false, pick: 0 }) === 'two-way', 'прямой ход остаётся двусторонним');

const carried = exitCarryOrigin(10, 0);
const localRibbon = branchEdges(10, 22);
const worldRibbon = {
  leftOuter: localRibbon.leftOuter + carried,
  leftInner: localRibbon.leftInner + carried,
  rightInner: localRibbon.rightInner + carried,
  rightOuter: localRibbon.rightOuter + carried,
};
const ribbon = exitRibbonMid(worldRibbon);
const again = createVectorField();
const firstExit: VectorSpawn = { key: 'first', nose: 0, yaw: EXIT_RIGHT.yaw, ownsFrom: 0 };
const nextExit: VectorSpawn = { key: 'next', nose: 500, yaw: EXIT_RIGHT.yaw, ownsFrom: 900 };
const peeled = again.embed({
  s: 510,
  lat: ribbon,
  y: 0,
  nose: 500,
  edges: worldRibbon,
  owned: [firstExit],
  branches: [nextExit],
  origin: carried,
  turn: 110,
  ownedHere: false,
}, straight);
const parent = again.frame([firstExit], 510, straight, 110);
const expected = parent.x + parent.rx * (ribbon - carried);
assert(Math.abs(peeled.x - expected) < 8, 'второй съезд отмеряется от центра дороги, не от нуля маршрута');

(globalThis as { console?: { log: (message: string) => void } }).console?.log('vectors ok');
