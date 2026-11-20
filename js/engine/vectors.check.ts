import { BRANCH_YAW, signedAngle, turnToward } from './branch.ts';
import { branchEdges, exitClock, exitRibbonMid, followsExit, onExitRibbon } from './fork.ts';
import { EXIT_RIGHT, RIGHT_FORK, STRAIGHT, branchVectors, courseLayoutOf, courseVector, createVectorField, openCourse, zoneNose } from './vectors.ts';
import type { ForkCourse, VectorSpawn } from './vectors.ts';

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
const three: ForkCourse = {
  id: 'three',
  vectors: [STRAIGHT, EXIT_RIGHT, { id: 'exit-left', yaw: -BRANCH_YAW, way: 'one-way' }],
};
assert(courseVector(three, 2).id === 'exit-left' && branchVectors(three).length === 2, 'третий слот курса — отдельный левый вектор');
const clock = exitClock();
const layout = courseLayoutOf(clock, 1500, 0);
const nose = zoneNose(0, layout);
assert(nose === layout.zoneLength - layout.lead, 'нос зоны считается от конца зоны, не от биома');
assert(openCourse(RIGHT_FORK, nose + 20, layout).length === 1, 'после носа открыто ответвление курса');
assert(openCourse(RIGHT_FORK, nose - 5, layout).length === 0, 'до носа ответвлений нет');
assert(openCourse(RIGHT_FORK, nose + clock.ownAfter, layout).length === 1, 'пришедший съезд остаётся ответвлением, а не дорогой');
assert(EXIT_RIGHT.way === 'one-way' && STRAIGHT.way === 'inherit', 'съезд односторонний, прямая наследует дорогу биома');

const carried = exitRibbonMid(branchEdges(10, 22));
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

const primed = createVectorField();
const staleFirst: VectorSpawn = { key: '0:exit', nose: 0, yaw: EXIT_RIGHT.yaw, ownsFrom: 0 };
const staleNext: VectorSpawn = { key: '1:exit', nose: 400, yaw: EXIT_RIGHT.yaw, ownsFrom: 900 };
const secondEdges = branchEdges(10, 22);
const secondLat = exitRibbonMid(secondEdges);
const primeQuery = {
  s: 520,
  lat: secondLat,
  y: 0,
  nose: 400,
  edges: secondEdges,
  branches: [staleNext],
  origin: 0,
  turn: 110,
  ownedHere: false,
};
primed.embed({ ...primeQuery, owned: [] }, straight);
const roadNow = primed.frame([staleFirst], 520, straight, 110);
const secondRide = primed.embed({ ...primeQuery, owned: [staleFirst] }, straight);
const secondTurn = signedAngle(roadNow.fx, roadNow.fz, secondRide.fx, secondRide.fz);
assert(Math.abs(secondTurn) <= Math.PI / 2, 'второй съезд не разворачивает больше чем на прямой угол');
assert(secondRide.x > roadNow.x - 2, 'второй съезд не возвращается на исходную дорогу');
const back = turnToward(0, -1, 0, 1, 1);
assert(back.fz <= 0.001, 'курс не переворачивается, даже если ветка смотрит назад');

const goreField = createVectorField();
const goreExit: VectorSpawn = { key: 'gore', nose: 0, yaw: EXIT_RIGHT.yaw, ownsFrom: 10000 };
const goreEdges = branchEdges(10, 22);
const goreAt = (lat: number, edges: typeof goreEdges = goreEdges) => goreField.embed({
  s: 220,
  lat,
  y: 0,
  nose: 0,
  edges,
  owned: [],
  branches: [goreExit],
  origin: 0,
  turn: 110,
  ownedHere: false,
}, straight);
const mainEdge = goreAt(goreEdges.leftInner);
const exitEdge = goreAt(goreEdges.rightInner);
const gapMid = (goreEdges.leftInner + goreEdges.rightInner) * 0.5;
const inGore = goreAt(gapMid);
const chord = mainEdge.x + (exitEdge.x - mainEdge.x) * 0.5;
assert(Math.abs(inGore.x - chord) < 0.5, 'клин лежит на отрезке между прямой и съездом');
assert(Math.abs(inGore.x - gapMid) > 2, 'клин не остаётся на прямой, когда съезд уже повернул');
const lip = goreAt(goreEdges.rightInner);
const justOn = goreAt(goreEdges.rightInner - 0.3);
const justOff = goreAt(goreEdges.rightInner - 0.5);
assert(onExitRibbon(goreEdges.rightInner - 0.3, goreEdges) && followsExit(goreEdges.rightInner - 0.3, goreEdges), 'у кромки сиденье и курс оба на ленте');
assert(!onExitRibbon(goreEdges.rightInner - 0.5, goreEdges) && !followsExit(goreEdges.rightInner - 0.5, goreEdges), 'в клине ни сиденье, ни курс ещё не на ленте');
assert(followsExit(goreEdges.rightOuter + 2, goreEdges) && !onExitRibbon(goreEdges.rightOuter + 2, goreEdges), 'обочина едет курсом ленты, сиденье на ней не сидит');
assert(Math.abs(justOn.x - lip.x) < Math.abs(justOff.x - lip.x), 'на асфальте ленты курс ленты, в клине ещё клин');
const shut = { leftOuter: -10, leftInner: 10, rightInner: 32, rightOuter: 32.2 };
const stayed = goreAt(20, shut);
assert(Math.abs(stayed.x - 20) < 1, 'схлопнутая лента не утаскивает клин на ветку');

(globalThis as { console?: { log: (message: string) => void } }).console?.log('vectors ok');
