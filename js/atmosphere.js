import * as THREE from 'three';
import { G } from './state.js';

export function initAtmosphere() {
  const $ = G.$;
  const clamp = G.clamp;
  const lerp = G.lerp;

  /* =========================================================================
   * 12. СМЕНА ВРЕМЕНИ СУТОК (И ЗАКАТНАЯ СЦЕНА ДЛЯ ГЛАВНОГО МЕНЮ)
   * ========================================================================= */
  /* -------------------------------------------------------------------------
   * ПАЛИТРА ВРЕМЕНИ СУТОК
   * Источник: референс `Cover art.bmp`. Доминирующие цвета обложки:
   *   #181830 15%  #303030 13%  #486090 9%  #181818 7%  #303048 5.5%
   *   #183018 5%   #303018 4%  #304878 4%  #483030 3%
   * Характер: тёмная холодная ночь с засветкой города, низкая насыщенность,
   * без неона. Небо и туман держим в сине-серых тонах, свет — нейтрально-холодный.
   * Меняя эти значения, обновляйте docs/STYLE.md.
   * ---------------------------------------------------------------------- */
  const todPalettes = {
    day: {
      top: new THREE.Color(0x2a5c94),
      mid: new THREE.Color(0x7fa9c9),
      bot: new THREE.Color(0xc9dae8),
      fog: new THREE.Color(0x9ab8ce),
      cloud: new THREE.Color(0xe8eef5),
      sunCol: new THREE.Color(0xfff0d6),
      hemiSky: new THREE.Color(0xd6e6f2),
      hemiGround: new THREE.Color(0x2b3640),
      sunInt: 2.3,
      hemiInt: 1.25,
      headInt: 0.7
    },
    sunset: {
      top: new THREE.Color(0x241a3a),
      mid: new THREE.Color(0xa85a68),
      bot: new THREE.Color(0xd98455),
      fog: new THREE.Color(0x8f5a68),
      cloud: new THREE.Color(0xc98a74),
      sunCol: new THREE.Color(0xe08a5a),
      hemiSky: new THREE.Color(0xb48c86),
      hemiGround: new THREE.Color(0x2a2320),
      sunInt: 1.65,
      hemiInt: 0.85,
      headInt: 2.6
    },
    night: {
      top: new THREE.Color(0x121a30),
      mid: new THREE.Color(0x1e2a44),
      bot: new THREE.Color(0x2c3a58),
      fog: new THREE.Color(0x1b2740),
      cloud: new THREE.Color(0x36445e),
      sunCol: new THREE.Color(0x9aabc4),
      hemiSky: new THREE.Color(0x5a6a86),
      hemiGround: new THREE.Color(0x141a26),
      sunInt: 0.40,
      hemiInt: 0.30,
      headInt: 4.8
    }
  };

  G.todCycleTime = 0.38;
  G.highBeamTimer = 0;
  G.highBeamCooldown = 0;

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }
  G.smoothstep = smoothstep;

  function updateAtmosphereAndTimeOfDay(dt, playerS) {
    if (!G.started && !G.ended) {
      G.todCycleTime = 0.385;
    } else if (G.started && !G.ended) {
      G.todCycleTime = (G.todCycleTime + dt * 0.0085) % 1;
    }

    let pA, pB, t, label;
    if (G.todCycleTime < 0.4) {
      pA = todPalettes.day; pB = todPalettes.sunset;
      t = smoothstep(0.25, 0.4, G.todCycleTime);
      label = t < 0.5 ? '☀ ДЕНЬ' : '🌇 ЗАКАТ';
    } else if (G.todCycleTime < 0.7) {
      pA = todPalettes.sunset; pB = todPalettes.night;
      t = smoothstep(0.4, 0.55, G.todCycleTime);
      label = t < 0.5 ? '🌇 ЗАКАТ' : '🌙 НОЧЬ';
    } else {
      pA = todPalettes.night; pB = todPalettes.day;
      t = smoothstep(0.82, 0.98, G.todCycleTime);
      label = t < 0.5 ? '🌙 НОЧЬ' : '☀ ДЕНЬ';
    }

    let inTunnel = false;
    for (const ms of G.megaStructures) {
      if (ms.userData.type === 'tunnel' && Math.abs(playerS - ms.userData.s) < ms.userData.length * 0.55) {
        inTunnel = true;
        break;
      }
    }

    G.skyDomeMat.uniforms.topColor.value.copy(pA.top).lerp(pB.top, t);
    G.skyDomeMat.uniforms.midColor.value.copy(pA.mid).lerp(pB.mid, t);
    G.skyDomeMat.uniforms.botColor.value.copy(pA.bot).lerp(pB.bot, t);
    G.scene.fog.color.copy(pA.fog).lerp(pB.fog, t);
    G.cloudMat.color.copy(pA.cloud).lerp(pB.cloud, t);
    G.sunLight.color.copy(pA.sunCol).lerp(pB.sunCol, t);
    G.hemiLight.color.copy(pA.hemiSky).lerp(pB.hemiSky, t);
    G.hemiLight.groundColor.copy(pA.hemiGround).lerp(pB.hemiGround, t);

    const baseSunInt = lerp(pA.sunInt, pB.sunInt, t);
    G.sunLight.intensity = inTunnel ? baseSunInt * 0.25 : baseSunInt;
    G.hemiLight.intensity = inTunnel ? 0.35 : lerp(pA.hemiInt, pB.hemiInt, t);

    const isNightish = (G.todCycleTime >= 0.36 && G.todCycleTime <= 0.88) || inTunnel;
    const baseHeadInt = inTunnel ? 5.2 : lerp(pA.headInt, pB.headInt, t);
    const beamBoost = G.highBeamTimer > 0 ? 3.8 : 1.0;

    for (const sp of G.bikeSpotLights) {
      sp.intensity = baseHeadInt * beamBoost;
      sp.distance = G.highBeamTimer > 0 ? 135 : 92;
    }

    const px = G.bikeRoot.position.x, pz = G.bikeRoot.position.z;
    G.skyDome.position.set(px, 0, pz);

    if (!G.started && !G.ended) {
      G.sunBody.position.set(px + 28, 36, pz - 275);
      G.sunBody.visible = true;
      G.moonBody.visible = false;
    } else {
      const sunAngle = G.todCycleTime * Math.PI * 2;
      G.sunBody.position.set(px + Math.cos(sunAngle) * 180, Math.sin(sunAngle) * 140 + 35, pz - 260);
      G.sunBody.visible = G.sunBody.position.y > -10;
      G.moonBody.position.set(px - Math.cos(sunAngle) * 180, -Math.sin(sunAngle) * 140 + 35, pz - 260);
      G.moonBody.visible = G.moonBody.position.y > -10;
    }

    for (const c of G.clouds) {
      c.userData.ox += c.userData.driftSpeed * dt;
      if (c.userData.ox > 230) c.userData.ox = -230;
      c.position.set(px + c.userData.ox, c.userData.oy, pz + c.userData.oz);
    }

    const badgeTod = $('badge-tod');
    if (badgeTod) badgeTod.textContent = inTunnel ? '🚇 ТОННЕЛЬ' : label;

    return isNightish;
  }
  G.updateAtmosphereAndTimeOfDay = updateAtmosphereAndTimeOfDay;
}
