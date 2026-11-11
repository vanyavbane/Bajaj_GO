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
      storm: new THREE.Color(0x3f4b5e),
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
      storm: new THREE.Color(0x3b2438),
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
      storm: new THREE.Color(0x10151f),
      sunCol: new THREE.Color(0x9aabc4),
      hemiSky: new THREE.Color(0x5a6a86),
      hemiGround: new THREE.Color(0x141a26),
      sunInt: 0.40,
      hemiInt: 0.30,
      headInt: 4.8
    }
  };

  /* -------------------------------------------------------------------------
   * БИОМНЫЕ ПОПРАВКИ К АТМОСФЕРЕ
   * Цвета-множители (≈1.0) накладываются поверх палитры времени суток,
   * поэтому цикл день → закат → ночь сохраняется, а локация меняет оттенок.
   * fogMul — плотность дымки, cloudY/cloudScale — высота и размер облаков.
   * ---------------------------------------------------------------------- */
  const biomeAtmos = [
    {
      // Город: нейтральная городская дымка.
      top: new THREE.Color(0xffffff), mid: new THREE.Color(0xffffff),
      bot: new THREE.Color(0xffffff), fog: new THREE.Color(0xf4f6fa),
      cloud: new THREE.Color(0xffffff),
      fogMul: 1.0, cloudY: 0, cloudScale: 1
    },
    {
      // Поле: тёплый горизонт, простор и ясный воздух.
      top: new THREE.Color(0xdce9ff), mid: new THREE.Color(0xffeed0),
      bot: new THREE.Color(0xfff3dd), fog: new THREE.Color(0xf6e9d0),
      cloud: new THREE.Color(0xfff6e4),
      fogMul: 0.78, cloudY: 5, cloudScale: 1.05
    },
    {
      // Лес: зелёная влажная дымка, низкие плотные облака.
      top: new THREE.Color(0xcfe1d2), mid: new THREE.Color(0xd9e8d1),
      bot: new THREE.Color(0xdde9d4), fog: new THREE.Color(0xccdcc6),
      cloud: new THREE.Color(0xdfe9da),
      fogMul: 1.3, cloudY: 2, cloudScale: 1.02
    },
    {
      // Горы: холодный разреженный воздух, облака ниже хребтов.
      top: new THREE.Color(0xc6daf4), mid: new THREE.Color(0xdbe9f8),
      bot: new THREE.Color(0xe6f0fa), fog: new THREE.Color(0xd6e3f2),
      cloud: new THREE.Color(0xeaf1fa),
      fogMul: 1.12, cloudY: -22, cloudScale: 1.16
    }
  ];

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
    const w0 = w[0], w1 = w[1], w2 = w[2], w3 = w[3];
    const a = biomeAtmos[0], b = biomeAtmos[1], c = biomeAtmos[2], d = biomeAtmos[3];
    _tintTop.setRGB(a.top.r * w0 + b.top.r * w1 + c.top.r * w2 + d.top.r * w3,
      a.top.g * w0 + b.top.g * w1 + c.top.g * w2 + d.top.g * w3,
      a.top.b * w0 + b.top.b * w1 + c.top.b * w2 + d.top.b * w3);
    _tintMid.setRGB(a.mid.r * w0 + b.mid.r * w1 + c.mid.r * w2 + d.mid.r * w3,
      a.mid.g * w0 + b.mid.g * w1 + c.mid.g * w2 + d.mid.g * w3,
      a.mid.b * w0 + b.mid.b * w1 + c.mid.b * w2 + d.mid.b * w3);
    _tintBot.setRGB(a.bot.r * w0 + b.bot.r * w1 + c.bot.r * w2 + d.bot.r * w3,
      a.bot.g * w0 + b.bot.g * w1 + c.bot.g * w2 + d.bot.g * w3,
      a.bot.b * w0 + b.bot.b * w1 + c.bot.b * w2 + d.bot.b * w3);
    _tintFog.setRGB(a.fog.r * w0 + b.fog.r * w1 + c.fog.r * w2 + d.fog.r * w3,
      a.fog.g * w0 + b.fog.g * w1 + c.fog.g * w2 + d.fog.g * w3,
      a.fog.b * w0 + b.fog.b * w1 + c.fog.b * w2 + d.fog.b * w3);
    _tintCloud.setRGB(a.cloud.r * w0 + b.cloud.r * w1 + c.cloud.r * w2 + d.cloud.r * w3,
      a.cloud.g * w0 + b.cloud.g * w1 + c.cloud.g * w2 + d.cloud.g * w3,
      a.cloud.b * w0 + b.cloud.b * w1 + c.cloud.b * w2 + d.cloud.b * w3);
    _biomeFogMul = a.fogMul * w0 + b.fogMul * w1 + c.fogMul * w2 + d.fogMul * w3;
    _biomeCloudY = a.cloudY * w0 + b.cloudY * w1 + c.cloudY * w2 + d.cloudY * w3;
    _biomeCloudScale = a.cloudScale * w0 + b.cloudScale * w1 + c.cloudScale * w2 + d.cloudScale * w3;
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
      if (ms.visible === false) continue;
      if (ms.userData.type === 'tunnel' && Math.abs(playerS - ms.userData.s) < ms.userData.length * 0.55) {
        inTunnel = true;
        break;
      }
    }

    const weather = G.weather;
    const wc = weather ? clamp(weather.cloud || 0, 0, 1) : 0;
    const wet = weather ? clamp(weather.wet || 0, 0, 1) : 0;

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
    G.scene.fog.color.copy(_fogCol);
    G.scene.fog.density = FOG_BASE * _biomeFogMul * (1 + 0.85 * wc);

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
    const isNightish = (G.todCycleTime >= 0.36 && G.todCycleTime <= 0.88) || inTunnel;
    const baseHeadInt = inTunnel ? 5.2 : lerp(pA.headInt, pB.headInt, t);
    const beamBoost = G.highBeamTimer > 0 ? 3.8 : 1.0;
    // На мокрой дороге ночью фары светят чуть ярче и «дороже».
    const wetBoost = isNightish ? 1 + 0.45 * wet : 1;

    for (const sp of G.bikeSpotLights) {
      sp.intensity = baseHeadInt * beamBoost * wetBoost;
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
    if (badgeTod) badgeTod.textContent = inTunnel ? '🚇 ТОННЕЛЬ' : label;

    return isNightish;
  }
  G.updateAtmosphereAndTimeOfDay = updateAtmosphereAndTimeOfDay;
}
