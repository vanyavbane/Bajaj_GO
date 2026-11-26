/**
 * Кромки съезда и езда по ним.
 * Форма съезда — рецепт блоков в blocks.ts. Полотно и откос — asphalt.ts.
 * Кромки считаются относительно центра новой дороги. Этот центр съезд не переносит.
 * Взятый въезд идёт в новую дорогу, старая сужается и сходит. Прямой ход уводит съезд в сторону.
 *
 * ChosenSide: -1 съезд закрыт, +1 въезд идёт в новую дорогу, 0 выбор ещё открыт.
 */

import { RIGHT_EXIT, compileExit, placedBlock, spanAt } from './blocks.ts';
import type { BuildChoice, PlacedBlock } from './blocks.ts';
import { smooth01 } from './profile.ts';

/** Длина зоны совпадает с js/biome.js; импорт оттуда создал бы цикл. */
const ZONE_M = 1500;

/**
 * Пролёт вантового моста внутри зоны биома, м.
 * Первые 350 м зоны — подход, последние 550 м — берег и развилка.
 */
export const BRIDGE_START_M = 350;
export const BRIDGE_END_M = 950;
/** Переход от обычной дороги к мосту и обратно. */
export const BRIDGE_FADE_M = 50;
/** Полуширина полотна моста: 4 полосы (2 встречные, 2 попутные) на одной ленте. */
export const BRIDGE_RIBBON_HALF = 9.5;
/** Внешняя кромка моста от оси. */
export const BRIDGE_EDGE = BRIDGE_RIBBON_HALF * 2;

/**
 * Кромки моста. Полотно сплошное: правой ленты съезда здесь нет.
 * Щель посредине была бы прочитана как съезд, и ось сиденья уехала
 * на 9.55 м влево — попутная полоса оказывалась встречной.
 */
export function bridgeEdges(): AsphaltEdges {
  const edge = BRIDGE_EDGE;
  return {
    leftOuter: -edge,
    leftInner: edge,
    rightInner: edge,
    rightOuter: edge,
  };
}

/** Вес моста в точке трассы: 0 на берегах, 1 внутри пролёта. */
export function bridgeWeightAtS(s: number): number {
  const local = s % ZONE_M;
  if (local <= BRIDGE_START_M - BRIDGE_FADE_M || local >= BRIDGE_END_M + BRIDGE_FADE_M) return 0;
  if (local <= BRIDGE_START_M) return (local - (BRIDGE_START_M - BRIDGE_FADE_M)) / BRIDGE_FADE_M;
  if (local >= BRIDGE_END_M) return (BRIDGE_END_M + BRIDGE_FADE_M - local) / BRIDGE_FADE_M;
  return 1;
}

/** Смещения четырёх полос моста: две встречные слева, две попутные справа. */
export function bridgeLaneOffsets(): number[] {
  const laneWidth = 4.75;
  const offsets: number[] = [];
  for (const center of [-laneWidth, laneWidth]) {
    for (let lane = 0; lane < 2; lane++) offsets.push(center + (lane - 0.5) * laneWidth);
  }
  return offsets;
}

export type { PlacedBlock };

const EXIT_PLAN = compileExit(RIGHT_EXIT);

/** -1 съезд не взят, +1 взят, 0 пока развилка открыта. То же значение, что BuildChoice. */
export type ChosenSide = BuildChoice;

/**
 * Слот на баннере развилки. 0 — левый вариант пары, 1 — правый.
 * Это индекс выбора, не метры. 0 — ехать прямо, 1 — съезд.
 */
export type BranchPick = 0 | 1;

/**
 * Выбор на баннере. -1 — развилка ещё не зафиксирована, 0 и 1 — слоты.
 * Ноль здесь — прямой ход, а не «ось по центру».
 */
export type SplitPick = -1 | BranchPick;

export function branchPick(value: number): BranchPick {
  return value === 1 ? 1 : 0;
}

export function splitPick(value: number): SplitPick {
  if (value === 1) return 1;
  if (value === 0) return 0;
  return -1;
}

/** Кромки двух лент, метры от оси. Слева числа отрицательные. */
export interface AsphaltEdges {
  leftOuter: number;
  leftInner: number;
  rightInner: number;
  rightOuter: number;
}


export interface RoadLimits {
  min: number;
  max: number;
}

/** Метры блока, за которые съезд отходит от прямой дороги и открывает клин. */
export const EXIT_DIVERGE = EXIT_PLAN.diverge;
/** Блок, где ветки уже разделены. Здесь игрок выбирает, что строить дальше. */
export const EXIT_RUN = EXIT_PLAN.run;
/** Нос съезда стоит на столько метров раньше границы зоны. */
export const FORK_LEAD = EXIT_PLAN.length;
export const FORK_SPREAD = EXIT_PLAN.spread;
/** Полуширина съезда: одна полоса в одну сторону. */
export const EXIT_LANE_HALF = 4.5;

/** Линейка съезда для курса. Курс не складывает длины блоков сам. */
export interface ExitClock {
  /** Нос стоит на столько метров раньше конца зоны. */
  lead: number;
  /** Сколько метров курс поворачивает. Это блок отхода. */
  turn: number;
  /** С этой метки после носа въезд уже стал новой дорогой. Конец закрытия. */
  ownAfter: number;
  /** Конец общего подхода: здесь фиксируется выбор. */
  choiceAt: number;
  spread: number;
}

/** Метры рецепта. Курс по ним знает, когда въезд уже пришёл в новую дорогу. */
export function exitClock(): ExitClock {
  const seal = EXIT_PLAN.exit.find((span) => span.kind === 'seal');
  if (!seal) throw new Error('Съезд без закрытия: курс не знает, когда въезд приходит в новую дорогу');
  return {
    lead: EXIT_PLAN.length,
    // Курс поворачивает на отделении, а не на подходе: +1 полоса едет
    // параллельно дороге до выбора, и только в seal уходит в свою сторону.
    turn: seal.length,
    ownAfter: seal.start + seal.length,
    choiceAt: EXIT_PLAN.choiceAt,
    spread: EXIT_PLAN.spread,
  };
}

/** Нахлёст половин асфальта, чтобы на прямой не было щели по оси. */
const FORK_SEAM = 0.16;

/** Метры до центра развилки текущей зоны. Отрицательные — ещё не доехали. */
export function forkOffset(meters: number, zoneLength: number, lead = FORK_LEAD): number {
  const m = Number.isFinite(meters) ? meters : 0;
  const length = Number.isFinite(zoneLength) && zoneLength > 0 ? zoneLength : 0;
  if (length === 0) return 0;
  const shift = Number.isFinite(lead) ? lead : FORK_LEAD;
  const zone = Math.floor(m / length);
  const splitM = (zone + 1) * length - shift;
  return m - splitM;
}

/**
 * Насколько рецепт держит съезд открытым, метры.
 * От носа растёт до пика и держится до конца рецепта.
 * Сужение старой дороги и ход въезда читают кромки кадра, не эта кривая.
 */
export function forkSpreadAt(
  meters: number,
  zoneLength: number,
  lead = FORK_LEAD,
  peak = FORK_SPREAD,
): number {
  const phase = exitPhase(forkOffset(meters, zoneLength, lead));
  if (phase.kind === 'none' || !(peak > 0)) return 0;
  return phase.open * peak;
}

/**
 * Занятость развилки для барьера, трамплинов и сервиса.
 * До выбора хвост ещё рисует обе ленты. После выбора блок settle — уже одна дорога,
 * поэтому флаг гаснет там, а не скачком на границе зоны.
 */
export function liveForkAmount(amount: number, phase: ExitKind, chosen: ChosenSide): number {
  const raw = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  if (chosen !== 0 && (phase === 'settle' || phase === 'none')) return 0;
  return raw;
}

/**
 * Занятость с учётом кромок.
 * Взятый въезд гасит развилку по мере прихода ленты к новой дороге.
 * Уход старой кромки в сторону эту занятость не держит.
 */
export function forkOccupancy(
  amount: number,
  phase: ExitKind,
  chosen: ChosenSide,
  edges: AsphaltEdges,
  close = 0,
): number {
  const raw = liveForkAmount(amount, phase, chosen);
  if (chosen !== 1 || phase !== 'end') return raw;
  if (!(exitWidth(edges) > 1)) return 0;
  const left = Math.max(0, Math.min(1, close));
  return raw * (1 - left);
}

/** -1 слева, включая ровно ноль. */
export function forkSide(lateralOffset: number): -1 | 1 {
  return lateralOffset <= 0 ? -1 : 1;
}

/** Участок жизни съезда. `t` — 0…1 внутри этой фазы. */
export type ExitKind = 'none' | 'diverge' | 'run' | 'end' | 'settle';

export interface ExitPhase {
  kind: ExitKind;
  t: number;
  /** 0…1, насколько лента съезда открыта. Метры получаются умножением на разъезд. */
  open: number;
}

/** 0 на кромке дороги, полный разъезд к концу отхода. */
function splitSpread(u: number): number {
  return FORK_SPREAD * smooth01(u);
}

/** Фаза по блоку под этой меткой. До носа и после последнего блока съезда нет. */
function exitPhase(d: number): ExitPhase {
  const span = spanAt(EXIT_PLAN, d);
  if (!span) return { kind: 'none', t: 0, open: 0 };
  if (span.kind === 'split') return { kind: 'diverge', t: span.u, open: splitSpread(span.u) / FORK_SPREAD };
  if (span.kind === 'fork') return { kind: 'run', t: 1, open: 1 };
  if (span.kind === 'seal') return { kind: 'end', t: smooth01(span.u), open: 1 };
  return { kind: 'settle', t: smooth01(span.u), open: 1 };
}

/** Дорога ширины `half` с центром `center`. Правой ленты нет. */
function roadAt(center: number, half: number): AsphaltEdges {
  return {
    leftOuter: center - half,
    leftInner: center + half,
    rightInner: center + half,
    rightOuter: center + half,
  };
}

/** Середина съезда, когда он уже отошёл на полный разъезд. */
function entranceHome(road: number): number {
  return exitRibbonMid(branchEdges(road, FORK_SPREAD));
}

/**
 * Взятый въезд за закрытие.
 * Старая дорога сужается на месте. Въезд остаётся лентой на своей линии до конца закрытия:
 * путь подхватывает её в тот же метр, и полотно не рвётся.
 */
function takenEntrance(road: number, arrive: number, t: number): AsphaltEdges {
  // Старт — та же прижатая +1 полоса, что была на подходе. К концу закрытия
  // она приходит на линию курса, а старая дорога сходит на нет.
  const fromMid = road + EXIT_LANE_HALF;
  const home = entranceHome(road);
  const fromHalf = EXIT_LANE_HALF;
  const dest = Math.max(0, Number.isFinite(arrive) ? arrive : fromHalf);
  const u = Math.max(0, Math.min(1, t));
  const oldHalf = road * (1 - u);
  const entranceHalf = fromHalf + (dest - fromHalf) * u;
  const mid = fromMid + (home - fromMid) * u;
  return {
    leftOuter: -oldHalf,
    leftInner: oldHalf,
    rightInner: mid - entranceHalf,
    rightOuter: mid + entranceHalf,
  };
}

/** Кромки поставленного блока. Непостроенный хвост остаётся развилкой, его ещё не закрывают. */
function blockEdges(half: number, block: PlacedBlock | null, chosen: ChosenSide, endWeight: number, arrive: number): AsphaltEdges {
  const road = Math.max(0, Number.isFinite(half) ? half : 0);
  const dest = Math.max(0, Number.isFinite(arrive) ? arrive : EXIT_LANE_HALF);
  if (!block) return branchEdges(road, 0);
  if (!block.built) return branchEdges(road, FORK_SPREAD);
  if (block.kind === 'split') return attachedEdges(road, smooth01(block.u));
  if (block.kind === 'fork') return attachedEdges(road, 1);
  if (block.kind === 'seal') {
    const t = smooth01(block.u) * Math.max(0, Math.min(1, endWeight));
    if (chosen === 1) return takenEntrance(road, dest, t);
    const edge = attachedEdges(road, 1);
    // Невыбранная ветка уходит в сторону и исчезает, не схлопываясь к выбранной.
    if (chosen === -1) {
      const away = t * FORK_SPREAD * 1.5;
      const w = exitWidth(edge) * (1 - t);
      const mid = exitRibbonMid(edge) + away;
      edge.rightInner = mid - w * 0.5;
      edge.rightOuter = mid + w * 0.5;
    }
    return edge;
  }
  // Въезд уже стал новой дорогой. За запас она садится на центр пути.
  // Прямой ход оставляет старую.
  if (chosen === 1) return roadAt(entranceHome(road) * (1 - smooth01(block.u)), dest);
  return branchEdges(road, 0);
}

/**
 * +1 полоса на подходе: плотно прижата к правой кромке.
 * В носу её ещё нет, на блоке split она плавно набирает полную ширину.
 * Пока выбор открыт, она едет параллельно основной и больше не растёт.
 * Отделяется только после выбора, блоком seal.
 */
function attachedEdges(road: number, open = 1): AsphaltEdges {
  const grow = Math.max(0, Math.min(1, Number.isFinite(open) ? open : 1));
  const exitHalf = EXIT_LANE_HALF * grow;
  return {
    leftOuter: -road,
    leftInner: road,
    rightInner: road,
    rightOuter: road + exitHalf * 2,
  };
}

/** Середина правой ленты. Одна формула и для полос, и для курса. */
export function exitRibbonMid(edges: AsphaltEdges): number {
  return (edges.rightInner + edges.rightOuter) * 0.5;
}

/** Один кадр дороги: локальные кромки, мировой центр и те же кромки в мире. */
export interface RoadFrame {
  origin: number;
  local: AsphaltEdges;
  world: AsphaltEdges;
  phase: ExitPhase;
  chosen: ChosenSide;
  /** Блок рецепта в этой точке. null — съезда здесь нет. */
  block: PlacedBlock | null;
}

export interface RoadQuery {
  forkDistance: number;
  half: number;
  chosen: ChosenSide;
  /** Центр новой дороги. Съезд его не переносит. */
  baseOrigin: number;
  endWeight?: number;
  /** Полуширина дороги, в которую приходит въезд. Без числа это ширина самого съезда. */
  arriveHalf?: number;
}

function finiteOrigin(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function translateEdges(edges: AsphaltEdges, origin: number): AsphaltEdges {
  if (origin === 0) return edges;
  return {
    leftOuter: edges.leftOuter + origin,
    leftInner: edges.leftInner + origin,
    rightInner: edges.rightInner + origin,
    rightOuter: edges.rightOuter + origin,
  };
}

/** Единственная сборка дороги в точке. Кромки берёт поставленный блок. */
export function sampleRoad(query: RoadQuery): RoadFrame {
  const chosen = query.chosen;
  const givenWeight = query.endWeight;
  const endWeight = typeof givenWeight === 'number' && Number.isFinite(givenWeight)
    ? Math.max(0, Math.min(1, givenWeight))
    : 1;
  const block = placedBlock(EXIT_PLAN, query.forkDistance, chosen);
  const phase = exitPhase(query.forkDistance);
  const weighted: ExitPhase = phase.kind === 'end' && chosen !== 0
    ? { ...phase, t: phase.t * endWeight }
    : phase;
  const origin = finiteOrigin(query.baseOrigin);
  const arrive = typeof query.arriveHalf === 'number' ? query.arriveHalf : EXIT_LANE_HALF;
  const local = blockEdges(query.half, block, chosen, endWeight, arrive);
  return {
    origin,
    local,
    world: translateEdges(local, origin),
    phase: weighted,
    chosen,
    block,
  };
}

/** Центр курса. После захвата его вычитают и полосы, и заголовок. */
export function roadCenter(frame: RoadFrame): number {
  return frame.origin;
}

/** Откуда вычитать боковой метр. Середину ленты и центр дороги нельзя перепутать. */
export type CoursePlace =
  | { kind: 'ribbon'; ribbon: number }
  | { kind: 'owned'; center: number }
  | { kind: 'free' };

/**
 * Боковой метр на курсе.
 * На открытой ленте вычитается её середина. После захвата — roadCenter.
 * На стыке это одно число, поэтому смена ширины не разводит ряд и полотно.
 */
export function courseLocal(lat: number, place: CoursePlace): number {
  if (place.kind === 'ribbon') return lat - place.ribbon;
  if (place.kind === 'owned') return lat - place.center;
  return lat;
}

/**
 * Обочина от кромки своей дороги.
 * Точка в клине через курс клина не проводится: шаг идёт поперёк курса кромки.
 */
export function besidePoint(
  pose: { x: number; z: number; rx: number; rz: number },
  edge: number,
  lat: number,
): { x: number; z: number } {
  const from = Number.isFinite(edge) ? edge : 0;
  const to = Number.isFinite(lat) ? lat : from;
  const shift = to - from;
  return { x: pose.x + pose.rx * shift, z: pose.z + pose.rz * shift };
}

/** Середина левого слота относительно центра кадра. На приходе это середина новой дороги. */
export function mainCenter(edges: AsphaltEdges): number {
  return (edges.leftOuter + edges.leftInner) * 0.5;
}

/** Полуширина левого слота. */
export function mainHalf(edges: AsphaltEdges): number {
  return Math.max(0, edges.leftInner - edges.leftOuter) * 0.5;
}

/** Ось полос. Съезд — смещение от неё, не вторая ось. */
export function laneAnchor(frame: RoadFrame): number {
  return frame.origin + mainCenter(frame.local);
}

function exitGap(edges: AsphaltEdges): number {
  return edges.rightInner - edges.leftInner;
}

/**
 * Одно полотно с шоссе: руль доходит до внешней кромки, на съезд ещё можно перестроиться.
 * Картинка этой кромки и есть край дороги. После щели это уже две дороги.
 */
export function roadsJoined(edges: AsphaltEdges): boolean {
  return exitWidth(edges) > RIDEABLE && exitGap(edges) < ATTACHED_GAP;
}

export function exitWidth(edges: AsphaltEdges): number {
  return Math.max(0, edges.rightOuter - edges.rightInner);
}

/** Центр ленты съезда в тех же метрах, что и кромки. null, если съезда нет. */
export function exitRibbonCenter(edges: AsphaltEdges): number | null {
  if (exitWidth(edges) < 1) return null;
  return exitRibbonMid(edges);
}

export const RIBBON_MARGIN = 0.7;

/** Полоса на левой дороге. Мир за её кромкой садится на край, от центра этой дороги. */
export function landOnCarriage(origin: number, edges: AsphaltEdges, world: number, span: number): number {
  const scale = Number.isFinite(span) && span !== 0 ? span : 1;
  const base = Number.isFinite(origin) ? origin : 0;
  const axis = base + mainCenter(edges);
  const right = base + edges.leftInner - RIBBON_MARGIN;
  const left = base + edges.leftOuter + RIBBON_MARGIN;
  const at = Number.isFinite(world) ? world : axis;
  return (Math.min(Math.max(at, left), right) - axis) / scale;
}

/** Точка снаружи кромки. Сторона берётся от центра дороги, не от нуля маршрута. */
export function outwardFrom(edge: number, origin: number, gap: number): number {
  if (!Number.isFinite(edge)) return Number.isFinite(origin) ? origin : 0;
  const center = Number.isFinite(origin) ? origin : 0;
  const outward = edge < center ? -1 : 1;
  const clearance = Number.isFinite(gap) ? Math.max(0, gap) : 0;
  return edge + outward * clearance;
}


const RELEASE_INSET = 2.6;
/** Щель уже видна: ленты больше не одно полотно, через неё не перестраиваются. */
const ATTACHED_GAP = 0.4;
const RIDEABLE = 2.4;
/** Насколько раньше внутренней кромки точка уже считается лентой. Одна цифра и для сиденья, и для курса. */
const RIBBON_ENTER = 0.35;

/** Где начинается курс съезда: чуть раньше внутренней кромки. */
export function exitCourseStart(edges: AsphaltEdges): number {
  return edges.rightInner - RIBBON_ENTER;
}

/**
 * Курс съезда. Лента должна быть достаточно широкой, чтобы по ней ехали.
 * Справа от асфальта курс тот же: обочина едет вместе с лентой.
 */
export function followsExit(lateral: number, edges: AsphaltEdges): boolean {
  if (!(exitWidth(edges) > RIDEABLE) || !Number.isFinite(lateral)) return false;
  return lateral >= exitCourseStart(edges);
}

/** Точка уже на асфальте съезда, даже если клин между лентами уже открыт. */
export function onExitRibbon(logical: number, edges: AsphaltEdges): boolean {
  if (!followsExit(logical, edges)) return false;
  return logical <= edges.rightOuter + RIBBON_ENTER;
}

/** Насколько нужно уйти правее кромки прямой, чтобы это уже был ход на съезд. */
const EXIT_INTENT = 1.6;

/**
 * Байк выбрал съезд корпусом: он на ленте или уже правее прямой.
 * Касание кромки ещё не считается.
 */
export function reachedExit(lateral: number, edges: AsphaltEdges): boolean {
  if (!(exitWidth(edges) > RIDEABLE) || !Number.isFinite(lateral)) return false;
  return onExitRibbon(lateral, edges) || lateral > edges.leftInner + EXIT_INTENT;
}

/** Довоз до ленты, м/с. У самой кромки он спадает, чтобы не пронести байк на ту сторону. */
const EXIT_PULL = 16;
const EXIT_PULL_EASE = 8;

/**
 * Скорость к ленте, м/с. Только в клине, когда байк уже ушёл с прямой и ещё не на асфальте.
 * На самой ленте и на прямой догонять нечего.
 * Последние метры до кромки скорость падает до нуля.
 */
export function exitEntryPull(lateral: number, edges: AsphaltEdges): number {
  if (exitGap(edges) >= ATTACHED_GAP) return 0;
  if (!reachedExit(lateral, edges) || onExitRibbon(lateral, edges)) return 0;
  const gap = edges.rightInner - lateral;
  if (!(gap > 0)) return 0;
  if (gap >= EXIT_PULL_EASE) return EXIT_PULL;
  return EXIT_PULL * (gap / EXIT_PULL_EASE);
}

/** Пока клин не открылся, уход влево отпускает съезд. */
export function canReleaseExit(logical: number, edges: AsphaltEdges): boolean {
  return exitGap(edges) < ATTACHED_GAP && logical < edges.rightInner - RELEASE_INSET;
}

/**
 * Прямая дорога на оси и съезд справа.
 * Пока разъезд меньше ширины полотна, съезд ещё приклеен к правой кромке:
 * на него можно перестроиться. Дальше между ними открывается клин.
 * При нулевом разъезде правая лента имеет нулевую ширину.
 * Съезд — отдельная лента в одну сторону. Полотно шире городской полосы:
 * на скорости в него заезжают не в нитку.
 */
export function branchEdges(half: number, spread: number, seam = FORK_SEAM): AsphaltEdges {
  const road = Math.max(0, Number.isFinite(half) ? half : 0);
  const open = Math.max(0, Number.isFinite(spread) ? spread : 0);
  if (open <= 0.001) {
    return {
      leftOuter: -road,
      leftInner: road,
      rightInner: road,
      rightOuter: road,
    };
  }
  const targetHalf = Math.max(1.8, Math.min(road, EXIT_LANE_HALF));
  // Полная ширина набирается на коротком горле, пока съезд ещё приклеен к шоссе.
  const grow = Math.min(1, open / 2.5);
  const exitHalf = targetHalf * grow;
  const exitCenter = road + open;
  let rightInner = exitCenter - exitHalf;
  let rightOuter = exitCenter + exitHalf;
  const nose = road - seam;
  if (rightInner < nose) rightInner = nose;
  if (rightOuter < rightInner) rightOuter = rightInner;
  return {
    leftOuter: -road,
    leftInner: road,
    rightInner,
    rightOuter,
  };
}

/**
 * Пределы руля в координатах полосы вокруг центра той дороги, по которой едут.
 * На съезде это его полуширина с тем же запасом, что у прямой дороги.
 * `enter` — съезд ещё можно взять. Пока ленты ещё одно полотно, правая стена
 * доходит до внешней кромки съезда. Открытый клин байк не пересекает.
 */
export function stayOnAsphalt(edges: AsphaltEdges, lateral: number, stick: 'road' | 'exit' | 'near' = 'near'): number {
  const roadLeft = edges.leftOuter + RIBBON_MARGIN;
  const roadRight = Math.max(roadLeft, edges.leftInner - RIBBON_MARGIN);
  const exitOpen = exitWidth(edges) > RIDEABLE && edges.rightOuter > edges.rightInner + RIBBON_MARGIN;
  const exitLeft = edges.rightInner + RIBBON_MARGIN;
  const exitRight = Math.max(exitLeft, edges.rightOuter - RIBBON_MARGIN);
  const at = Number.isFinite(lateral) ? lateral : (roadLeft + roadRight) * 0.5;
  const clampSpan = (value: number, left: number, right: number) => Math.min(Math.max(value, left), right);
  const onRoad = (value: number) => clampSpan(value, roadLeft, roadRight);
  const onExit = (value: number) => clampSpan(value, exitLeft, exitRight);
  const joined = exitOpen && exitGap(edges) < ATTACHED_GAP;
  if (joined) return clampSpan(at, roadLeft, Math.max(roadRight, exitRight));
  if (!exitOpen || stick === 'road') return onRoad(at);
  if (stick === 'exit') return onExit(at);
  if (at >= edges.leftOuter && at <= edges.leftInner) return onRoad(at);
  if (at >= edges.rightInner && at <= edges.rightOuter) return onExit(at);
  const roadEdge = at < edges.leftOuter ? edges.leftOuter : edges.leftInner;
  const exitEdge = at < edges.rightInner ? edges.rightInner : edges.rightOuter;
  return Math.abs(at - roadEdge) <= Math.abs(at - exitEdge) ? onRoad(at) : onExit(at);
}

export function logicalRoadLimits(edge: AsphaltEdges, scale: number, riding = false, enter = false): RoadLimits {
  // Та же линейка, что у полосы. На конце закрытия старая дорога сходит
  // и масштаб падает: пределы на другой линейке сажают байка на неё.
  const span = Number.isFinite(scale) && scale > 0 ? scale : 0.001;
  const exitHalf = exitWidth(edge) * 0.5;
  const onExit = riding && exitHalf > 0.5;
  let minEdge: number;
  let maxEdge: number;
  const roadMid = mainCenter(edge);
  const joined = roadsJoined(edge);
  // Пока +1 полоса прижата, руль видит одно полотно целиком, независимо от
  // того, в какой полосе сидит байк. Границы не прыгают при перестроении.
  if (joined && (enter || exitGap(edge) <= 0.01)) {
    minEdge = (edge.leftOuter + RIBBON_MARGIN - roadMid) / span;
    maxEdge = (edge.rightOuter - RIBBON_MARGIN - roadMid) / span;
  } else if (onExit && !joined) {
    // Съезд уже другая дорога. Ноль руля — середина ленты, не ось той, что сходится.
    const mid = (edge.rightInner + edge.rightOuter) * 0.5;
    minEdge = edge.rightInner + RIBBON_MARGIN - mid;
    maxEdge = edge.rightOuter - RIBBON_MARGIN - mid;
  } else if (onExit) {
    // Лента ещё одно полотно с шоссе, номер полосы считается от его середины.
    minEdge = (edge.rightInner + RIBBON_MARGIN - roadMid) / span;
    maxEdge = (edge.rightOuter - RIBBON_MARGIN - roadMid) / span;
  } else {
    // Полоса байка считается от центра его дороги, не от нуля сплайна.
    minEdge = (edge.leftOuter + RIBBON_MARGIN - roadMid) / span;
    maxEdge = (edge.leftInner - RIBBON_MARGIN - roadMid) / span;
  }
  if (!Number.isFinite(minEdge) || !Number.isFinite(maxEdge)) return { min: 0, max: 0 };
  if (maxEdge < minEdge) {
    const mid = (minEdge + maxEdge) * 0.5;
    return { min: mid, max: mid };
  }
  return { min: minEdge, max: maxEdge };
}
