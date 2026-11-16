/**
 * Полосы читаются только из конфига, который выставил биом.
 * Городские «4 полосы и 2 встречные» больше нигде не подставляются молча:
 * если конфига нет или он разошёлся сам с собой, игра падает сразу.
 *
 * @param {{
 *   laneCount?: number,
 *   oncomingCount?: number,
 *   LANE_OFFSETS?: number[],
 *   LANE_SPEEDS?: number[],
 *   START_LANE?: number
 * }} state
 */
export function readLanes(state) {
  const offsets = state && state.LANE_OFFSETS;
  const count = state && state.laneCount;
  const oncoming = state && state.oncomingCount;
  const speeds = state && state.LANE_SPEEDS;
  if (!Array.isArray(offsets) || !Number.isInteger(count) || count < 1 || offsets.length !== count) {
    throw new Error('Полосы дороги не заданы. Их выставляет applyLaneConfig в js/biome.js до остальной сцены.');
  }
  if (!Number.isInteger(oncoming) || oncoming < 0 || oncoming >= count) {
    throw new Error(`Встречных полос ${oncoming} при ${count} полосах. Проверь oncoming в BIOMES.`);
  }
  if (!Array.isArray(speeds) || speeds.length !== count || speeds.some((speed) => !Number.isFinite(speed))) {
    throw new Error('LANE_SPEEDS должен совпадать с числом полос текущего биома.');
  }
  const startLane = Number.isFinite(state.START_LANE) ? state.START_LANE : offsets[count - 1];
  return { count, oncoming, offsets, speeds, startLane };
}

/**
 * Штрихи между соседними полосами. Граница встречных и попутных сюда не входит:
 * её рисует жёлтая осевая. Смещения берутся из конфига, а не из «номер × ширина».
 */
export function laneDashOffsets(offsets, oncomingCount) {
  const marks = [];
  if (!offsets || offsets.length < 2) return marks;
  const split = oncomingCount | 0;
  for (let i = 0; i < offsets.length - 1; i++) {
    if (i + 1 === split) continue;
    marks.push((offsets[i] + offsets[i + 1]) * 0.5);
  }
  return marks;
}

/** Одна и та же полоса, даже если у соседних биомов разный номер. Шаг полос от 4.3 м. */
export function sameLaneOffset(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1.6;
}

/** Индекс полосы, чей центр ближе всего к смещению. Номер из другого биома не переносится. */
export function nearestLaneIndex(offsets, lateral) {
  let best = 0;
  let bestDist = Infinity;
  const target = Number.isFinite(lateral) ? lateral : 0;
  for (let i = 0; i < offsets.length; i++) {
    const dist = Math.abs(offsets[i] - target);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/** Индекс полосы внутри текущего конфига. Дробное и пустое значение прижимается к диапазону. */
export function clampLaneIndex(index, count) {
  const n = Math.round(Number(index));
  const raw = Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(count - 1, raw));
}
