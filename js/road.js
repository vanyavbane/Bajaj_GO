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

  // Профиль и кромка принадлежат биому. Повторный расчёт здесь затирал
  // ROAD_EDGE формулой без масштаба полос.
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
  const _pA = new THREE.Vector3();
  const _pB = new THREE.Vector3();

  /** Смещение полосы: число либо функция от s — тогда тангенс идёт по линии полосы. */
  function latAt(lat, s) {
    return typeof lat === 'function' ? lat(s) : lat;
  }

  /** Мировая точка дороги со сдвигом оси развилки — та же формула, что и у позиции. */
  function roadPoint(out, s, lat, heightOffset) {
    const dx = roadDX(s);
    const lh = Math.hypot(dx, 1) || 1;
    const total = lat + (G.forkCenterShiftAtS ? G.forkCenterShiftAtS(s) : 0);
    out.set(roadX(s) + total / lh, roadY(s) + heightOffset, -s + total * dx / lh);
    return out;
  }

  /**
   * Мировое смещение для касательной. Числовой world-offset callers обычно
   * считают в точке s и он уже включает разъезд ветки (splitLateralShiftAtS).
   * Чтобы касательная шла вдоль ветки, а не вдоль оси, переносим вклад
   * разъезда на sSample: lat + forkSide(lat)*(spread(sSample) - spread(s)).
   * Сдвиг оси (centerShift) добавляется отдельно в roadPoint.
   */
  function latForTangent(lat, sSample, sRef) {
    if (typeof lat === 'function') return lat(sSample);
    if (!G.forkSpreadAtS) return lat;
    const spreadRef = G.forkSpreadAtS(sRef);
    const spreadSample = G.forkSpreadAtS(sSample);
    if (spreadRef <= 0.001 && spreadSample <= 0.001) return lat;
    const side = lat <= 0 ? -1 : 1;
    return lat + side * (spreadSample - spreadRef);
  }

  function placeOnRoad(obj, s, lateralOffset = 0, heightOffset = 0, extraYaw = 0, extraPitch = 0, extraRoll = 0) {
    const dx = roadDX(s);
    const dy = roadDY(s);
    const shift = G.forkCenterShiftAtS ? G.forkCenterShiftAtS(s) : 0;
    // Касательную берём по фактическому пути объекта (с учётом сдвига/разъезда),
    // иначе на развязке и при сходе сдвига после неё байк, трафик и декорации
    // едут боком. На обычной дороге это даёт ту же ориентацию.
    const h = 0.8;
    roadPoint(_pA, s - h, latForTangent(lateralOffset, s - h, s), 0);
    roadPoint(_pB, s + h, latForTangent(lateralOffset, s + h, s), 0);
    _forward.subVectors(_pB, _pA);
    if (_forward.lengthSq() < 1e-8) _forward.set(dx, dy, -1);
    _forward.normalize();
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
    const lat = latAt(lateralOffset, s) + shift;
    obj.position.set(
      roadX(s) + lat / lh,
      roadY(s) + heightOffset,
      -s + lat * dx / lh
    );
  }
  G.placeOnRoad = placeOnRoad;
}
