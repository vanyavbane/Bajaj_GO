import { G } from './state.js';

export function initInput() {
  const $ = G.$;

  /* =========================================================================
   * 15. ОБРАБОТКА ВВОДА (КЛАВИАТУРА И ЭКРАННЫЕ КНОПКИ)
   * ========================================================================= */
  function handleKey(e, isDown) {
    const k = e.key.toLowerCase();

    if (isDown) {
      if (e.key === 'Escape' || e.code === 'KeyP' || k === 'p' || k === 'з') {
        if (G.uiModal) {
          if (G.modalKind === 'exit') { e.preventDefault(); G.closeOverlayToGame(); }
          return;
        }
        if (G.started && !G.ended) {
          e.preventDefault();
          G.togglePause();
          return;
        }
      }

      if (G.currentScreen === 'crash') {
        if (e.key === 'Enter') { e.preventDefault(); G.startGame(); return; }
        if (e.key === 'Escape') { e.preventDefault(); G.renderMainMenu(); return; }
      } else if (G.currentScreen === 'shop') {
        if (e.key === 'Escape') { e.preventDefault(); G.renderMainMenu(); return; }
      }

      if (k === 'f' || e.code === 'KeyF') {
        G.triggerHighBeam();
        e.preventDefault();
        return;
      }
      if (k === 't' || k === 'c' || k === 'v' || k === 'е' || k === 'с' || k === 'м' || e.code === 'KeyT' || e.code === 'KeyC' || e.code === 'KeyV') {
        G.toggleCameraMode();
        e.preventDefault();
        return;
      }
    }

    const map = {
      arrowleft: 'left', a: 'left', ф: 'left',
      arrowright: 'right', d: 'right', в: 'right',
      arrowup: 'gas', w: 'gas', ц: 'gas', ' ': 'gas',
      arrowdown: 'brake', s: 'brake', ы: 'brake'
    };
    if (map[k]) {
      G.keys[map[k]] = isDown;
      e.preventDefault();
    }
  }
  addEventListener('keydown', e => handleKey(e, true));
  addEventListener('keyup', e => handleKey(e, false));
  addEventListener('blur', () => Object.keys(G.keys).forEach(k => (G.keys[k] = false)));

  document.querySelectorAll('.ctrl[data-key]').forEach(btn => {
    if (!(btn instanceof HTMLElement)) return;
    const k = btn.dataset.key;
    const down = e => {
      e.preventDefault();
      try { if (e.pointerId != null) btn.setPointerCapture(e.pointerId); } catch (err) { /* указатель уже отпущен */ }
      G.keys[k] = true;
      btn.classList.add('on');
    };
    const up = e => {
      e.preventDefault();
      G.keys[k] = false;
      btn.classList.remove('on');
    };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
  });
  $('btn-flash').addEventListener('pointerdown', e => {
    e.preventDefault();
    G.triggerHighBeam();
  });
  $('btn-camera').addEventListener('pointerdown', e => {
    e.preventDefault();
    G.toggleCameraMode();
  });

  const view = $('view');
  let swipeId = null;
  let swipeX = 0;
  let swipeSteer = null;
  function clearSwipe() {
    if (swipeSteer === 'left' || swipeSteer === 'right') {
      const held = document.querySelector(`.ctrl[data-key="${swipeSteer}"]`);
      if (!(held instanceof HTMLElement) || !held.classList.contains('on')) G.keys[swipeSteer] = false;
    }
    swipeSteer = null;
    swipeId = null;
  }
  view.addEventListener('pointerdown', e => {
    if (!G.started || G.ended || G.paused || G.uiModal) return;
    if (e.target instanceof Element && e.target.closest('#controls, #btn-pause')) return;
    swipeId = e.pointerId;
    swipeX = e.clientX;
    try { view.setPointerCapture(e.pointerId); } catch (err) { /* жест уже закончился */ }
  });
  view.addEventListener('pointermove', e => {
    if (e.pointerId !== swipeId) return;
    const dx = e.clientX - swipeX;
    const next = dx > 36 ? 'right' : (dx < -36 ? 'left' : null);
    if (next === swipeSteer) return;
    if (swipeSteer) {
      const held = document.querySelector(`.ctrl[data-key="${swipeSteer}"]`);
      if (!(held instanceof HTMLElement) || !held.classList.contains('on')) G.keys[swipeSteer] = false;
    }
    swipeSteer = next;
    if (next) G.keys[next] = true;
  });
  view.addEventListener('pointerup', e => { if (e.pointerId === swipeId) clearSwipe(); });
  view.addEventListener('pointercancel', e => { if (e.pointerId === swipeId) clearSwipe(); });
}
