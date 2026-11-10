import * as THREE from 'three';
import { G } from './state.js';

export function initEffects() {
  const $ = G.$;

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
  // Тон звуков понижается вместе с замедлением мира (0.45…1.0).
  let slowMoPitch = 1;
  function playJumpSound(type = 'overfly', combo = 1) {
    try {
      const ctx = ensureAudio();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      if (type === 'overfly') {
        osc.type = 'triangle';
        const baseFreq = (520 + Math.min(combo, 5) * 110) * slowMoPitch;
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.45, now + 0.16);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.18);
      } else if (type === 'launch') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(240 * slowMoPitch, now);
        osc.frequency.exponentialRampToValueAtTime(480 * slowMoPitch, now + 0.22);
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
      const ctx = ensureAudio();
      const now = ctx.currentTime;
      const base = (isFood ? 660 : 520) * slowMoPitch;
      const steps = [1, 1.5];
      for (let i = 0; i < steps.length; i++) {
        const off = i * 0.075;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
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

  const FEED_LIFE = 2.6;
  const FEED_MAX = 4;
  const feedItems = [];

  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function feedTone(freq, dur, type, level, delay) {
    const ctx = ensureAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t = ctx.currentTime + (delay || 0);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(level, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function playFeedSound(kind, level) {
    try {
      ensureAudio();
      if (kind === 'overfly') {
        playJumpSound('overfly', level);
        return;
      }
      if (kind === 'land') {
        feedTone(520, 0.16, 'sine', 0.07);
        feedTone(780, 0.18, 'sine', 0.05, 0.08);
        return;
      }
      if (kind === 'hard') {
        feedTone(180, 0.22, 'sine', 0.08);
        feedTone(110, 0.26, 'triangle', 0.06, 0.06);
        return;
      }
      if (kind === 'upgrade') {
        feedTone(523, 0.14, 'sine', 0.06);
        feedTone(659, 0.14, 'sine', 0.05, 0.09);
        feedTone(784, 0.2, 'sine', 0.05, 0.18);
        return;
      }
      if (kind === 'remove' || kind === 'bad') {
        feedTone(392, 0.12, 'sine', 0.05);
        feedTone(262, 0.2, 'sine', 0.05, 0.08);
        return;
      }
      feedTone(360 + Math.min(level, 6) * 70, 0.12, 'triangle', 0.07);
    } catch {
      // Аудио может быть заблокировано браузером — молча пропускаем
    }
  }

  function pushFeed(text, tone, level) {
    const kind = tone || 'combo';
    playFeedSound(kind, level || 1);
    const feed = $('event-feed');
    if (G.uiModal || G.paused) feed.classList.add('frozen');
    const el = document.createElement('div');
    el.className = 'feed-item ' + kind;
    el.textContent = text;
    feed.appendChild(el);
    feedItems.push({ el, life: FEED_LIFE });
    while (feedItems.length > FEED_MAX) feedItems.shift().el.remove();
  }

  function tickFeed(dt) {
    const feed = $('event-feed');
    const frozen = !!(G.uiModal || G.paused);
    feed.classList.toggle('frozen', frozen);
    if (frozen) return;
    for (let i = feedItems.length - 1; i >= 0; i--) {
      feedItems[i].life -= dt;
      if (feedItems[i].life > 0) continue;
      feedItems[i].el.remove();
      feedItems.splice(i, 1);
    }
  }

  function clearFeed() {
    feedItems.length = 0;
    $('event-feed').replaceChildren();
    $('event-feed').classList.remove('frozen');
  }

  G.pushFeed = pushFeed;
  G.tickFeed = tickFeed;
  G.clearFeed = clearFeed;

  function tickJumpParticles(dt) {
    for (const p of G.jumpParticles) {
      if (p.life > 0) {
        p.life -= dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.vy -= 14 * dt;
        p.mesh.rotation.x += 6 * dt;
        p.mesh.rotation.y += 6 * dt;
        if (p.life <= 0) p.mesh.visible = false;
      }
    }
  }
  G.tickJumpParticles = tickJumpParticles;

  /* ---------- Slow-Mo при перелётах через 3+ машины ---------- */
  const SLOWMO_TARGET = 0.4;      // время мира замедляется до 40%
  const SLOWMO_MAX_SECONDS = 6;   // страховка, чтобы эффект не завис
  let slowMoActive = false;
  let slowMoEnding = false;
  let slowMoUsedThisJump = false;
  let slowMoFactor = 1;
  let slowMoElapsed = 0;
  G.slowMoFactor = 1;

  function updateSlowMoVisuals() {
    const vig = document.getElementById('slowmo-vignette');
    if (vig) vig.classList.toggle('on', slowMoActive);
    const badge = document.getElementById('slowmo-badge');
    if (badge) badge.hidden = !slowMoActive;
  }

  function resetSlowMo() {
    slowMoActive = false;
    slowMoEnding = false;
    slowMoUsedThisJump = false;
    slowMoFactor = 1;
    slowMoElapsed = 0;
    slowMoPitch = 1;
    G.slowMoFactor = 1;
    updateSlowMoVisuals();
  }
  G.resetSlowMo = resetSlowMo;

  // Новый прыжок: эффект можно запустить снова, но активный не обрываем.
  function resetSlowMoJump() {
    slowMoUsedThisJump = false;
  }
  G.resetSlowMoJump = resetSlowMoJump;

  function triggerSlowMo() {
    if (slowMoActive || slowMoUsedThisJump) return;
    slowMoUsedThisJump = true;
    slowMoActive = true;
    slowMoEnding = false;
    slowMoElapsed = 0;
    updateSlowMoVisuals();
    playSlowMoEnter();
  }
  G.triggerSlowMo = triggerSlowMo;

  function endSlowMo() {
    if (!slowMoActive || slowMoEnding) return;
    slowMoEnding = true;
    updateSlowMoVisuals();
  }
  G.endSlowMo = endSlowMo;

  function updateSlowMo(realDt) {
    if (slowMoActive) {
      slowMoElapsed += realDt;
      if (!slowMoEnding) {
        slowMoFactor = G.lerp(slowMoFactor, SLOWMO_TARGET, Math.min(1, realDt * 9));
        if (slowMoElapsed > SLOWMO_MAX_SECONDS) slowMoEnding = true;
      } else {
        slowMoFactor = G.lerp(slowMoFactor, 1, Math.min(1, realDt * 2.4));
        if (slowMoFactor > 0.985) {
          slowMoFactor = 1;
          slowMoActive = false;
          slowMoEnding = false;
          updateSlowMoVisuals();
        }
      }
    } else {
      slowMoFactor = 1;
    }
    // Понижение тона звуков во время замедления (0.45…1.0)
    slowMoPitch = 0.45 + 0.55 * G.clamp(slowMoFactor, 0, 1);
    G.slowMoFactor = slowMoFactor;
    return slowMoFactor;
  }
  G.updateSlowMo = updateSlowMo;

  // Низкий «вдох» при входе в замедление.
  function playSlowMoEnter() {
    try {
      const ctx = ensureAudio();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const sub = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, now);
      filter.frequency.exponentialRampToValueAtTime(260, now + 0.9);
      osc.type = 'sawtooth';
      sub.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(92, now + 0.9);
      sub.frequency.setValueAtTime(160, now);
      sub.frequency.exponentialRampToValueAtTime(46, now + 0.9);
      osc.connect(filter);
      sub.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.09, now + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);
      osc.start(now);
      sub.start(now);
      osc.stop(now + 1.0);
      sub.stop(now + 1.0);
    } catch {
      // Аудио может быть заблокировано браузером — молча пропускаем
    }
  }
}
