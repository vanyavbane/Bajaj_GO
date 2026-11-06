import * as THREE from 'three';
import { G } from './state.js';

export function initEffects() {
  const $ = G.$;
  const clamp = G.clamp;

  /* =========================================================================
   * ЭФФЕКТЫ: ЧАСТИЦЫ ПРЫЖКА, ВСПЛЫВАЮЩИЕ ОЧКИ И ЗВУКИ
   * ========================================================================= */
  G.jumpParticles = [];
  const partGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
  for (let i = 0; i < 24; i++) {
    const pm = new THREE.Mesh(partGeo, i % 2 === 0 ? G.M.neonCyan : G.M.neonYellow);
    pm.visible = false;
    G.scene.add(pm);
    G.jumpParticles.push({ mesh: pm, vx: 0, vy: 0, vz: 0, life: 0 });
  }

  function spawnOverflyParticles(worldPos) {
    let spawned = 0;
    for (const p of G.jumpParticles) {
      if (p.life <= 0) {
        p.life = 0.65;
        p.mesh.visible = true;
        p.mesh.position.copy(worldPos);
        p.mesh.position.y += 1.6;
        p.vx = (Math.random() - 0.5) * 9;
        p.vy = 2.5 + Math.random() * 5.5;
        p.vz = (Math.random() - 0.5) * 9;
        if (++spawned >= 8) break;
      }
    }
  }
  G.spawnOverflyParticles = spawnOverflyParticles;

  let audioCtx = null;
  function playJumpSound(type = 'overfly', combo = 1) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      if (type === 'overfly') {
        osc.type = 'triangle';
        const baseFreq = 520 + Math.min(combo, 5) * 110;
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.45, now + 0.16);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.18);
      } else if (type === 'launch') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(480, now + 0.22);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        osc.start(now);
        osc.stop(now + 0.24);
      }
    } catch {
      // Игнорируем, если аудио заблокировано браузером
    }
  }
  G.playJumpSound = playJumpSound;

  // Короткий двухнотный отклик при въезде в маркерную зону съезда
  function playExitChime(isFood) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const now = audioCtx.currentTime;
      const base = isFood ? 660 : 520;
      const steps = [1, 1.5];
      for (let i = 0; i < steps.length; i++) {
        const off = i * 0.075;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(base * steps[i], now + off);
        gain.gain.setValueAtTime(0.0001, now + off);
        gain.gain.exponentialRampToValueAtTime(0.07, now + off + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.001, now + off + 0.18);
        osc.start(now + off);
        osc.stop(now + off + 0.2);
      }
    } catch {
      // Аудио может быть заблокировано браузером — молча пропускаем
    }
  }
  G.playExitChime = playExitChime;

  function spawnFloatingPopup(text, worldPos, color = '#fff176') {
    const container = $('floating-popups');
    if (!container) return;
    const v = worldPos.clone().project(G.camera);
    const x = (v.x * 0.5 + 0.5) * innerWidth;
    const y = (-v.y * 0.5 + 0.5) * innerHeight;
    const el = document.createElement('div');
    el.className = 'float-pop';
    el.style.left = `${clamp(x, 80, innerWidth - 80)}px`;
    el.style.top = `${clamp(y, 70, innerHeight - 90)}px`;
    el.style.color = color;
    el.textContent = text;
    container.appendChild(el);
    setTimeout(() => el.remove(), 1050);
  }
  G.spawnFloatingPopup = spawnFloatingPopup;
}
