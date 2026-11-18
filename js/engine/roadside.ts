import { carriageEdge, exitWidth, mainRoadOpen } from './fork.ts';
import type { AsphaltEdges, ChosenSide } from './fork.ts';

export type { AsphaltEdges, ChosenSide };

/**
 * Контракт постановки окружения.
 *
 * Боковое смещение считается не от оси, а от кромки асфальта в той же
 * системе, что `placeOnRoad`: до сдвига оси развилки. Сдвиг оси добавляет
 * уже `placeOnRoad`, второй раз его прибавлять нельзя.
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
  chosenSide: ChosenSide;
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

/** Обе обочины живой дороги открыты. Мёртвая лента уже схлопнута в кромках,
 *  поэтому выбор сам по себе сторону не прячет: иначе отказ от съезда
 *  убирал бы правую обочину прямой, а взятый съезд — левую кромку новой дороги. */
export function sideOpen(_chosenSide: ChosenSide, _side: AssetSide): boolean {
  void _chosenSide;
  void _side;
  return true;
}

/** Кромка дороги, вдоль которой ставится декор. Съезд справа в неё не входит,
 *  пока прямая ещё есть. */
export function outerEdge(edges: AsphaltEdges, side: AssetSide): number {
  return carriageEdge(edges, side);
}

/**
 * Смещение бокового объекта. Точка постановки отодвигается от кромки
 * на зазор и на собственный выступ меша, поэтому грань не попадает на асфальт.
 */
export function besidePose(frame: RoadsideFrame, asset: BesideAsset): RoadsidePose {
  if (!sideOpen(frame.chosenSide, asset.side)) return HIDDEN;
  const absLat = Math.abs(outerEdge(frame.edges, asset.side)) + outward(asset.gap) + outward(asset.inset);
  return { lateral: asset.side * absLat, absLat };
}

/**
 * Сколько метров от оси до асфальта внутри разъезда.
 * На прямой внутренние кромки сходятся, и места под островок нет.
 */
function exitGore(edges: AsphaltEdges): boolean {
  return mainRoadOpen(edges) && exitWidth(edges) > 1 && edges.rightInner > edges.leftInner;
}

export function medianRoom(edges: AsphaltEdges): number {
  if (exitGore(edges)) return Math.max(0, (edges.rightInner - edges.leftInner) * 0.5);
  const left = -finite(edges.leftInner);
  const right = finite(edges.rightInner);
  if (left <= 0 || right <= 0) return 0;
  return Math.min(left, right);
}

/** Помещается ли объект между лентами, не задевая асфальт. */
export function medianFits(edges: AsphaltEdges, asset: MedianAsset): boolean {
  return medianRoom(edges) >= outward(asset.halfWidth) + outward(asset.gap);
}

/** Смещение на островке. Вылезающий в сторону асфальта сдвиг обрезается. */
export function medianPose(edges: AsphaltEdges, asset: MedianAsset): RoadsidePose {
  const room = medianRoom(edges);
  const need = outward(asset.halfWidth) + outward(asset.gap);
  if (room < need) return HIDDEN;
  const limit = room - need;
  const center = exitGore(edges) ? (edges.leftInner + edges.rightInner) * 0.5 : 0;
  const desired = asset.lateral == null ? center : finite(asset.lateral);
  const lateral = center + Math.max(-limit, Math.min(limit, desired - center));
  return { lateral, absLat: Math.abs(lateral) };
}
