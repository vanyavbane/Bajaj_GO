/**
 * Декор стоит снаружи живого асфальта во всех локациях и во всех фазах развилки.
 * Проверяет и непрерывность точки постановки: прямая, смена полосы и выбор
 * ветки не должны двигать боковые объекты рывками.
 */
import { BIOMES, laneLayoutOf } from './biomes.ts';
import { asphaltSpan } from './asphalt.ts';
import { BRIDGE_EDGE, BRIDGE_RIBBON_HALF, bridgeEdges, exitClock, sampleRoad, type AsphaltEdges } from './fork.ts';
import { besidePose, stripSeam } from './roadside.ts';

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

const EPS = 1e-6;
const cityWidth = laneLayoutOf(BIOMES[0]!).width;

// Мост — та же проезжая часть, что город: кромки, полосы и декор читают
// одну и ту же ширину, без добавочных девяти метров по каждой стороне.
assert(BRIDGE_RIBBON_HALF === cityWidth * 0.5, 'полуширина ленты моста равна полуширине города');
assert(BRIDGE_EDGE === cityWidth * 0.5, 'кромка моста стоит на кромке города');
const deck = asphaltSpan(bridgeEdges());
assert(
  Math.abs(deck.width - cityWidth) < EPS
    && Math.abs(deck.left + cityWidth * 0.5) < EPS
    && Math.abs(deck.right - cityWidth * 0.5) < EPS,
  'мост: живой асфальт ровно городской ширины и на той же оси',
);

const clock = exitClock();
const states = [-1, 0, 1] as const;
const sides = [-1, 1] as const;
const gaps = [0.8, 4.8, 12, 22];
const stations = [
  -80, -20, 0, 20,
  clock.choiceAt - 20, clock.choiceAt - 0.01, clock.choiceAt, clock.choiceAt + 0.01,
  clock.choiceAt + 40, clock.ownAfter - 0.01, clock.ownAfter, clock.ownAfter + 40,
];
const preChoice = new Map<string, number>();

for (const biome of BIOMES) {
  const half = laneLayoutOf(biome).width * 0.5;
  for (const chosen of states) {
    for (const d of stations) {
      const frame = sampleRoad({ forkDistance: d, half, chosen, baseOrigin: 0, endWeight: 1 }).local;
      const span = asphaltSpan(frame);
      for (const side of sides) {
        for (const gap of gaps) {
          const pose = besidePose({ edges: frame, origin: 0 }, { side, gap, inset: 0 });
          const clear = side < 0 ? span.left - pose.lateral : pose.lateral - span.right;
          assert(
            Number.isFinite(clear) && clear >= gap - EPS,
            `${biome.id}: choice=${chosen} d=${d} side=${side} gap=${gap}: декор на асфальте`,
          );
          // Выступ меша к дороге уже учтён в позе и не заходит на полотно.
          const withMesh = besidePose({ edges: frame, origin: 0 }, { side, gap, inset: 2 });
          const face = withMesh.lateral - side * 2;
          const faceClear = side < 0 ? span.left - face : face - span.right;
          assert(faceClear >= gap - EPS, `${biome.id}: выступ меша заходит на асфальт`);
          if (d <= 0) {
            const key = `${biome.id}|${d}|${side}|${gap}`;
            const at = preChoice.get(key);
            if (at === undefined) preChoice.set(key, pose.lateral);
            else assert(Math.abs(at - pose.lateral) < EPS, `${biome.id}: выбор до развилки не двигает декор на прямой`);
          }
        }
      }
    }

    for (const side of sides) {
      let prev: number | null = null;
      for (let d = -100; d <= clock.ownAfter + 60; d += 0.5) {
        const frame = sampleRoad({ forkDistance: d, half, chosen, baseOrigin: 0, endWeight: 1 }).local;
        const lat = besidePose({ edges: frame, origin: 0 }, { side, gap: 0.8, inset: 0 }).lateral;
        assert(Number.isFinite(lat), `${biome.id}: точка декора стала нечисловой`);
        if (prev !== null) {
          assert(Math.abs(lat - prev) < 2, `${biome.id}: декор дёрнулся на ${d} м (choice=${chosen})`);
          assert(!stripSeam(prev, lat, 6), `${biome.id}: кромка декора перескочила на другую ленту`);
        }
        prev = lat;
      }
    }
  }
}

/**
 * Пешеходная постановка из pedestrians.js: обещание то же, что у остального
 * декора, — встать снаружи каждой живой ленты полного каркаса. Раньше правая
 * сторона брала leftInner и при открытом клине оказывалась на ленте съезда.
 */
function sidewalkLateral(frame: AsphaltEdges, side: -1 | 1, gap: number): number {
  return besidePose({ edges: frame, origin: 0 }, { side, gap, inset: 0 }).lateral;
}

function liveStrips(frame: AsphaltEdges): { left: number; right: number }[] {
  const strips = [
    { left: frame.leftOuter, right: frame.leftInner },
    { left: frame.rightInner, right: frame.rightOuter },
  ];
  return strips.filter((strip) => strip.right - strip.left > 0.5);
}

for (const biome of BIOMES) {
  const half = laneLayoutOf(biome).width * 0.5;
  for (const chosen of states) {
    for (const side of sides) {
      let prev: number | null = null;
      for (let d = -40; d <= clock.ownAfter + 60; d += 0.5) {
        const frame = sampleRoad({ forkDistance: d, half, chosen, baseOrigin: 0, endWeight: 1 }).local;
        const lat = sidewalkLateral(frame, side, 2.8);
        for (const strip of liveStrips(frame)) {
          assert(
            lat <= strip.left - 1.1 || lat >= strip.right + 1.1,
            `${biome.id}: пешеход на ленте, choice=${chosen} d=${d} side=${side}`,
          );
        }
        if (prev !== null) {
          assert(Math.abs(lat - prev) < 2, `${biome.id}: пешеход дёрнулся на ${d} м (choice=${chosen})`);
        }
        prev = lat;
      }
    }
  }
}

(globalThis as { console?: { log: (message: string) => void } }).console?.log('decor contract ok');
