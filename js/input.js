import { G } from './state.js';

export function initInput() {
  const $ = G.$;
  const clamp = G.clamp;
  const lerp = G.lerp;

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
      } else if (G.currentScreen === 'shop' || G.currentScreen === 'tuning') {
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
    const k = btn.dataset.key;
    const down = e => { e.preventDefault(); G.keys[k] = true; btn.classList.add('on'); };
    const up = e => { e.preventDefault(); G.keys[k] = false; btn.classList.remove('on'); };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
  });
  $('btn-flash').addEventListener('pointerdown', e => {
    e.preventDefault();
    G.triggerHighBeam();
  });
  $('btn-camera').addEventListener('pointerdown', e => {
    e.preventDefault();
    G.toggleCameraMode();
  });
}
