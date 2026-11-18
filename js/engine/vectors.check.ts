import { BRANCH_YAW } from './branch.ts';
import { EXIT_LEFT, EXIT_RIGHT, RIGHT_FORK, STRAIGHT, branchVectors, courseOwns, courseVector, createVectorField, openCourse, ownedCourse, zoneNose } from './vectors.ts';
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
const three: ForkCourse = { id: 'three', vectors: [STRAIGHT, EXIT_RIGHT, EXIT_LEFT] };
assert(courseVector(three, 2).id === 'exit-left' && branchVectors(three).length === 2, 'третий слот курса — отдельный левый вектор');
const layout = { zoneLength: 1500, lead: 430, ownAfter: 330, offset: 0 };
assert(zoneNose(0, layout) === 1070, 'нос зоны считается от конца зоны, не от биома');
const owned = ownedCourse(RIGHT_FORK, 1070 + 330, layout, (zone) => (zone === 0 ? 1 : 0));
assert(owned.length === 1 && owned[0]?.key === '0:exit', 'взятый съезд попадает в путь только когда стал дорогой');
assert(ownedCourse(RIGHT_FORK, 1070 + 10, layout, () => 1).length === 0, 'до конца поворота вектор ещё не владеет дорогой');
assert(openCourse(RIGHT_FORK, 1070 + 20, layout).length === 1, 'после носа открыто ответвление курса');
assert(openCourse(RIGHT_FORK, 1070 - 5, layout).length === 0, 'до носа ответвлений нет');
assert(courseOwns(RIGHT_FORK, 1, 1400, 1070, 330) && !courseOwns(RIGHT_FORK, 0, 1400, 1070, 330), 'прямой выбор дорогу не перехватывает');

(globalThis as { console?: { log: (message: string) => void } }).console?.log('vectors ok');
