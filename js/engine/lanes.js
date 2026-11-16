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

/** Индекс полосы внутри текущего конфига. Дробное и пустое значение прижимается к диапазону. */
export function clampLaneIndex(index, count) {
  const n = Math.round(Number(index));
  const raw = Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(count - 1, raw));
}
