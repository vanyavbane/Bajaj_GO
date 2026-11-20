import { outwardFrom, shellEdge } from './fork.ts';
import type { AsphaltEdges } from './fork.ts';

export type { AsphaltEdges };

/**
 * Контракт постановки окружения.
 *
 * Боковое смещение — готовые метры для `placeOnRoad`. Знак берётся от середины
 * живого асфальта, поэтому декор остаётся снаружи съезда, даже если старый центр ещё в стороне.
 *
 * Кромки приходят снаружи (`roadEdgesAt`): две ленты, разъезд и схлопывание
 * чужой ветки уже внутри них. Этот модуль считает смещение декора.
 * Three.js здесь нет.
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

/** Смещение для `placeOnRoad`. */
export interface RoadsidePose {
  lateral: number;
  absLat: number;
}

function finite(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

function outward(n: number): number {
  return Math.max(0, finite(n));
}

/** Одна дорога как кромки. Вторая лента в эту оболочку не входит. */
export function spanEdges(span: { left: number; right: number }): AsphaltEdges {
  const left = Number.isFinite(span.left) ? span.left : 0;
  const right = Number.isFinite(span.right) ? span.right : left;
  return {
    leftOuter: left,
    leftInner: right,
    rightInner: right,
    rightOuter: right,
  };
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
