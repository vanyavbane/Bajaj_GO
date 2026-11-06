import { G } from './state.js';

export function initRoad() {
  const $ = G.$;
  const clamp = G.clamp;
  const lerp = G.lerp;

  /* =========================================================================
   * 3. ГЕОМЕТРИЯ ДОРОГИ (КРИВЫЕ И ВЫСОТЫ ОТНОСИТЕЛЬНО ОСИ S)
   * ========================================================================= */
  G.ROAD_WIDTH = 19.0;
  G.LANE_OFFSETS = [-7.1, -2.35, 2.35, 7.1]; // 1-2 встречные, 3-4 попутные
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

  function placeOnRoad(obj, s, lateralOffset = 0, heightOffset = 0, extraYaw = 0, extraPitch = 0, extraRoll = 0) {
    const yaw = -Math.atan(roadDX(s));
    const pitch = Math.atan(roadDY(s));
    const cx = roadX(s) + Math.cos(-yaw) * lateralOffset;
    const cz = -s + Math.sin(-yaw) * lateralOffset;
    const cy = roadY(s) + heightOffset;
    obj.position.set(cx, cy, cz);
    obj.rotation.order = 'YXZ';
    obj.rotation.y = yaw + extraYaw;
    obj.rotation.x = pitch + extraPitch;
    obj.rotation.z = extraRoll;
  }
  G.placeOnRoad = placeOnRoad;
}
