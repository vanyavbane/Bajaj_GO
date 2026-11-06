import { G } from './state.js';
import { createVehicleModel } from './models/vehicles.js';

export function initTraffic() {
  /* =========================================================================
   * 9. ТРАФИК (СЕДАНЫ, ТАКСИ, ГАЗЕЛИ, АВТОБУСЫ И СТАНДАРТНЫЙ BAJAJ QUTE)
   * ========================================================================= */
  G.trafficPool = [];
  const vehicleColors = [0xd8dee9, 0xb71c1c, 0x1565c0, 0x2e7d32, 0x455a64, 0x6d4c41, 0x37474f, 0xf5f5f5];
  const vehicleTypes = ['sedan', 'taxi', 'gazelle_flatbed', 'qute_traffic', 'gazelle_van', 'bus', 'sedan'];

  for (let i = 0; i < 18; i++) {
    const vType = vehicleTypes[i % vehicleTypes.length];
    const model = createVehicleModel(vType, vehicleColors[i % vehicleColors.length]);
    G.scene.add(model.root);

    const laneIdx = vType === 'qute_traffic' ? 3 : (i % 4);
    G.trafficPool.push({
      model,
      laneIdx,
      targetLaneIdx: laneIdx,
      lateralOffset: G.LANE_OFFSETS[laneIdx],
      s: 35 + i * 26,
      speedKmh: vType === 'qute_traffic' ? 50 : G.LANE_SPEEDS[laneIdx],
      changingLane: false,
      flashReactTimer: 0,
      steerAngle: 0,
      nearMissAwarded: false,
      jumpedInCurrentJump: false
    });
  }

  function resetTrafficVehicle(car, newS, forcedLane = null) {
    const isQuteTraffic = car.model.type === 'qute_traffic';
    const laneIdx = isQuteTraffic ? 3 : (forcedLane !== null ? forcedLane : Math.floor(Math.random() * 4));
    car.laneIdx = laneIdx;
    car.targetLaneIdx = laneIdx;
    car.lateralOffset = G.LANE_OFFSETS[laneIdx];
    car.s = newS;
    car.speedKmh = isQuteTraffic ? 50 : G.LANE_SPEEDS[laneIdx];
    car.changingLane = false;
    car.flashReactTimer = 0;
    car.steerAngle = 0;
    car.nearMissAwarded = false;
    car.jumpedInCurrentJump = false;
    car.model.alertSprite.visible = false;
  }
  G.resetTrafficVehicle = resetTrafficVehicle;
}
