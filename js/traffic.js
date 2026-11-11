import { classifyCarContact, isOncomingLane, menuTrafficNudge, playerHalfWidth, stepTrafficCar, trafficRecycle } from './engine/motion.js';
import { COMBO_WINDOW, nearMissPoints } from './engine/rules.js';
import { createVehicleModel } from './models/vehicles.js';
import { G } from './state.js';

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

  function updateTraffic(dt, now, isQute) {
    const playerHalfW = playerHalfWidth(isQute);
    const menuDemo = !G.started && !G.ended;
    for (const car of G.trafficPool) {
      const wasFlashing = car.flashReactTimer > 0;
      const step = stepTrafficCar(car, dt, G.LANE_OFFSETS);
      car.s = step.s;
      car.lateralOffset = step.lateralOffset;
      car.steerAngle = step.steerAngle;
      car.laneIdx = step.laneIdx;
      car.changingLane = step.changingLane;
      car.flashReactTimer = step.flashReactTimer;

      if (wasFlashing) {
        car.model.alertSprite.visible = Math.floor(now / 120) % 2 === 0;
        if (car.flashReactTimer <= 0) car.model.alertSprite.visible = false;
      }

      const recycle = trafficRecycle(car.s, G.playerS);
      if (recycle) resetTrafficVehicle(car, recycle.base + Math.random() * recycle.spread);

      const nudge = menuTrafficNudge(car.s, car.lateralOffset, G.playerS, G.laneOffset, menuDemo);
      if (nudge != null) car.s = nudge;

      const oncoming = isOncomingLane(car.laneIdx);
      const vehicleYaw = (oncoming ? Math.PI : 0) - car.steerAngle * 0.45;
      G.placeOnRoad(car.model.root, car.s, car.lateralOffset, 0, vehicleYaw);

      const distToPlayer = Math.abs(car.s - G.playerS);
      const useLod = distToPlayer > 145;
      car.model.hiDetail.visible = !useLod;
      car.model.loDetail.visible = useLod;

      if (!useLod) {
        const wheelSpin = (recycle ? 0 : step.move) * 1.6;
        for (const w of car.model.wheels) w.rotation.x -= wheelSpin;
        for (const fp of car.model.frontPivots) fp.rotation.y = -car.steerAngle;
      }

      if (menuDemo || G.ended) continue;
      const kind = classifyCarContact({
        airborne: G.jumpState.airborne,
        height: G.jumpState.height,
        roofHeight: car.model.roofHeight,
        oncoming,
        alreadyJumped: car.jumpedInCurrentJump,
        dS: Math.abs(car.s - G.playerS),
        dLat: Math.abs(car.lateralOffset - G.laneOffset),
        halfLength: car.model.halfLength,
        halfWidth: car.model.halfWidth,
        playerHalfW,
        speed: G.speed,
        cooldown: G.accidentCooldown,
        nearMissAwarded: car.nearMissAwarded
      });
      if (kind === 'overfly') {
        car.jumpedInCurrentJump = true;
        G.jumpState.carsJumped++;
        const cCount = G.jumpState.carsJumped;
        const side = car.lateralOffset < G.laneOffset ? 'left' : 'right';
        G.spawnOverflyParticles(car.model.root.position);
        G.pushFeed(`ПЕРЕЛЁТ ×${cCount}`, 'overfly', cCount, side);
        if (cCount >= 3) G.triggerSlowMo();
      } else if (kind === 'crash') {
        G.handleAccident(car);
      } else if (kind === 'near') {
        car.nearMissAwarded = true;
        G.comboCount++;
        G.comboTimer = COMBO_WINDOW;
        const pts = nearMissPoints(G.comboCount, G.laneOffset);
        G.score += pts;
        const side = car.lateralOffset < G.laneOffset ? 'left' : 'right';
        G.pushFeed(`КОМБО ×${G.comboCount} · +${pts} ₽`, 'combo', G.comboCount, side);
      }
    }
  }
  G.updateTraffic = updateTraffic;
}
