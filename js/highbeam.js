import { G } from './state.js';

export function initHighbeam() {
  const $ = G.$;
  const clamp = G.clamp;
  const lerp = G.lerp;

  /* =========================================================================
   * 13. ДАЛЬНИЙ СВЕТ (КЛАВИША F)
   * ========================================================================= */
  function triggerHighBeam() {
    if (!G.started || G.ended || G.highBeamCooldown > 0) return;
    G.highBeamTimer = 0.42;
    G.highBeamCooldown = 0.85;
    $('badge-beam').hidden = false;

    for (const car of G.trafficPool) {
      if (car.laneIdx < 2) continue;
      const distAhead = car.s - G.playerS;
      const latDiff = Math.abs(car.lateralOffset - G.laneOffset);
      if (distAhead >= 6 && distAhead <= 60 && latDiff < 2.9 && !car.changingLane) {
        car.changingLane = true;
        car.targetLaneIdx = (car.laneIdx === 2) ? 3 : 2;
        car.speedKmh = G.LANE_SPEEDS[car.targetLaneIdx];
        car.flashReactTimer = 1.6;
        car.model.alertSprite.visible = true;
      }
    }
  }
  G.triggerHighBeam = triggerHighBeam;
}
