import * as THREE from 'three';
import { G } from './state.js';

/* =========================================================================
 * СВЕТ КАДРА
 * -------------------------------------------------------------------------
 * Небо и палитра остаются в atmosphere.js. Здесь то, что светит на сцену:
 * направленный свет и его тень, фары, свечение окон и фонарей.
 * Вызывается после updateAtmosphere, когда диск солнца уже стоит на месте.
 * ========================================================================= */

const BEAM_DAY = 0.7;
const BEAM_NIGHT = 4.8;
const BEAM_TUNNEL = 5.2;
const BEAM_SCALE = 6;

export function initLighting() {
  const sunFocus = new THREE.Vector3();
  const sunDir = new THREE.Vector3();
  const shadowRight = new THREE.Vector3();
  const shadowUp = new THREE.Vector3();
  let shadowFit = '';

  function fadeEmissive(mat, day, night, glow) {
    if (!mat) return;
    mat.emissiveIntensity = day + (night - day) * glow;
  }

  function applyNightLights(glow) {
    fadeEmissive(G.windowLitMat, 0.04, 0.85, glow);
    fadeEmissive(G.lampHeadMat, 0.05, 1.5, glow);
    fadeEmissive(G.mkadLightMat, 0.06, 1.8, glow);
    fadeEmissive(G.mkadGlassMat, 0.04, 0.9, glow);
    fadeEmissive(G.quayLampMat, 0.04, 0.9, glow);
    if (G.M) {
      fadeEmissive(G.M.headlightMat, 0.12, 1.55, glow);
      fadeEmissive(G.M.drlMat, 0.45, 1.6, glow);
      fadeEmissive(G.M.amberMat, 0.16, 1.15, glow);
    }
    fadeEmissive(G.trafficHeadMat, 0.1, 1.7, glow);
    fadeEmissive(G.trafficTailMat, 0.22, 1.15, glow);
    fadeEmissive(G.trafficBrakeMat, 0.25, 1.4, glow);
    fadeEmissive(G.trafficReverseMat, 0.1, 0.45, glow);
    fadeEmissive(G.trafficAmberMat, 0.18, 1.25, glow);
    fadeEmissive(G.trafficDrlMat, 0.4, 1.5, glow);
    if (G.trafficGlowMat) G.trafficGlowMat.opacity = 0.05 + 0.65 * glow;
    const braking = !!(G.keys && (G.keys.brake || G.stickBrake));
    const tail = 0.35 + 0.75 * glow;
    if (G.tailLightBrakeMat) G.tailLightBrakeMat.emissiveIntensity = braking ? tail * 3.1 : tail;
  }

  let beamWet = NaN;
  let beamNight = NaN;
  let beamHigh = false;
  let beamTunnel = false;

  function applyHeadlights(nightGlow) {
    if (!G.bikeSpotLights) return;
    const wet = G.weather ? Math.min(1, Math.max(0, G.weather.wet || 0)) : 0;
    const highOn = G.highBeamTimer > 0;
    const inTunnel = !!G.inTunnel;
    if (wet === beamWet && nightGlow === beamNight && highOn === beamHigh && inTunnel === beamTunnel) return;
    beamWet = wet;
    beamNight = nightGlow;
    beamHigh = highOn;
    beamTunnel = inTunnel;
    const beam = inTunnel ? BEAM_TUNNEL : BEAM_DAY + (BEAM_NIGHT - BEAM_DAY) * nightGlow;
    const wetBoost = 1 + 0.45 * wet * nightGlow;
    const high = highOn ? 3.8 : 1;
    const distance = highOn ? 135 : 92;
    for (const sp of G.bikeSpotLights) {
      sp.intensity = beam * wetBoost * high * BEAM_SCALE;
      sp.distance = distance;
    }
  }

  function snapShadowFocus() {
    const light = G.sunLight;
    const cam = light.shadow.camera;
    const mapSize = light.shadow.mapSize.x;
    if (!light.castShadow || mapSize < 2) return;
    shadowUp.set(0, 1, 0);
    shadowRight.crossVectors(shadowUp, sunDir);
    if (shadowRight.lengthSq() < 1e-8) return;
    shadowRight.normalize();
    shadowUp.crossVectors(sunDir, shadowRight);
    const texelX = (cam.right - cam.left) / mapSize;
    const texelY = (cam.top - cam.bottom) / mapSize;
    if (!(texelX > 0) || !(texelY > 0)) return;
    const focus = light.target.position;
    const tx = shadowRight.dot(focus);
    const ty = shadowUp.dot(focus);
    const ox = Math.round(tx / texelX) * texelX - tx;
    const oy = Math.round(ty / texelY) * texelY - ty;
    focus.addScaledVector(shadowRight, ox).addScaledVector(shadowUp, oy);
    light.position.addScaledVector(shadowRight, ox).addScaledVector(shadowUp, oy);
  }

  function aimSunAtPlayer() {
    if (!G.sunLight || !G.bikeRoot) return;
    G.bikeRoot.getWorldDirection(sunDir);
    if (sunDir.lengthSq() < 1e-6) sunDir.set(0, 0, -1);
    sunFocus.copy(G.bikeRoot.position).addScaledVector(sunDir, 16);

    const sun = G.sunBody;
    const moon = G.moonBody;
    const body = sun && sun.visible && sun.position.y > 4 ? sun
      : moon && moon.visible && moon.position.y > 4 ? moon
      : null;
    if (body) sunDir.copy(body.position).sub(sunFocus);
    else sunDir.set(-16, 42, -12);
    if (sunDir.lengthSq() < 1) sunDir.set(-16, 42, -12);
    sunDir.normalize();
    if (sunDir.y < 0.18) {
      sunDir.y = 0.18;
      sunDir.normalize();
    }

    const quality = G.shadowQuality === 'high' ? 'high' : G.shadowQuality === 'off' ? 'off' : 'low';
    const distance = quality === 'high' ? 72 : 56;
    G.sunLight.position.copy(sunFocus).addScaledVector(sunDir, distance);
    G.sunLight.target.position.copy(sunFocus);

    if (quality !== 'off' && quality !== shadowFit) {
      shadowFit = quality;
      const cam = G.sunLight.shadow.camera;
      const halfW = quality === 'high' ? 48 : 32;
      const halfH = quality === 'high' ? 36 : 24;
      cam.near = 4;
      cam.far = quality === 'high' ? 160 : 120;
      cam.left = -halfW;
      cam.right = halfW;
      cam.top = halfH;
      cam.bottom = -halfH;
      cam.updateProjectionMatrix();
    }
    if (quality !== 'off') snapShadowFocus();
  }

  let litGlow = -1;
  let litBrake = false;

  function updateFrameLighting() {
    const sunY = G.sunBody ? G.sunBody.position.y : 40;
    const nightGlow = G.inTunnel ? 1 : 1 - G.smoothstep(20, 100, sunY);
    G.nightGlow = nightGlow;
    const braking = !!(G.keys && (G.keys.brake || G.stickBrake));
    if (nightGlow !== litGlow || braking !== litBrake) {
      litGlow = nightGlow;
      litBrake = braking;
      applyNightLights(nightGlow);
    }
    applyHeadlights(nightGlow);
    aimSunAtPlayer();
  }
  G.updateFrameLighting = updateFrameLighting;
}
