/**
 * Запись развилки: открыто, прямая и съезд не схлопываются в одно число.
 */
import { courseBranches, decideZone, zoneRoadOf } from './route.ts';

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

const open = decideZone({ committed: false, storedSide: 1 });
assert(open.choice === 'open' && open.side === 0 && open.pick === 0 && !open.tookExit, 'пока зона не зафиксирована, записанная сторона дорогу не двигает');

const straight = decideZone({ committed: true, storedSide: -1 });
assert(straight.choice === 'straight' && straight.side === -1 && straight.pick === 0 && !straight.tookExit, 'прямая остаётся нулевым вектором и не переносит ось');
assert(open.choice !== straight.choice && open.pick === straight.pick, 'открытая развилка и прямая — разные записи на одном векторе');

const exit = decideZone({ committed: true, storedSide: 1 });
assert(exit.choice === 'exit' && exit.side === 1 && exit.pick === 1 && exit.tookExit, 'съезд — первый вектор и переносит ось');

const fromNext = decideZone({ committed: true, nextIsExit: true });
assert(fromNext.choice === 'exit' && fromNext.side === 1, 'без записанной стороны съезд читается из правого слота');

const otherSlot = decideZone({ committed: true, nextIsExit: false });
assert(otherSlot.choice === 'straight' && otherSlot.side === -1, 'левый слот закрывает съезд');

const missing = decideZone({ committed: true, nextIsExit: null });
assert(missing.choice === 'straight' && missing.side === -1, 'зафиксированная зона без пары закрывает съезд');

const straightRoad = zoneRoadOf(straight, 10, 40);
assert(!straightRoad.tookExit && straightRoad.half === 10 && !('keptOrigin' in straightRoad), 'прямая не хранит чужой центр');

const kept = zoneRoadOf(exit, 10, 40);
assert(kept.tookExit && kept.half === 10 && kept.keptOrigin === 40, 'взятый съезд оставляет сверенный центр');

assert(courseBranches('open', ['exit']).length === 1, 'открытая развилка держит вектор съезда');
assert(courseBranches('exit', ['exit']).length === 1, 'взятый съезд держит свой вектор');
assert(courseBranches('straight', ['exit']).length === 0, 'прямая гасит вектор съезда');

const fresh = zoneRoadOf(exit, 8, null);
assert(fresh.tookExit && fresh.half === 8 && !('keptOrigin' in fresh), 'без сверки центр считает формула');
