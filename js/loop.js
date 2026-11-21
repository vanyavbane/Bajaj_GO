import { exitEntryPull } from './engine/fork.js';
import { defaultRunOffset, lanesOf, offsetDirection } from './engine/lanes.js';
import { jumpLaunchVy, playerHalfWidth, rampUnderBike, stepGroundedPose, stepJump, stepSpeed, stepSteer, worldMeters } from './engine/motion.js';
import { meters, rubles } from './engine/money.js';
import { HARD_LANDING_PITCH, HARD_LANDING_WOBBLE, distancePoints, hardLandingSpeed, jumpBonus, oncomingMultiplier, overflyMultiplier, scrapeSpeed } from './engine/rules.js';
import { G } from './state.js';

export function initLoop() {
  const $ = G.$;
  const clamp = G.clamp;
  const lerp = G.lerp;
  let jumpLineShown = '';
  let oncomingShown = false;

  /* =========================================================================
   * 17. ГЛАВНЫЙ ЦИКЛ СИМУЛЯЦИИ, ФИЗИКА ТЮНИНГА, ТРАМПЛИНОВ И РЕНДЕРИНГ
   * ========================================================================= */
  G.renderMainMenu();

  function finishJumpLanding() {
    G.endSlowMo();
    const jumpDist = Math.max(0, G.playerS - G.jumpState.startS);
    const hardPitch = Math.abs(G.jumpState.pitch) > HARD_LANDING_PITCH;

    if (G.jumpState.carsJumped > 0 || jumpDist > 16) {
      const count = G.jumpState.carsJumped;
      const totalBonus = jumpBonus(count, jumpDist, !hardPitch);

      if (hardPitch) {
        G.speed = hardLandingSpeed(G.speed);
        G.jumpState.wobbleTimer = HARD_LANDING_WOBBLE;
      }

      G.score += totalBonus;
      G.totalJumpBonusRun += totalBonus;
      G.totalCarsJumpedRun += count;

      const flown = meters(jumpDist);
      const pay = rubles(totalBonus);
      const text = hardPitch
        ? `Жёсткая посадка · ${flown} · +${pay}`
        : (count > 0
          ? `Прыжок ${flown} · перелёт ×${count} · мягкая посадка · +${pay}`
          : `Прыжок ${flown} · +${pay}`);
      G.pushFeed(text, hardPitch ? 'hard' : 'land', count);
    }

    G.jumpState.airborne = false;
    G.jumpState.height = 0;
    G.jumpState.vy = 0;
    G.jumpState.pitch = 0;
    G.jumpState.carsJumped = 0;
    G.jumpState.liveBonus = 0;
    $('jump-live').hidden = true;

    for (const c of G.trafficPool) c.jumpedInCurrentJump = false;
  }

  function tickTransientTimers(dt) {
    if (G.highBeamTimer > 0) {
      G.highBeamTimer -= dt;
      if (G.highBeamTimer <= 0) $('badge-beam').hidden = true;
    }
    if (G.highBeamCooldown > 0) G.highBeamCooldown -= dt;
  }

  function spinOwnWheels(meters) {
    const spin = meters * 1.9;
    G.frontWheelGroup.rotation.x -= spin;
    G.rearWheelGroup.rotation.x -= spin;
    for (const qw of G.quteWheels) qw.rotation.x -= spin;
  }

  // Меню едет медленнее всех попутных полос (минимум 50–55 км/ч в биомах),
  // поэтому байк не догоняет машины в своём ряду и не накладывается на них.
  const MENU_DEMO_SPEED = 48;

  function advanceMenuDemo(dt, now) {
    const forwardMeters = worldMeters(MENU_DEMO_SPEED, dt);
    const prevS = G.playerS;
    G.playerS += forwardMeters;

    // В меню ряд фиксирован: на трамплине и после него байк не перестраивается.
    if (!G.jumpState.airborne) {
      const demoTarget = defaultRunOffset(lanesOf(G.riderLanesAt(G.playerS)));
      G.laneOffset = lerp(G.laneOffset, demoTarget, dt * 2.5);
    }
    G.steerVisual = Math.sin(now * 0.0012) * 0.08;
    spinOwnWheels(forwardMeters);

    // Прыжок в меню: только визуальный. Бонусы, перелёты и HUD заезда не трогаем.
    if (G.jumpState.airborne) {
      const air = stepJump(G.jumpState, dt, false, false);
      G.jumpState.vy = air.vy;
      G.jumpState.height = air.height;
      G.jumpState.pitch = air.pitch;
      if (air.landed) {
        G.jumpState.airborne = false;
        G.jumpState.height = 0;
        G.jumpState.vy = 0;
        G.jumpState.pitch = 0;
      }
      return;
    }

    const bikeLat = G.riderLatAt(G.playerS);
    let deckHeight = 0;
    for (const ramp of G.rampsPool) {
      // Флаг мог остаться с прошлого заезда: пока трамплин впереди, сбрасываем.
      if (G.playerS < ramp.s - ramp.length * 0.5) ramp.triggeredThisPass = false;
      const rampLat = G.drivenLaneAt(ramp.s, G.holdDrivenLane(ramp.s, ramp.lateralOffset));
      const contact = rampUnderBike(G.playerS, prevS, bikeLat, {
        s: ramp.s,
        length: ramp.length,
        width: ramp.width,
        height: ramp.height,
        lateralOffset: rampLat
      });
      if (!contact) continue;
      deckHeight = contact.height;
      if (contact.launch && !ramp.triggeredThisPass) {
        ramp.triggeredThisPass = true;
        G.jumpState.airborne = true;
        G.jumpState.height = contact.height + 0.08;
        G.jumpState.vy = jumpLaunchVy(MENU_DEMO_SPEED, G.selectedBike().massFactor);
        G.jumpState.pitch = 0.20;
        G.jumpState.startS = G.playerS;
        G.jumpState.carsJumped = 0;
        G.jumpState.liveBonus = 0;
        return;
      }
    }
    G.jumpState.height = deckHeight;
    G.jumpState.pitch = deckHeight > 0.05 ? 0.15 : 0;
  }

  function simulateRun(dt, now, bike, effStats) {
    const prevSpeed = G.speed;
    G.accidentCooldown = Math.max(0, G.accidentCooldown - dt);
    // Пустой бак без эвакуатора: жёсткое ограничение 5 км/ч, не зависит от тюнинга
    const effectiveMaxSpeed = (G.limpMode && G.fuelM <= 0)
      ? Math.min(effStats.maxSpeed, G.LIMP_MAX_SPEED)
      : effStats.maxSpeed;
    const stickDrive = G.controlMode === 'stick';
    const gasOn = G.keys.gas || (stickDrive && G.stickGas);
    const brakeOn = G.keys.brake || (stickDrive && G.stickBrake);
    const stepped = stepSpeed(G.speed, dt, {
      gas: gasOn,
      brake: brakeOn,
      maxSpeed: effectiveMaxSpeed,
      accel: effStats.accel,
      brakeDecel: effStats.brakeDecel * (1 - 0.15 * (G.weather ? G.weather.wet : 0)),
      isQute: effStats.isQute
    });
    G.speed = stepped.speed;

    for (const fl of G.yuraFlames) {
      fl.visible = effStats.isYura && gasOn && G.speed > 40 && (Math.floor(now / 60) % 2 === 0);
      fl.scale.z = 0.7 + Math.random() * 0.9;
    }

    G.accelPitchOffset = lerp(G.accelPitchOffset, clamp((stepped.speed - prevSpeed) / Math.max(dt, 0.001) * 0.0008, -0.04, 0.05), dt * 6);

    // Lane-assist: после развилки мягко возвращает байк в попутную полосу.
    // Пока выбор открыт и пока взятый въезд ещё не кончился, он не тянет на старую дорогу.
    const fork = G.splitState;
    const forkOpen = fork && fork.active && !fork.chosen;
    const forkTaken = fork && fork.active && fork.chosenSide === 1;
    if (G.laneAssistTarget != null && !G.jumpState.airborne && !forkOpen && !forkTaken) {
      const assist = G.laneAssistTarget - G.laneOffset;
      G.lateralVelocity = lerp(G.lateralVelocity, clamp(assist * 2.6, -5.5, 5.5), dt * 2.6);
    }
    const wantsRight = G.keys.right
      || (G.controlMode === 'tilt' && !G.swipeActive && G.tiltSmoothed > 0.2)
      || (G.controlMode === 'stick' && G.stickHeld && G.stickSteer > 0.2);

    const steered = stepSteer({
      laneOffset: G.laneOffset,
      lateralVelocity: G.lateralVelocity,
      steerVisual: G.steerVisual,
      slipDriftVel: G.slipDriftVel,
      wobbleTimer: G.jumpState.wobbleTimer
    }, dt, now, {
      left: G.keys.left,
      right: G.keys.right,
      // Наклон передаётся аналогом: чем сильнее крен, тем сильнее поворот.
      // Свайп по экрану по-прежнему работает дискретными keys.
      steer: G.controlMode === 'tilt' && !G.swipeActive
        ? G.tiltSmoothed
        : (G.controlMode === 'stick' && G.stickHeld ? G.stickSteer : undefined),
      brake: G.keys.brake,
      speed: G.speed,
      airborne: G.jumpState.airborne,
      curvature: G.roadCurvature(G.playerS),
      isYura: effStats.isYura,
      wideTires: effStats.wideTires,
      upgradedBrakes: effStats.upgradedBrakes,
      roadEdge: G.ROAD_EDGE,
      roadEdgeMin: G.roadEdgeMin,
      roadEdgeMax: G.roadEdgeMax
    });
    G.laneOffset = steered.laneOffset;
    G.lateralVelocity = steered.lateralVelocity;
    // Рулевой расчёт сглаживает скорость к обычной. В клине удержание вправо
    // остаётся довозом до ленты и не гасится этим сглаживанием.
    if (wantsRight && fork && fork.active && fork.chosenSide !== 0 && G.roadEdgesAt && G.riderLatAt) {
      const pull = exitEntryPull(G.riderLatAt(G.playerS), G.roadEdgesAt(G.playerS));
      if (pull > G.lateralVelocity) {
        const room = G.roadEdgeMax - G.laneOffset;
        const extra = Math.min(Math.max(0, room), (pull - G.lateralVelocity) * dt);
        G.laneOffset += extra;
        G.lateralVelocity = pull;
      }
    }
    G.steerVisual = steered.steerVisual;
    G.slipDriftVel = steered.slipDriftVel;
    G.jumpState.wobbleTimer = steered.wobbleTimer;
    if (steered.scraped) G.speed = scrapeSpeed(G.speed, dt);

    for (const fp of G.quteFrontPivots) fp.rotation.y = -G.steerVisual * 0.42;
    G.quteSteeringWheelPivot.rotation.z = -G.steerVisual * 0.88;

    const forwardMeters = worldMeters(G.speed, dt);
    const prevS = G.playerS;
    G.playerS += forwardMeters;
    G.distance += (G.speed * dt) / 3600;

    // 3.1 Экономика: расход топлива, износ деталей и таймер заказа
    G.tickEconomy(dt, forwardMeters);
    G.tickOrder(dt);

    // 4. ФИЗИКА ТРАМПЛИНОВ И ПРЫЖКОВ
    let surfaceRampHeight = 0;
    for (const ramp of G.rampsPool) {
      const bikeLat = G.riderLatAt(G.playerS);
      const rampLat = G.drivenLaneAt(ramp.s, G.holdDrivenLane(ramp.s, ramp.lateralOffset));
      const contact = !G.jumpState.airborne && rampUnderBike(G.playerS, prevS, bikeLat, {
        s: ramp.s,
        length: ramp.length,
        width: ramp.width,
        height: ramp.height,
        lateralOffset: rampLat
      });
      if (contact) {
        surfaceRampHeight = contact.height;

        if (contact.launch && !ramp.triggeredThisPass && G.speed > 60) {
          ramp.triggeredThisPass = true;
          G.jumpState.airborne = true;
          G.jumpState.height = surfaceRampHeight + 0.08;
          G.jumpState.vy = jumpLaunchVy(G.speed, bike.massFactor);
          G.jumpState.pitch = 0.20;
          G.jumpState.startS = G.playerS;
          G.jumpState.carsJumped = 0;
          G.jumpState.liveBonus = 0;
          G.resetSlowMoJump();
          for (const c of G.trafficPool) c.jumpedInCurrentJump = false;
          $('jump-live').hidden = false;
          jumpLineShown = 'Машин: 0 · Бонус: +0 ₽';
          $('jump-live-text').textContent = jumpLineShown;
          G.playJumpSound('launch', 1);
        }
      }
    }

    stopAtMedian(prevS, playerHalfWidth(effStats.isQute));

    if (G.jumpState.airborne) {
      const air = stepJump(G.jumpState, dt, G.keys.gas, G.keys.brake);
      G.jumpState.vy = air.vy;
      G.jumpState.height = air.height;
      G.jumpState.pitch = air.pitch;

      if (air.landed) {
        finishJumpLanding();
      } else {
        const jumpDistNow = Math.max(0, G.playerS - G.jumpState.startS);
        const count = G.jumpState.carsJumped;
        G.jumpState.liveBonus = jumpBonus(count, jumpDistNow, false);
        const jumpLine = `Машин: ${count} (×${overflyMultiplier(count)}) · Дист: ${meters(jumpDistNow)} · +${rubles(G.jumpState.liveBonus)}`;
        if (jumpLine !== jumpLineShown) {
          jumpLineShown = jumpLine;
          $('jump-live-text').textContent = jumpLine;
        }
      }
    } else {
      const pose = stepGroundedPose(G.jumpState, dt, surfaceRampHeight, G.accelPitchOffset);
      G.jumpState.height = pose.height;
      G.jumpState.pitch = pose.pitch;
    }

    // 5. Начисление очков за дистанцию и встречную полосу
    if (G.comboTimer > 0) {
      G.comboTimer -= dt;
      if (G.comboTimer <= 0) G.comboCount = 0;
    }
    const rideDirection = offsetDirection(lanesOf(G.riderLanesAt(G.playerS)), G.laneOffset);
    const oncomingMult = oncomingMultiplier(rideDirection);
    G.score += distancePoints(G.speed, dt, rideDirection, G.comboCount);

    const oncomingOn = oncomingMult !== 1;
    if (oncomingOn !== oncomingShown) {
      oncomingShown = oncomingOn;
      $('badge-oncoming').hidden = !oncomingOn;
    }

    spinOwnWheels(forwardMeters);
  }

  function stopAtMedian(prevS, halfPlayer) {
    if (!G.medianBlocksBike || G.jumpState.airborne) return;
    let hit = null;
    for (let i = 0; i <= 4; i++) {
      const s = prevS + (G.playerS - prevS) * (i / 4);
      const found = G.medianBlocksBike(s, G.riderLatAt(s), halfPlayer);
      if (found) {
        hit = found;
        break;
      }
    }
    if (!hit) return;
    G.speed = 0;
    G.lateralVelocity = 0;
    const world = G.riderLatAt(G.playerS);
    const sign = world <= hit.lat ? -1 : 1;
    const axis = G.riderLatAt(G.playerS, 0);
    const scale = G.riderLaneScaleAt(G.playerS);
    const span = Math.abs(scale) < 0.2 ? 1 : scale;
    G.laneOffset = (hit.lat + sign * hit.clear - axis) / span;
  }

  function placePlayer(isQute) {
    const maxRollFactor = isQute ? 0.055 : (0.09 + clamp(G.speed / 280, 0, 0.14));
    const leanRoll = -G.steerVisual * maxRollFactor;
    const worldLat = G.riderLatAt(G.playerS);
    G.placeOnRoad(
      G.bikeRoot,
      G.playerS,
      worldLat,
      G.jumpState.height,
      -G.steerVisual * 0.035,
      G.jumpState.pitch,
      leanRoll
    );
  }

  function updateHud(now) {
    const activeMult = oncomingMultiplier(offsetDirection(lanesOf(G.riderLanesAt(G.playerS)), G.laneOffset));
    G.updateCockpitDashboard(now, G.speed, G.distance, G.score, activeMult, G.highBeamTimer > 0);
    G.updateEcoHud(now);
  }

  function animate(now) {
    requestAnimationFrame(animate);
    const realDt = Math.min(0.04, (now - G.lastTime) / 1000);
    G.lastTime = now;

    // Slow-Mo замедляет весь игровой мир (трафик, частицы, анимации),
    // но не влияет на паузу. Модальные окна не останавливают плавный
    // возврат времени, чтобы эффект завершился до продолжения заезда.
    if (!G.paused) {
      G.updateSlowMo(realDt);
    }
    const dt = realDt * G.slowMoFactor;

    // Живой предпросмотр камеры в настройках (лёгкий рендер ~30 fps)
    if (G.camPreviewActive) G.renderCameraPreview(now);
    if (G.shopPreviewActive) G.renderShopPreview(now);

    if (G.tickFeed) G.tickFeed(dt);

    // Наклон устройства и видимость tilt-оверлея обновляются даже в паузе,
    // чтобы оверлей успевал скрыться вместе с открытием меню.
    if (G.updateTilt) G.updateTilt(now);

    // Пауза и открытые модальные окна останавливают симуляцию целиком.
    if (G.paused || G.uiModal) {
      if (G.setRainSound) G.setRainSound(0);
      if (G.renderFrame) G.renderFrame(realDt);
      else G.renderer.render(G.scene, G.camera);
      return;
    }

    tickTransientTimers(dt);

    const bike = G.selectedBike();
    const effStats = G.getBikeEffectiveStats(bike.id);
    G.applyWearToStats(effStats);
    G.frameStats = effStats;
    const isQute = effStats.isQute;

    if (!G.started && !G.ended) advanceMenuDemo(dt, now);
    if (G.started && !G.ended) {
      simulateRun(dt, now, bike, effStats);
    }

    // Биом читает уже сдвинутый playerS: профиль, трафик, декорации и небо
    // в одном кадре видят одну и ту же точку маршрута.
    if (G.updateBiome) G.updateBiome(dt);
    placePlayer(isQute);
    if (G.updateWeather) G.updateWeather(dt);
    G.updateFollowCamera(dt, isQute);
    G.updateRoadSurface(G.playerS);
    const isNightish = G.updateAtmosphereAndTimeOfDay(dt, G.playerS);
    G.aimSunAtPlayer();
    G.recycleRamps();
    if (G.updateRepair) G.updateRepair(dt, now);
    G.tickJumpParticles(dt);
    G.updateRoadside(isNightish);
    if (G.updateAdManager) G.updateAdManager(dt);
    G.updateMegaStructures(dt);
    G.updateExitWorld(dt);
    G.updateDeliveryMarker();
    G.updatePedestrians(dt, now);
    if (G.updateForkPark) G.updateForkPark(dt, now);
    G.updateTraffic(dt, now, isQute);
    updateHud(now);
    if (G.renderFrame) G.renderFrame(realDt);
    else G.renderer.render(G.scene, G.camera);
  }

  addEventListener('resize', () => {
    G.camera.aspect = innerWidth / innerHeight;
    G.camera.updateProjectionMatrix();
    G.renderer.setSize(innerWidth, innerHeight);
    if (G.applyPostFxSize) G.applyPostFxSize();
  });

  requestAnimationFrame(animate);
}
