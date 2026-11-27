/**
 * Сеть курсов дороги.
 * Прямая — вектор с нулевым углом. Каждый съезд — отдельный вектор со своим
 * углом относительно родителя. Кэш держит сколько угодно таких векторов.
 * Биом только называет, какой вектор выбран. Считать путь он не должен.
 */

import { BRANCH_YAW, frameFromSpline, signedAngle, stepBranch, turnToward, yawRight } from './branch.ts';
import { courseLocal, exitCourseStart, exitRibbonMid, followsExit } from './fork.ts';
import type { AsphaltEdges, ExitClock } from './fork.ts';
import type { FrozenYaw, PathFrame, RoadEmbed } from './branch.ts';
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
    turnAt: nose + layout.choiceAt,
    ownsFrom: nose + layout.ownAfter,
  };
}

/** Открытые ответвления зоны, в которой лежит s. До носа список пуст. Съезд дорогой не становится. */
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

/** Один включённый вектор на маршруте. В список дороги игра его не кладёт: съезд остаётся ответвлением. */
export interface VectorSpawn {
  /** Ключ кэша. Один нос и один угол — один ключ. */
  key: string;
  nose: number;
  yaw: number;
  /** С этой метки вектор входит в переданный путь. Дорога сама его не подхватывает. */
  ownsFrom: number;
  /** Метры вправо от родителя, где съезд отрывается. Без числа путь начинается на оси. */
  born?: number;
  /** С какой метки вектор начинает поворот. По умолчанию нос.
   *  +1 полоса едет рядом с дорогой до выбора: поворот начинается только на отделении. */
  turnAt?: number;
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
  /** Векторы переданного пути. По nose по возрастанию. Съезд игры сюда не входит. */
  owned: readonly VectorSpawn[];
  /** Открытые ответвления этой зоны. Пусто, если нос ещё впереди. */
  branches: readonly VectorSpawn[];
  origin: number;
  turn: number;
  /** Путь уже ведёт эта точка, а не лента съезда. Игра держит это выключенным: съезд в дорогу не превращается. */
  ownedHere: boolean;
  /**
   * Между лентами есть живой клин. После конца рецепта он пустой, и курс
   * не должен сворачивать в него. По умолчанию клин есть — так работают чистые
   * геометрические проверки.
   */
  gore?: boolean;
  /**
   * Полосы ещё едут к ленте. `t` — тот же 0…1, что сдвигает laneAnchor.
   * Точка у оси едет этим t, а не перескакивает на курс съезда у кромки.
   * Нет поля — курс по-прежнему смотрит только на кромки.
   */
  hold?: LaneHold | null;
  /**
   * Центр правой ленты в мировом боковом метре на любом s. Когда он есть,
   * курс съезда идёт по тем же кромкам, что и асфальт, а не по вечному углу
   * ответвления. Без поля работают чистые геометрические проверки.
   */
  centerAt?: (s: number) => number;
}

/** Ось полос на закрытии прямой. Курс везёт её тем же t. */
export interface LaneHold {
  t: number;
  axis: number;
  half: number;
}

interface PathRecord {
  nose: number;
  yaw: number;
  born: number;
  samples: PathFrame[];
  frozen: FrozenYaw | null;
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

  function parentKey(spawns: readonly VectorSpawn[], s: number, beforeNose: number): string {
    for (let i = spawns.length - 1; i >= 0; i--) {
      const item = spawns[i];
      if (!item || !(item.nose < beforeNose)) continue;
      if (item.nose <= s && item.ownsFrom <= s) return item.key;
    }
    return 'spline';
  }

  function pathFrom(
    spawn: VectorSpawn,
    s: number,
    turn: number,
    baseAt: (s: number) => PathFrame,
    from: string,
  ): PathFrame {
    const start = Number.isFinite(spawn.turnAt) ? (spawn.turnAt as number) : spawn.nose;
    if (!(s > start)) return baseAt(s);
    const id = `${spawn.key}@${from}`;
    const born = Number.isFinite(spawn.born) ? (spawn.born ?? 0) : 0;
    let rec = cache.get(id);
    if (!rec || rec.nose !== start || rec.yaw !== spawn.yaw || rec.born !== born) {
      const origin = baseAt(start);
      rec = {
        nose: start,
        yaw: spawn.yaw,
        born,
        samples: [{
          ...origin,
          x: origin.x + origin.rx * born,
          z: origin.z + origin.rz * born,
        }],
        frozen: null,
      };
      cache.set(id, rec);
    }
    const need = Math.ceil((s - start) / STEP);
    while (rec.samples.length - 1 < need) advance(rec, turn, baseAt);
    const t = (s - start) / STEP;
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
    return pathFrom(spawn, s, turn, (u) => frame(spawns, u, spline, turn, nose), parentKey(spawns, nose, nose));
  }

  /**
   * Курс ленты по её фактическим кромкам. Съезд сначала отходит вправо,
   * а потом плавно садится на ось новой дороги: постоянный угол здесь
   * развёл бы камеру и байка с асфальтом.
   */
  function pathFromCenter(
    spawn: VectorSpawn,
    s: number,
    baseAt: (s: number) => PathFrame,
    centerAt: (s: number) => number,
  ): PathFrame {
    const base = baseAt(s);
    const offset = centerAt(s);
    const h = 0.75;
    const beforeS = Math.max(spawn.nose, s - h);
    const afterS = s + h;
    const before = centerAt(beforeS);
    const after = centerAt(afterS);
    const leftH = Math.max(0.001, s - beforeS);
    const rightH = Math.max(0.001, afterS - s);
    const slope = (after - before) / (leftH + rightH);
    const second = (after - before) / rightH - (offset - before) / leftH;
    const turned = yawRight(base, Math.atan(slope));
    return {
      x: base.x + base.rx * offset,
      z: base.z + base.rz * offset,
      fx: turned.fx,
      fz: turned.fz,
      rx: -turned.fz,
      rz: turned.fx,
      curvature: base.curvature + second / (2 * h * (1 + slope * slope)),
    };
  }

  interface Heading {
    y: number;
    origin: number;
    ribbon: number;
    width: number;
    rightInner: number;
    leftInner: number;
    leftOuter: number;
    ownedHere: boolean;
    gore: boolean;
    branched: boolean;
    peel: number;
    separated: number;
    parent: PathFrame;
    right: PathFrame | null;
    hold: LaneHold | null;
    centerAt?: (s: number) => number;
  }

  function heading(query: Omit<EmbedQuery, 'lat'>, spline: (s: number) => SplineSample): Heading {
    const { s, y, nose, edges, owned, branches, origin, turn, ownedHere } = query;
    const centerAt = query.centerAt;
    const gore = query.gore !== false;
    const givenHold = query.hold;
    const width = edges.rightOuter - edges.rightInner;
    const gap = edges.rightInner - edges.leftInner;
    const peelT = Math.max(0, Math.min(1, (s - nose) / Math.max(turn, 0.001)));
    const peel = peelT * peelT * (3 - 2 * peelT);
    const separated = width > 1 ? Math.max(0, Math.min(1, gap / 4)) : 0;
    const branchAt = (spawn: VectorSpawn | null): PathFrame | null => {
      if (!spawn || !(s > spawn.nose)) return null;
      return pathFrom(
        spawn,
        s,
        turn,
        (u) => frame(owned, u, spline, turn, spawn.nose),
        parentKey(owned, spawn.nose, spawn.nose),
      );
    };
    // Взятый въезд становится дорогой, но его асфальт уже пришёл на ось:
    // курс не должен продолжать поворачивать по старому углу ответвления.
    const ownedSpawn = owned.length > 0 ? owned[owned.length - 1] : null;
    const parent = centerAt && ownedSpawn
      ? pathFromCenter(ownedSpawn, s, (u) => frame(owned, u, spline, turn, ownedSpawn.nose), centerAt)
      : frame(owned, s, spline, turn);
    const rightSpawn = branches.find((item) => item.yaw > 0) ?? null;
    const right = rightSpawn
      ? centerAt
        ? pathFromCenter(rightSpawn, s, (u) => frame(owned, u, spline, turn, rightSpawn.nose), centerAt)
        : branchAt(rightSpawn)
      : null;
    return {
      y,
      origin,
      ribbon: exitRibbonMid(edges),
      width,
      rightInner: edges.rightInner,
      leftInner: edges.leftInner,
      leftOuter: edges.leftOuter,
      ownedHere,
      gore,
      branched: owned.length > 0,
      peel,
      separated,
      parent,
      right,
      hold: givenHold && Number.isFinite(givenHold.t) ? givenHold : null,
      centerAt,
    };
  }

  /**
   * От курса прямой к курсу ленты. Вес 0 — прямая, 1 — лента.
   * Съезд, чей курс смотрит назад к исходной дороге, байка туда не тащит.
   */
  function blendRibbon(head: Heading, frame: PathFrame, lat: number, weight: number): RoadEmbed {
    const w = Math.max(0, Math.min(1, weight));
    const from = onParent(head, lat);
    const angle = signedAngle(head.parent.fx, head.parent.fz, frame.fx, frame.fz);
    const legal = Math.abs(angle) <= Math.PI / 2;
    const along = courseLocal(lat, { kind: 'ribbon', ribbon: head.ribbon });
    const bx = legal ? frame.x + frame.rx * along : from.x;
    const bz = legal ? frame.z + frame.rz * along : from.z;
    const aimX = legal ? frame.fx : head.parent.fx;
    const aimZ = legal ? frame.fz : head.parent.fz;
    // Курс поворачивает ровно там, где лента отделяется. Пока +1 полоса
    // прижата, байк едет вдоль дороги, а не боком к своей будущей ветке.
    const hw = legal ? w : 0;
    const turned = turnToward(head.parent.fx, head.parent.fz, aimX, aimZ, hw);
    return {
      x: from.x + (bx - from.x) * w,
      y: head.y,
      z: from.z + (bz - from.z) * w,
      rx: -turned.fz,
      rz: turned.fx,
      fx: turned.fx,
      fz: turned.fz,
      curvature: head.parent.curvature + (frame.curvature - head.parent.curvature) * (legal ? hw : 0),
    };
  }

  function onParent(head: Heading, lat: number): { x: number; z: number } {
    const local = courseLocal(lat, head.branched ? { kind: 'owned', center: head.origin } : { kind: 'free' });
    return {
      x: head.parent.x + head.parent.rx * local,
      z: head.parent.z + head.parent.rz * local,
    };
  }

  /** Вся лента съезда на одном курсе. Кромки не разъезжаются по разным углам. */
  function ribbonPose(head: Heading, path: PathFrame, lat: number): RoadEmbed {
    const across = head.separated > 0.75 ? 1 : head.separated;
    return blendRibbon(head, path, lat, head.peel * across);
  }

  function place(head: Heading, lat: number): RoadEmbed {
    const hold = head.hold;
    const branch = head.right;
    if (hold && branch && head.width > 0.8) {
      const distAxis = Math.abs(lat - hold.axis);
      const distRibbon = Math.abs(lat - head.ribbon);
      if (distAxis <= hold.half && distAxis < distRibbon) {
        return blendRibbon(head, branch, lat, hold.t);
      }
    }
    const ribbonEdge = {
      leftOuter: head.leftOuter,
      leftInner: head.leftInner,
      rightInner: head.rightInner,
      rightOuter: head.rightInner + head.width,
    };
    const onRight = !head.ownedHere && head.right != null && followsExit(lat, ribbonEdge);
    if (onRight && head.right) return ribbonPose(head, head.right, lat);
    const gap = head.rightInner - head.leftInner;
    const open = Math.max(0, Math.min(1, head.width / 4));
    // После разделения клин пустой: камера не должна поворачивать в него,
    // даже если её боковая точка лежит между полными лентами.
    if (head.gore && !head.ownedHere && head.right && gap > 0.8 && open > 0 && lat > head.leftInner && lat < exitCourseStart(ribbonEdge)) {
      const u = (lat - head.leftInner) / gap;
      const main = onParent(head, head.leftInner);
      const exitEdge = ribbonPose(head, head.right, head.rightInner);
      const stay = onParent(head, lat);
      const chordX = main.x + (exitEdge.x - main.x) * u;
      const chordZ = main.z + (exitEdge.z - main.z) * u;
      const turned = turnToward(head.parent.fx, head.parent.fz, exitEdge.fx, exitEdge.fz, u * open);
      const nfx = turned.fx;
      const nfz = turned.fz;
      return {
        x: stay.x + (chordX - stay.x) * open,
        y: head.y,
        z: stay.z + (chordZ - stay.z) * open,
        rx: -nfz,
        rz: nfx,
        fx: nfx,
        fz: nfz,
        curvature: head.parent.curvature + (exitEdge.curvature - head.parent.curvature) * u * open,
      };
    }
    const stay = onParent(head, lat);
    const path = head.parent;
    return {
      x: stay.x,
      y: head.y,
      z: stay.z,
      rx: path.rx,
      rz: path.rz,
      fx: path.fx,
      fz: path.fz,
      curvature: path.curvature,
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
