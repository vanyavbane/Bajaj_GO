import { clampLaneIndex, nearestLaneIndex, sameLaneOffset } from './engine/lanes.js';
import { classifyCarContact, isOncomingLane, menuTrafficNudge, playerHalfWidth, stepTrafficCar, trafficRecycle } from './engine/motion.js';
import { COMBO_WINDOW, laneSplitEdge, nearMissPoints } from './engine/rules.js';
import { createVehicleModel } from './models/vehicles.js';
import { G } from './state.js';

export function initTraffic() {
  /* =========================================================================
   * 9. ТРАФИК
   * -------------------------------------------------------------------------
   * 11 типов: легковые, кроссоверы, SUV, Газели, КАМАЗ, фура, автобус и Qute.
   * Размер пула — максимум из BIOMES[].traffic.count, типы по кругу.
   * Тяжёлые машины гарантированно есть в каждом биоме, даже если
   * предпочтения биома заняли все слоты.
   * ========================================================================= */
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
  const POOL_SIZE = Math.max(...G.BIOMES.map((biome) => biome.traffic.count));

  function lanesAt(s) {
    return G.getLaneConfig(G.roadBiomeAtS(s));
  }

  function quteLane(cfg) {
    const same = Math.max(1, cfg.count - cfg.oncomingCount);
    return cfg.oncomingCount + Math.min(same - 1, Math.max(0, same - 2));
  }

  function pickLane(cfg, model, forcedLane) {
    if (model.type === 'qute_traffic') return quteLane(cfg);
    if (forcedLane == null) return Math.floor(Math.random() * cfg.count);
    return clampLaneIndex(forcedLane, cfg.count);
  }

  for (let i = 0; i < POOL_SIZE; i++) {
    const vType = vehicleTypes[i % vehicleTypes.length];
    const model = createVehicleModel(vType, vehicleColors[i % vehicleColors.length], i);
    G.scene.add(model.root);

    const s0 = 35 + i * 26;
    G.trafficPool.push(parkedTraffic(model, s0, i));
  }

  const heavyIndices = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    if (HEAVY_TYPES.has(G.trafficPool[i].model.type)) heavyIndices.push(i);
  }

  /* Какие машины пула работают в каждом биоме. Сначала идут предпочтительные
   * типы (грузовики в полях, легковые в лесу), затем остальные — до лимита. */
  const activeMask = [];
  for (let b = 0; b < G.BIOMES.length; b++) {
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

  function parkedTraffic(model, s, forcedLane = null) {
    const cfg = lanesAt(s);
    const idx = pickLane(cfg, model, forcedLane);
    return {
      model,
      laneIdx: idx,
      targetLaneIdx: idx,
      lateralOffset: cfg.offsets[idx],
      s,
      speedKmh: model.type === 'qute_traffic' ? QUTE_TRAFFIC_SPEED : cfg.speeds[idx],
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
    Object.assign(car, parkedTraffic(car.model, newS, forcedLane));
    car.model.alertSprite.visible = false;
    if (car.model.blinkers) {
      for (const blinker of car.model.blinkers) blinker.visible = false;
    }
    car.model.root.visible = true;
  }
  G.resetTrafficVehicle = resetTrafficVehicle;

  /** Полоса машины — ближайший центр в биоме её точки, не старый номер. */
  function settleCarLane(car, cfg) {
    if (car.changingLane) return;
    const idx = nearestLaneIndex(cfg.offsets, car.lateralOffset);
    const target = cfg.offsets[idx];
    if (idx === car.laneIdx && Math.abs(car.lateralOffset - target) < 0.05) return;
    const jump = Math.abs((car.lateralOffset || 0) - target);
    if (jump > 1.2 && Math.abs(car.s - G.playerS) < 130) {
      car.s = G.playerS + 170 + Math.random() * 110;
    }
    car.laneIdx = idx;
    car.targetLaneIdx = idx;
    car.lateralOffset = target;
    car.steerAngle = 0;
    if (car.model.type !== 'qute_traffic') car.speedKmh = cfg.speeds[idx];
  }

  G.remapTrafficLanes = () => {
    for (const car of G.trafficPool) {
      const cfg = lanesAt(car.s);
      if (car.model.type === 'qute_traffic') {
        const q = quteLane(cfg);
        car.laneIdx = q;
        car.targetLaneIdx = q;
        car.lateralOffset = cfg.offsets[q];
        car.changingLane = false;
        car.speedKmh = QUTE_TRAFFIC_SPEED;
      }
      settleCarLane(car, cfg);
    }
  };

  function holdForRepair(car, oncoming) {
    const ev = G.repairEvent;
    if (!ev || !ev.active || oncoming || car.changingLane) return;
    if (!sameLaneOffset(car.lateralOffset, ev.laneOffset)) return;
    if (car.s > ev.s + 2 || car.s < ev.s - 80) return;
    let rank = 0;
    for (const other of G.trafficPool) {
      if (other !== car && other.active && sameLaneOffset(other.lateralOffset, ev.laneOffset) && other.s > car.s && other.s < ev.s) rank++;
    }
    const stop = ev.s - ev.length * 0.5 - 4 - rank * 8;
    if (car.s > stop) {
      car.s = stop;
      car.speedKmh = 0;
    } else if (car.s > stop - 14) {
      car.speedKmh = Math.min(car.speedKmh, 14);
    }
    if (G.playerS > ev.s + ev.length && car.speedKmh < 2) {
      const lanesNow = lanesAt(car.s);
      const last = lanesNow.count - 1;
      const alt = car.laneIdx < last ? car.laneIdx + 1 : Math.max(lanesNow.oncomingCount, car.laneIdx - 1);
      if (alt !== car.laneIdx && alt >= lanesNow.oncomingCount) {
        car.changingLane = true;
        car.targetLaneIdx = alt;
        car.speedKmh = 22;
      }
    }
  }

  function updateTraffic(dt, now, isQute) {
    const playerHalfW = playerHalfWidth(isQute);
    const menuDemo = !G.started && !G.ended;
    const dominant = G.roadBiomeAtS(G.playerS + 240);
    const mask = activeMask[dominant] || activeMask[0];
    // Окно разъезда: новые машины не спавним и не рециклим —
    // уже ехавшие доезжают по своим траекториям.
    const choosing = !!(G.splitState && G.splitState.active);
    for (let i = 0; i < G.trafficPool.length; i++) {
      const car = G.trafficPool[i];
      const where = car.active ? car.s : G.playerS + 240;
      const wantActive = (activeMask[G.roadBiomeAtS(where)] || mask)[i] === 1;

      if (!car.active) {
        if (!wantActive || choosing) continue;
        // Машина возвращается в биом далеко впереди, вне видимости игрока.
        car.active = true;
        car.retiring = false;
        resetTrafficVehicle(car, G.playerS + 230 + Math.random() * 130);
      } else if (!wantActive) {
        car.retiring = true;
      }

      // Скорость и направление — полоса биома в точке машины.
      // settle мог перенести её вперёд, поэтому конфиг читаем ещё раз.
      let road = lanesAt(car.s);
      settleCarLane(car, road);
      road = lanesAt(car.s);
      const targetSpeed = car.model.type === 'qute_traffic'
        ? QUTE_TRAFFIC_SPEED
        : road.speeds[clampLaneIndex(car.laneIdx, road.count)];
      car.speedKmh += (targetSpeed - car.speedKmh) * Math.min(1, dt * 1.6);

      const wasFlashing = car.flashReactTimer > 0;
      const step = stepTrafficCar(car, dt, road.offsets, road.oncomingCount);
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
      if (recycle && !choosing) resetTrafficVehicle(car, recycle.base + Math.random() * recycle.spread);

      const oncoming = isOncomingLane(car.laneIdx, road.oncomingCount);
      holdForRepair(car, oncoming);

      // Полосы уже переведены в мировые метры: масштаб ширины и сдвиг ветки.
      const toWorld = G.laneWorldOffsetAtS;
      const carWorldLat = toWorld(car.s, car.lateralOffset);
      const playerWorldLat = toWorld(G.playerS, G.laneOffset);

      const nudge = menuTrafficNudge(car.s, carWorldLat, G.playerS, playerWorldLat, menuDemo);
      if (nudge != null) car.s = nudge;

      const vehicleYaw = (oncoming ? Math.PI : 0) - car.steerAngle * 0.45;
      G.placeOnRoad(car.model.root, car.s, carWorldLat, 0, vehicleYaw);
      car.model.root.visible = true;

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
        dLat: Math.abs(carWorldLat - playerWorldLat),
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
        const side = carWorldLat < playerWorldLat ? 'left' : 'right';
        G.spawnOverflyParticles(car.model.root.position);
        G.pushFeed(`ПЕРЕЛЁТ ×${cCount}`, 'overfly', cCount, side);
        if (cCount >= 3) G.triggerSlowMo();
      } else if (kind === 'crash') {
        G.handleAccident(car);
      } else if (kind === 'near') {
        car.nearMissAwarded = true;
        G.comboCount++;
        G.comboTimer = COMBO_WINDOW;
        const pts = nearMissPoints(G.comboCount, G.laneOffset, laneSplitEdge(G.LANE_OFFSETS, G.oncomingCount));
        G.score += pts;
        const side = carWorldLat < playerWorldLat ? 'left' : 'right';
        G.pushFeed(`КОМБО ×${G.comboCount} · +${pts} ₽`, 'combo', G.comboCount, side);
      }
    }
  }
  G.updateTraffic = updateTraffic;
}
