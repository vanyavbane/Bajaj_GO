/**
 * Каталог локаций. Порядок записей — порядок сохранённых индексов:
 * текущий биом, счётчики посещений и план зон хранят номер в этом массиве.
 */

export const TRAFFIC_MODELS = [
  'sedan',
  'hatchback',
  'crossover',
  'taxi',
  'suv',
  'gazelle_flatbed',
  'gazelle_van',
  'kamaz',
  'truck',
  'bus',
  'qute_traffic',
] as const;

export type TrafficModel = (typeof TRAFFIC_MODELS)[number];

export type BiomeId = 'city' | 'field' | 'forest' | 'mountain' | 'mkad' | 'embankment';

export interface BiomeTraffic {
  count: number;
  pref: readonly TrafficModel[];
}

export interface BiomeDef {
  id: BiomeId;
  name: string;
  icon: string;
  sub: string;
  short: string;
  accent: number;
  lanes: number;
  oncoming: number;
  laneWidth: number;
  speeds: readonly number[];
  sceneryScale: number;
  traffic: BiomeTraffic;
}

/** Полосы одного биома. `count` — все полосы, `oncomingCount` — сколько из них встречные. */
export interface LaneLayout {
  id: BiomeId;
  count: number;
  oncomingCount: number;
  laneWidth: number;
  width: number;
  offsets: number[];
  speeds: number[];
  startLane: number;
}

/** Профиль дороги в одной точке s. */
export interface RoadSample {
  id: BiomeId;
  x: number;
  dx: number;
  ddx: number;
  y: number;
  dy: number;
  ddy: number;
}

const BIOME_IDS = ['city', 'field', 'forest', 'mountain', 'mkad', 'embankment'] as const satisfies readonly BiomeId[];

function defineBiome<const Speeds extends readonly number[]>(def: {
  id: BiomeId;
  name: string;
  icon: string;
  sub: string;
  short: string;
  accent: number;
  lanes: Speeds['length'];
  oncoming: number;
  laneWidth: number;
  speeds: Speeds;
  sceneryScale: number;
  traffic: BiomeTraffic;
}): BiomeDef {
  if (def.lanes < 1) throw new Error(`Биом ${def.id}: нужна хотя бы одна полоса`);
  if (!Number.isInteger(def.oncoming) || def.oncoming < 0 || def.oncoming >= def.lanes) {
    throw new Error(`Биом ${def.id}: встречных ${def.oncoming} при ${def.lanes} полосах`);
  }
  if (!(def.laneWidth > 0) || !(def.sceneryScale > 0)) {
    throw new Error(`Биом ${def.id}: ширина полосы и масштаб декора должны быть больше нуля`);
  }
  if (def.traffic.count < 1 || def.traffic.pref.length < 1) {
    throw new Error(`Биом ${def.id}: трафик не задан`);
  }
  for (const speed of def.speeds) {
    if (!Number.isFinite(speed) || speed <= 0) {
      throw new Error(`Биом ${def.id}: скорость полосы должна быть конечным числом больше нуля`);
    }
  }
  return def;
}

export const BIOMES: readonly BiomeDef[] = [
  defineBiome({
    id: 'city',
    name: 'ГОРОД',
    icon: '🏙️',
    sub: 'МНОГОЭТАЖКИ · ВЫВЕСКИ · ПЕШЕХОДЫ',
    short: 'Город',
    accent: 0x4fc3f7,
    lanes: 4,
    oncoming: 2,
    laneWidth: 4.75,
    speeds: [40, 60, 70, 55],
    sceneryScale: 1,
    traffic: {
      count: 18,
      pref: ['sedan', 'taxi', 'hatchback', 'crossover', 'bus', 'qute_traffic', 'suv', 'gazelle_flatbed', 'gazelle_van', 'kamaz', 'truck'],
    },
  }),
  defineBiome({
    id: 'field',
    name: 'ПОЛЯ',
    icon: '🌾',
    sub: 'ПШЕНИЦА · ВЕТРЯКИ · АМБАРЫ',
    short: 'Поля',
    accent: 0xffb300,
    lanes: 4,
    oncoming: 2,
    laneWidth: 4.75,
    speeds: [40, 55, 65, 55],
    sceneryScale: 1,
    traffic: {
      count: 12,
      pref: ['gazelle_flatbed', 'gazelle_van', 'kamaz', 'truck', 'bus', 'sedan', 'taxi', 'crossover', 'suv', 'hatchback', 'qute_traffic'],
    },
  }),
  defineBiome({
    id: 'forest',
    name: 'ЛЕС',
    icon: '🌲',
    sub: 'ЕЛИ · ВАЛУНЫ · ЛЕСНАЯ ДОРОГА',
    short: 'Лес',
    accent: 0x66bb6a,
    lanes: 4,
    oncoming: 2,
    laneWidth: 4.75,
    speeds: [35, 50, 60, 50],
    sceneryScale: 1,
    traffic: {
      count: 9,
      pref: ['sedan', 'hatchback', 'crossover', 'suv', 'taxi', 'qute_traffic', 'bus', 'gazelle_van', 'gazelle_flatbed', 'kamaz', 'truck'],
    },
  }),
  defineBiome({
    id: 'mountain',
    name: 'ГОРЫ',
    icon: '🏔️',
    sub: 'СЕРПАНТИН · СКАЛЫ · ПЕРЕВАЛ',
    short: 'Горы',
    accent: 0xb0bec5,
    lanes: 2,
    oncoming: 1,
    laneWidth: 4.6,
    speeds: [40, 55],
    sceneryScale: 2.15,
    traffic: {
      count: 10,
      pref: ['truck', 'kamaz', 'gazelle_flatbed', 'gazelle_van', 'bus', 'suv', 'crossover', 'sedan', 'hatchback', 'taxi', 'qute_traffic'],
    },
  }),
  defineBiome({
    id: 'mkad',
    name: 'МКАД',
    icon: '🛣️',
    sub: '8 ПОЛОС · ЭСТАКАДЫ · РАЗВЯЗКИ',
    short: 'МКАД',
    accent: 0xff7043,
    lanes: 8,
    oncoming: 4,
    laneWidth: 4.3,
    speeds: [50, 65, 75, 85, 85, 75, 65, 55],
    sceneryScale: 1.45,
    traffic: {
      count: 36,
      pref: ['sedan', 'crossover', 'suv', 'taxi', 'hatchback', 'bus', 'gazelle_van', 'kamaz', 'truck', 'gazelle_flatbed', 'qute_traffic'],
    },
  }),
  defineBiome({
    id: 'embankment',
    name: 'НАБЕРЕЖНАЯ',
    icon: '🌉',
    sub: 'НЕВА · КЛАССИЦИЗМ · ПАРАПЕТ И ФОНАРИ',
    short: 'Набережная',
    accent: 0x7fb3d5,
    lanes: 4,
    oncoming: 2,
    laneWidth: 4.75,
    speeds: [40, 60, 70, 55],
    sceneryScale: 1,
    traffic: {
      count: 18,
      pref: ['sedan', 'taxi', 'hatchback', 'crossover', 'bus', 'qute_traffic', 'suv', 'gazelle_flatbed', 'gazelle_van', 'kamaz', 'truck'],
    },
  }),
];

/** Куда ведёт развилка: левый слот и правый. Свой биом в паре не стоит. */
export const BIOME_NEXT: Record<BiomeId, readonly [BiomeId, BiomeId]> = {
  city: ['embankment', 'mkad'],
  field: ['city', 'forest'],
  forest: ['field', 'mountain'],
  mountain: ['city', 'forest'],
  mkad: ['city', 'field'],
  embankment: ['city', 'field'],
};

function assertCatalog(): void {
  const seen = new Set<string>();
  for (const biome of BIOMES) {
    if (seen.has(biome.id)) throw new Error(`Биом ${biome.id} записан дважды`);
    seen.add(biome.id);
  }
  for (const id of BIOME_IDS) {
    if (!seen.has(id)) throw new Error(`В каталоге нет биома ${id}`);
    const next = BIOME_NEXT[id];
    if (next[0] === next[1] || next[0] === id || next[1] === id) {
      throw new Error(`Переходы из ${id} должны вести в два других биома`);
    }
  }
}

assertCatalog();

export function isTrafficModel(type: string): type is TrafficModel {
  return (TRAFFIC_MODELS as readonly string[]).includes(type);
}

export function biomeIndexOf(id: BiomeId): number {
  const index = BIOMES.findIndex((biome) => biome.id === id);
  if (index < 0) throw new Error(`В каталоге нет биома ${id}`);
  return index;
}

/** Индексы пары развилки в том же порядке, что и BIOMES. */
export function transitionIndexes(): number[][] {
  return BIOMES.map((biome) => BIOME_NEXT[biome.id].map((id) => biomeIndexOf(id)));
}

/** Смещения полос от центра полотна. Крайняя попутная — старт байка. */
export function laneLayoutOf(biome: BiomeDef): LaneLayout {
  const offsets: number[] = [];
  const half = (biome.lanes - 1) * 0.5;
  for (let i = 0; i < biome.lanes; i++) offsets.push((i - half) * biome.laneWidth);
  const startLane = offsets[biome.lanes - 1] ?? 0;
  return {
    id: biome.id,
    count: biome.lanes,
    oncomingCount: biome.oncoming,
    laneWidth: biome.laneWidth,
    width: biome.lanes * biome.laneWidth,
    offsets,
    speeds: biome.speeds.slice(),
    startLane,
  };
}
