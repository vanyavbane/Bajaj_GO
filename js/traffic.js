import { approachExit, arrivalMove, birthLane, canStartExitJoin, carriageHolds, carriageLat, laneAtWorld, repairQueue, ribbonDirection, vehicleLat } from './engine/carriage.js';
import { retargetRide } from './engine/exit.js';
import { clampLaneIndex, nearestLaneIndexIn, sameLaneOffset } from './engine/lanes.js';
import { besideWithLane, offsetDirection, outerLane } from './engine/lanes.js';
import { classifyCarContact, menuTrafficNudge, playerHalfWidth, stepTrafficCar, trafficRecycle } from './engine/motion.js';
import { repairStopS } from './engine/repair.js';
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
  function exitLaneOf(road) {
    return road.lanes.find((lane) => lane.exit) || null;
  }

  function spawnRoad(s) {
    const lanes = G.roadsAt(s).lanes;
    return { lanes, onExit: G.drivenIsExitAt(s) && !!exitLaneOf(lanes) };
  }

  /** Полосы той дороги, по которой машина уже едет. Съезд — её правая полоса. */
  function carLanes(car) {
    return G.roadsAt(car.s).lanes;
  }

  function quteLane(cfg) {
    const forward = cfg.lanes.filter((lane) => lane.direction === 'with' && !lane.exit);
    if (forward.length === 0) return 0;
    const pick = forward.length >= 2 ? forward[forward.length - 2] : forward[0];
    return pick ? pick.index : 0;
  }

  function pickLane(cfg, model, forcedLane, onRibbon) {
    if (model.type === 'qute_traffic') return quteLane(cfg);
    if (onRibbon) {
      const exit = exitLaneOf(cfg);
      if (exit) return exit.index;
      const roll = forcedLane == null ? Math.random() * cfg.count : forcedLane;
      return birthLane(cfg, true, roll);
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
    const facing = cfg.lanes[idx];
    return {
      model,
      laneIdx: idx,
      targetLaneIdx: idx,
      laneDir: ribbonDirection(road.onExit, facing && facing.direction),
      laneKey: laneSetKey(cfg),
      lateralOffset: cfg.offsets[idx],
      s,
      speedKmh: model.type === 'qute_traffic' ? QUTE_TRAFFIC_SPEED : cfg.speeds[idx],
      changingLane: false,
      onExit: road.onExit,
      joiningExit: false,
      heldLat: NaN,
      ribbonHalf: NaN,
      /** Середина ленты, с которой машина ехала в прошлом кадре. */
      surface: NaN,
      heading: ribbonDirection(road.onExit, facing?.direction) === 'against' ? Math.PI : 0,
      flashReactTimer: 0,
      steerAngle: 0,
      nearMissAwarded: false,
      jumpedInCurrentJump: false,
      active: true,
      retiring: false,
      repairQueued: false
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

  /** Ключ набора полос без скользящего смещения съезда: смена биома его меняет, ход ленты — нет. */
  function laneSetKey(cfg) {
    const body = [];
    let exit = 0;
    const lanes = cfg.lanes || [];
    for (let i = 0; i < lanes.length; i++) {
      const lane = lanes[i];
      if (lane.exit) exit = 1;
      else body.push(lane.offset);
    }
    return `${exit}|${body.join(',')}`;
  }

  /**
   * Смена набора полос оставляет машину в мировой точке.
   * Точка уже не на этой дороге — машина с неё уходит, а не прыгает на новую ось.
   */
  /** Лента уже отделилась: это её дорога, не полоса сходящего шоссе. */
  function ribbonSeparated(road) {
    const ribbon = road.spot && road.spot.ribbon;
    return ribbon && !ribbon.joined ? ribbon : null;
  }

  function adoptLaneSet(car, road) {
    const key = laneSetKey(road.lanes);
    if (car.joiningExit) return false;
    if (car.laneKey != null && car.laneKey !== key && Number.isFinite(car.heldLat)) {
      if (car.onExit && ribbonSeparated(road)) {
        car.lateralOffset = car.heldLat - road.ribbonCenter;
      } else if (!carriageHolds(car.heldLat, road.axis, road.half)) {
        return true;
      } else {
        car.lateralOffset = laneAtWorld(car.heldLat, road.axis, road.scale);
      }
    }
    car.laneKey = key;
    return false;
  }

  /** Полоса машины — ближайший центр её направления. Осевая не сажает попутную во встречную. */
  function settleCarLane(car, cfg) {
    if (car.joiningExit) return;
    const here = G.roadsAt(car.s);
    if (car.onExit && ribbonSeparated(here)) {
      car.changingLane = false;
      car.laneDir = 'with';
      return;
    }
    const dir = car.laneDir === 'against' ? 'against' : 'with';
    const idx = nearestLaneIndexIn(cfg, car.lateralOffset || 0, dir);
    const lane = cfg.lanes[idx];
    if (lane) car.laneDir = lane.direction === 'against' ? 'against' : 'with';
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
      if (!car.active) continue;
      const live = G.roadsAt(car.s);
      if (adoptLaneSet(car, live)) {
        car.active = false;
        car.retiring = false;
        car.model.root.visible = false;
        continue;
      }
      const cfg = live.lanes;
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
    const lanes = road.lanes;
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
  function beginExitJoin(car, road) {
    const exit = exitLaneOf(road.lanes);
    if (!exit || car.onExit) return false;
    const gate = outerLane(road.lanes, 'right', 'with');
    if (!gate) return false;
    const center = road.axis + exit.offset * (road.scale || 1);
    return canStartExitJoin({
      changingLane: !!car.changingLane,
      lane: car.laneIdx,
      lastLane: gate.index,
      roadRight: road.axis + road.half,
      ribbonLeft: center - road.exitHalf,
    });
  }

  /** Доезд до асфальта съезда. Пока его нет, машина остаётся в мире шоссе. */
  function slideOntoExit(car, dt) {
    const road = G.roadsAt(car.s);
    const exit = exitLaneOf(road.lanes);
    if (!exit) {
      car.joiningExit = false;
      return;
    }
    const scale = road.scale || 1;
    const center = road.axis + exit.offset * scale;
    const world = G.drivenLaneAt(car.s, car.lateralOffset);
    const moved = approachExit(world, center - road.exitHalf, center + road.exitHalf, dt);
    if (!moved.arrived) {
      car.lateralOffset = laneAtWorld(moved.lat, road.axis, scale);
      return;
    }
    car.onExit = true;
    car.joiningExit = false;
    car.laneDir = 'with';
    car.laneIdx = exit.index;
    car.targetLaneIdx = exit.index;
    const home = ribbonWorld(road);
    car.lateralOffset = home != null && ribbonSeparated(road) ? moved.lat - home : exit.offset;
    car.changingLane = false;
  }

  function holdForRepair(car, oncoming) {
    const ev = G.repairEvent;
    if (!ev || !ev.active || oncoming || car.changingLane) {
      car.repairQueued = false;
      return;
    }
    const holeOnExit = eventOnExit(ev);
    const carOnExit = !!(car.onExit && exitLaneOf(G.roadsAt(car.s).lanes));
    if (!repairQueue(carOnExit, holeOnExit)) {
      car.repairQueued = false;
      return;
    }
    const hole = G.holdDrivenLane(ev.s, ev.laneOffset);
    if (!sameLaneOffset(car.lateralOffset, hole) || car.s > ev.s + 2 || car.s < ev.s - 80) {
      car.repairQueued = false;
      return;
    }
    let rank = 0;
    for (const other of G.trafficPool) {
      const otherOnExit = !!(other.onExit && exitLaneOf(G.roadsAt(other.s).lanes));
      if (other !== car && other.active && repairQueue(otherOnExit, holeOnExit) && sameLaneOffset(other.lateralOffset, hole) && other.s > car.s && other.s < ev.s) rank++;
    }
    const stop = repairStopS(ev.s, ev.length, rank);
    car.repairQueued = true;
    if (car.s >= stop - 0.5) {
      car.s = stop;
      car.speedKmh = 0;
    } else if (car.s > stop - 14) {
      car.speedKmh = Math.min(car.speedKmh, 14);
    }
    if (G.playerS > ev.s + ev.length && car.speedKmh < 2) {
      const alt = besideWithLane(carLanes(car), car.laneIdx);
      if (alt && alt.index !== car.laneIdx) {
        car.changingLane = true;
        car.targetLaneIdx = alt.index;
        car.speedKmh = 22;
        car.repairQueued = false;
      }
    }
  }

  /** Одна дорога машины на этот кадр. Съезд — полоса main, пока у чтения есть лента. */
  function ribbonWorld(road) {
    if (!road.spot || !road.spot.ribbon) return null;
    return road.ribbonCenter;
  }

  /** Машина едет вместе с лентой. Смещение внутри ленты не сбрасывается, когда середина уезжает. */
  function followRibbon(car, road) {
    const center = ribbonWorld(road);
    if (center == null) {
      car.surface = NaN;
      return;
    }
    const scale = road.scale || 1;
    const own = ribbonSeparated(road);
    // Пока смещение ещё в полосах шоссе, мир читается с его оси.
    // На своей дороге съезда heldLat уже метры, и следующее смещение — от середины ленты.
    const steered = Number.isFinite(car.heldLat)
      ? car.heldLat
      : carriageLat(road.axis, scale, car.lateralOffset || 0);
    const placed = retargetRide(steered, car.surface, Number.isFinite(car.surface), center);
    let world = placed.world;
    const half = road.spot.ribbon.half;
    if (own && Number.isFinite(car.ribbonHalf)) world += half - car.ribbonHalf;
    car.ribbonHalf = own ? half : NaN;
    car.lateralOffset = own
      ? world - center
      : laneAtWorld(world, road.axis, scale);
    car.surface = center;
  }

  function eventOnExit(ev) {
    const road = G.roadsAt(ev.s);
    const lane = road.lanes.lanes[ev.laneIdx];
    return !!(lane && lane.exit);
  }

  function assignCarRoad(car) {
    const road = G.roadsAt(car.s);
    const ribbon = road.spot && road.spot.ribbon;
    const highway = road.lanes;
    const exit = exitLaneOf(highway);
    const wasOnExit = !!car.onExit;
    if (ribbonSeparated(road)) {
      const center = road.ribbonCenter;
      const world = Number.isFinite(car.heldLat)
        ? car.heldLat
        : carriageLat(road.axis, road.scale || 1, car.lateralOffset || 0);
      car.onExit = Math.abs(world - center) <= road.exitHalf + 0.35;
    } else {
      car.onExit = ribbon != null && wasOnExit;
    }
    if (!car.onExit && !wasOnExit && beginExitJoin(car, road)) car.joiningExit = true;
    if (car.onExit || !exit) car.joiningExit = false;
    if (car.onExit && ribbon) followRibbon(car, road);
    else car.surface = NaN;
    let departed = false;
    if (wasOnExit && !car.onExit) {
      const world = Number.isFinite(car.heldLat)
        ? car.heldLat
        : G.drivenLaneAt(car.s, car.lateralOffset);
      const axis = road.axis;
      const scale = road.scale || 1;
      if (!carriageHolds(world, axis, road.half)) {
        departed = true;
      } else {
        const moved = arrivalMove(highway, laneAtWorld(world, axis, scale));
        car.laneDir = 'with';
        const here = nearestLaneIndexIn(highway, moved.offset, 'with');
        const dest = nearestLaneIndexIn(highway, moved.target, 'with');
        car.laneIdx = moved.changing ? here : dest;
        car.targetLaneIdx = dest;
        car.lateralOffset = moved.offset;
        car.changingLane = moved.changing;
      }
    }
    return { lanes: highway, onRibbon: !!car.onExit, departed };
  }

  function updateTraffic(dt, now, isQute) {
    const playerHalfW = playerHalfWidth(isQute);
    const menuDemo = !G.started && !G.ended;
    const dominant = G.trafficBiomeAtS(G.playerS + 240);
    const mask = activeMask[dominant] || activeMask[0];
    // Окно разъезда: новые машины не спавним и не рециклим —
    // уже ехавшие доезжают по своим траекториям.
    const choosing = !!(G.splitState && G.splitState.active);
    for (let i = 0; i < G.trafficPool.length; i++) {
      const car = G.trafficPool[i];
      const where = car.active ? car.s : G.playerS + 240;
      const wantActive = car.repairQueued || (activeMask[G.trafficBiomeAtS(where)] || mask)[i] === 1;

      if (!car.active) {
        if (!wantActive || choosing) continue;
        // Машина возвращается в биом далеко впереди, вне видимости игрока.
        car.active = true;
        car.retiring = false;
        resetTrafficVehicle(car, G.playerS + 230 + Math.random() * 130);
      } else if (!wantActive && !car.repairQueued) {
        car.retiring = true;
      }

      const seat = assignCarRoad(car);
      if (seat.departed) {
        car.active = false;
        car.retiring = false;
        car.model.root.visible = false;
        continue;
      }
      const live = G.roadsAt(car.s);
      if (adoptLaneSet(car, live)) {
        car.active = false;
        car.retiring = false;
        car.model.root.visible = false;
        continue;
      }
      const road = live.lanes;
      const onRibbon = seat.onRibbon;
      settleCarLane(car, road);
      const targetSpeed = car.model.type === 'qute_traffic'
        ? QUTE_TRAFFIC_SPEED
        : road.speeds[clampLaneIndex(car.laneIdx, road.count)];
      car.speedKmh += (targetSpeed - car.speedKmh) * Math.min(1, dt * 1.6);

      const wasFlashing = car.flashReactTimer > 0;
      const flow = travelFlow(car, road, onRibbon);
      const step = stepTrafficCar(car, dt, road, flow);
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

      const recycle = car.repairQueued ? null : trafficRecycle(car.s, G.playerS);
      if (recycle && !choosing) resetTrafficVehicle(car, recycle.base + Math.random() * recycle.spread);

      if (car.joiningExit) slideOntoExit(car, dt);

      const oncoming = flow < 0;
      holdForRepair(car, oncoming);

      const carWorldLat = vehicleLat(G.roadsAt(car.s), car.lateralOffset, !!car.onExit);
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
        if (G.audio) G.audio.playSfx('near_miss');
        G.comboCount++;
        G.comboTimer = COMBO_WINDOW;
        if (G.trackMaxCombo) G.trackMaxCombo(G.comboCount);
        const pts = nearMissPoints(
          G.comboCount,
          ribbonDirection(G.drivenIsExitAt(G.playerS), offsetDirection(G.lanesAtS(G.playerS), G.laneOffset))
        );
        G.score += pts;
        const side = carWorldLat < playerWorldLat ? 'left' : 'right';
        G.pushFeed(`КОМБО ×${G.comboCount} · +${pts} ₽`, 'combo', G.comboCount, side);
      }
    }
  }
  G.updateTraffic = updateTraffic;
}
