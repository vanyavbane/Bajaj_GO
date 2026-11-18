import { BIOME_NEXT, BIOMES, laneLayoutOf, transitionIndexes } from './biomes.ts';
import { EXIT_CHOICE, EXIT_DIVERGE, FORK_LEAD, FORK_SPREAD, branchEdges, branchPick, chosenSideOf, exitEdges, exitPhase, exitReserved, exitRiderShift, forkCenterShift, forkSpreadAt, logicalRoadLimits, pickToSide, splitPick } from './fork.ts';

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

const ids = ['city', 'field', 'forest', 'mountain', 'mkad'] as const;
assert(BIOMES.length === ids.length, 'в каталоге пять биомов');
for (let i = 0; i < ids.length; i++) {
  assert(BIOMES[i]?.id === ids[i], `порядок каталога держит сохранённые индексы, позиция ${i}`);
}

for (const biome of BIOMES) {
  assert(biome.speeds.length === biome.lanes, `${biome.id}: скоростей столько же, сколько полос`);
  const layout = laneLayoutOf(biome);
  assert(layout.offsets.length === biome.lanes, `${biome.id}: смещение у каждой полосы`);
  assert(layout.oncomingCount === biome.oncoming, `${biome.id}: встречные совпадают`);
  assert(Math.abs(layout.width - biome.lanes * biome.laneWidth) < 1e-9, `${biome.id}: ширина полотна`);
  assert(layout.startLane === layout.offsets[layout.count - 1], `${biome.id}: старт на крайней попутной`);
  const next = BIOME_NEXT[biome.id];
  assert(next[0] !== biome.id && next[1] !== biome.id && next[0] !== next[1], `${biome.id}: два чужих перехода`);
}

const city = laneLayoutOf(BIOMES[0]!);
const mountain = laneLayoutOf(BIOMES[3]!);
const mkad = laneLayoutOf(BIOMES[4]!);
assert(city.count === 4 && city.oncomingCount === 2, 'город: 4 полосы, 2 встречные');
assert(mountain.count === 2 && mountain.oncomingCount === 1, 'горы: 2 полосы, 1 встречная');
assert(mkad.count === 8 && mkad.oncomingCount === 4 && mkad.width === 34.4, 'МКАД: 8 полос по 4.3 м');
assert(transitionIndexes().every((pair) => pair.length === 2), 'у каждой развилки два индекса');

assert(pickToSide(0) === -1 && pickToSide(1) === 1, 'левый слот баннера — минус по оси');
assert(chosenSideOf(0) === 0 && chosenSideOf(-1) === -1 && chosenSideOf(2) === 0, 'сторона оси только из -1 и 1');
assert(splitPick(-1) === -1 && splitPick(0) === 0 && branchPick(1) === 1 && branchPick(-1) === 0, 'слот баннера не путается со стороной оси');

const straightRoad = branchEdges(10, 0);
assert(straightRoad.leftOuter === -10 && straightRoad.leftInner === 10, 'прямая дорога остаётся на оси');
assert(straightRoad.rightOuter === straightRoad.rightInner, 'без разъезда съезда нет');
const openExit = branchEdges(10, 26);
assert(openExit.leftOuter === -10 && openExit.leftInner === 10, 'на съезде прямая лента не уезжает влево');
assert(openExit.rightInner > openExit.leftInner && openExit.rightOuter > openExit.rightInner, 'съезд открывается справа от дороги');
const declined = exitEdges(10, { kind: 'end', t: 1, spread: FORK_SPREAD }, -1);
assert(Math.abs(declined.rightOuter - declined.rightInner) < 1e-9, 'отказ от съезда закрывает правую ленту');
assert(declined.leftOuter === -10 && declined.leftInner === 10, 'отказ не двигает прямую дорогу');
assert(forkCenterShift(100, 1500, 1) === 0 && forkCenterShift(100, 1500, -1) === 0, 'ось маршрута не переезжает');
const nose = branchEdges(10, 4);
assert(nose.rightInner <= 10.01 && nose.rightOuter > nose.rightInner, 'на подходе съезд ещё соединён с правой кромкой');
assert(nose.rightOuter - nose.rightInner > 2, 'соединённый съезд уже можно занять');

const zone = 1500;
const noseM = zone - FORK_LEAD;
assert(forkSpreadAt(noseM - 20, zone) === 0, 'до съезда дорога одна');
assert(forkSpreadAt(noseM + EXIT_DIVERGE + 30, zone) === FORK_SPREAD, 'на раздельном участке съезд держит полную ширину');
assert(forkSpreadAt(noseM + EXIT_CHOICE + 10, zone) === FORK_SPREAD, 'после выбора съезд не вливается обратно');
assert(forkSpreadAt(noseM + FORK_LEAD - 1, zone) === FORK_SPREAD, 'до границы зоны ветка ещё считается открытой');
assert(forkSpreadAt(noseM + FORK_LEAD, zone) === 0, 'за границей зоны съезда уже нет');
const endedExit = exitEdges(10, { kind: 'end', t: 1, spread: FORK_SPREAD }, -1);
const endedMid = (endedExit.rightInner + endedExit.rightOuter) * 0.5;
assert(Math.abs(endedExit.rightOuter - endedExit.rightInner) < 1e-6, 'отказанная ветка сходит на нет');
assert(endedMid > 12, 'отказанная ветка заканчивается в стороне, не на прямой дороге');
const taken = exitEdges(10, { kind: 'end', t: 1, spread: FORK_SPREAD }, 1);
assert(Math.abs(taken.leftOuter - taken.leftInner) < 1e-6, 'взятый съезд заканчивает прямую ветку');
assert(taken.rightOuter - taken.rightInner > 10, 'взятый съезд остаётся дорогой');

const settled = exitEdges(10, { kind: 'settle', t: 1, spread: FORK_SPREAD }, 1);
const plain = exitEdges(10, exitPhase(-1), 0);
assert(Math.abs(settled.rightInner - plain.leftOuter) < 1e-6 && Math.abs(settled.rightOuter - plain.leftInner) < 1e-6, 'в конце съезда ветка совпадает с дорогой на оси');
const declinedSettle = exitEdges(10, { kind: 'settle', t: 0.4, spread: FORK_SPREAD }, -1);
assert(declinedSettle.leftOuter === -10 && declinedSettle.rightOuter === declinedSettle.rightInner, 'после отказа к границе остаётся только прямая');
const openRibbon = branchEdges(10, FORK_SPREAD);
const ride = 9 + exitRiderShift(9, 10, openRibbon);
assert(ride > openRibbon.rightInner && ride < openRibbon.rightOuter, 'байк на ленте съезда, не в клине');
const centered = exitEdges(10, { kind: 'settle', t: 1, spread: FORK_SPREAD }, 1);
assert(exitRiderShift(9, 10, centered) === 0, 'когда ветка легла на ось, байк снова в своей полосе');
const joined = branchEdges(10, 4);
const joinedLimits = logicalRoadLimits(joined, 1, false);
assert(joinedLimits.max > joined.leftInner, 'пока съезд приклеен, правая стена стоит за ним, а не на кромке прямой');
const splitRoad = branchEdges(10, FORK_SPREAD);
const blocked = logicalRoadLimits(splitRoad, 1, false);
const riding = logicalRoadLimits(splitRoad, 1, true);
assert(blocked.max < splitRoad.leftInner, 'после клина с прямой на съезд уже не перестроиться');
assert(riding.max > blocked.max, 'тот, кто уже на съезде, не бьётся о кромку прямой');
assert(!exitReserved(-5) && exitReserved(EXIT_DIVERGE) && !exitReserved(FORK_LEAD + 1), 'коридор съезда не залезает за границу зоны');

(globalThis as { console?: { log: (message: string) => void } }).console?.log('biome catalog ok');
