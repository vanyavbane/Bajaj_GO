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

    const riderLat = G.riderLatAt(G.playerS);
    const bikeOnExit = G.drivenIsExitAt(G.playerS);
    for (const car of G.trafficPool) {
      const roads = G.roadsAt(car.s);
      const onExit = !!(car.onExit && roads.exit);
      const road = onExit ? roads.exit : roads.main;
      const carLat = G.trafficLatAt(car.s, car.lateralOffset, onExit);
      if (Math.abs(carLat - riderLat) >= road.lanes.laneWidth) continue;
      // На одной дороге номер полосы общий. На другой ленте место байка
      // переводится в её кадр: номера шоссе и съезда сами по себе не совпадают.
      const sameRoad = onExit === bikeOnExit;
      const scale = road.scale || 1;
      const playerLane = sameRoad ? G.laneOffset : (riderLat - road.axis) / scale;
      const lanes = lanesOf(road.lanes).map((lane) => (
        onExit ? { ...lane, direction: 'with' } : lane
      ));
      const lane = highbeamYieldLane(
        car, G.playerS, playerLane, lanes, road.lanes.laneWidth
      );
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
