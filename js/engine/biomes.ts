/**
 * Каталог локаций. Имя — идентичность записи: полосы, волны дороги, земля,
 * небо и развилка лежат здесь. Порядок массива — только номер в сохранении
 * (текущий биом, счётчики посещений, план зон). Новую локацию добавляют
 * в конец, не в середину.
 */

import { cos, sin, type Wave } from './profile.ts';

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

/** Кто рисует локацию. `slots` — общий пул в biome.js, остальные — свой модуль. */
export const BIOME_DECORS = ['roadside', 'slots', 'forest', 'mountain', 'embankment'] as const;
export type BiomeDecor = (typeof BIOME_DECORS)[number];

export interface BiomeTraffic {
  count: number;
  pref: readonly TrafficModel[];
}

/** Волны плана и профиля. Из них profile.ts считает значение и обе производные. */
export interface BiomeRoad {
  x: readonly Wave[];
  y: readonly Wave[];
}

/** Зелёный указатель над дорогой. */
export interface BiomeSign {
  title: string;
  subtitle: string;
}

/** Сколько процедурных щитов собирает roadside.js. Индекс в `boards` меньше этого числа. */
export const PROCEDURAL_BOARDS = 9;

/** Множители неба поверх времени суток. Цвета — 0xRRGGBB. */
export interface BiomeSky {
  top: number;
  mid: number;
  bot: number;
  fog: number;
  cloud: number;
  fogMul: number;
  cloudY: number;
  cloudScale: number;
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
  /** Кто рисует обочину. Город и слоты не делят один модуль с лесом. */
  decor: BiomeDecor;
  /** Цвет земли, 0xRRGGBB. */
  ground: number;
  road: BiomeRoad;
  sky: BiomeSky;
  /** 2 — съезды МКАД с двумя стрелками, 1 — табличка локации. */
  signArrows: 1 | 2;
  signs: readonly BiomeSign[];
  /** Индексы процедурных щитов этой локации. */
  boards: readonly number[];
  /**
   * false — запись собрана, но в развилку не входит.
   * Так набережная остаётся в каталоге, пока берег не доделан.
   */
  route: boolean;
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

const ALL_BOARDS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

/** Город и МКАД делят один список съездов, чтобы щиты не разъехались. */
const RING_SIGNS: readonly BiomeSign[] = [
  { title: 'САДОВОД · 14 КМ', subtitle: 'МЕГА БЕЛАЯ ДАЧА' },
  { title: 'ТРК VEGAS · 24 КМ', subtitle: 'КАШИРСКОЕ ШОССЕ' },
  { title: 'КРОКУС СИТИ · 66 КМ', subtitle: 'ВОЛОКОЛАМСКОЕ Ш.' },
  { title: 'ЛОСИНЫЙ ОСТРОВ · 95 КМ', subtitle: 'ЯРОСЛАВСКОЕ ШОССЕ' },
  { title: 'ЩЁЛКОВСКОЕ Ш. · 104 КМ', subtitle: 'ЦЕНТР · БАЛАШИХА' },
  { title: 'ХИМКИ · 74 КМ', subtitle: 'ЛЕНИНГРАДСКОЕ ШОССЕ' },
];

function colorByte(value: number, id: string, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffff) {
    throw new Error(`Биом ${id}: ${label} должен быть цветом 0xRRGGBB`);
  }
}

function checkWaves(id: string, waves: readonly Wave[], axis: string): void {
  if (waves.length < 1) throw new Error(`Биом ${id}: у дороги нет волн по ${axis}`);
  for (const wave of waves) {
    if (wave.kind !== 'sin' && wave.kind !== 'cos') {
      throw new Error(`Биом ${id}: волна по ${axis} должна быть sin или cos`);
    }
    if (!Number.isFinite(wave.amp) || !Number.isFinite(wave.freq) || wave.freq === 0) {
      throw new Error(`Биом ${id}: амплитуда и частота волны по ${axis} должны быть конечными, частота не ноль`);
    }
  }
}

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
  decor: BiomeDecor;
  ground: number;
  road: BiomeRoad;
  sky: BiomeSky;
  signArrows: 1 | 2;
  signs: readonly BiomeSign[];
  boards: readonly number[];
  route?: boolean;
  traffic: BiomeTraffic;
}): BiomeDef {
  if (def.lanes < 1) throw new Error(`Биом ${def.id}: нужна хотя бы одна полоса`);
  if (!Number.isInteger(def.oncoming) || def.oncoming < 0 || def.oncoming >= def.lanes) {
    throw new Error(`Биом ${def.id}: встречных ${def.oncoming} при ${def.lanes} полосах`);
  }
  if (!(def.laneWidth > 0) || !(def.sceneryScale > 0)) {
    throw new Error(`Биом ${def.id}: ширина полосы и масштаб декора должны быть больше нуля`);
  }
  if (!(BIOME_DECORS as readonly string[]).includes(def.decor)) {
    throw new Error(`Биом ${def.id}: неизвестный декор ${def.decor}`);
  }
  if (def.traffic.count < 1 || def.traffic.pref.length < 1) {
    throw new Error(`Биом ${def.id}: трафик не задан`);
  }
  for (const speed of def.speeds) {
    if (!Number.isFinite(speed) || speed <= 0) {
      throw new Error(`Биом ${def.id}: скорость полосы должна быть конечным числом больше нуля`);
    }
  }
  colorByte(def.ground, def.id, 'цвет земли');
  colorByte(def.accent, def.id, 'акцент');
  checkWaves(def.id, def.road.x, 'x');
  checkWaves(def.id, def.road.y, 'y');
  const sky = def.sky;
  colorByte(sky.top, def.id, 'небо сверху');
  colorByte(sky.mid, def.id, 'небо середина');
  colorByte(sky.bot, def.id, 'небо снизу');
  colorByte(sky.fog, def.id, 'туман');
  colorByte(sky.cloud, def.id, 'облака');
  if (!(sky.fogMul > 0) || !(sky.cloudScale > 0) || !Number.isFinite(sky.cloudY)) {
    throw new Error(`Биом ${def.id}: дымка и масштаб облаков должны быть больше нуля`);
  }
  if (def.signArrows !== 1 && def.signArrows !== 2) {
    throw new Error(`Биом ${def.id}: у указателя одна или две стрелки`);
  }
  if (def.signs.length < 1 || def.boards.length < 1) {
    throw new Error(`Биом ${def.id}: нужны указатели и щиты`);
  }
  for (const sign of def.signs) {
    if (sign.title.trim() === '' || sign.subtitle.trim() === '') {
      throw new Error(`Биом ${def.id}: у указателя пустая строка`);
    }
  }
  for (const board of def.boards) {
    if (!Number.isInteger(board) || board < 0 || board >= PROCEDURAL_BOARDS) {
      throw new Error(`Биом ${def.id}: щит ${board} вне набора из ${PROCEDURAL_BOARDS}`);
    }
  }
  return { ...def, route: def.route !== false };
}

export const BIOMES: readonly BiomeDef[] = [
  defineBiome({
    id: 'city',
    name: 'ГОРОД',
    icon: 'buildings',
    sub: 'МНОГОЭТАЖКИ · ВЫВЕСКИ · ПЕШЕХОДЫ',
    short: 'Город',
    accent: 0x4fc3f7,
    lanes: 4,
    oncoming: 2,
    laneWidth: 4.75,
    speeds: [40, 60, 70, 55],
    sceneryScale: 1,
    decor: 'roadside',
    ground: 0x2a4d31,
    road: {
      x: [sin(34, 0.0042), cos(48, 0.0021)],
      y: [sin(1.65, 0.055), cos(1.15, 0.029)],
    },
    sky: { top: 0xffffff, mid: 0xffffff, bot: 0xffffff, fog: 0xf4f6fa, cloud: 0xffffff, fogMul: 1, cloudY: 0, cloudScale: 1 },
    signArrows: 2,
    signs: RING_SIGNS,
    boards: ALL_BOARDS,
    traffic: {
      count: 18,
      pref: ['sedan', 'taxi', 'hatchback', 'crossover', 'bus', 'qute_traffic', 'suv', 'gazelle_flatbed', 'gazelle_van', 'kamaz', 'truck'],
    },
  }),
  defineBiome({
    id: 'field',
    name: 'ПОЛЯ',
    icon: 'flower1',
    sub: 'ПШЕНИЦА · ВЕТРЯКИ · АМБАРЫ',
    short: 'Поля',
    accent: 0xffb300,
    lanes: 4,
    oncoming: 2,
    laneWidth: 4.75,
    speeds: [40, 55, 65, 55],
    sceneryScale: 1,
    decor: 'slots',
    ground: 0x6f6a36,
    road: {
      x: [sin(14, 0.0035), cos(7, 0.0014)],
      y: [sin(0.55, 0.0062), cos(0.35, 0.0031)],
    },
    sky: { top: 0xdce9ff, mid: 0xffeed0, bot: 0xfff3dd, fog: 0xf6e9d0, cloud: 0xfff6e4, fogMul: 0.78, cloudY: 5, cloudScale: 1.05 },
    signArrows: 1,
    signs: [{ title: 'ПОДМОСКОВНЫЕ ПОЛЯ', subtitle: 'ПШЕНИЦА · ВЕТРЯКИ · АМБАРЫ' }],
    boards: [2, 0, 8],
    traffic: {
      count: 12,
      pref: ['gazelle_flatbed', 'gazelle_van', 'kamaz', 'truck', 'bus', 'sedan', 'taxi', 'crossover', 'suv', 'hatchback', 'qute_traffic'],
    },
  }),
  defineBiome({
    id: 'forest',
    name: 'ЛЕС',
    icon: 'tree',
    sub: 'ЕЛИ · ВАЛУНЫ · ЛЕСНАЯ ДОРОГА',
    short: 'Лес',
    accent: 0x66bb6a,
    lanes: 4,
    oncoming: 2,
    laneWidth: 4.75,
    speeds: [35, 50, 60, 50],
    sceneryScale: 1,
    decor: 'forest',
    ground: 0x1e3d29,
    road: {
      x: [sin(18, 0.006), cos(10, 0.0027), sin(6, 0.0011)],
      y: [sin(1.2, 0.008), cos(0.7, 0.0042)],
    },
    sky: { top: 0xcfe1d2, mid: 0xd9e8d1, bot: 0xdde9d4, fog: 0xccdcc6, cloud: 0xdfe9da, fogMul: 1.3, cloudY: 2, cloudScale: 1.02 },
    signArrows: 1,
    signs: [{ title: 'ЛЕСНАЯ ДОРОГА', subtitle: 'ЕЛИ · ВАЛУНЫ · ПРОСЕКИ' }],
    boards: [2, 0],
    traffic: {
      count: 9,
      pref: ['sedan', 'hatchback', 'crossover', 'suv', 'taxi', 'qute_traffic', 'bus', 'gazelle_van', 'gazelle_flatbed', 'kamaz', 'truck'],
    },
  }),
  defineBiome({
    id: 'mountain',
    name: 'ГОРЫ',
    icon: 'geo-alt',
    sub: 'СЕРПАНТИН · СКАЛЫ · ПЕРЕВАЛ',
    short: 'Горы',
    accent: 0xb0bec5,
    lanes: 2,
    oncoming: 1,
    laneWidth: 4.6,
    speeds: [40, 55],
    sceneryScale: 2.15,
    decor: 'mountain',
    ground: 0x5a6066,
    road: {
      x: [sin(46, 0.028), sin(22, 0.013), cos(9, 0.0045)],
      y: [sin(30, 0.006), cos(14, 0.010), sin(6, 0.019)],
    },
    sky: { top: 0xc6daf4, mid: 0xdbe9f8, bot: 0xe6f0fa, fog: 0xd6e3f2, cloud: 0xeaf1fa, fogMul: 1.12, cloudY: -22, cloudScale: 1.16 },
    signArrows: 1,
    signs: [
      { title: 'ГОРНЫЙ СЕРПАНТИН', subtitle: 'ПЕРЕВАЛ · СМОТРОВАЯ ПЛОЩАДКА' },
      { title: 'ПЕРЕВАЛ', subtitle: 'ВНИМАНИЕ · КРУТЫЕ ПОВОРОТЫ' },
      { title: 'СМОТРОВАЯ ПЛОЩАДКА', subtitle: 'ОСТАНОВКА · ОТДЫХ · ВИД' },
    ],
    boards: [1, 2],
    traffic: {
      count: 10,
      pref: ['truck', 'kamaz', 'gazelle_flatbed', 'gazelle_van', 'bus', 'suv', 'crossover', 'sedan', 'hatchback', 'taxi', 'qute_traffic'],
    },
  }),
  defineBiome({
    id: 'mkad',
    name: 'МКАД',
    icon: 'signpost-split',
    sub: '8 ПОЛОС · ЭСТАКАДЫ · РАЗВЯЗКИ',
    short: 'МКАД',
    accent: 0xff7043,
    lanes: 8,
    oncoming: 4,
    laneWidth: 4.3,
    speeds: [50, 65, 75, 85, 85, 75, 65, 55],
    sceneryScale: 1.45,
    decor: 'slots',
    ground: 0x3a4048,
    road: {
      // МКАД: прямая магистраль, как поле — только шире и с другой декорацией.
      x: [sin(14, 0.0035), cos(7, 0.0014)],
      y: [sin(0.55, 0.0062), cos(0.35, 0.0031)],
    },
    sky: { top: 0xdfe6ee, mid: 0xf0e7dc, bot: 0xf6ece2, fog: 0xe4ded6, cloud: 0xf1eae1, fogMul: 1.06, cloudY: -2, cloudScale: 1.08 },
    signArrows: 2,
    signs: RING_SIGNS,
    boards: ALL_BOARDS,
    traffic: {
      count: 36,
      pref: ['sedan', 'crossover', 'suv', 'taxi', 'hatchback', 'bus', 'gazelle_van', 'kamaz', 'truck', 'gazelle_flatbed', 'qute_traffic'],
    },
  }),
  defineBiome({
    id: 'embankment',
    name: 'НАБЕРЕЖНАЯ',
    icon: 'water',
    sub: 'НЕВА · КЛАССИЦИЗМ · ПАРАПЕТ И ФОНАРИ',
    short: 'Набережная',
    accent: 0x7fb3d5,
    lanes: 4,
    oncoming: 2,
    laneWidth: 4.75,
    speeds: [40, 60, 70, 55],
    sceneryScale: 1,
    decor: 'embankment',
    ground: 0x5a6670,
    road: {
      x: [sin(18, 0.0032), cos(9, 0.0013)],
      y: [sin(0.5, 0.006), cos(0.3, 0.003)],
    },
    sky: { top: 0xd8ecff, mid: 0xeaf6ff, bot: 0xf4fbff, fog: 0xdceef8, cloud: 0xffffff, fogMul: 0.72, cloudY: 8, cloudScale: 1.04 },
    signArrows: 1,
    signs: [{ title: 'ДВОРЦОВАЯ НАБЕРЕЖНАЯ', subtitle: 'НЕВА · ПАРАПЕТ · ФОНАРИ' }],
    boards: [0, 2, 8],
    route: true,
    traffic: {
      count: 18,
      pref: ['sedan', 'taxi', 'hatchback', 'crossover', 'bus', 'qute_traffic', 'suv', 'gazelle_flatbed', 'gazelle_van', 'kamaz', 'truck'],
    },
  }),
];

/** Куда ведёт развилка: левый слот и правый. Свой биом в паре не стоит. */
export const BIOME_NEXT: Record<BiomeId, readonly [BiomeId, BiomeId]> = {
  city: ['mountain', 'mkad'],
  field: ['city', 'forest'],
  forest: ['field', 'mountain'],
  mountain: ['embankment', 'forest'],
  mkad: ['city', 'embankment'],
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
    for (const target of next) {
      const biome = BIOMES.find((item) => item.id === target);
      if (!biome?.route) throw new Error(`Переход из ${id} ведёт в ${target}, а эта локация не на маршруте`);
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

function clampVisit(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(2, Math.round(n)));
}

/**
 * Номер локации из сохранения.
 * Имя — текущая запись. Целое число — старый номер в каталоге.
 * Чужое имя и номер вне каталога не становятся локацией.
 */
export function storedBiomeIndex(value: unknown): number | null {
  if (typeof value === 'string' && !/^\d+$/.test(value)) {
    const index = BIOMES.findIndex((biome) => biome.id === value);
    return index >= 0 ? index : null;
  }
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < 0 || n >= BIOMES.length) return null;
  return n;
}

/** Счётчики посещений. Объект по имени — новая запись, массив — старые номера. */
export function storedVisits(value: unknown): number[] {
  const visits = BIOMES.map(() => 0);
  if (Array.isArray(value)) {
    for (let i = 0; i < visits.length; i++) visits[i] = clampVisit(value[i]);
    return visits;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (let i = 0; i < BIOMES.length; i++) visits[i] = clampVisit(record[BIOMES[i]!.id]);
  }
  return visits;
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
