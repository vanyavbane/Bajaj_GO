import { lanesOf } from './engine/lanes.js';
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
      const roads = G.roadsAt(car.s);
      const carLanes = car.onExit && roads.exit ? roads.exit.lanes : roads.main.lanes;
      const carLat = G.trafficLatAt(car.s, car.lateralOffset, car.onExit);
      if (Math.abs(carLat - G.riderLatAt(G.playerS)) >= carLanes.laneWidth) continue;
      const lane = highbeamYieldLane(
        car, G.playerS, G.laneOffset, lanesOf(carLanes), carLanes.laneWidth
      );
      if (lane == null) continue;
      car.changingLane = true;
      car.targetLaneIdx = lane;
      car.speedKmh = carLanes.speeds[lane];
      car.flashReactTimer = 1.6;
      car.model.alertSprite.visible = true;
    }
  }
  G.triggerHighBeam = triggerHighBeam;
}
