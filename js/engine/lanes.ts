/**
 * Полосы читаются только из конфига, который выставил биом.
 * Городские «4 полосы и 2 встречные» больше нигде не подставляются молча:
 * если конфига нет или он разошёлся сам с собой, игра падает сразу.
 */

export interface LaneSource {
  laneCount?: number;
  oncomingCount?: number;
  LANE_OFFSETS?: number[];
  LANE_SPEEDS?: number[];
  START_LANE?: number;
}

/** Односторонняя — только попутные. Двусторонняя — есть встречные. */
export type RoadWay = 'one-way' | 'two-way';

/** На односторонней встречная полоса становится попутной. Смещения полос те же. */
export function carriageLanes<T extends { oncomingCount: number }>(lanes: T, way: RoadWay): T {
  if (way !== 'one-way' || lanes.oncomingCount === 0) return lanes;
  return { ...lanes, oncomingCount: 0 };
}

export interface LaneConfig {
  count: number;
  oncoming: number;
  offsets: number[];
  speeds: number[];
  startLane: number;
}

function finiteNumbers(values: readonly unknown[], count: number): number[] | null {
  if (values.length !== count) return null;
  const out: number[] = [];
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    out.push(value);
  }
  return out;
}

export function readLanes(state: LaneSource | null | undefined): LaneConfig {
  const offsets = state?.LANE_OFFSETS;
  const count = state?.laneCount;
  const oncoming = state?.oncomingCount;
  const speeds = state?.LANE_SPEEDS;
  const laneOffsets = Array.isArray(offsets) && typeof count === 'number' && Number.isInteger(count) && count >= 1
    ? finiteNumbers(offsets, count)
    : null;
  if (!laneOffsets || typeof count !== 'number') {
    throw new Error('Полосы дороги не заданы. Их выставляет applyLaneConfig в js/biome.js до остальной сцены.');
  }
  if (typeof oncoming !== 'number' || !Number.isInteger(oncoming) || oncoming < 0 || oncoming >= count) {
    throw new Error(`Встречных полос ${oncoming} при ${count} полосах. Проверь oncoming в BIOMES.`);
  }
  const laneSpeeds = Array.isArray(speeds) ? finiteNumbers(speeds, count) : null;
  if (!laneSpeeds) {
    throw new Error('LANE_SPEEDS должен совпадать с числом полос текущего биома.');
  }
  const start = state?.START_LANE;
  const fallback = laneOffsets[count - 1] ?? 0;
  const startLane = typeof start === 'number' && Number.isFinite(start) ? start : fallback;
  return { count, oncoming, offsets: laneOffsets, speeds: laneSpeeds, startLane };
}

/**
 * Штрихи между соседними полосами. Граница встречных и попутных сюда не входит:
 * её рисует жёлтая осевая. Смещения берутся из конфига, а не из «номер × ширина».
 */
export function laneDashOffsets(offsets: number[] | null | undefined, oncomingCount: number): number[] {
  const marks: number[] = [];
  if (!offsets || offsets.length < 2) return marks;
  const split = oncomingCount | 0;
  for (let i = 0; i < offsets.length - 1; i++) {
    if (i + 1 === split) continue;
    const left = offsets[i];
    const right = offsets[i + 1];
    if (typeof left !== 'number' || typeof right !== 'number') continue;
    if (!Number.isFinite(left) || !Number.isFinite(right)) continue;
    marks.push((left + right) * 0.5);
  }
  return marks;
}

/** Одна и та же полоса, даже если у соседних биомов разный номер. Шаг полос от 4.3 м. */
export function sameLaneOffset(a: number, b: number): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1.6;
}

/** Индекс полосы, чей центр ближе всего к смещению. Номер из другого биома не переносится. */
export function nearestLaneIndex(offsets: number[], lateral: number): number {
  let best = 0;
  let bestDist = Infinity;
  const target = Number.isFinite(lateral) ? lateral : 0;
  for (let i = 0; i < offsets.length; i++) {
    const offset = offsets[i];
    if (typeof offset !== 'number' || !Number.isFinite(offset)) continue;
    const dist = Math.abs(offset - target);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/** Индекс полосы внутри текущего конфига. Дробное и пустое значение прижимается к диапазону. */
export function clampLaneIndex(index: number, count: number): number {
  const n = Math.round(Number(index));
  const raw = Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(count - 1, raw));
}
