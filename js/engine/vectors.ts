/**
 * Сеть курсов дороги.
 * Прямая — вектор с нулевым углом. Каждый съезд — отдельный вектор со своим
 * углом относительно родителя. Кэш держит сколько угодно таких векторов.
 * Биом только называет, какой вектор выбран. Считать путь он не должен.
 */

import { BRANCH_YAW, frameFromSpline, stepBranch } from './branch.ts';
import { courseLocal, exitRibbonMid } from './fork.ts';
import type { AsphaltEdges, ExitClock } from './fork.ts';
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

/** 0 — прямая. 1 — первое ответвление, 2 — следующее. Дробный номер сюда не входит. */
export type CoursePick = 0 | 1 | 2;

/** Выбор игрока. 0 и меньше — прямая, 1 — первое ответвление, 2 — следующее. */
export function courseVector(course: ForkCourse, pick: CoursePick): CourseVector {
  const index = Number.isFinite(pick) && pick > 0 ? Math.floor(pick) : 0;
  return course.vectors[index] ?? course.vectors[0] ?? STRAIGHT;
}

/** Ответвления курса, без прямой. */
export function branchVectors(course: ForkCourse): readonly CourseVector[] {
  return course.vectors.filter((vector) => vector.yaw !== 0);
}

/** Как зоны лежат на оси s. Длины съезда приходят из ExitClock, биом их не складывает. */
export interface CourseLayout {
  zoneLength: number;
  /** Нос развилки стоит на столько метров раньше конца зоны. */
  lead: number;
  /** Через столько метров после носа взятый вектор становится дорогой. */
  ownAfter: number;
  /** Сколько метров курс поворачивает. */
  turn: number;
  /** Конец общего подхода: здесь фиксируется выбор. */
  choiceAt: number;
  spread: number;
  offset: number;
}

/** Раскладка зоны из линейки съезда. Поля линейки копируются, а не задаются заново. */
export function courseLayoutOf(clock: ExitClock, zoneLength: number, offset: number): CourseLayout {
  return {
    zoneLength,
    lead: clock.lead,
    ownAfter: clock.ownAfter,
    turn: clock.turn,
    choiceAt: clock.choiceAt,
    spread: clock.spread,
    offset: Number.isFinite(offset) ? offset : 0,
  };
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
  pickAt: (zone: number) => CoursePick,
): VectorSpawn[] {
  const zone = zoneAt(s, layout);
  const list: VectorSpawn[] = [];
  for (let z = 0; z <= zone; z++) {
    const spawn = vectorSpawnOf(z, courseVector(course, pickAt(z)), layout);
    if (spawn && s >= spawn.ownsFrom) list.push(spawn);
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
export function courseOwns(course: ForkCourse, pick: CoursePick, s: number, nose: number, ownAfter: number): boolean {
  return courseVector(course, pick).yaw !== 0 && s >= nose + ownAfter;
}

/**
 * Какая проезжая часть в точке.
 * Лента съезда односторонняя. После того как она стала дорогой, она остаётся
 * односторонней до конца зоны и там вливается в двустороннюю дорогу биома.
 */
export function carriageWay(args: {
  course: ForkCourse;
  pick: CoursePick;
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
  /** Вторая производная сплайна. На ветке к ней добавляется собственный поворот. */
  ddx?: number;
}

/** Кромки ленты. Те же поля, что у сечения дороги. */
export type RibbonEdges = AsphaltEdges;

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

function splineFrame(sample: SplineSample, s: number): PathFrame {
  return frameFromSpline(sample.x, sample.dx, s, sample.ddx ?? 0);
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
      if (item.nose <= s && item.ownsFrom <= s) {
        spawn = item;
        break;
      }
    }
    if (!spawn) return splineFrame(spline(s), s);
    const nose = spawn.nose;
    return pathFrom(spawn, s, turn, (u) => frame(spawns, u, spline, turn, nose));
  }

  interface Heading {
    y: number;
    origin: number;
    ribbon: number;
    width: number;
    rightInner: number;
    leftOuter: number;
    ownedHere: boolean;
    branched: boolean;
    peel: number;
    separated: number;
    parent: PathFrame;
    right: PathFrame | null;
    left: PathFrame | null;
  }

  function heading(query: Omit<EmbedQuery, 'lat'>, spline: (s: number) => SplineSample): Heading {
    const { s, y, nose, edges, owned, branches, origin, turn, ownedHere } = query;
    const width = edges.rightOuter - edges.rightInner;
    const gap = edges.rightInner - edges.leftInner;
    const peelT = Math.max(0, Math.min(1, (s - nose) / Math.max(turn, 0.001)));
    const peel = peelT * peelT * (3 - 2 * peelT);
    const separated = Math.max(0, Math.min(1, gap / 4));
    const rightSpawn = branches.find((item) => item.yaw > 0) ?? null;
    const leftSpawn = branches.find((item) => item.yaw < 0) ?? null;
    const right = rightSpawn && s > rightSpawn.nose
      ? pathFrom(rightSpawn, s, turn, (u) => frame(owned, u, spline, turn, rightSpawn.nose))
      : null;
    const left = leftSpawn && s > leftSpawn.nose
      ? pathFrom(leftSpawn, s, turn, (u) => frame(owned, u, spline, turn, leftSpawn.nose))
      : null;
    const parent = frame(owned, s, spline, turn);
    return {
      y,
      origin,
      ribbon: exitRibbonMid(edges),
      width,
      rightInner: edges.rightInner,
      leftOuter: edges.leftOuter,
      ownedHere,
      branched: owned.length > 0,
      peel,
      separated,
      parent,
      right,
      left,
    };
  }

  function place(head: Heading, lat: number): RoadEmbed {
    const onRight = !head.ownedHere && head.width > 0.8 && lat >= head.rightInner - 0.2;
    const onLeft = !head.ownedHere && head.left && lat <= head.leftOuter + 0.2;
    const exitFrame = onRight ? head.right : onLeft ? head.left : null;
    if (exitFrame) {
      const outer = Math.max(0, Math.min(1, (lat - head.rightInner) / Math.max(head.width, 0.5)));
      const weight = head.peel * (head.separated > 0.75 ? 1 : Math.max(head.separated, onLeft ? 0 : outer));
      const fromCenter = courseLocal(lat, { kind: 'owned', center: head.origin });
      const sx = head.parent.x + head.parent.rx * fromCenter;
      const sz = head.parent.z + head.parent.rz * fromCenter;
      const along = courseLocal(lat, { kind: 'ribbon', ribbon: head.ribbon });
      const bx = exitFrame.x + exitFrame.rx * along;
      const bz = exitFrame.z + exitFrame.rz * along;
      const fx = head.parent.fx + (exitFrame.fx - head.parent.fx) * weight;
      const fz = head.parent.fz + (exitFrame.fz - head.parent.fz) * weight;
      const len = Math.hypot(fx, fz) || 1;
      const nfx = fx / len;
      const nfz = fz / len;
      return {
        x: sx + (bx - sx) * weight,
        y: head.y,
        z: sz + (bz - sz) * weight,
        rx: -nfz,
        rz: nfx,
        fx: nfx,
        fz: nfz,
        curvature: head.parent.curvature + (exitFrame.curvature - head.parent.curvature) * weight,
        branched: weight > 0.04,
      };
    }
    const local = courseLocal(lat, head.branched ? { kind: 'owned', center: head.origin } : { kind: 'free' });
    const path = head.parent;
    return {
      x: path.x + path.rx * local,
      y: head.y,
      z: path.z + path.rz * local,
      rx: path.rx,
      rz: path.rz,
      fx: path.fx,
      fz: path.fz,
      curvature: path.curvature,
      branched: head.branched,
    };
  }

  function embed(query: EmbedQuery, spline: (s: number) => SplineSample): RoadEmbed {
    return place(heading(query, spline), query.lat);
  }

  return {
    clear(): void {
      cache.clear();
    },
    frame,
    heading,
    place,
    embed,
  };
}

export type VectorField = ReturnType<typeof createVectorField>;
