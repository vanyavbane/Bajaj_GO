import { highbeamYieldLane } from './engine/motion.js';
import { G } from './state.js';

export function initHighbeam() {
  const $ = G.$;

  /* =========================================================================
   * 13. ДАЛЬНИЙ СВЕТ (КЛАВИША F)
   * ========================================================================= */
  function triggerHighBeam() {
    if (!G.started || G.ended || G.paused || G.uiModal || G.highBeamCooldown > 0) return;
    G.highBeamTimer = 0.42;
    G.highBeamCooldown = 0.85;
    $('badge-beam').hidden = false;

    for (const car of G.trafficPool) {
      const carLanes = G.lanesAtS(car.s);
      const lane = highbeamYieldLane(
        car, G.playerS, G.laneOffset, carLanes.oncomingCount, carLanes.count, carLanes.laneWidth
      );
      if (lane == null || car.onExit) continue;
      car.changingLane = true;
      car.targetLaneIdx = lane;
      car.speedKmh = carLanes.speeds[lane];
      car.flashReactTimer = 1.6;
      car.model.alertSprite.visible = true;
    }
  }
  G.triggerHighBeam = triggerHighBeam;
}
