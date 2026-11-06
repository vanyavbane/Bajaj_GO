import { G } from './state.js';
import { createVehicleModel } from './models/vehicles.js';

export function initTraffic() {
  /* =========================================================================
   * 9. ТРАФИК (СЕДАНЫ, ТАКСИ, ГАЗЕЛИ, АВТОБУСЫ И СТАНДАРТНЫЙ BAJAJ QUTE)
   * ========================================================================= */
  const QUTE_TRAFFIC_LANE = 3;
  const QUTE_TRAFFIC_SPEED = 50;
  G.trafficPool = [];
  const vehicleColors = [0xd8dee9, 0xb71c1c, 0x1565c0, 0x2e7d32, 0x455a64, 0x6d4c41, 0x37474f, 0xf5f5f5];
  const vehicleTypes = ['sedan', 'taxi', 'gazelle_flatbed', 'qute_traffic', 'gazelle_van', 'bus', 'sedan'];

  for (let i = 0; i < 18; i++) {
    const vType = vehicleTypes[i % vehicleTypes.length];
    const model = createVehicleModel(vType, vehicleColors[i % vehicleColors.length]);
    G.scene.add(model.root);

    G.trafficPool.push(parkedTraffic(model, trafficLane(vType, i % 4), 35 + i * 26));
  }

  function trafficLane(type, fallbackLane) {
    return type === 'qute_traffic' ? QUTE_TRAFFIC_LANE : fallbackLane;
  }

  function parkedTraffic(model, laneIdx, s) {
    return {
      model,
      laneIdx,
      targetLaneIdx: laneIdx,
      lateralOffset: G.LANE_OFFSETS[laneIdx],
      s,
      speedKmh: model.type === 'qute_traffic' ? QUTE_TRAFFIC_SPEED : G.LANE_SPEEDS[laneIdx],
      changingLane: false,
      flashReactTimer: 0,
      steerAngle: 0,
      nearMissAwarded: false,
      jumpedInCurrentJump: false
    };
  }

  function resetTrafficVehicle(car, newS, forcedLane = null) {
    const laneIdx = trafficLane(
      car.model.type,
      forcedLane !== null ? forcedLane : Math.floor(Math.random() * 4)
    );
    Object.assign(car, parkedTraffic(car.model, laneIdx, newS));
    car.model.alertSprite.visible = false;
  }
  G.resetTrafficVehicle = resetTrafficVehicle;
}
