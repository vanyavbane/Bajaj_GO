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

  // Профиль дороги принадлежит биому (js/biome.js): позиции и производные
  // смешиваются в одной точке, поэтому при смене локации нет скачков.
  const roadX = (s) => G.biomeRoadX(s);
  G.roadX = roadX;
  const roadDX = (s) => G.biomeRoadDX(s);
  G.roadDX = roadDX;
  const roadDDX = (s) => G.biomeRoadDDX(s);
  G.roadDDX = roadDDX;
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
