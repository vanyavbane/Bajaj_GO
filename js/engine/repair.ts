/** Чистая логика события «ремонт дороги»: отметки, площадка, пробка и попадание. */

export const REPAIR_MIN_DIST = 3500;
export const REPAIR_SPREAD = 500;
export const REPAIR_ALLOWED_BIOMES = ['city', 'mkad'] as const;

export type RepairBiome = (typeof REPAIR_ALLOWED_BIOMES)[number];

export interface RepairSiteInput {
  splitAt: (s: number) => number;
  allowedAt: (s: number) => boolean;
  structures: Array<{ s: number; visible?: boolean }>;
  ramps: Array<{ s: number }>;
  exits: Array<{ s: number }>;
  repairs: Array<{ s: number; active?: boolean }>;
}

export interface RepairQueueTarget {
  s: number;
  laneIdx: number;
}

/** Случайная отметка следующего события в окне 3500 ± 500 м. */
export function repairMark(roll = Math.random(), min = REPAIR_MIN_DIST, spread = REPAIR_SPREAD): number {
  const r = Math.max(0, Math.min(1, Number.isFinite(roll) ? roll : 0.5));
  return min + (r * 2 - 1) * spread;
}

/** Ремонт — только городская инфраструктура: город и МКАД. */
export function repairAllowed(biome: string): boolean {
  return (REPAIR_ALLOWED_BIOMES as readonly string[]).includes(biome);
}

/**
 * Площадка свободна, если рядом нет развилки, можно подъехать за 180 м,
 * и вперёд ещё нет моста, трамплина, съезда или другого ремонта.
 */
export function repairSiteClear(s: number, input: RepairSiteInput): boolean {
  if (!Number.isFinite(s)) return false;
  if (input.splitAt(s) > 0.05 || input.splitAt(s - 100) > 0.05 || input.splitAt(s + 100) > 0.05) return false;
  if (!input.allowedAt(s)) return false;
  for (const structure of input.structures) {
    if ((structure.visible ?? true) && structure.s > s - 180 && structure.s < s + 80) return false;
  }
  for (const ramp of input.ramps) {
    if (Math.abs(ramp.s - s) < 45) return false;
  }
  for (const exit of input.exits) {
    if (Math.abs(exit.s - s) < 55) return false;
  }
  for (const other of input.repairs) {
    if ((other.active ?? true) && Math.abs(other.s - s) < 120) return false;
  }
  return true;
}

/** Первая машина стоит в 4 м от края зоны, дальше — через 8 м. */
export function repairStopS(eventS: number, length: number, rank = 0): number {
  return eventS - length * 0.5 - 4 - Math.max(0, rank) * 8;
}

/** От 3 до 5 машин перед ограждением. */
export function repairQueueCount(roll = Math.random()): number {
  const r = Math.max(0, Math.min(1, Number.isFinite(roll) ? roll : 0.5));
  return 3 + Math.min(2, Math.floor(r * 3));
}

export function repairQueueTargets(eventS: number, length: number, laneIdx: number, count: number): RepairQueueTarget[] {
  const total = Math.max(0, Math.min(5, Math.floor(Number.isFinite(count) ? count : 0)));
  const targets: RepairQueueTarget[] = [];
  for (let rank = 0; rank < total; rank++) {
    targets.push({ s: repairStopS(eventS, length, rank), laneIdx });
  }
  return targets;
}

/** AABB зоны: метр запаса по ходу и полуширина байка поперёк. */
export function repairCollision(
  playerS: number,
  playerLat: number,
  siteS: number,
  siteLat: number,
  length: number,
  halfW: number,
): boolean {
  if (![playerS, playerLat, siteS, siteLat, length, halfW].every(Number.isFinite)) return false;
  return Math.abs(playerS - siteS) < length * 0.5 + 1 && Math.abs(playerLat - siteLat) < halfW;
}
