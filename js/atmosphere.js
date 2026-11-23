import * as THREE from 'three';
import { BIOMES } from './engine/biomes.js';
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
      storm: new THREE.Color(0x3f4b5e),
      sunCol: new THREE.Color(0xfff0d6),
      hemiSky: new THREE.Color(0xd6e6f2),
      hemiGround: new THREE.Color(0x2b3640),
      sunInt: 2.3,
      hemiInt: 1.25
    },
    sunset: {
      top: new THREE.Color(0x241a3a),
      mid: new THREE.Color(0xa85a68),
      bot: new THREE.Color(0xd98455),
      fog: new THREE.Color(0x8f5a68),
      cloud: new THREE.Color(0xc98a74),
      storm: new THREE.Color(0x3b2438),
      sunCol: new THREE.Color(0xe08a5a),
      hemiSky: new THREE.Color(0xb48c86),
      hemiGround: new THREE.Color(0x2a2320),
      sunInt: 1.65,
      hemiInt: 0.85
    },
    night: {
      top: new THREE.Color(0x121a30),
      mid: new THREE.Color(0x1e2a44),
      bot: new THREE.Color(0x2c3a58),
      fog: new THREE.Color(0x1b2740),
      cloud: new THREE.Color(0x36445e),
      storm: new THREE.Color(0x10151f),
      sunCol: new THREE.Color(0x9aabc4),
      hemiSky: new THREE.Color(0x5a6a86),
      hemiGround: new THREE.Color(0x141a26),
      sunInt: 0.40,
      hemiInt: 0.30
    }
  };

  /* Небо локации читается из каталога, в том же порядке, что и веса биома. */
  const biomeAtmos = BIOMES.map((biome) => ({
    top: new THREE.Color(biome.sky.top),
    mid: new THREE.Color(biome.sky.mid),
    bot: new THREE.Color(biome.sky.bot),
    fog: new THREE.Color(biome.sky.fog),
    cloud: new THREE.Color(biome.sky.cloud),
    fogMul: biome.sky.fogMul,
    cloudY: biome.sky.cloudY,
    cloudScale: biome.sky.cloudScale,
  }));

  const _tintTop = new THREE.Color();
  const _tintMid = new THREE.Color();
  const _tintBot = new THREE.Color();
  const _tintFog = new THREE.Color();
  const _tintCloud = new THREE.Color();
  let _biomeFogMul = 1;
  let _biomeCloudY = 0;
  let _biomeCloudScale = 1;
  let _biomeField = 0;

  function blendBiomeAtmosphere(playerS) {
    const w = G.biomeWeightsAtS(playerS);
    const fieldIndex = (G.BIOMES || []).findIndex((b) => b.id === 'field');
    const w1 = fieldIndex >= 0 ? (w[fieldIndex] || 0) : 0;
    const mix = (target, key) => {
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < biomeAtmos.length; i++) {
        const wi = w[i] || 0;
        if (wi <= 0) continue;
        const c = biomeAtmos[i][key];
        r += c.r * wi; g += c.g * wi; b += c.b * wi;
      }
      target.setRGB(r, g, b);
    };
    mix(_tintTop, 'top');
    mix(_tintMid, 'mid');
    mix(_tintBot, 'bot');
    mix(_tintFog, 'fog');
    mix(_tintCloud, 'cloud');
    _biomeFogMul = 0; _biomeCloudY = 0; _biomeCloudScale = 0;
    for (let i = 0; i < biomeAtmos.length; i++) {
      const wi = w[i] || 0;
      if (wi <= 0) continue;
      _biomeFogMul += biomeAtmos[i].fogMul * wi;
      _biomeCloudY += biomeAtmos[i].cloudY * wi;
      _biomeCloudScale += biomeAtmos[i].cloudScale * wi;
    }
    if (_biomeFogMul <= 0) _biomeFogMul = 1;
    if (_biomeCloudScale <= 0) _biomeCloudScale = 1;
    _biomeField = w1;
  }

  G.todCycleTime = 0.38;
  G.highBeamTimer = 0;
  G.highBeamCooldown = 0;

  const FOG_BASE = 0.0024;
  const _skyTop = new THREE.Color();
  const _skyMid = new THREE.Color();
  const _skyBot = new THREE.Color();
  const _fogCol = new THREE.Color();
  const _cloudBase = new THREE.Color();
  const _stormCol = new THREE.Color();

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }
  G.smoothstep = smoothstep;

  function updateAtmosphereAndTimeOfDay(dt, playerS) {
    // Отладочная страница держит сутки на месте: цикл и меню их не сдвигают.
    if (typeof G.todHold === 'number') {
      G.todCycleTime = G.todHold;
    } else if (!G.started && !G.ended) {
      G.todCycleTime = 0.385;
    } else if (G.started && !G.ended) {
      G.todCycleTime = (G.todCycleTime + dt * 0.0085) % 1;
    }

    let pA, pB, t, label, mark;
    if (G.todCycleTime < 0.4) {
      pA = todPalettes.day; pB = todPalettes.sunset;
      t = smoothstep(0.25, 0.4, G.todCycleTime);
      mark = t < 0.5 ? 'sun' : 'sunset';
      label = t < 0.5 ? 'ДЕНЬ' : 'ЗАКАТ';
    } else if (G.todCycleTime < 0.7) {
      pA = todPalettes.sunset; pB = todPalettes.night;
      t = smoothstep(0.4, 0.55, G.todCycleTime);
      mark = t < 0.5 ? 'sunset' : 'moon';
      label = t < 0.5 ? 'ЗАКАТ' : 'НОЧЬ';
    } else {
      pA = todPalettes.night; pB = todPalettes.day;
      t = smoothstep(0.82, 0.98, G.todCycleTime);
      mark = t < 0.5 ? 'moon' : 'sun';
      label = t < 0.5 ? 'НОЧЬ' : 'ДЕНЬ';
    }

    let inTunnel = false;
    for (const ms of G.megaStructures) {
      if (ms.visible === false) continue;
      if (ms.userData.type === 'tunnel' && Math.abs(playerS - ms.userData.s) < ms.userData.length * 0.55) {
        inTunnel = true;
        break;
      }
    }

    const weather = G.weather;
    const wc = weather ? clamp(weather.cloud || 0, 0, 1) : 0;

    _skyTop.copy(pA.top).lerp(pB.top, t);
    _skyMid.copy(pA.mid).lerp(pB.mid, t);
    _skyBot.copy(pA.bot).lerp(pB.bot, t);
    _fogCol.copy(pA.fog).lerp(pB.fog, t);

    // Локация накладывает свой оттенок поверх времени суток.
    blendBiomeAtmosphere(playerS);
    _skyTop.multiply(_tintTop);
    _skyMid.multiply(_tintMid);
    _skyBot.multiply(_tintBot);
    _fogCol.multiply(_tintFog);

    // Дождь приглушает небо и сгущает дымку, но оставляет дорогу читаемой.
    if (wc > 0.001) {
      _skyTop.multiplyScalar(1 - 0.55 * wc);
      _skyMid.multiplyScalar(1 - 0.45 * wc);
      _skyBot.multiplyScalar(1 - 0.32 * wc);
      _fogCol.multiplyScalar(1 - 0.30 * wc);
    }

    G.skyDomeMat.uniforms.topColor.value.copy(_skyTop);
    G.skyDomeMat.uniforms.midColor.value.copy(_skyMid);
    G.skyDomeMat.uniforms.botColor.value.copy(_skyBot);
    if (G.paintEnvironment) G.paintEnvironment(_skyTop, _skyMid, _skyBot);
    G.scene.fog.color.copy(_fogCol);
    const fork = G.forkView ? 0.62 : 1;
    G.scene.fog.density = FOG_BASE * _biomeFogMul * (1 + 0.85 * wc) * fork;
    if (G.skyDomeMat.uniforms.fogColor) {
      G.skyDomeMat.uniforms.fogColor.value.copy(_fogCol);
      G.skyDomeMat.uniforms.fogDensity.value = G.scene.fog.density;
    }

    _cloudBase.copy(pA.cloud).lerp(pB.cloud, t);
    _stormCol.copy(pA.storm).lerp(pB.storm, t);
    G.cloudMat.color.copy(_cloudBase).lerp(_stormCol, wc).multiply(_tintCloud);
    if (G.stormCloudMat) {
      G.stormCloudMat.color.copy(_stormCol);
      G.stormCloudMat.opacity = wc * 0.92;
    }

    G.sunLight.color.copy(pA.sunCol).lerp(pB.sunCol, t);
    G.hemiLight.color.copy(pA.hemiSky).lerp(pB.hemiSky, t);
    G.hemiLight.groundColor.copy(pA.hemiGround).lerp(pB.hemiGround, t);

    const baseSunInt = lerp(pA.sunInt, pB.sunInt, t);
    G.sunLight.intensity = inTunnel ? baseSunInt * 0.25 : baseSunInt * (1 - 0.50 * wc);
    G.hemiLight.intensity = inTunnel ? 0.35 : lerp(pA.hemiInt, pB.hemiInt, t) * (1 + 0.18 * wc);

    G.inTunnel = inTunnel;

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

    for (let ci = 0; ci < G.clouds.length; ci++) {
      const c = G.clouds[ci];
      c.userData.ox += c.userData.driftSpeed * dt;
      if (c.userData.ox > 230) c.userData.ox = -230;
      // В поле облака реже: половина слоёв скрывается.
      c.visible = _biomeField < 0.55 || ci % 2 === 0;
      c.position.set(px + c.userData.ox, c.userData.oy - 12 * wc + _biomeCloudY, pz + c.userData.oz);
      c.scale.setScalar((1 + 0.16 * wc) * _biomeCloudScale);
    }

    // Грозовой слой плавно проявляется/рассеивается вместе с влажностью.
    if (G.stormClouds) {
      const stormVisible = wc > 0.015;
      G.stormCloudGroup.visible = stormVisible;
      if (stormVisible) {
        for (const c of G.stormClouds) {
          c.userData.ox += c.userData.driftSpeed * dt;
          if (c.userData.ox > 260) c.userData.ox = -260;
          c.position.set(px + c.userData.ox, c.userData.oy - 15 * wc, pz + c.userData.oz);
        }
      }
    }

    const badgeTod = $('badge-tod');
    if (badgeTod) {
      const ico = badgeTod.querySelector('sl-icon');
      const text = badgeTod.querySelector('span');
      if (ico) ico.setAttribute('name', inTunnel ? 'train-front' : mark);
      if (text) text.textContent = inTunnel ? 'ТОННЕЛЬ' : label;
    }
  }
  G.updateAtmosphereAndTimeOfDay = updateAtmosphereAndTimeOfDay;
}
