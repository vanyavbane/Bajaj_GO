/**
 * Полотно, клин и откос.
 * Кромки кадра считает fork.ts. Здесь из них собирается картинка:
 * две ленты асфальта, оболочка, пешеходный переход и земля снаружи кромки.
 */

import { EXIT_LANE_HALF, FORK_SPREAD, roadsJoined, type AsphaltEdges } from './fork.ts';

export interface ShoulderProfile {
  berm: number;
  far: number;
  lipY: number;
  bermY: number;
  farY: number;
  /** Бордюр и тротуар шоссе. Съезд эту полосу не резервирует. */
  cityEdge: number;
}

export interface ShoulderLats {
  lip: number;
  berm: number;
  far: number;
}

/** Весь живой асфальт в точке: прямая и съезд вместе. Узкая прямая остаётся, пока у неё есть ширина. */
export function asphaltSpan(edges: AsphaltEdges): { left: number; right: number; mid: number; width: number } {
  const shell = roadShell(edges);
  return {
    left: shell.left,
    right: shell.right,
    mid: (shell.left + shell.right) * 0.5,
    width: Math.max(0, shell.right - shell.left),
  };
}

/** Кусок асфальта одной ленты. Левый и правый слот кадра сюда не входят. */
export interface AsphaltSpan {
  left: number;
  right: number;
}

/** Скачок дальше этого — уже другая лента, а не продолжение той же. */
const TRACK_JUMP = 6;

function spanCenter(span: AsphaltSpan): number {
  return (span.left + span.right) * 0.5;
}

/** Живые куски кадра: прямая и съезд, если у них есть ширина. */
function asphaltSpans(edges: AsphaltEdges): AsphaltSpan[] {
  const spans: AsphaltSpan[] = [];
  if (edges.leftInner - edges.leftOuter > 0.05) spans.push({ left: edges.leftOuter, right: edges.leftInner });
  if (edges.rightOuter - edges.rightInner > 0.05) spans.push({ left: edges.rightInner, right: edges.rightOuter });
  return spans;
}

/** Внешняя лента стороны. Обочина меряет её полуширину, а не середину обеих лент. */
export function outerRibbon(edges: AsphaltEdges, side: -1 | 1): { edge: number; center: number; half: number } | null {
  const spans = asphaltSpans(edges);
  let best: AsphaltSpan | null = null;
  for (const span of spans) {
    if (!best || (side < 0 ? span.left < best.left : span.right > best.right)) best = span;
  }
  if (!best) return null;
  const half = (best.right - best.left) * 0.5;
  const center = (best.left + best.right) * 0.5;
  return { edge: side < 0 ? best.left : best.right, center, half };
}

/** Ближняя кромка асфальта. На полотне — кромка этой ленты со стороны точки. */
export function groundEdge(edges: AsphaltEdges, lat: number): number {
  const spans = asphaltSpans(edges);
  if (spans.length === 0) return 0;
  for (const span of spans) {
    if (lat >= span.left && lat <= span.right) {
      const mid = (span.left + span.right) * 0.5;
      return lat >= mid ? span.right : span.left;
    }
  }
  let edge = spans[0].left;
  let best = Infinity;
  for (const span of spans) {
    const leftD = Math.abs(lat - span.left);
    const rightD = Math.abs(lat - span.right);
    if (leftD < best) {
      best = leftD;
      edge = span.left;
    }
    if (rightD < best) {
      best = rightD;
      edge = span.right;
    }
  }
  return edge;
}

/**
 * Ровная полоса снаружи кромки под бордюр и тротуар.
 * Она есть только у кромок шоссе. Снаружи съезда откос начинается от асфальта.
 */
export function vergeAt(edges: AsphaltEdges, edge: number, cityOuter: number): number {
  if (!(cityOuter > 0) || !Number.isFinite(edge)) return 0;
  const roadRight = roadsJoined(edges) ? edges.rightOuter : edges.leftInner;
  const onHighway = Math.abs(edge - edges.leftOuter) < 0.35 || Math.abs(edge - roadRight) < 0.35;
  return onHighway ? cityOuter : 0;
}

/**
 * Земля у точки lat.
 * `dist` — метры от центра ближайшей ленты. На асфальте это 0.
 * `half` — полуширина этой ленты, откос считается от неё.
 */
export function groundAt(edges: AsphaltEdges, lat: number): { dist: number; half: number } {
  const spans = asphaltSpans(edges);
  if (spans.length === 0) return { dist: Math.abs(lat), half: 0 };
  for (const span of spans) {
    if (lat >= span.left && lat <= span.right) {
      return { dist: 0, half: (span.right - span.left) * 0.5 };
    }
  }
  let best = spans[0];
  let edge = best ? best.left : 0;
  let bestD = Infinity;
  for (const span of spans) {
    const leftD = Math.abs(lat - span.left);
    const rightD = Math.abs(lat - span.right);
    const d = Math.min(leftD, rightD);
    if (d < bestD) {
      bestD = d;
      best = span;
      edge = leftD <= rightD ? span.left : span.right;
    }
  }
  const half = best ? (best.right - best.left) * 0.5 : 0;
  return { dist: half + Math.abs(lat - edge), half };
}

/**
 * Две ленты асфальта.
 * Лента держится за свой кусок.
 * Кусок, который прыгнул дальше порога, начинает другую ленту.
 */
export function followAsphalt(
  previous: readonly (AsphaltSpan | null)[],
  edges: AsphaltEdges,
): [AsphaltSpan | null, AsphaltSpan | null] {
  const spans = asphaltSpans(edges);
  const next: [AsphaltSpan | null, AsphaltSpan | null] = [null, null];
  const used = spans.map(() => false);
  for (let track = 0; track < 2; track++) {
    const prev = previous[track] ?? null;
    if (!prev) continue;
    let best = -1;
    let bestD = TRACK_JUMP;
    const at = spanCenter(prev);
    for (let i = 0; i < spans.length; i++) {
      if (used[i]) continue;
      const span = spans[i];
      if (!span) continue;
      const distance = Math.abs(spanCenter(span) - at);
      if (distance < bestD) {
        bestD = distance;
        best = i;
      }
    }
    if (best >= 0) {
      next[track] = spans[best] ?? null;
      used[best] = true;
    }
  }
  for (let i = 0; i < spans.length; i++) {
    if (used[i]) continue;
    const span = spans[i];
    if (!span) continue;
    if (!next[0]) next[0] = span;
    else if (!next[1]) next[1] = span;
  }
  return next;
}

function collapsedSpan(span: AsphaltSpan): AsphaltSpan {
  const mid = spanCenter(span);
  return { left: mid, right: mid };
}

/**
 * Пустые ряды ленты схлопываются в точку на её конце.
 * Следующий кусок не тянет полотно через разрыв.
 */
export function pinchAsphalt(rows: readonly (readonly (AsphaltSpan | null)[])[]): [AsphaltSpan[], AsphaltSpan[]] {
  const count = rows.length;
  const drawn: [AsphaltSpan[], AsphaltSpan[]] = [[], []];
  for (let track = 0; track < 2; track++) {
    const samples = rows.map((row) => row[track] ?? null);
    const out: AsphaltSpan[] = new Array(count);
    const runs: { start: number; end: number }[] = [];
    let index = 0;
    while (index < count) {
      if (!samples[index]) {
        index += 1;
        continue;
      }
      let end = index + 1;
      while (end < count && samples[end]) end += 1;
      runs.push({ start: index, end });
      index = end;
    }
    if (runs.length === 0) {
      const point = { left: 0, right: 0 };
      for (let row = 0; row < count; row++) out[row] = point;
      drawn[track] = out;
      continue;
    }
    for (let runIndex = 0; runIndex < runs.length; runIndex++) {
      const run = runs[runIndex];
      if (!run) continue;
      const first = samples[run.start];
      const last = samples[run.end - 1];
      if (!first || !last) continue;
      const lead = collapsedSpan(first);
      const tail = collapsedSpan(last);
      const from = runIndex === 0 ? 0 : runs[runIndex - 1]?.end ?? 0;
      const previous = runIndex === 0 ? null : samples[(runs[runIndex - 1]?.end ?? 1) - 1];
      for (let row = from; row < run.start; row++) {
        const bridge = previous && row < run.start - 1 ? collapsedSpan(previous) : lead;
        out[row] = bridge;
      }
      for (let row = run.start; row < run.end; row++) {
        const span = samples[row];
        if (span) out[row] = span;
      }
      if (runIndex === runs.length - 1) {
        for (let row = run.end; row < count; row++) out[row] = tail;
      }
    }
    for (let row = 0; row < count; row++) {
      if (!out[row]) out[row] = { left: 0, right: 0 };
    }
    drawn[track] = out;
  }
  return drawn;
}

/**
 * Внутренняя кромка ленты для цветной линии развилки.
 * У левой ленты это правый край, у правой — левый. Узкая лента линию не держит.
 */
export function innerTrackEdge(span: AsphaltSpan | null, side: -1 | 1, inset = 0.2): number | null {
  if (!span || span.right - span.left < 0.7) return null;
  const pad = Math.min(Math.max(0, inset), (span.right - span.left) * 0.25);
  return side < 0 ? span.right - pad : span.left + pad;
}

/**
 * Клин между двумя живыми лентами.
 * Узкая или увезённая в сторону лента клин не открывает: парк за ней не едет.
 */
export function goreSpan(edges: AsphaltEdges): AsphaltSpan | null {
  const tracks = followAsphalt([null, null], edges);
  const first = tracks[0];
  const second = tracks[1];
  if (!first || !second) return null;
  if (first.right - first.left < 2 || second.right - second.left < 2) return null;
  const left = first.left + first.right <= second.left + second.right ? first : second;
  const right = left === first ? second : first;
  const gap = right.left - left.right;
  if (gap < 1 || gap > FORK_SPREAD + 2) return null;
  return { left: left.right, right: right.left };
}

/** Оболочка кадра: внешние кромки живых лент. Центр слота для этого не нужен. */
export function roadShell(edges: AsphaltEdges): AsphaltSpan {
  return asphaltShell(followAsphalt([null, null], edges)) ?? { left: 0, right: 0 };
}

/** Внешняя кромка оболочки. Декор и земля стоят снаружи неё. */
export function shellEdge(edges: AsphaltEdges, side: -1 | 1): number {
  const shell = roadShell(edges);
  return side < 0 ? shell.left : shell.right;
}

/** Внешние кромки живого асфальта. Схлопнутая лента в оболочку не входит. */
export function asphaltShell(spans: readonly (AsphaltSpan | null)[]): AsphaltSpan | null {
  let left = Infinity;
  let right = -Infinity;
  for (const span of spans) {
    if (!span || span.right - span.left < 0.5) continue;
    if (span.left < left) left = span.left;
    if (span.right > right) right = span.right;
  }
  if (!(left < right)) return null;
  return { left, right };
}

/**
 * Оболочка по рядам.
 * Кромка, перескочившая на другую ленту, схлопывается в точку с обеих сторон разрыва.
 * Откос не тянет полотно через этот разрыв.
 */
export function pinchShell(shells: readonly (AsphaltSpan | null)[]): AsphaltSpan[] {
  const pinched = pinchAsphalt(shells.map((shell) => [shell, null]))[0];
  for (let i = 1; i < pinched.length; i++) {
    const prev = pinched[i - 1];
    const here = pinched[i];
    if (!prev || !here) continue;
    if (Math.abs(spanCenter(here) - spanCenter(prev)) <= TRACK_JUMP) continue;
    pinched[i - 1] = collapsedSpan(prev);
    pinched[i] = collapsedSpan(here);
  }
  return pinched;
}

/**
 * Пешеходная дорога пересекает съезд.
 * Переход — кусок тротуара от ближней кромки асфальта до дальней,
 * а не разметка, снятая с ленты съезда.
 * Пока съезд не набрал свою ширину или уже ушёл с тротуара, пересекать нечего.
 */
export function walkCrossing(edges: AsphaltEdges, walkOuter: number): { near: number; far: number } | null {
  const width = edges.rightOuter - edges.rightInner;
  if (!(width >= EXIT_LANE_HALF * 2 - 0.3)) return null;
  const walk = Number.isFinite(walkOuter) ? Math.max(0, walkOuter) : 0;
  if (edges.rightInner > edges.leftInner + walk) return null;
  return { near: edges.rightInner, far: edges.rightOuter };
}

/** Откос начинается снаружи кромки асфальта и не складывается внутрь неё. */
export function shoulderLats(asphaltAbs: number, cityOuter: number, shoulder: ShoulderProfile): ShoulderLats {
  const lip = Math.abs(asphaltAbs) + cityOuter;
  const berm = Math.max(shoulder.berm, lip + 1.5);
  const far = Math.max(shoulder.far, berm + (shoulder.far - shoulder.berm));
  return { lip, berm, far };
}

/**
 * Высота земли на удалении от оси. Те же три точки, что у ленты откоса:
 * между ними отрезок, за дальней точкой — её высота.
 */
export function shoulderHeight(absLat: number, lats: ShoulderLats, shoulder: ShoulderProfile): number {
  const a = Math.abs(absLat);
  if (a <= lats.lip) return shoulder.lipY;
  if (a <= lats.berm) {
    const span = lats.berm - lats.lip;
    const t = span > 0 ? (a - lats.lip) / span : 0;
    return shoulder.lipY + t * (shoulder.bermY - shoulder.lipY);
  }
  if (a <= lats.far) {
    const span = lats.far - lats.berm;
    const t = span > 0 ? (a - lats.berm) / span : 0;
    return shoulder.bermY + t * (shoulder.farY - shoulder.bermY);
  }
  return shoulder.farY;
}

