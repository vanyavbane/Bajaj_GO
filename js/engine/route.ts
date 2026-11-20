/**
 * Решение одной зоны: развилка ещё открыта, взята прямая или взят съезд.
 * Кадр дороги читает эту запись. Курс по-прежнему нумерует векторы:
 * прямая и открытая развилка остаются на нулевом, съезд — на первом.
 * Ось переносит только съезд.
 */

import type { ChosenSide, ZoneRoad } from './fork.ts';
import type { CoursePick } from './vectors.ts';

/** Три состояния развилки. Ноль курса сюда не входит: он бывает и у прямой, и у открытой. */
export type RouteChoice = 'open' | 'straight' | 'exit';

export interface ZoneVote {
  /** Зона уже зафиксировала развилку. */
  committed: boolean;
  /** 1 — съезд, -1 — прямая. Нет числа — сторона в записи не лежит. */
  storedSide?: number | null;
  /** Следующий биом совпал с правым слотом. null — пары нет. */
  nextIsExit?: boolean | null;
}

export interface ZoneDecision {
  choice: RouteChoice;
  /** Сторона для кромок: 0 открыто, -1 прямая закрыла съезд, 1 съезд стал дорогой. */
  side: ChosenSide;
  /** Вектор курса. Съезд владеет ответвлением, остальные остаются на прямой. */
  pick: CoursePick;
  tookExit: boolean;
}

function decision(choice: RouteChoice, side: ChosenSide, pick: CoursePick, tookExit: boolean): ZoneDecision {
  return { choice, side, pick, tookExit };
}

/** Одна запись из голоса зоны. Незафиксированная зона не смотрит на записанную сторону. */
export function decideZone(vote: ZoneVote): ZoneDecision {
  if (!vote.committed) return decision('open', 0, 0, false);
  if (vote.storedSide === 1) return decision('exit', 1, 1, true);
  if (vote.storedSide === -1) return decision('straight', -1, 0, false);
  if (vote.nextIsExit === true) return decision('exit', 1, 1, true);
  return decision('straight', -1, 0, false);
}

/** Курс съезда жив, пока зона его не отвергла. Прямая гасит вектор, даже если асфальт ещё сходится. */
export function courseBranches<T>(choice: RouteChoice, branches: readonly T[]): readonly T[] {
  return choice === 'straight' ? [] : branches;
}

/** Дорога зоны для переноса оси. Прямая и открытая развилка центр не несут. */
export function zoneRoadOf(decision: ZoneDecision, half: number, keptOrigin?: number | null): ZoneRoad {
  const width = Number.isFinite(half) ? half : 0;
  if (!decision.tookExit) return { tookExit: false, half: width };
  if (keptOrigin == null || !Number.isFinite(keptOrigin)) return { tookExit: true, half: width };
  return { tookExit: true, half: width, keptOrigin };
}
