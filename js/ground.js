import * as THREE from 'three';
import { G } from './state.js';
import { outwardFrom } from './engine/fork.js';
import { outerRibbon, shoulderLats, vergeAt } from './engine/asphalt.js';
import { stripSeam } from './engine/roadside.js';

/* Земля — отдельный слой. Она начинается от кромки асфальта.
 * Запас под тротуар есть только у шоссе: там тротуар нарисован своим мешем.
 * Справа от съезда этого запаса нет, иначе между асфальтом и травой дыра. */

const RIBBON_LEN = 350;
const RIBBON_SEGS = 112;
const RIBBON_BEHIND = 28;
const ROW = RIBBON_SEGS + 1;

export function initGround() {
  const sampleS = new Float32Array(ROW);
  const sampleY = new Float32Array(ROW);
  const sampleCity = new Float32Array(ROW);

  function makeSlope() {
    const geo = new THREE.PlaneGeometry(85, RIBBON_LEN, 2, RIBBON_SEGS);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, G.M.grass);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    G.scene.add(mesh);
    return mesh;
  }

  const slopeLeft = makeSlope();
  const slopeRight = makeSlope();

  function pinchRow(pos, row) {
    if (row < 1) return;
    const base = (row - 1) * 3;
    let x = 0;
    let y = 0;
    let z = 0;
    for (let i = 0; i < 3; i++) {
      x += pos.getX(base + i);
      y += pos.getY(base + i);
      z += pos.getZ(base + i);
    }
    x /= 3;
    y /= 3;
    z /= 3;
    for (let i = 0; i < 3; i++) pos.setXYZ(base + i, x, y, z);
  }

  /** Откос держится внешней живой кромки. Если съезд торчит дальше дороги байка, земля идёт за ним. */
  function skirt(s, side) {
    const edges = G.roadEdgesAt(s);
    const outer = outerRibbon(edges, side);
    const span = G.drivenSpanAt(s);
    if (!outer && (!span || span.width < 0.5)) return null;
    const driven = span && span.width >= 0.5
      ? { edge: side < 0 ? span.left : span.right, center: span.mid, half: span.width * 0.5 }
      : null;
    let ribbon = outer || driven;
    if (outer && driven) {
      const further = side < 0 ? outer.edge < driven.edge - 0.5 : outer.edge > driven.edge + 0.5;
      ribbon = further ? outer : driven;
    }
    return { edges, edge: ribbon.edge, center: ribbon.center, half: ribbon.half };
  }

  function shade(geo) {
    const pos = geo.attributes.position.array;
    const norm = geo.attributes.normal.array;
    for (let r = 0; r < ROW; r++) {
      const ahead = r < ROW - 1;
      const r2 = ahead ? r + 1 : r - 1;
      const sign = ahead ? 1 : -1;
      for (let slot = 0; slot < 3; slot++) {
        const o = (r * 3 + slot) * 3;
        const n = (r2 * 3 + slot) * 3;
        const ax = (pos[n] - pos[o]) * sign;
        const ay = (pos[n + 1] - pos[o + 1]) * sign;
        const az = (pos[n + 2] - pos[o + 2]) * sign;
        const across = slot < 2 ? slot + 1 : slot - 1;
        const b = (r * 3 + across) * 3;
        const vx = pos[b] - pos[o];
        const vy = pos[b + 1] - pos[o + 1];
        const vz = pos[b + 2] - pos[o + 2];
        let nx = ay * vz - az * vy;
        let ny = az * vx - ax * vz;
        let nz = ax * vy - ay * vx;
        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const len = Math.hypot(nx, ny, nz) || 1;
        norm[o] = nx / len;
        norm[o + 1] = ny / len;
        norm[o + 2] = nz / len;
      }
    }
    geo.attributes.normal.needsUpdate = true;
  }

  function updateGround(playerS) {
    for (let r = 0; r < ROW; r++) {
      const frac = r / RIBBON_SEGS;
      const s = playerS - RIBBON_BEHIND + (1 - frac) * RIBBON_LEN;
      sampleS[r] = s;
      sampleY[r] = G.roadY(s);
      sampleCity[r] = G.cityWeightAtS(s);
    }
    const posL = slopeLeft.geometry.attributes.position;
    const posR = slopeRight.geometry.attributes.position;
    const sh = G.shoulder;
    let prevLeft = null;
    let prevRight = null;
    for (let r = 0; r < ROW; r++) {
      const s = sampleS[r];
      const cy = sampleY[r];
      const leftSkirt = skirt(s, -1);
      const rightSkirt = skirt(s, 1);
      const city = sh.cityEdge * sampleCity[r];
      const leftApron = leftSkirt ? vergeAt(leftSkirt.edges, leftSkirt.edge, city) : 0;
      const rightApron = rightSkirt ? vergeAt(rightSkirt.edges, rightSkirt.edge, city) : 0;
      const left = shoulderLats(leftSkirt ? leftSkirt.half : 0, leftApron, sh);
      const right = shoulderLats(rightSkirt ? rightSkirt.half : 0, rightApron, sh);
      const embW = Math.max(0, Math.min(1, G.embankmentWeightAtS(s)));
      const mix = (a, b) => a + (b - a) * embW;
      const half = rightSkirt ? rightSkirt.half : 0;
      const rLip = mix(right.lip, half);
      const rBerm = mix(right.berm, 17);
      const rFar = mix(right.far, 30);
      const rLipY = mix(sh.lipY, 0.08);
      const rBermY = mix(sh.bermY, 0.08);
      const rFarY = mix(sh.farY, -6);
      const place = (band, fromCenter, height) => {
        if (!band) {
          const p = G.embedRoad(s, 0);
          return [p.x, cy + height, p.z];
        }
        const lat = outwardFrom(band.edge, band.center, Math.max(0, fromCenter - band.half));
        const p = G.embedBeside(s, band.edge, lat);
        return [p.x, cy + height, p.z];
      };
      const idx = r * 3;
      const leftEdge = leftSkirt ? leftSkirt.edge : null;
      const rightEdge = rightSkirt ? rightSkirt.edge : null;
      const leftJump = stripSeam(prevLeft, leftEdge);
      const rightJump = stripSeam(prevRight, rightEdge);
      if (leftEdge != null) prevLeft = leftEdge;
      if (rightEdge != null) prevRight = rightEdge;
      posL.setXYZ(idx, ...place(leftSkirt, left.far, sh.farY));
      posL.setXYZ(idx + 1, ...place(leftSkirt, left.berm, sh.bermY));
      posL.setXYZ(idx + 2, ...place(leftSkirt, left.lip, sh.lipY));
      posR.setXYZ(idx, ...place(rightSkirt, rLip, rLipY));
      posR.setXYZ(idx + 1, ...place(rightSkirt, rBerm, rBermY));
      posR.setXYZ(idx + 2, ...place(rightSkirt, rFar, rFarY));
      if (leftJump) {
        const x = posL.getX(idx + 2);
        const y = posL.getY(idx + 2);
        const z = posL.getZ(idx + 2);
        posL.setXYZ(idx, x, y, z);
        posL.setXYZ(idx + 1, x, y, z);
        pinchRow(posL, r);
      }
      if (rightJump) {
        const x = posR.getX(idx);
        const y = posR.getY(idx);
        const z = posR.getZ(idx);
        posR.setXYZ(idx + 1, x, y, z);
        posR.setXYZ(idx + 2, x, y, z);
        pinchRow(posR, r);
      }
    }
    posL.needsUpdate = true;
    posR.needsUpdate = true;
    if (Number.isNaN(lastShade) || Math.abs(playerS - lastShade) >= 4) {
      lastShade = playerS;
      shade(slopeLeft.geometry);
      shade(slopeRight.geometry);
    }
  }

  let lastShade = NaN;
  G.updateGround = updateGround;
}
