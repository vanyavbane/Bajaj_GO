/**
 * Ремонт дороги: отметка спавна, запретные соседи, очередь и попадание.
 * Чистая логика не зависит от Three.js и DOM, поэтому проверяется отдельно.
 */
import {
  REPAIR_ALLOWED_BIOMES,
  REPAIR_MIN_DIST,
  REPAIR_SPREAD,
  repairAllowed,
  repairCollision,
  repairMark,
  repairQueueCount,
  repairQueueTargets,
  repairSiteClear,
  repairStopS,
  type RepairSiteInput,
} from './repair.ts';

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

assert(REPAIR_MIN_DIST === 3500 && REPAIR_SPREAD === 500, 'порог 3500 ± 500 м');
assert(repairMark(0) === 3000 && repairMark(1) === 4000, 'окно отметки');
assert(Math.abs(repairMark(0.5) - 3500) < 1e-9, 'середина окна');
assert(repairAllowed('city') && repairAllowed('mkad'), 'город и МКАД разрешены');
for (const biome of ['field', 'forest', 'mountain', 'embankment']) {
  assert(!repairAllowed(biome), `биом ${biome} не должен принимать ремонт`);
}
assert(REPAIR_ALLOWED_BIOMES.length === 2, 'разрешены ровно два биома');

const clear: RepairSiteInput = {
  splitAt: () => 0,
  allowedAt: () => true,
  structures: [],
  ramps: [],
  exits: [],
  repairs: [],
};
const at = (s: number) => repairSiteClear(1000, { ...clear, splitAt: (x) => (Math.abs(x - s) < 1 ? 1 : 0) });

assert(repairSiteClear(1000, clear), 'свободная площадка проходит');
assert(!repairSiteClear(NaN, clear), 'нечисловая координата не проходит');
assert(!repairSiteClear(1000, { ...clear, allowedAt: () => false }), 'запрещённый биом не проходит');
assert(!at(1000), 'развилка на площадке не проходит');
assert(!at(900), 'развилка за 100 м до площадки не проходит');
assert(!at(1100), 'развилка через 100 м после площадки не проходит');
assert(at(880), 'развилка дальше 100 м не мешает');

assert(!repairSiteClear(1000, { ...clear, structures: [{ s: 1000, visible: true }] }), 'мост над площадкой не проходит');
assert(!repairSiteClear(1000, { ...clear, structures: [{ s: 900, visible: true }] }), 'мост в окне подъезда не проходит');
assert(repairSiteClear(1000, { ...clear, structures: [{ s: 900, visible: false }] }), 'невидимый мост не мешает');
assert(!repairSiteClear(1000, { ...clear, ramps: [{ s: 1040 }] }), 'трамплин рядом не проходит');
assert(repairSiteClear(1000, { ...clear, ramps: [{ s: 1060 }] }), 'далёкий трамплин не мешает');
assert(!repairSiteClear(1000, { ...clear, exits: [{ s: 960 }] }), 'съезд рядом не проходит');
assert(repairSiteClear(1000, { ...clear, exits: [{ s: 940 }] }), 'далёкий съезд не мешает');
assert(!repairSiteClear(1000, { ...clear, repairs: [{ s: 1100, active: true }] }), 'второй ремонт рядом не проходит');
assert(repairSiteClear(1000, { ...clear, repairs: [{ s: 1100, active: false }] }), 'неактивный ремонт не мешает');

assert(Math.abs(repairStopS(1000, 8) - 992) < 1e-9, 'первая машина в 4 м от края');
assert(Math.abs(repairStopS(1000, 8, 3) - 968) < 1e-9, 'четвёртая машина через 8 м');
assert(repairQueueCount(0) === 3 && repairQueueCount(0.99) === 5, 'очередь из 3–5 машин');
const queue = repairQueueTargets(1000, 8, 3, 4);
assert(queue.length === 4 && queue.every((car) => car.laneIdx === 3), 'очередь стоит в полосе ремонта');
assert(Math.abs(queue[3].s - 968) < 1e-9, 'очередь не скучивается');

assert(repairCollision(1000, 3, 1000, 3, 8, 2), 'попадание в яму');
assert(repairCollision(1004, 3, 1000, 3, 8, 2), 'метр запаса по ходу входит в зону');
assert(!repairCollision(1006, 3, 1000, 3, 8, 2), 'за зоной попадания нет');
assert(!repairCollision(1000, 5.05, 1000, 3, 8, 2), 'соседняя полоса не задевает');
assert(!repairCollision(NaN, 3, 1000, 3, 8, 2), 'нечисловые координаты не попадают');
