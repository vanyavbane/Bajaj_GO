import { approachExit, arrivalMove, birthLane, canStartExitJoin, carFollowsRibbon, carriageHolds, carriageLat, repairQueue, ribbonDirection } from './engine/carriage.js';
import { clampLaneIndex, nearestLaneIndex, sameLaneOffset } from './engine/lanes.js';
import { besideWithLane, lanesOf, offsetDirection, outerLane } from './engine/lanes.js';
import { classifyCarContact, menuTrafficNudge, playerHalfWidth, stepTrafficCar, trafficRecycle } from './engine/motion.js';
import { COMBO_WINDOW, nearMissPoints } from './engine/rules.js';
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
  /** @type {import('./engine/biomes.js').TrafficModel[]} */
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

  /** Новая машина рождается на дороге байка. На ленте съезда — только когда байк уже на ней. */
  function spawnRoad(s) {
    const roads = G.roadsAt(s);
    if (G.drivenIsExitAt(s) && roads.exit) {
      return { lanes: roads.exit.lanes, onExit: true };
    }
    return { lanes: roads.main.lanes, onExit: false };
  }

  /** Полосы той дороги, по которой машина уже едет. Смена полос байка её не пересаживает. */
  function carLanes(car) {
    const roads = G.roadsAt(car.s);
    return car.onExit && roads.exit ? roads.exit.lanes : roads.main.lanes;
  }

  function quteLane(cfg) {
    const forward = lanesOf(cfg).filter((lane) => lane.direction === 'with');
    if (forward.length === 0) return 0;
    const pick = forward.length >= 2 ? forward[forward.length - 2] : forward[0];
    return pick ? pick.index : 0;
  }

  function pickLane(cfg, model, forcedLane, onRibbon) {
    if (model.type === 'qute_traffic') return quteLane(cfg);
    if (onRibbon) {
      const roll = forcedLane == null ? Math.random() * cfg.count : forcedLane;
      return birthLane(lanesOf(cfg), true, roll);
    }
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
    const road = spawnRoad(s);
    const cfg = road.lanes;
    const idx = pickLane(cfg, model, forcedLane, road.onExit);
    const facing = lanesOf(cfg)[idx];
    return {
      model,
      laneIdx: idx,
      targetLaneIdx: idx,
      lateralOffset: cfg.offsets[idx],
      s,
      speedKmh: model.type === 'qute_traffic' ? QUTE_TRAFFIC_SPEED : cfg.speeds[idx],
      changingLane: false,
      onExit: road.onExit,
      joiningExit: false,
      heldLat: NaN,
      heading: ribbonDirection(road.onExit, facing?.direction) === 'against' ? Math.PI : 0,
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
    if (car.joiningExit) return;
    const idx = nearestLaneIndex(cfg.offsets, car.lateralOffset);
    const target = cfg.offsets[idx];
    const jump = Math.abs((car.lateralOffset || 0) - target);
    if (idx === car.laneIdx && jump < 0.05) {
      car.targetLaneIdx = idx;
      if (!car.changingLane) car.lateralOffset = target;
      return;
    }
    car.laneIdx = idx;
    car.targetLaneIdx = idx;
    // Конфигурация полос изменилась (биом/съезд): машина остаётся в своей полосе,
    // смещение к новой координате полосы делается плавно, без телепорта.
    if (car.changingLane || jump > 0.35) {
      car.changingLane = true;
    } else {
      car.lateralOffset = target;
      car.steerAngle = 0;
    }
    if (car.model.type !== 'qute_traffic') {
      car.speedKmh = cfg.speeds[clampLaneIndex(idx, cfg.count)];
    }
  }

  G.remapTrafficLanes = () => {
    for (const car of G.trafficPool) {
      const cfg = carLanes(car);
      if (car.model.type === 'qute_traffic') {
        const q = quteLane(cfg);
        const target = cfg.offsets[q];
        const jump = Math.abs((car.lateralOffset || 0) - target);
        car.laneIdx = q;
        car.targetLaneIdx = q;
        car.changingLane = jump > 0.35;
        if (!car.changingLane) car.lateralOffset = target;
        car.speedKmh = QUTE_TRAFFIC_SPEED;
      }
      settleCarLane(car, cfg);
    }
  };

  /** 1 — по ходу дороги, -1 — навстречу. На ленте въезда все едут вперёд. */
  function travelFlow(car, road, onRibbon) {
    const lanes = lanesOf(road);
    const target = lanes[car.targetLaneIdx];
    const current = lanes[car.laneIdx];
    const sense = (lane) => ribbonDirection(onRibbon, lane && lane.direction);
    if (car.changingLane && sense(target) === 'with') return 1;
    return sense(current) === 'against' ? -1 : 1;
  }

  function faceTraffic(car, flow, dt) {
    const want = flow < 0 ? Math.PI : 0;
    if (!Number.isFinite(car.heading)) car.heading = want;
    let turn = want - car.heading;
    if (turn > Math.PI) turn -= Math.PI * 2;
    if (turn < -Math.PI) turn += Math.PI * 2;
    car.heading += turn * Math.min(1, dt * 2.4);
  }

  /** Крайняя попутная начинает переезд, только пока съезд ещё прижат к шоссе. */
  function beginExitJoin(car, roads) {
    const ribbon = roads.exit;
    if (!ribbon || car.onExit) return false;
    const gate = outerLane(lanesOf(roads.main.lanes), 'right', 'with');
    if (!gate) return false;
    return canStartExitJoin({
      changingLane: !!car.changingLane,
      lane: car.laneIdx,
      lastLane: gate.index,
      roadRight: roads.main.axis + roads.main.half,
      ribbonLeft: ribbon.axis - ribbon.half,
    });
  }

  /** Доезд до асфальта съезда. Пока его нет, машина остаётся в мире шоссе. */
  function slideOntoExit(car, dt) {
    const roads = G.roadsAt(car.s);
    const ribbon = roads.exit;
    if (!ribbon) {
      car.joiningExit = false;
      return;
    }
    const world = G.trafficLatAt(car.s, car.lateralOffset, false);
    const moved = approachExit(world, ribbon.axis - ribbon.half, ribbon.axis + ribbon.half, dt);
    if (!moved.arrived) {
      const scale = roads.main.scale || 1;
      car.lateralOffset = (moved.lat - roads.main.axis) / scale;
      return;
    }
    const scale = ribbon.scale || 1;
    const logical = (moved.lat - ribbon.axis) / scale;
    const idx = nearestLaneIndex(ribbon.lanes.offsets, logical);
    car.onExit = true;
    car.joiningExit = false;
    car.laneIdx = idx;
    car.targetLaneIdx = idx;
    car.lateralOffset = logical;
    car.changingLane = Math.abs(ribbon.lanes.offsets[idx] - logical) > 0.06;
    if (!car.changingLane) car.lateralOffset = ribbon.lanes.offsets[idx];
  }

  function holdForRepair(car, oncoming) {
    const ev = G.repairEvent;
    if (!ev || !ev.active || oncoming || car.changingLane) return;
    const holeOnExit = G.drivenIsExitAt(ev.s);
    const carOnExit = !!(car.onExit && G.roadsAt(car.s).exit);
    if (!repairQueue(carOnExit, holeOnExit)) return;
    const hole = G.holdDrivenLane(ev.s, ev.laneOffset);
    if (!sameLaneOffset(car.lateralOffset, hole)) return;
    if (car.s > ev.s + 2 || car.s < ev.s - 80) return;
    let rank = 0;
    for (const other of G.trafficPool) {
      const otherOnExit = !!(other.onExit && G.roadsAt(other.s).exit);
      if (other !== car && other.active && repairQueue(otherOnExit, holeOnExit) && sameLaneOffset(other.lateralOffset, hole) && other.s > car.s && other.s < ev.s) rank++;
    }
    const stop = ev.s - ev.length * 0.5 - 4 - rank * 8;
    if (car.s > stop) {
      car.s = stop;
      car.speedKmh = 0;
    } else if (car.s > stop - 14) {
      car.speedKmh = Math.min(car.speedKmh, 14);
    }
    if (G.playerS > ev.s + ev.length && car.speedKmh < 2) {
      const alt = besideWithLane(lanesOf(carLanes(car)), car.laneIdx);
      if (alt && alt.index !== car.laneIdx) {
        car.changingLane = true;
        car.targetLaneIdx = alt.index;
        car.speedKmh = 22;
      }
    }
  }

  /** Одна дорога машины на этот кадр: остаётся, переезжает или садится на новую. */
  function assignCarRoad(car) {
    const roads = G.roadsAt(car.s);
    const highway = roads.main.lanes;
    const ribbon = roads.exit;
    const wasOnExit = !!car.onExit;
    car.onExit = carFollowsRibbon({ hasExit: ribbon != null, following: wasOnExit });
    if (!car.onExit && !wasOnExit && beginExitJoin(car, roads)) car.joiningExit = true;
    if (car.onExit || !ribbon) car.joiningExit = false;
    let departed = false;
    if (wasOnExit && !car.onExit) {
      const from = G.sideRibbonAt(car.s);
      const world = from
        ? carriageLat(from.axis, from.scale, car.lateralOffset)
        : G.trafficLatAt(car.s, car.lateralOffset, false);
      const axis = roads.main.axis;
      const scale = roads.main.scale || 1;
      if (!carriageHolds(world, axis, roads.main.half)) {
        departed = true;
      } else {
        const moved = arrivalMove(lanesOf(highway), (world - axis) / scale);
        const here = nearestLaneIndex(highway.offsets, moved.offset);
        const dest = nearestLaneIndex(highway.offsets, moved.target);
        car.laneIdx = moved.changing ? here : dest;
        car.targetLaneIdx = dest;
        car.lateralOffset = moved.offset;
        car.changingLane = moved.changing;
      }
    }
    const onRibbon = !!(car.onExit && ribbon);
    return { lanes: onRibbon ? ribbon.lanes : highway, onRibbon, departed };
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

      const seat = assignCarRoad(car);
      if (seat.departed) {
        car.active = false;
        car.retiring = false;
        car.model.root.visible = false;
        continue;
      }
      const road = seat.lanes;
      const onRibbon = seat.onRibbon;
      settleCarLane(car, road);
      const targetSpeed = car.model.type === 'qute_traffic'
        ? QUTE_TRAFFIC_SPEED
        : road.speeds[clampLaneIndex(car.laneIdx, road.count)];
      car.speedKmh += (targetSpeed - car.speedKmh) * Math.min(1, dt * 1.6);

      const wasFlashing = car.flashReactTimer > 0;
      const flow = travelFlow(car, road, onRibbon);
      const step = stepTrafficCar(car, dt, lanesOf(road), flow);
      faceTraffic(car, flow, dt);
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

      if (car.joiningExit) slideOntoExit(car, dt);

      const oncoming = flow < 0;
      holdForRepair(car, oncoming);

      const carWorldLat = G.trafficLatAt(car.s, car.lateralOffset, car.onExit);
      // Старая дорога ушла из-под машины. На новую её не переносит.
      if (!car.onExit && Number.isFinite(car.heldLat) && Math.abs(carWorldLat - car.heldLat) > 6) {
        car.active = false;
        car.retiring = false;
        car.model.root.visible = false;
        continue;
      }
      car.heldLat = carWorldLat;
      const playerWorldLat = G.riderLatAt(G.playerS);

      const nudge = menuTrafficNudge(car.s, carWorldLat, G.playerS, playerWorldLat, menuDemo);
      if (nudge != null) car.s = nudge;

      const vehicleYaw = car.heading - car.steerAngle * 0.45;
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
        const pts = nearMissPoints(
          G.comboCount,
          ribbonDirection(G.drivenIsExitAt(G.playerS), offsetDirection(lanesOf(G.riderLanesAt(G.playerS)), G.laneOffset))
        );
        G.score += pts;
        const side = carWorldLat < playerWorldLat ? 'left' : 'right';
        G.pushFeed(`КОМБО ×${G.comboCount} · +${pts} ₽`, 'combo', G.comboCount, side);
      }
    }
  }
  G.updateTraffic = updateTraffic;
}
