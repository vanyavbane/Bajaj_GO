import * as THREE from 'three';
import { readLanes } from './engine/lanes.js';
import { G } from './state.js';

export function initRoad() {

  /* =========================================================================
   * 3. ГЕОМЕТРИЯ ДОРОГИ (КРИВЫЕ И ВЫСОТЫ ОТНОСИТЕЛЬНО ОСИ S)
   * -------------------------------------------------------------------------
   * Ширину и полосы задаёт биом (js/biome.js) в initBiome(), который
   * вызывается раньше. Здесь конфиг только проверяется: подставлять
   * городские 4 полосы нельзя, иначе горы и МКАД молча станут городом.
   * ========================================================================= */
  readLanes(G);

  // Высота принадлежит биому. Кромку и курс считает он же.
  const roadY = (s) => G.biomeRoadY(s);
  G.roadY = roadY;
  const roadDY = (s) => G.biomeRoadDY(s);
  G.roadDY = roadDY;

  const _forward = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _up = new THREE.Vector3();
  const _zAxis = new THREE.Vector3();
  const _basis = new THREE.Matrix4();
  const _qRoad = new THREE.Quaternion();
  const _qExtra = new THREE.Quaternion();
  const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
  function orient(obj, fx, fy, fz, rx, rz, extraYaw, extraPitch, extraRoll) {
    _forward.set(fx, fy, fz);
    if (_forward.lengthSq() < 1e-8) _forward.set(0, 0, -1);
    else _forward.normalize();
    _right.set(rx, 0, rz);
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
    else _right.normalize();
    _up.crossVectors(_right, _forward).normalize();
    _zAxis.copy(_forward).negate();
    _basis.makeBasis(_right, _up, _zAxis);
    _qRoad.setFromRotationMatrix(_basis);
    if (extraYaw !== 0 || extraPitch !== 0 || extraRoll !== 0) {
      _euler.set(extraPitch, extraYaw, extraRoll);
      _qExtra.setFromEuler(_euler);
      _qRoad.multiply(_qExtra);
    }
    obj.quaternion.copy(_qRoad);
  }

  function placeOnRoad(obj, s, lateralOffset = 0, heightOffset = 0, extraYaw = 0, extraPitch = 0, extraRoll = 0) {
    const lat = lateralOffset;
    const here = G.embedRoad(s, lat);
    orient(obj, here.fx, roadDY(s), here.fz, here.rx, here.rz, extraYaw, extraPitch, extraRoll);
    obj.position.set(here.x, here.y + heightOffset, here.z);
  }
  G.placeOnRoad = placeOnRoad;
}
