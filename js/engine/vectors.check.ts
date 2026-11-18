import { BRANCH_YAW } from './branch.ts';
import { EXIT_RIGHT, STRAIGHT, createVectorField } from './vectors.ts';
import type { VectorSpawn } from './vectors.ts';

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

(globalThis as { console?: { log: (message: string) => void } }).console?.log('vectors ok');
