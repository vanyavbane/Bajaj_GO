import { exitWidth, mainRoadOpen, outwardFrom, shellEdge } from './fork.ts';
import type { AsphaltEdges } from './fork.ts';

export type { AsphaltEdges };

/**
 * Контракт постановки окружения.
 *
 * Боковое смещение — готовые метры для `placeOnRoad`. Знак берётся от середины
 * живого асфальта, поэтому декор остаётся снаружи съезда, даже если старый центр ещё в стороне.
 *
 * Кромки приходят снаружи (`roadEdgesAt`): две ленты, разъезд и схлопывание
 * чужой ветки уже внутри них. Этот модуль решает только, можно ли ставить
 * объект и на каком смещении. Three.js здесь нет.
 */

/** Сторона обочины. Островок между лентами сюда не входит. */
export type AssetSide = -1 | 1;

/** Кадр дороги, от которого ставится декор в одной точке s. */
export interface RoadsideFrame {
  edges: AsphaltEdges;
  /** Мировой центр дороги. От него считается, насколько декор ушёл от оси. */
  origin: number;
}

/**
 * Боковой ассет.
 * `gap` — зазор от внешней кромки асфальта до ближайшей грани меша.
 * `inset` — насколько меш торчит от точки постановки в сторону дороги.
 */
export interface BesideAsset {
  side: AssetSide;
  gap: number;
  inset: number;
}

/** Смещение для `placeOnRoad`. `null` — в этой точке объект не ставить. */
export interface RoadsidePose {
  lateral: number | null;
  absLat: number | null;
}

/**
 * Объект на островке.
 * `halfWidth` — половина габарита от точки постановки.
 * `gap` — зазор от этой грани до внутренней кромки асфальта.
 * `lateral` — желаемое смещение от оси; по умолчанию островок по центру.
 */
export interface MedianAsset {
  halfWidth: number;
  gap: number;
  lateral?: number;
}

const HIDDEN: RoadsidePose = { lateral: null, absLat: null };

function finite(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

function outward(n: number): number {
  return Math.max(0, finite(n));
}

/**
 * Смещение бокового объекта. Точка постановки отодвигается от кромки
 * на зазор и на собственный выступ меша, поэтому грань не попадает на асфальт.
 * Выбор ветки сторону не прячет: мёртвая лента уже схлопнута в кромках.
 */
export function besidePose(frame: RoadsideFrame, asset: BesideAsset): RoadsidePose {
  const edge = shellEdge(frame.edges, asset.side);
  const shellMid = (shellEdge(frame.edges, -1) + shellEdge(frame.edges, 1)) * 0.5;
  const lateral = outwardFrom(edge, shellMid, outward(asset.gap) + outward(asset.inset));
  return { lateral, absLat: Math.abs(lateral - frame.origin) };
}

/**
 * Сколько метров от оси до асфальта внутри разъезда.
 * На прямой внутренние кромки сходятся, и места под островок нет.
 */
function exitGore(edges: AsphaltEdges, center = 0): boolean {
  return mainRoadOpen(edges, center) && exitWidth(edges) > 1 && edges.rightInner > edges.leftInner;
}

export function medianRoom(edges: AsphaltEdges, center = 0): number {
  const gap = edges.rightInner - edges.leftInner;
  if (!(gap > 0)) return 0;
  if (exitGore(edges, center)) return gap * 0.5;
  const axis = Number.isFinite(center) ? center : 0;
  if (edges.leftInner < axis && edges.rightInner > axis) {
    return Math.min(axis - edges.leftInner, edges.rightInner - axis);
  }
  return 0;
}

/** Помещается ли объект между лентами, не задевая асфальт. */
export function medianFits(edges: AsphaltEdges, asset: MedianAsset, center = 0): boolean {
  return medianRoom(edges, center) >= outward(asset.halfWidth) + outward(asset.gap);
}

/** Смещение на островке. Вылезающий в сторону асфальта сдвиг обрезается. */
export function medianPose(edges: AsphaltEdges, asset: MedianAsset, center = 0): RoadsidePose {
  const room = medianRoom(edges, center);
  const need = outward(asset.halfWidth) + outward(asset.gap);
  if (room < need) return HIDDEN;
  const limit = room - need;
  const goreCenter = exitGore(edges, center) ? (edges.leftInner + edges.rightInner) * 0.5 : center;
  const desired = asset.lateral == null ? goreCenter : finite(asset.lateral);
  const lateral = goreCenter + Math.max(-limit, Math.min(limit, desired - goreCenter));
  return { lateral, absLat: Math.abs(lateral - center) };
}
