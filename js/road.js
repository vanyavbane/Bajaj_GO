import * as THREE from 'three';
import { G } from './state.js';

export function initRoad() {

  /* =========================================================================
   * 3. ГЕОМЕТРИЯ ДОРОГИ (КРИВЫЕ И ВЫСОТЫ ОТНОСИТЕЛЬНО ОСИ S)
   * ========================================================================= */
  G.ROAD_WIDTH = 19.0;
  G.ROAD_EDGE = G.ROAD_WIDTH * 0.5 - 0.5;
  G.LANE_OFFSETS = [-7.1, -2.35, 2.35, 7.1]; // 1-2 встречные, 3-4 попутные
  G.START_LANE = G.LANE_OFFSETS[3];
  G.LANE_SPEEDS = [40, 60, 70, 55];

  function roadX(s) {
    return Math.sin(s * 0.0042) * 34 + Math.cos(s * 0.0021) * 48;
  }
  G.roadX = roadX;
  function roadDX(s) {
    return Math.cos(s * 0.0042) * 34 * 0.0042 - Math.sin(s * 0.0021) * 48 * 0.0021;
  }
  G.roadDX = roadDX;
  function roadDDX(s) {
    return -Math.sin(s * 0.0042) * 34 * 0.0042 * 0.0042 - Math.cos(s * 0.0021) * 48 * 0.0021 * 0.0021;
  }
  G.roadDDX = roadDDX;
  function roadY(s) {
    return Math.sin(s * 0.055) * 1.65 + Math.cos(s * 0.029) * 1.15;
  }
  G.roadY = roadY;
  function roadDY(s) {
    return Math.cos(s * 0.055) * 1.65 * 0.055 - Math.sin(s * 0.029) * 1.15 * 0.029;
  }

  const _forward = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _up = new THREE.Vector3();
  const _zAxis = new THREE.Vector3();
  const _basis = new THREE.Matrix4();
  const _qRoad = new THREE.Quaternion();
  const _qExtra = new THREE.Quaternion();
  const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

  function placeOnRoad(obj, s, lateralOffset = 0, heightOffset = 0, extraYaw = 0, extraPitch = 0, extraRoll = 0) {
    const dx = roadDX(s);
    const dy = roadDY(s);
    // Касательная пути: ds даёт (roadDX, roadDY, -1). Нос модели смотрит в −Z.
    _forward.set(dx, dy, -1).normalize();
    _right.set(-_forward.z, 0, _forward.x);
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

    // Смещение по полосе — в горизонтали, как у ленты асфальта. Дорога без крена.
    const lh = Math.hypot(dx, 1) || 1;
    obj.position.set(
      roadX(s) + lateralOffset / lh,
      roadY(s) + heightOffset,
      -s + lateralOffset * dx / lh
    );
  }
  G.placeOnRoad = placeOnRoad;
}
