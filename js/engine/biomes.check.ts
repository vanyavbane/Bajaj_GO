import { BIOME_NEXT, BIOMES, laneLayoutOf, storedBiomeIndex, storedVisits, transitionIndexes } from './biomes.ts';
import { besideWithLane, carriageLanes, defaultRunOffset, directionEdge, exitCarriage, lanesOf, nearestLaneOffset, offsetDirection, outerLane } from './lanes.ts';
import { stepTrafficCar } from './motion.ts';
import { EXIT_DIVERGE, EXIT_LANE_HALF, FORK_LEAD, FORK_SPREAD, branchEdges, branchPick, exitClock, exitEntryPull, landOnCarriage, exitRibbonMid, forkOccupancy, forkOffset, forkSpreadAt, laneMeters, liveForkAmount, logicalRoadLimits, onExitRibbon, reachedExit, roadCenter, roadLateral, sampleRoad, splitPick } from './fork.ts';

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

const ids = ['city', 'field', 'forest', 'mountain', 'mkad', 'embankment'] as const;
assert(BIOMES.length === ids.length, 'в каталоге шесть локаций, порядок совпадает с сохранением');
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
const embankment = laneLayoutOf(BIOMES[5]!);
assert(city.count === 4 && city.oncomingCount === 2, 'город: 4 полосы, 2 встречные');
assert(mountain.count === 2 && mountain.oncomingCount === 1, 'горы: 2 полосы, 1 встречная');
assert(mkad.count === 8 && mkad.oncomingCount === 4 && mkad.width === 34.4, 'МКАД: 8 полос по 4.3 м');
assert(embankment.count === 4 && embankment.oncomingCount === 2, 'набережная: 4 полосы, 2 встречные');
assert(embankment.speeds.join() === city.speeds.join(), 'набережная: скорости как в городе');
assert(transitionIndexes().every((pair) => pair.length === 2), 'у каждой развилки два индекса');
assert(BIOMES.every((biome) => biome.road.x.length > 0 && biome.road.y.length > 0 && biome.sky.fogMul > 0), 'у каждой локации свои волны и небо');
assert(BIOMES.every((biome) => biome.signs.length > 0 && biome.boards.length > 0), 'у каждой локации свои указатели и щиты');
assert(BIOMES[0]!.signs === BIOMES[4]!.signs && BIOMES[0]!.signArrows === 2, 'город и МКАД делят список съездов');
assert(BIOMES[5]!.signs[0]?.title !== BIOMES[0]!.signs[0]?.title, 'набережная не берёт указатели города');
assert(BIOME_NEXT.city[0] === 'mountain' && BIOME_NEXT.city[1] === 'mkad', 'город ведёт в горы и на МКАД');
assert(BIOMES.filter((biome) => !biome.route).map((biome) => biome.id).join() === 'embankment', 'набережная записана, но не стоит на маршруте');
const decorOf = { city: 'roadside', field: 'slots', forest: 'forest', mountain: 'mountain', mkad: 'slots', embankment: 'embankment' } as const;
for (const biome of BIOMES) {
  assert(biome.decor === decorOf[biome.id], `${biome.id}: декор записан в каталоге`);
}
assert(storedBiomeIndex('forest') === 2 && storedBiomeIndex(2) === 2 && storedBiomeIndex('2') === 2, 'имя и старый номер читаются как одна локация');
assert(storedBiomeIndex('shore') == null && storedBiomeIndex(9) == null && storedBiomeIndex(-1) == null, 'чужое имя и номер вне каталога не становятся локацией');
const visits = storedVisits({ forest: 2, city: 1 });
assert(visits[0] === 1 && visits[2] === 2 && visits[1] === 0, 'счётчики читаются по имени');
assert(storedVisits([0, 1, 2]).join() === '0,1,2,0,0,0', 'старый массив счётчиков остаётся по номерам');
for (const biome of BIOMES) {
  for (const target of BIOME_NEXT[biome.id]) {
    assert(BIOMES.find((item) => item.id === target)?.route === true, `${biome.id} не предлагает локацию вне маршрута`);
  }
}

assert(splitPick(-1) === -1 && splitPick(0) === 0 && branchPick(1) === 1 && branchPick(-1) === 0, 'слот баннера не путается со стороной оси');

const straightRoad = branchEdges(10, 0);
assert(straightRoad.leftOuter === -10 && straightRoad.leftInner === 10, 'прямая дорога остаётся на оси');
assert(straightRoad.rightOuter === straightRoad.rightInner, 'без разъезда съезда нет');
const openExit = branchEdges(10, 26);
assert(openExit.leftOuter === -10 && openExit.leftInner === 10, 'на съезде прямая лента не уезжает влево');
assert(openExit.rightInner > openExit.leftInner && openExit.rightOuter > openExit.rightInner, 'съезд открывается справа от дороги');
const roadAt = (d: number, chosen: -1 | 0 | 1) => sampleRoad({
  forkDistance: d,
  half: 10,
  chosen,
  baseOrigin: 0,
  endWeight: 1,
}).local;
const atSeal = exitClock().ownAfter - 0.001;
const afterSeal = exitClock().ownAfter + 10;
const declined = roadAt(atSeal, -1);
assert(Math.abs(declined.rightOuter - declined.rightInner) < 1e-4, 'отказ от съезда закрывает правую ленту');
assert(declined.leftOuter === -10 && declined.leftInner === 10, 'отказ не двигает прямую дорогу');
const arrivedFrame = sampleRoad({
  forkDistance: FORK_LEAD - 1,
  half: 10,
  chosen: 1,
  baseOrigin: 0,
});
assert(arrivedFrame.origin === 0, 'въезд не переносит центр новой дороги');
assert(
  Math.abs(arrivedFrame.local.leftOuter + EXIT_LANE_HALF) < 0.05 && Math.abs(arrivedFrame.local.leftInner - EXIT_LANE_HALF) < 0.05,
  'после въезда ширина — ширина новой дороги, не старой',
);
const earlyChoice = sampleRoad({
  forkDistance: -30,
  half: 10,
  chosen: 1,
  baseOrigin: 4,
});
assert(earlyChoice.origin === 4, 'до развилки центр дороги остаётся её центром');
assert(forkOffset(100, 0) === 0 && forkOffset(Number.NaN, 1500) === forkOffset(0, 1500), 'пустая или битая длина зоны не роняет развилку');
const brokenOrigin = sampleRoad({
  forkDistance: 10,
  half: 10,
  chosen: 0,
  baseOrigin: Number.NaN,
});
assert(brokenOrigin.origin === 0 && brokenOrigin.world.leftOuter === -10, 'битый центр не разъезжает кромки');
const afterFork = sampleRoad({
  forkDistance: FORK_LEAD + 8,
  half: 10,
  chosen: 1,
  baseOrigin: 4,
});
assert(afterFork.origin === 4, 'следующая зона стоит на центре дороги, не на съезде');
assert(afterFork.local.leftOuter === -10 && afterFork.local.rightOuter === 10, 'за рецептом съезда уже нет');
const clock = exitClock();
const returning = sampleRoad({
  forkDistance: clock.choiceAt + 20,
  half: 10,
  chosen: 1,
  baseOrigin: 0,
  endWeight: 1,
});
assert(returning.origin === 0, 'въезд не двигает центр новой дороги');
const oldSpan = returning.local.leftInner - returning.local.leftOuter;
assert(oldSpan < 20 && oldSpan > 1, 'старая дорога сужается, пока въезд ещё идёт');
const fullRibbon = exitRibbonMid(branchEdges(10, FORK_SPREAD));
const backRibbon = exitRibbonMid(returning.local);
assert(Math.abs(backRibbon - fullRibbon) < 0.5, 'въезд остаётся на своей линии, пока старая дорога сужается');
const sealStart = sampleRoad({
  forkDistance: clock.choiceAt + 0.01,
  half: 10,
  chosen: 1,
  baseOrigin: 0,
  endWeight: 0,
});
const sealEnd = sampleRoad({
  forkDistance: clock.ownAfter - 0.05,
  half: 10,
  chosen: 1,
  baseOrigin: 0,
  endWeight: 1,
});
const arrived = sampleRoad({
  forkDistance: clock.ownAfter + 0.05,
  half: 10,
  chosen: 1,
  baseOrigin: 0,
  endWeight: 1,
});
assert(Math.abs(laneMeters(0, 1, sealStart, false)) < 0.05, 'полосы дороги остаются на её центре');
assert(
  Math.abs(exitRibbonMid(sealEnd.local) - (arrived.local.leftOuter + arrived.local.leftInner) * 0.5) < 1,
  'линия въезда не прыгает, когда он становится дорогой',
);
assert(sealStart.local.leftOuter === -10 && sealStart.local.leftInner === 10, 'в начале закрытия старая дорога ещё цела');
const homeLine = exitRibbonMid(branchEdges(10, FORK_SPREAD));
assert(
  Math.abs((arrived.local.leftOuter + arrived.local.leftInner) * 0.5 - homeLine) < 1,
  'сразу после закрытия новая дорога стоит на линии въезда',
);
assert(Math.abs(exitRibbonMid(sealStart.local) - backRibbon) < 0.5, 'въезд на закрытии не съезжает с своей линии');
assert(exitRibbonMid(sealEnd.local) > 12, 'до конца закрытия въезд ещё лента на своей линии');
assert(sealEnd.local.leftInner - sealEnd.local.leftOuter < 1, 'к концу закрытия старая дорога уже сошла');
const straightEnd = sampleRoad({
  forkDistance: clock.ownAfter - 1,
  half: 10,
  chosen: -1,
  baseOrigin: 0,
  endWeight: 1,
});
assert(Math.abs(laneMeters(2, 1, straightEnd, false) - 2) < 1e-6, 'прямой ход оставляет полосы на прямой');
const nose = branchEdges(10, 4);
assert(nose.rightInner <= 10.01 && nose.rightOuter > nose.rightInner, 'на подходе съезд ещё соединён с правой кромкой');
assert(nose.rightOuter - nose.rightInner > 2, 'соединённый съезд уже можно занять');

const zone = 1500;
const noseM = zone - FORK_LEAD;
assert(forkSpreadAt(noseM - 20, zone) === 0, 'до съезда дорога одна');
assert(forkSpreadAt(noseM + EXIT_DIVERGE + 30, zone) === FORK_SPREAD, 'на раздельном участке съезд держит полную ширину');
assert(forkSpreadAt(noseM + exitClock().choiceAt + 10, zone) === FORK_SPREAD, 'кривая рецепта на закрытии ещё полная: возврат читают кромки');
assert(forkSpreadAt(noseM + FORK_LEAD - 1, zone) === FORK_SPREAD, 'до границы зоны кривая рецепта ещё открыта');
assert(forkSpreadAt(noseM + FORK_LEAD, zone) === 0, 'за границей зоны съезда уже нет');
const endedExit = roadAt(atSeal, -1);
const endedMid = exitRibbonMid(endedExit);
assert(Math.abs(endedExit.rightOuter - endedExit.rightInner) < 1e-6, 'отказанная ветка сходит на нет');
assert(endedMid > 12, 'отказанная ветка заканчивается в стороне, не на прямой дороге');
const taken = roadAt(atSeal, 1);
assert(Math.abs(exitRibbonMid(taken) - homeLine) < 0.5, 'к концу закрытия въезд ещё на своей линии');
assert(taken.leftInner - taken.leftOuter < 0.2, 'к концу закрытия старая дорога сошла');

const stillOpen = roadAt(afterSeal, 0);
assert(stillOpen.rightOuter - stillOpen.rightInner > 9, 'до выбора съезд впереди не обрывается');
const settled = roadAt(afterSeal, 1);
assert(
  Math.abs((settled.leftInner - settled.leftOuter) * 0.5 - EXIT_LANE_HALF) < 0.05,
  'после въезда дорога держит ширину новой, не старой',
);
assert(settled.rightOuter === settled.rightInner, 'после въезда отдельной старой ленты нет');
const declinedSettle = roadAt(afterSeal, -1);
assert(declinedSettle.leftOuter === -10 && declinedSettle.leftInner === 10, 'после отказа прямая остаётся своей ширины');
assert(declinedSettle.rightOuter === declinedSettle.rightInner && declinedSettle.rightInner === declinedSettle.leftInner, 'после отказа съезда уже нет, осталась одна прямая');
const openRibbon = branchEdges(10, FORK_SPREAD);
assert(roadLateral(9, openRibbon, false) === 9, 'вне съезда полоса и есть метры от оси');
const ride = roadLateral(9, openRibbon, true);
assert(ride > openRibbon.rightInner && ride < openRibbon.rightOuter, 'байк на ленте съезда, не в клине');
const carriedRide = roadLateral(2, returning.local, true);
assert(carriedRide > returning.local.rightInner && carriedRide < returning.local.rightOuter, 'на въезде байк остаётся на ленте');
const narrow = sampleRoad({ forkDistance: clock.ownAfter, half: 10, chosen: 1, baseOrigin: 0, endWeight: 1, arriveHalf: 8 });
const wide = sampleRoad({ forkDistance: clock.ownAfter + 20, half: 10, chosen: 1, baseOrigin: 0, endWeight: 1, arriveHalf: 14 });
assert(roadCenter(narrow) === 0 && roadCenter(wide) === 0, 'ширина новой дороги не двигает центр пути');
const wideMid = (wide.local.leftOuter + wide.local.leftInner) * 0.5;
assert(Math.abs(laneMeters(0, 1, wide, false) - wideMid) < 1e-6, 'нулевая полоса остаётся на центре новой дороги');
assert(Math.abs(narrow.local.leftInner - narrow.local.leftOuter - 16) < 1e-6, 'после въезда ширина — ширина новой дороги');
assert(Math.abs(wide.local.leftInner - wide.local.leftOuter - 28) < 1e-6, 'более широкая новая дорога не берёт ширину старой');
assert(onExitRibbon(32, openRibbon) && !onExitRibbon(0, openRibbon), 'байк на асфальте съезда узнаётся и при открытом клине');
const joined = branchEdges(10, 4);
const joinedLimits = logicalRoadLimits(joined, 1, false);
assert(joinedLimits.max > joined.leftInner, 'пока съезд приклеен, правая стена стоит за ним, а не на кромке прямой');
const splitRoad = branchEdges(10, FORK_SPREAD);
const blocked = logicalRoadLimits(splitRoad, 1, false);
const openChoice = logicalRoadLimits(splitRoad, 1, false, true);
const riding = logicalRoadLimits(splitRoad, 1, true);
const plainLimits = logicalRoadLimits(branchEdges(EXIT_LANE_HALF, 0), 1, false);
assert(blocked.max < splitRoad.leftInner, 'после отказа с прямой на съезд уже не перестроиться');
assert(openChoice.max > splitRoad.rightInner, 'пока съезд можно взять, правая стена стоит за ним');
assert(!reachedExit(splitRoad.leftInner, splitRoad), 'кромка прямой ещё не ход на съезд');
assert(reachedExit(splitRoad.leftInner + 2, splitRoad), 'уход правее прямой — это съезд');
assert(exitEntryPull(splitRoad.leftInner + 2, splitRoad) === 16, 'в глубине клина довоз 16 м/с');
assert(exitEntryPull(splitRoad.rightInner - 2, splitRoad) < 16, 'у кромки ленты довоз спадает');
assert(exitEntryPull(splitRoad.rightInner - 2, splitRoad) > 0, 'спад начинается ещё в клине');
assert(exitEntryPull(splitRoad.rightInner + 1, splitRoad) === 0, 'на ленте догонять уже нечего');
assert(exitEntryPull(0, splitRoad) === 0, 'с прямой в клин не вытягивает');
assert(Math.abs(riding.max - plainLimits.max) < 1e-6 && Math.abs(riding.min - plainLimits.min) < 1e-6, 'на съезде те же пределы руля, что на прямой дороге той же ширины');
const arrivedLimits = logicalRoadLimits(arrived.local, 1, false, true);
assert(Math.abs(arrivedLimits.min + arrivedLimits.max) < 0.2, 'после въезда стены руля стоят вокруг центра новой дороги');
assert(arrivedLimits.max < EXIT_LANE_HALF, 'стена руля не остаётся на старой оси сплайна');
assert(liveForkAmount(1, 'settle', 0) === 1, 'до выбора хвост ещё занимает место развилки');
assert(liveForkAmount(1, 'settle', 1) === 0 && liveForkAmount(1, 'settle', -1) === 0, 'после выбора блок дороги уже не развилка');
assert(liveForkAmount(1, 'end', 1) === 1 && liveForkAmount(0, 'none', 1) === 0, 'закрытие ветки ещё развилка, пустая фаза — нет');
const openForkEdges = branchEdges(10, FORK_SPREAD);
assert(forkOccupancy(1, 'end', 1, openForkEdges, 0) === 1, 'в начале въезда развилка ещё занимает место');
assert(forkOccupancy(1, 'end', 1, openForkEdges, 0.8) < 0.3, 'к концу въезда развилка гаснет');
assert(forkOccupancy(1, 'end', 1, branchEdges(10, 0), 1) === 0, 'без ленты въезда развилки нет');
assert(forkOccupancy(FORK_SPREAD, 'run', 1, openForkEdges) === FORK_SPREAD, 'на выборе уход старой кромки развилку не гасит');
const dead = branchEdges(10, 0);
assert(Math.abs(landOnCarriage(0, dead, 32, 1) - 9.3) < 1e-9, 'пропавшая лента сажает байка на край прямой');
assert(landOnCarriage(0, dead, 2, 1) === 2, 'байк, который уже на прямой, остаётся на месте');
const oneWay = carriageLanes({ oncomingCount: 2, offsets: [-6, -2, 2, 6] }, 'one-way');
assert(oneWay.way === 'one-way' && oneWay.oncomingCount === 0 && oneWay.biomeOncoming === 2, 'односторонняя помнит, какие полосы были встречными');
const again = carriageLanes(oneWay, 'one-way');
assert(again.way === 'one-way' && again.oncomingCount === 0 && again.biomeOncoming === 2, 'повтор не забывает встречные полосы биома');
const back = carriageLanes(oneWay, 'two-way');
assert(back.way === 'two-way' && back.oncomingCount === 2, 'на двусторонней встречные биома возвращаются');
const cityLanes = lanesOf({ ...city, way: 'two-way' });
assert(cityLanes.length === city.count, 'у города полоса на каждое смещение');
assert(cityLanes.every((lane) => (lane.direction === 'against') === (lane.side === 'left')), 'встречные полосы города — его левая сторона');
assert(cityLanes.every((lane) => (lane.direction === 'with') === (lane.side === 'right')), 'попутные полосы города — его правая сторона');
const exitLanes = lanesOf(exitCarriage(city.id));
assert(exitLanes[0]?.side === 'left' && exitLanes[0]?.direction === 'with', 'левая полоса съезда едет вперёд');
assert(exitLanes[1]?.side === 'right' && exitLanes[1]?.direction === 'with', 'правая полоса съезда едет вперёд');
assert(directionEdge(exitLanes) == null, 'у съезда нет границы встречного хода');
assert(outerLane(exitLanes, 'right', 'with')?.offset === exitLanes[1]?.offset, 'крайняя правая полоса съезда — та, что справа');
const forward = lanesOf(oneWay);
assert(forward.every((lane) => lane.direction === 'with'), 'односторонняя не оставляет встречного направления');
assert(forward[0]?.side === 'left' && forward[forward.length - 1]?.side === 'right', 'стороны односторонней дороги остаются');
const restored = lanesOf(back);
assert(restored[0]?.direction === 'against' && restored[0]?.side === 'left', 'возврат двусторонней снова ставит левую полосу навстречу');
assert(defaultRunOffset(cityLanes) === cityLanes.find((lane) => lane.direction === 'with')?.offset, 'попутная по умолчанию — ближайшая к оси, не встречная');
assert(defaultRunOffset(exitLanes) === exitLanes[1]?.offset, 'на съезде попутная по умолчанию — крайняя правая');
assert(nearestLaneOffset(cityLanes, -100, 'with') === defaultRunOffset(cityLanes), 'поиск попутной не сажает байка на встречную');
assert(besideWithLane(cityLanes, 2)?.index === 3 && besideWithLane(cityLanes, 3)?.index === 2, 'попутная уступает соседу своего направления');
assert(besideWithLane(cityLanes, 0) == null, 'встречная от дальнего света не перестраивается');
assert(offsetDirection(cityLanes, -8) === 'against' && offsetDirection(cityLanes, 8) === 'with', 'левее границы ход встречный, правее попутный');
assert(offsetDirection(exitLanes, -2) === 'with', 'на съезде левая полоса не даёт двойных очков встречки');
const meetLanes = lanesOf({ offsets: [-6, -2, 2, 6], oncomingCount: 2, way: 'two-way' });
const meet = stepTrafficCar(
  { laneIdx: 0, targetLaneIdx: 0, lateralOffset: -6, s: 10, speedKmh: 36, changingLane: false, flashReactTimer: 0, steerAngle: 0 },
  0.5, meetLanes,
);
assert(meet.s < 10 && meet.oncoming, 'на двусторонней встречная едет навстречу');
const merged = stepTrafficCar(
  { laneIdx: 0, targetLaneIdx: 2, lateralOffset: -6, s: 10, speedKmh: 36, changingLane: true, flashReactTimer: 0, steerAngle: 0 },
  0.5, lanesOf({ offsets: [-6, -2, 2, 6], oncomingCount: 0, way: 'one-way' }), 1,
);
assert(merged.s > 10 && !merged.oncoming, 'на съезде бывшая встречная едет вперёд и перестраивается');

(globalThis as { console?: { log: (message: string) => void } }).console?.log('biome catalog ok');
