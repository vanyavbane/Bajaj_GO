import { classifyCarContact, isOncomingLane, menuTrafficNudge, playerHalfWidth, stepTrafficCar, trafficRecycle } from './engine/motion.js';
import { COMBO_WINDOW, nearMissPoints } from './engine/rules.js';
import { createVehicleModel } from './models/vehicles.js';
import { G } from './state.js';

export function initTraffic() {
  /* =========================================================================
   * 9. ТРАФИК
   * -------------------------------------------------------------------------
   * 20 моделей с весами: легковые, кроссоверы, SUV, Газели, КАМАЗ, фура и
   * автобус. Тяжёлые машины гарантированно есть в каждом биоме, даже если
   * предпочтения биома заняли все слоты.
   * ========================================================================= */
  const QUTE_TRAFFIC_LANE = 3;
  const QUTE_TRAFFIC_SPEED = 50;
  const HEAVY_TYPES = new Set(['kamaz', 'truck', 'bus']);
  G.trafficPool = [];
  const vehicleColors = [0xd8dee9, 0xb71c1c, 0x1565c0, 0x2e7d32, 0x455a64, 0x6d4c41, 0x37474f, 0xf5f5f5];
  const vehicleTypes = [
    'sedan', 'sedan', 'sedan',
    'hatchback', 'hatchback',
    'crossover', 'crossover',
    'taxi', 'taxi',
    'suv', 'suv',
    'gazelle_flatbed', 'gazelle_flatbed',
    'gazelle_van', 'gazelle_van',
    'kamaz', 'truck', 'bus',
    'qute_traffic', 'qute_traffic'
  ];
  const POOL_SIZE = 20;

  for (let i = 0; i < POOL_SIZE; i++) {
    const vType = vehicleTypes[i % vehicleTypes.length];
    const model = createVehicleModel(vType, vehicleColors[i % vehicleColors.length], i);
    G.scene.add(model.root);

    G.trafficPool.push(parkedTraffic(model, trafficLane(vType, i % 4), 35 + i * 26));
  }

  const heavyIndices = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    if (HEAVY_TYPES.has(G.trafficPool[i].model.type)) heavyIndices.push(i);
  }

  /* Какие машины пула работают в каждом биоме. Сначала идут предпочтительные
   * типы (грузовики в полях, легковые в лесу), затем остальные — до лимита. */
  const activeMask = [];
  for (let b = 0; b < 4; b++) {
    const traffic = G.BIOMES[b].traffic;
    const order = [];
    for (let i = 0; i < POOL_SIZE; i++) order.push(i);
    const rank = (i) => {
      const r = traffic.pref.indexOf(G.trafficPool[i].model.type);
      return r < 0 ? 99 : r;
    };
    order.sort((a, c) => (rank(a) - rank(c)) || (a - c));
    const mask = new Uint8Array(POOL_SIZE);
    const limit = Math.min(traffic.count, POOL_SIZE);
    for (let k = 0; k < limit; k++) mask[order[k]] = 1;

    // Хотя бы одна тяжёлая машина на дороге в любом биоме.
    if (limit >= 3 && !heavyIndices.some((i) => mask[i] === 1)) {
      for (let k = limit - 1; k >= 0; k--) {
        const idx = order[k];
        if (!heavyIndices.includes(idx)) {
          mask[idx] = 0;
          break;
        }
      }
      mask[heavyIndices[0]] = 1;
    }
    activeMask.push(mask);
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
      jumpedInCurrentJump: false,
      active: true,
      retiring: false
    };
  }

  function resetTrafficVehicle(car, newS, forcedLane = null) {
    const laneIdx = trafficLane(
      car.model.type,
      forcedLane !== null ? forcedLane : Math.floor(Math.random() * 4)
    );
    Object.assign(car, parkedTraffic(car.model, laneIdx, newS));
    car.model.alertSprite.visible = false;
    if (car.model.blinkers) {
      for (const blinker of car.model.blinkers) blinker.visible = false;
    }
    car.model.root.visible = true;
  }
  G.resetTrafficVehicle = resetTrafficVehicle;

  function updateTraffic(dt, now, isQute) {
    const playerHalfW = playerHalfWidth(isQute);
    const menuDemo = !G.started && !G.ended;
    const mask = activeMask[G.biomeDominant || 0] || activeMask[0];
    for (let i = 0; i < G.trafficPool.length; i++) {
      const car = G.trafficPool[i];
      const wantActive = mask[i] === 1;

      if (!car.active) {
        if (!wantActive) continue;
        // Машина возвращается в биом далеко впереди, вне видимости игрока.
        car.active = true;
        car.retiring = false;
        resetTrafficVehicle(car, G.playerS + 230 + Math.random() * 130);
      } else if (!wantActive) {
        car.retiring = true;
      }

      // Плавно подтягиваем скорость к лимиту текущего биома.
      const targetSpeed = car.model.type === 'qute_traffic'
        ? QUTE_TRAFFIC_SPEED
        : G.LANE_SPEEDS[car.laneIdx];
      car.speedKmh += (targetSpeed - car.speedKmh) * Math.min(1, dt * 1.6);

      const wasFlashing = car.flashReactTimer > 0;
      const step = stepTrafficCar(car, dt, G.LANE_OFFSETS);
      car.s = step.s;
      car.lateralOffset = step.lateralOffset;
      car.steerAngle = step.steerAngle;
      car.laneIdx = step.laneIdx;
      car.changingLane = step.changingLane;
      car.flashReactTimer = step.flashReactTimer;

      if (wasFlashing) {
        const blinkOn = Math.floor(now / 120) % 2 === 0;
        car.model.alertSprite.visible = blinkOn;
        if (car.model.blinkers) {
          for (const blinker of car.model.blinkers) blinker.visible = blinkOn;
        }
        if (car.flashReactTimer <= 0) {
          car.model.alertSprite.visible = false;
          if (car.model.blinkers) {
            for (const blinker of car.model.blinkers) blinker.visible = false;
          }
        }
      }

      const recycle = trafficRecycle(car.s, G.playerS);
      if (recycle) resetTrafficVehicle(car, recycle.base + Math.random() * recycle.spread);

      const nudge = menuTrafficNudge(car.s, car.lateralOffset, G.playerS, G.laneOffset, menuDemo);
      if (nudge != null) car.s = nudge;

      const oncoming = isOncomingLane(car.laneIdx);
      const vehicleYaw = (oncoming ? Math.PI : 0) - car.steerAngle * 0.45;
      G.placeOnRoad(car.model.root, car.s, car.lateralOffset, 0, vehicleYaw);

      // Машины, выбывшие из биома, доезжают и скрываются вдали.
      if (car.retiring && Math.abs(car.s - G.playerS) > 150) {
        car.active = false;
        car.retiring = false;
        car.model.root.visible = false;
        continue;
      }

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
