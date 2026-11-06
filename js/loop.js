import { classifyCarContact, isOncomingLane, jumpLaunchVy, menuTrafficNudge, playerHalfWidth, rampUnderBike, stepGroundedPose, stepJump, stepSpeed, stepSteer, stepTrafficCar, trafficRecycle, worldMeters } from './motion.js';
import { COMBO_WINDOW, HARD_LANDING_PITCH, HARD_LANDING_WOBBLE, distancePoints, hardLandingSpeed, jumpBonus, nearMissPoints, oncomingMultiplier, overflyCarPoints, overflyMultiplier, scrapeSpeed } from './rules.js';
import { G } from './state.js';

export function initLoop() {
  const $ = G.$;
  const clamp = G.clamp;
  const lerp = G.lerp;
  let jumpLineShown = '';
  let oncomingShown = false;
  let comboShown = 0;

  /* =========================================================================
   * 17. ГЛАВНЫЙ ЦИКЛ СИМУЛЯЦИИ, ФИЗИКА ТЮНИНГА, ТРАМПЛИНОВ И РЕНДЕРИНГ
   * ========================================================================= */
  G.renderMainMenu();

  function finishJumpLanding() {
    const jumpDist = Math.max(0, G.playerS - G.jumpState.startS);
    const hardPitch = Math.abs(G.jumpState.pitch) > HARD_LANDING_PITCH;
    const bonusSummaryEl = $('jump-summary');

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

      bonusSummaryEl.className = hardPitch ? 'show hard' : 'show';
      bonusSummaryEl.innerHTML = hardPitch
        ? `⚠ ЖЁСТКОЕ ПРИЗЕМЛЕНИЕ (${jumpDist.toFixed(0)} м) · +${totalBonus} ₽`
        : `🏆 ПРЫЖОК ${jumpDist.toFixed(0)} М · ПЕРЕЛЁТ ×${count} ${count > 0 ? '(МЯГКАЯ ПОСАДКА +10%)' : ''} · +${totalBonus} ₽`;
      G.jumpSummaryTimer = 2.6;
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
    if (G.jumpSummaryTimer > 0) {
      G.jumpSummaryTimer -= dt;
      if (G.jumpSummaryTimer <= 0) $('jump-summary').classList.remove('show');
    }
  }

  function spinOwnWheels(meters) {
    const spin = meters * 1.9;
    G.frontWheelGroup.rotation.x -= spin;
    G.rearWheelGroup.rotation.x -= spin;
    for (const qw of G.quteWheels) qw.rotation.x -= spin;
  }

  function advanceMenuDemo(dt, now) {
    const forwardMeters = worldMeters(78, dt);
    G.playerS += forwardMeters;
    G.laneOffset = lerp(G.laneOffset, G.LANE_OFFSETS[2], dt * 2.5);
    G.steerVisual = Math.sin(now * 0.0012) * 0.08;
    spinOwnWheels(forwardMeters);
  }

  function simulateRun(dt, now, bike, effStats) {
    const prevSpeed = G.speed;
    G.accidentCooldown = Math.max(0, G.accidentCooldown - dt);
    // Пустой бак без эвакуатора: жёсткое ограничение 5 км/ч, не зависит от тюнинга
    const effectiveMaxSpeed = (G.limpMode && G.fuelM <= 0)
      ? Math.min(effStats.maxSpeed, G.LIMP_MAX_SPEED)
      : effStats.maxSpeed;
    const stepped = stepSpeed(G.speed, dt, {
      gas: G.keys.gas,
      brake: G.keys.brake,
      maxSpeed: effectiveMaxSpeed,
      accel: effStats.accel,
      brakeDecel: effStats.brakeDecel,
      isQute: effStats.isQute
    });
    G.speed = stepped.speed;

    G.tailLightBrakeMat.emissiveIntensity = G.keys.brake ? 3.4 : 1.1;
    for (const fl of G.yuraFlames) {
      fl.visible = effStats.isYura && G.keys.gas && G.speed > 40 && (Math.floor(now / 60) % 2 === 0);
      fl.scale.z = 0.7 + Math.random() * 0.9;
    }

    G.accelPitchOffset = lerp(G.accelPitchOffset, clamp((stepped.speed - prevSpeed) / Math.max(dt, 0.001) * 0.0008, -0.04, 0.05), dt * 6);

    const steered = stepSteer({
      laneOffset: G.laneOffset,
      lateralVelocity: G.lateralVelocity,
      steerVisual: G.steerVisual,
      slipDriftVel: G.slipDriftVel,
      wobbleTimer: G.jumpState.wobbleTimer
    }, dt, now, {
      left: G.keys.left,
      right: G.keys.right,
      brake: G.keys.brake,
      speed: G.speed,
      airborne: G.jumpState.airborne,
      curvature: G.roadDDX(G.playerS),
      isYura: effStats.isYura,
      wideTires: effStats.wideTires,
      upgradedBrakes: effStats.upgradedBrakes,
      roadEdge: G.ROAD_EDGE
    });
    G.laneOffset = steered.laneOffset;
    G.lateralVelocity = steered.lateralVelocity;
    G.steerVisual = steered.steerVisual;
    G.slipDriftVel = steered.slipDriftVel;
    G.jumpState.wobbleTimer = steered.wobbleTimer;
    if (steered.scraped) G.speed = scrapeSpeed(G.speed, dt);

    for (const fp of G.quteFrontPivots) fp.rotation.y = -G.steerVisual * 0.42;
    G.quteSteeringWheelPivot.rotation.z = -G.steerVisual * 0.88;

    const forwardMeters = worldMeters(G.speed, dt);
    G.playerS += forwardMeters;
    G.distance += (G.speed * dt) / 3600;

    // 3.1 Экономика: расход топлива, износ деталей и таймер заказа
    G.tickEconomy(dt, forwardMeters);
    G.tickOrder(dt);

    // 4. ФИЗИКА ТРАМПЛИНОВ И ПРЫЖКОВ
    let surfaceRampHeight = 0;
    for (const ramp of G.rampsPool) {
      const contact = !G.jumpState.airborne && rampUnderBike(G.playerS, G.laneOffset, ramp);
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
          for (const c of G.trafficPool) c.jumpedInCurrentJump = false;
          $('jump-live').hidden = false;
          jumpLineShown = 'Машин: 0 · Бонус: +0 ₽';
          $('jump-live-text').textContent = jumpLineShown;
          G.playJumpSound('launch', 1);
        }
      }
    }

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
        const jumpLine = `Машин: ${count} (×${overflyMultiplier(count)}) · Дист: ${jumpDistNow.toFixed(0)} м · +${Math.round(G.jumpState.liveBonus)} ₽`;
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
    const oncomingMult = oncomingMultiplier(G.laneOffset);
    G.score += distancePoints(G.speed, dt, G.laneOffset, G.comboCount);

    const oncomingOn = oncomingMult !== 1;
    if (oncomingOn !== oncomingShown) {
      oncomingShown = oncomingOn;
      $('badge-oncoming').hidden = !oncomingOn;
    }
    if (G.comboCount !== comboShown) {
      comboShown = G.comboCount;
      const badgeCombo = $('badge-combo');
      if (G.comboCount > 1) {
        badgeCombo.hidden = false;
        badgeCombo.textContent = `🔥 КОМБО ×${G.comboCount}`;
      } else {
        badgeCombo.hidden = true;
      }
    }

    spinOwnWheels(forwardMeters);
  }

  function placePlayer(isQute) {
    const maxRollFactor = isQute ? 0.055 : (0.09 + clamp(G.speed / 280, 0, 0.14));
    const leanRoll = -G.steerVisual * maxRollFactor;
    G.placeOnRoad(
      G.bikeRoot,
      G.playerS,
      G.laneOffset,
      G.jumpState.height,
      -G.steerVisual * 0.035,
      G.jumpState.pitch,
      leanRoll
    );
  }

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
      if (recycle) G.resetTrafficVehicle(car, recycle.base + Math.random() * recycle.spread);

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
        const popVal = overflyCarPoints(cCount);
        G.spawnOverflyParticles(car.model.root.position);
        G.spawnFloatingPopup(`+${popVal} ₽ (ПЕРЕЛЁТ ×${cCount})`, car.model.root.position, cCount >= 2 ? '#00e5ff' : '#fff176');
        G.playJumpSound('overfly', cCount);
      } else if (kind === 'crash') {
        G.handleAccident(car);
      } else if (kind === 'near') {
        car.nearMissAwarded = true;
        G.comboCount++;
        G.comboTimer = COMBO_WINDOW;
        G.score += nearMissPoints(G.comboCount, G.laneOffset);
      }
    }
  }

  function updateHud(now) {
    const activeMult = oncomingMultiplier(G.laneOffset);
    G.updateCockpitDashboard(now, G.speed, G.distance, G.score, activeMult, G.highBeamTimer > 0);
    G.updateEcoHud(now);
  }

  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min(0.04, (now - G.lastTime) / 1000);
    G.lastTime = now;

    // Пауза и открытые модальные окна останавливают симуляцию целиком.
    if (G.paused || G.uiModal) {
      G.renderer.render(G.scene, G.camera);
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

    placePlayer(isQute);
    G.updateFollowCamera(dt, isQute);
    G.aimSunAtPlayer();
    G.updateRoadSurface(G.playerS);
    const isNightish = G.updateAtmosphereAndTimeOfDay(dt, G.playerS);
    G.recycleRamps();
    G.tickJumpParticles(dt);
    G.updateRoadside(isNightish);
    G.updateMegaStructures(dt);
    G.updateExitWorld(dt);
    G.updateDeliveryMarker();
    G.updatePedestrians(dt, now);
    updateTraffic(dt, now, isQute);
    updateHud(now);
    G.renderer.render(G.scene, G.camera);
  }

  addEventListener('resize', () => {
    G.camera.aspect = innerWidth / innerHeight;
    G.camera.updateProjectionMatrix();
    G.renderer.setSize(innerWidth, innerHeight);
  });

  requestAnimationFrame(animate);
}
