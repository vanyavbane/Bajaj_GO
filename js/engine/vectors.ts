/**
 * Сеть курсов дороги.
 * Прямая — вектор с нулевым углом. Каждый съезд — отдельный вектор со своим
 * углом относительно родителя. Кэш держит сколько угодно таких векторов.
 * Биом только называет, какой вектор выбран. Считать путь он не должен.
 */

import { BRANCH_YAW, frameFromSpline, stepBranch } from './branch.ts';
import type { PathFrame, RoadEmbed } from './branch.ts';
import type { RoadWay } from './lanes.ts';

export type { PathFrame, RoadEmbed };
export { BRANCH_YAW };

/** Курс относительно родителя. Вправо угол положительный. */
export interface CourseVector {
  id: string;
  yaw: number;
  /** inherit — дорога биома. one-way — съезд, пока он не влился в двустороннюю. */
  way: RoadWay | 'inherit';
}

export const STRAIGHT: CourseVector = { id: 'straight', yaw: 0, way: 'inherit' };
export const EXIT_RIGHT: CourseVector = { id: 'exit', yaw: BRANCH_YAW, way: 'one-way' };
export const EXIT_LEFT: CourseVector = { id: 'exit-left', yaw: -BRANCH_YAW, way: 'one-way' };

/** Развилка: нулевой вектор — прямая, остальные — ответвления в порядке выбора. */
export interface ForkCourse {
  id: string;
  vectors: readonly CourseVector[];
}

/** То, что сейчас стоит в игре: прямо или съезд вправо. */
export const RIGHT_FORK: ForkCourse = {
  id: 'right-fork',
  vectors: [STRAIGHT, EXIT_RIGHT],
};

/** Выбор игрока. 0 и меньше — прямая, 1 — первое ответвление, 2 — следующее. */
export function courseVector(course: ForkCourse, pick: number): CourseVector {
  const index = Number.isFinite(pick) && pick > 0 ? Math.floor(pick) : 0;
  return course.vectors[index] ?? course.vectors[0] ?? STRAIGHT;
}

/** Ответвления курса, без прямой. */
export function branchVectors(course: ForkCourse): readonly CourseVector[] {
  return course.vectors.filter((vector) => vector.yaw !== 0);
}

/** Как зоны лежат на оси s. Биом подставляет свои длины, курс их не знает. */
export interface CourseLayout {
  zoneLength: number;
  /** Нос развилки стоит на столько метров раньше конца зоны. */
  lead: number;
  /** Через столько метров после носа взятый вектор становится дорогой. */
  ownAfter: number;
  offset: number;
}

export function zoneAt(s: number, layout: CourseLayout): number {
  const along = Math.max(0, layout.offset + (Number.isFinite(s) ? s : 0));
  if (!(layout.zoneLength > 0)) return 0;
  return Math.floor(along / layout.zoneLength);
}

export function zoneNose(zone: number, layout: CourseLayout): number {
  return (zone + 1) * layout.zoneLength - layout.lead - layout.offset;
}

/** Спавн вектора. Прямая с нулевым углом путь не ответвляет — её не возвращают. */
export function vectorSpawnOf(zone: number, vector: CourseVector, layout: CourseLayout): VectorSpawn | null {
  if (vector.yaw === 0) return null;
  const nose = zoneNose(zone, layout);
  return {
    key: `${zone}:${vector.id}`,
    nose,
    yaw: vector.yaw,
    ownsFrom: nose + layout.ownAfter,
  };
}

/** Уже взятые векторы, которые к метке s владеют дорогой. */
export function ownedCourse(
  course: ForkCourse,
  s: number,
  layout: CourseLayout,
  pickAt: (zone: number) => number,
): VectorSpawn[] {
  const zone = zoneAt(s, layout);
  const list: VectorSpawn[] = [];
  for (let z = 0; z <= zone; z++) {
    const spawn = vectorSpawnOf(z, courseVector(course, pickAt(z)), layout);
    if (spawn && s >= spawn.ownsFrom - 0.01) list.push(spawn);
  }
  return list;
}

/** Открытые ответвления зоны, в которой лежит s. До носа список пуст. */
export function openCourse(course: ForkCourse, s: number, layout: CourseLayout): VectorSpawn[] {
  const zone = zoneAt(s, layout);
  const nose = zoneNose(zone, layout);
  if (!(s > nose)) return [];
  const list: VectorSpawn[] = [];
  for (const vector of branchVectors(course)) {
    const spawn = vectorSpawnOf(zone, vector, layout);
    if (spawn) list.push(spawn);
  }
  return list;
}

/** Взятый ненулевой вектор этой зоны уже стал дорогой. */
export function courseOwns(course: ForkCourse, pick: number, s: number, nose: number, ownAfter: number): boolean {
  return courseVector(course, pick).yaw !== 0 && s >= nose + ownAfter - 0.01;
}

/**
 * Какая проезжая часть в точке.
 * Лента съезда односторонняя. После того как она стала дорогой, она остаётся
 * односторонней до конца зоны и там вливается в двустороннюю дорогу биома.
 */
export function carriageWay(args: {
  course: ForkCourse;
  pick: number;
  s: number;
  nose: number;
  ownAfter: number;
  zoneEnd: number;
  onRamp: boolean;
}): RoadWay {
  if (args.onRamp) return 'one-way';
  const vector = courseVector(args.course, args.pick);
  if (vector.way === 'one-way' && args.s >= args.nose + args.ownAfter && args.s < args.zoneEnd) {
    return 'one-way';
  }
  return 'two-way';
}

/** Один включённый вектор на маршруте. */
export interface VectorSpawn {
  /** Ключ кэша. Один нос и один угол — один ключ. */
  key: string;
  nose: number;
  yaw: number;
  /** С этой метки вектор уже является дорогой, а не только лентой. */
  ownsFrom: number;
}

export interface SplineSample {
  x: number;
  dx: number;
}

/** Кромки, которые нужны, чтобы понять, лежит ли точка на ленте съезда. */
export interface RibbonEdges {
  leftOuter: number;
  leftInner: number;
  rightInner: number;
  rightOuter: number;
}

export interface EmbedQuery {
  s: number;
  lat: number;
  y: number;
  nose: number;
  edges: RibbonEdges;
  /** Векторы, которые к этой метке уже стали дорогой. По nose по возрастанию. */
  owned: readonly VectorSpawn[];
  /** Открытые ответвления этой зоны. Пусто, если нос ещё впереди. */
  branches: readonly VectorSpawn[];
  origin: number;
  turn: number;
  /** Этот съезд уже стал дорогой. */
  ownedHere: boolean;
}

interface PathRecord {
  nose: number;
  yaw: number;
  samples: PathFrame[];
  frozen: { fx: number; fz: number } | null;
}

const STEP = 2;

/** Лента справа берёт вектор с положительным углом, слева — с отрицательным. */
function pickBranch(branches: readonly VectorSpawn[], edges: RibbonEdges, lat: number): VectorSpawn | null {
  const rightWidth = edges.rightOuter - edges.rightInner;
  if (rightWidth > 0.8 && lat >= edges.rightInner - 0.2) {
    return branches.find((item) => item.yaw > 0) ?? null;
  }
  const leftWidth = edges.leftInner - edges.leftOuter;
  if (leftWidth > 0.8 && lat <= edges.leftOuter + 0.2) {
    return branches.find((item) => item.yaw < 0) ?? null;
  }
  return null;
}

function splineFrame(sample: SplineSample, s: number): PathFrame {
  return frameFromSpline(sample.x, sample.dx, s);
}

/** Поле путей. Каждый вектор копится отдельно и не затирает остальные. */
export function createVectorField() {
  const cache = new Map<string, PathRecord>();

  function advance(rec: PathRecord, turn: number, baseAt: (s: number) => PathFrame): void {
    const prev = rec.samples[rec.samples.length - 1];
    if (!prev) return;
    const cursor = rec.nose + (rec.samples.length - 1) * STEP;
    const mid = cursor + STEP * 0.5;
    const stepped = stepBranch(prev, cursor, rec.nose, STEP, baseAt(mid), turn, rec.yaw, rec.frozen);
    rec.frozen = stepped.frozen;
    rec.samples.push(stepped.frame);
  }

  function pathFrom(
    spawn: VectorSpawn,
    s: number,
    turn: number,
    baseAt: (s: number) => PathFrame,
  ): PathFrame {
    if (!(s > spawn.nose)) return baseAt(s);
    let rec = cache.get(spawn.key);
    if (!rec || rec.nose !== spawn.nose || rec.yaw !== spawn.yaw) {
      rec = { nose: spawn.nose, yaw: spawn.yaw, samples: [baseAt(spawn.nose)], frozen: null };
      cache.set(spawn.key, rec);
    }
    const need = Math.ceil((s - spawn.nose) / STEP);
    while (rec.samples.length - 1 < need) advance(rec, turn, baseAt);
    const t = (s - spawn.nose) / STEP;
    const i0 = Math.max(0, Math.min(rec.samples.length - 1, Math.floor(t)));
    const i1 = Math.min(rec.samples.length - 1, i0 + 1);
    const u = Math.max(0, Math.min(1, t - i0));
    const a = rec.samples[i0];
    const b = rec.samples[i1] ?? a;
    if (!a || !b) return baseAt(s);
    const fx = a.fx + (b.fx - a.fx) * u;
    const fz = a.fz + (b.fz - a.fz) * u;
    const len = Math.hypot(fx, fz) || 1;
    const nfx = fx / len;
    const nfz = fz / len;
    return {
      x: a.x + (b.x - a.x) * u,
      z: a.z + (b.z - a.z) * u,
      fx: nfx,
      fz: nfz,
      rx: -nfz,
      rz: nfx,
      curvature: a.curvature + (b.curvature - a.curvature) * u,
    };
  }

  /** Кадр дороги. beforeNose отсекает сам вектор и всех, кто начался не раньше его. */
  function frame(
    spawns: readonly VectorSpawn[],
    s: number,
    spline: (s: number) => SplineSample,
    turn: number,
    beforeNose = Infinity,
  ): PathFrame {
    let spawn: VectorSpawn | null = null;
    for (let i = spawns.length - 1; i >= 0; i--) {
      const item = spawns[i];
      if (!item || !(item.nose < beforeNose)) continue;
      if (item.nose <= s && item.ownsFrom <= s + 0.01) {
        spawn = item;
        break;
      }
    }
    if (!spawn) return splineFrame(spline(s), s);
    const nose = spawn.nose;
    return pathFrom(spawn, s, turn, (u) => frame(spawns, u, spline, turn, nose));
  }

  function embed(query: EmbedQuery, spline: (s: number) => SplineSample): RoadEmbed {
    const { s, lat, y, nose, edges, owned, branches, origin, turn, ownedHere } = query;
    const exit = pickBranch(branches, edges, lat);
    const exitFrame = exit && s > exit.nose
      ? pathFrom(exit, s, turn, (u) => frame(owned, u, spline, turn, exit.nose))
      : null;
    const width = edges.rightOuter - edges.rightInner;
    const gap = edges.rightInner - edges.leftInner;
    const ribbon = (edges.rightInner + edges.rightOuter) * 0.5;
    if (exitFrame && exit && !ownedHere && width > 0.8 && lat >= edges.rightInner - 0.2) {
      const base = frame(owned, s, spline, turn, exit.nose);
      const peelT = Math.max(0, Math.min(1, (s - nose) / Math.max(turn, 0.001)));
      const peel = peelT * peelT * (3 - 2 * peelT);
      const separated = Math.max(0, Math.min(1, gap / 4));
      const outer = Math.max(0, Math.min(1, (lat - edges.rightInner) / Math.max(width, 0.5)));
      const weight = peel * Math.max(separated, outer);
      const sx = base.x + base.rx * lat;
      const sz = base.z + base.rz * lat;
      const bx = exitFrame.x + exitFrame.rx * (lat - ribbon);
      const bz = exitFrame.z + exitFrame.rz * (lat - ribbon);
      const fx = base.fx + (exitFrame.fx - base.fx) * weight;
      const fz = base.fz + (exitFrame.fz - base.fz) * weight;
      const len = Math.hypot(fx, fz) || 1;
      const nfx = fx / len;
      const nfz = fz / len;
      return {
        x: sx + (bx - sx) * weight,
        y,
        z: sz + (bz - sz) * weight,
        rx: -nfz,
        rz: nfx,
        fx: nfx,
        fz: nfz,
        curvature: base.curvature + (exitFrame.curvature - base.curvature) * weight,
        branched: weight > 0.04,
      };
    }
    const path = frame(owned, s, spline, turn);
    const branched = owned.length > 0;
    const local = branched ? lat - origin : lat;
    return {
      x: path.x + path.rx * local,
      y,
      z: path.z + path.rz * local,
      rx: path.rx,
      rz: path.rz,
      fx: path.fx,
      fz: path.fz,
      curvature: path.curvature,
      branched,
    };
  }

  return {
    clear(): void {
      cache.clear();
    },
    frame,
    embed,
  };
}

export type VectorField = ReturnType<typeof createVectorField>;
