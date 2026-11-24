import * as THREE from 'three';
import { sfxRate } from './engine/audio.ts';
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

  // Звуком теперь управляет js/audio.js: шины, громкость и заменяемые MP3.
  // Здесь остаются только игровые эффекты, которые не привязаны к файлам.
  let slowMoPitch = 1;

  function playJumpSound(type = 'overfly', combo = 1) {
    if (type === 'launch') {
      G.audio.playSfx('jump_launch');
      return;
    }
    G.audio.playSfx('jump_overfly', { rate: sfxRate(combo) });
  }
  G.playJumpSound = playJumpSound;

  // Короткий двухнотный отклик при въезде в маркерную зону съезда
  function playExitChime(isFood) {
    const base = isFood ? 660 : 520;
    for (const [i, step] of [1, 1.5].entries()) {
      G.audio.playTone({
        freq: base * step,
        dur: 0.18,
        type: 'sine',
        level: 0.07,
        delay: i * 0.075,
      });
    }
  }
  G.playExitChime = playExitChime;

  const FEED_LIFE = 2.6;
  const FEED_MAX = 4;
  const feedItems = [];

  function feedTone(freq, dur, type, level, delay) {
    G.audio.playTone({ freq, dur, type, level, delay });
  }

  function playFeedSound(kind, level) {
    if (kind === 'overfly') {
      playJumpSound('overfly', level);
      return;
    }
    if (kind === 'land') {
      feedTone(520, 0.16, 'sine', 0.035);
      feedTone(780, 0.18, 'sine', 0.025, 0.08);
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
  }

  function pushFeed(text, tone, level, side = 'center') {
    const kind = tone || 'combo';
    const place = side === 'left' || side === 'right' ? side : 'center';
    playFeedSound(kind, level || 1);
    const feed = $('event-feed');
    if (G.uiModal || G.paused) feed.classList.add('frozen');
    const el = document.createElement('div');
    el.className = 'feed-item ' + kind + ' side-' + place;
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
    if (G.audio) G.audio.setPitch(1);
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
    if (G.audio) G.audio.setPitch(slowMoPitch);
    G.slowMoFactor = slowMoFactor;
    return slowMoFactor;
  }
  G.updateSlowMo = updateSlowMo;

  // Низкий «вдох» при входе в замедление.
  function playSlowMoEnter() {
    G.audio.playTone({
      freq: 320, sweepTo: 92, dur: 1, type: 'sawtooth', level: 0.07,
      filterFrom: 1400, filterTo: 260,
    });
    G.audio.playTone({ freq: 160, sweepTo: 46, dur: 1, type: 'sine', level: 0.05 });
  }
}
