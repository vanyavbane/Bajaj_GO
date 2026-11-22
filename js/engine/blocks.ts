/**
 * Съезд собирается из блоков.
 * Рецепт — это подход, общий для обоих путей, и две цепочки одинаковой длины.
 * Игрок выбирает одну: прямую дорогу или съезд. Вторая цепочка не строится.
 * Новый съезд — новый рецепт здесь, а не новая ветка в расчёте кромок.
 */

/** split — съезд отходит. fork — обе ленты, здесь выбор. seal — чужая лента сходится.
 *  road — дальше одна дорога. Взятый въезд приходит в новую, старая к этому месту уже сошла. */
export type BlockKind = 'split' | 'fork' | 'seal' | 'road';

/** -1 прямая, +1 съезд, 0 игрок ещё не выбрал. */
export type BuildChoice = -1 | 0 | 1;

export interface RoadBlock {
  id: string;
  kind: BlockKind;
  /** Длина вдоль маршрута, метры. Стык со следующим блоком — ровно в конце. */
  length: number;
}

export interface ExitRecipe {
  id: string;
  /** Насколько съезд отходит от прямой, метры. Одно число на весь рецепт. */
  spread: number;
  approach: readonly RoadBlock[];
  /** 0 — остаться на дороге, 1 — уехать по съезду. */
  choices: readonly [readonly RoadBlock[], readonly RoadBlock[]];
}

/** Правый съезд зоны. Длины цепочек совпадают, поэтому стык не зависит от выбора. */
export const RIGHT_EXIT: ExitRecipe = {
  id: 'right-exit',
  spread: 22,
  approach: [
    { id: 'split', kind: 'split', length: 80 },
    { id: 'fork', kind: 'fork', length: 480 },
  ],
  choices: [
    [
      { id: 'seal-exit', kind: 'seal', length: 160 },
      { id: 'ahead', kind: 'road', length: 180 },
    ],
    [
      { id: 'seal-main', kind: 'seal', length: 160 },
      { id: 'arrived', kind: 'road', length: 180 },
    ],
  ],
};

export interface Span {
  id: string;
  kind: BlockKind;
  start: number;
  length: number;
}

export interface SpanHit extends Span {
  /** 0 в начале блока, 1 на стыке со следующим. */
  u: number;
}

export interface CompiledExit {
  id: string;
  spread: number;
  length: number;
  choiceAt: number;
  diverge: number;
  run: number;
  seal: number;
  margin: number;
  approach: readonly Span[];
  straight: readonly Span[];
  exit: readonly Span[];
  /** Подход и прямая цепочка. Фаза дороги читает её: длины совпадают со съездом. */
  timeline: readonly Span[];
}

export interface PlacedBlock {
  id: string;
  kind: BlockKind;
  u: number;
  start: number;
  length: number;
  /** Подход уже стоит. Хвост стоит только после выбора игрока. */
  built: boolean;
}

function fail(recipe: ExitRecipe, message: string): never {
  throw new Error(`Съезд «${recipe.id}»: ${message}`);
}

function checkBlock(recipe: ExitRecipe, block: RoadBlock, where: string): void {
  if (block.id.trim() === '') fail(recipe, `${where}: у блока нет имени`);
  if (!Number.isFinite(block.length) || block.length <= 0) {
    fail(recipe, `${where}: длина блока «${block.id}» должна быть больше нуля`);
  }
}

function lay(blocks: readonly RoadBlock[], origin: number): Span[] {
  const spans: Span[] = [];
  let cursor = origin;
  for (const block of blocks) {
    spans.push({ id: block.id, kind: block.kind, start: cursor, length: block.length });
    cursor += block.length;
  }
  return spans;
}

function sameShape(recipe: ExitRecipe, straight: readonly RoadBlock[], exit: readonly RoadBlock[]): void {
  if (straight.length !== exit.length) {
    fail(recipe, 'у прямой и у съезда должно быть поровну блоков');
  }
  for (let i = 0; i < straight.length; i++) {
    const left = straight[i];
    const right = exit[i];
    if (!left || !right || left.length !== right.length) {
      fail(recipe, `блок ${i + 1} двух цепочек разной длины`);
    }
  }
}

/** Собирает рецепт в линейку. Кривой рецепт не становится дорогой. */
export function compileExit(recipe: ExitRecipe): CompiledExit {
  if (recipe.id.trim() === '') fail(recipe, 'нет имени');
  if (!Number.isFinite(recipe.spread) || recipe.spread <= 0) fail(recipe, 'разъезд должен быть больше нуля');
  if (recipe.approach.length < 2) fail(recipe, 'в подходе нужны блок отхода и блок выбора');
  recipe.approach.forEach((block, index) => checkBlock(recipe, block, `подход ${index + 1}`));
  const split = recipe.approach[0];
  const fork = recipe.approach[recipe.approach.length - 1];
  if (!split || split.kind !== 'split') fail(recipe, 'первый блок подхода — отход съезда');
  if (!fork || fork.kind !== 'fork') fail(recipe, 'последний блок подхода — место выбора');
  for (const block of recipe.approach) {
    if (block !== split && block.kind === 'split') fail(recipe, 'отход съезда только один');
    if (block !== fork && block.kind === 'fork') fail(recipe, 'место выбора только одно');
    if (block.kind === 'seal' || block.kind === 'road') {
      fail(recipe, `блок «${block.id}» стоит до выбора`);
    }
  }
  const [straightBlocks, exitBlocks] = recipe.choices;
  if (straightBlocks.length !== 2 || exitBlocks.length !== 2) {
    fail(recipe, 'после выбора два блока: закрыть чужую ленту и ехать дальше');
  }
  straightBlocks.forEach((block, index) => checkBlock(recipe, block, `прямая ${index + 1}`));
  exitBlocks.forEach((block, index) => checkBlock(recipe, block, `съезд ${index + 1}`));
  sameShape(recipe, straightBlocks, exitBlocks);
  const straightSeal = straightBlocks[0];
  const exitSeal = exitBlocks[0];
  const straightEnd = straightBlocks[1];
  const exitEnd = exitBlocks[1];
  if (!straightSeal || straightSeal.kind !== 'seal' || !exitSeal || exitSeal.kind !== 'seal') {
    fail(recipe, 'сразу после выбора чужая лента закрывается');
  }
  if (!straightEnd || straightEnd.kind !== 'road') fail(recipe, 'прямая цепочка заканчивается обычной дорогой');
  if (!exitEnd || exitEnd.kind !== 'road') fail(recipe, 'после въезда остаётся новая дорога');
  const ids = new Set<string>();
  for (const block of [...recipe.approach, ...straightBlocks, ...exitBlocks]) {
    if (ids.has(block.id)) fail(recipe, `имя «${block.id}» повторяется`);
    ids.add(block.id);
  }
  const approach = lay(recipe.approach, 0);
  const choiceAt = approach.reduce((sum, span) => sum + span.length, 0);
  const straight = lay(straightBlocks, choiceAt);
  const exit = lay(exitBlocks, choiceAt);
  const timeline = [...approach, ...straight];
  const length = timeline.reduce((sum, span) => sum + span.length, 0);
  return {
    id: recipe.id,
    spread: recipe.spread,
    length,
    choiceAt,
    diverge: split.length,
    run: fork.length,
    seal: straightSeal.length,
    margin: straightEnd.length,
    approach,
    straight,
    exit,
    timeline,
  };
}

/** Блок линейки в метре d от носа. На стыке это уже следующий блок. */
export function spanAt(plan: CompiledExit, d: number): SpanHit | null {
  if (!(d >= 0) || d >= plan.length) return null;
  for (const span of plan.timeline) {
    if (d < span.start + span.length) {
      return { ...span, u: (d - span.start) / span.length };
    }
  }
  return null;
}

/** Блок, который реально построен. До выбора хвост ещё не стоит. */
export function placedBlock(plan: CompiledExit, d: number, chosen: BuildChoice): PlacedBlock | null {
  const span = spanAt(plan, d);
  if (!span) return null;
  if (span.start < plan.choiceAt) {
    return { id: span.id, kind: span.kind, u: span.u, start: span.start, length: span.length, built: true };
  }
  if (chosen === 0) {
    return { id: 'open', kind: 'fork', u: span.u, start: span.start, length: span.length, built: false };
  }
  const chain = chosen === 1 ? plan.exit : plan.straight;
  const built = chain.find((item) => item.start === span.start);
  if (!built) return null;
  return { id: built.id, kind: built.kind, u: span.u, start: built.start, length: built.length, built: true };
}
