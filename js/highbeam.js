import { vehicleLat } from './engine/carriage.js';
import { surfaceWorld } from './engine/exit.js';
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
    if (G.audio) G.audio.playSfx('high_beam');
    $('badge-beam').hidden = false;

    const riderLat = G.riderLatAt(G.playerS);
    for (const car of G.trafficPool) {
      const road = G.roadsAt(car.s);
      const carLat = vehicleLat(road, car.lateralOffset, !!car.onExit);
      if (Math.abs(carLat - riderLat) >= road.lanes.laneWidth) continue;
      const own = car.onExit && road.spot && road.spot.ribbon && !road.spot.ribbon.joined;
      const scale = road.scale || 1;
      const playerLane = own
        ? riderLat - surfaceWorld(road.axis, road.spot, true)
        : (riderLat - road.axis) / scale;
      const lane = highbeamYieldLane(car, G.playerS, playerLane, road.lanes);
      if (lane == null) continue;
      car.changingLane = true;
      car.targetLaneIdx = lane;
      car.speedKmh = road.lanes.speeds[lane];
      car.flashReactTimer = 1.6;
      car.model.alertSprite.visible = true;
    }
  }
  G.triggerHighBeam = triggerHighBeam;
}
