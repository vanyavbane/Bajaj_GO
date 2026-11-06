/** @type {import('./game-state.d.ts').GameState} */
export const G = /** @type {import('./game-state.d.ts').GameState} */ ({
  $: (id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error('Нет элемента #' + id);
    return el;
  },
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  lerp: (a, b, t) => a + (b - a) * t,
});
