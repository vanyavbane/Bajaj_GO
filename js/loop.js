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
    const hardPitch = Math.abs(G.jumpState.pitch) > 0.34;
    const bonusSummaryEl = $('jump-summary');

    if (G.jumpState.carsJumped > 0 || jumpDist > 16) {
      const count = G.jumpState.carsJumped;
      const comboMult = count >= 3 ? 2.0 : (count === 2 ? 1.5 : 1.0);
      const baseOverflyScore = count * 50 * comboMult;
      const distBonus = Math.max(0, Math.floor((jumpDist - 12) / 10) * 20);
      let totalBonus = baseOverflyScore + distBonus;

      if (!hardPitch && count > 0) {
        totalBonus = Math.round(totalBonus * 1.1);
      }

      if (hardPitch) {
        G.speed *= 0.72;
        G.jumpState.wobbleTimer = 0.55;
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

  function advanceMenuDemo(dt, now) {
    const demoSpeed = 78;
    const forwardMeters = (demoSpeed / 3.6) * dt * 1.45;
    G.playerS += forwardMeters;
    G.laneOffset = lerp(G.laneOffset, G.LANE_OFFSETS[2], dt * 2.5);
    G.steerVisual = Math.sin(now * 0.0012) * 0.08;
    G.frontWheelGroup.rotation.x -= forwardMeters * 1.9;
    G.rearWheelGroup.rotation.x -= forwardMeters * 1.9;
    for (const qw of G.quteWheels) qw.rotation.x -= forwardMeters * 1.9;
  }

  function simulateRun(dt, now, bike, effStats, isQute, isYura, hasUpgradedBrakes, hasWideTires) {
    const prevSpeed = G.speed;
    G.accidentCooldown = Math.max(0, G.accidentCooldown - dt);
    // Пустой бак без эвакуатора: жёсткое ограничение 5 км/ч, не зависит от тюнинга
    const effectiveMaxSpeed = (G.limpMode && G.fuelM <= 0)
      ? Math.min(effStats.maxSpeed, G.LIMP_MAX_SPEED)
      : effStats.maxSpeed;
    const effectiveAccel = effStats.accel;
    const speedRatio = G.speed / effectiveMaxSpeed;

    // 1. Ускорение и торможение с учётом установленного тюнинга (макс. скорость, широкая резина, усиленные тормоза)
    if (G.keys.gas && !G.keys.brake) {
      const accelCurve = effectiveAccel * (1.05 - 0.65 * speedRatio * speedRatio);
      G.speed = Math.min(effectiveMaxSpeed, G.speed + accelCurve * dt);
    } else {
      const dragDecel = (isQute ? 7.2 : 8.5) + G.speed * 0.14;
      G.speed = Math.max(0, G.speed - dragDecel * dt);
    }
    if (G.keys.brake) {
      G.speed = Math.max(0, G.speed - effStats.brakeDecel * dt);
    }
    if (G.speed > effectiveMaxSpeed) {
      G.speed = Math.max(effectiveMaxSpeed, G.speed - 60 * dt);
    }

    G.tailLightBrakeMat.emissiveIntensity = G.keys.brake ? 3.4 : 1.1;
    for (const fl of G.yuraFlames) {
      fl.visible = isYura && G.keys.gas && G.speed > 40 && (Math.floor(now / 60) % 2 === 0);
      fl.scale.z = 0.7 + Math.random() * 0.9;
    }

    const accelDelta = (G.speed - prevSpeed) / Math.max(dt, 0.001);
    G.accelPitchOffset = lerp(G.accelPitchOffset, clamp(accelDelta * 0.0008, -0.04, 0.05), dt * 6);

    // 2. Рулевое управление (усиленные тормоза и широкая резина повышают стабильность при замедлении и манёврах)
    const dir = (G.keys.right ? 1 : 0) - (G.keys.left ? 1 : 0);
    const airControlFactor = G.jumpState.airborne ? 0.36 : 1.0;
    const wobblePenalty = G.jumpState.wobbleTimer > 0 ? Math.sin(now * 0.045) * 2.4 : 0;
    if (G.jumpState.wobbleTimer > 0) G.jumpState.wobbleTimer -= dt;

    const isLowSpeed = G.speed < 90;
    const lowSpeedFactor = clamp((90 - G.speed) / 90, 0, 1);

    const steerResp = isLowSpeed ? (7.5 + lowSpeedFactor * 4.5) : clamp(4.2 - (G.speed - 90) / 140, 1.85, 4.2);
    G.steerVisual += (dir - G.steerVisual) * Math.min(1, dt * steerResp);

    const targetLatVel = dir * (isLowSpeed ? (6.4 + lowSpeedFactor * 2.2) : (5.4 + G.speed * 0.014)) * airControlFactor;
    const latInertia = isLowSpeed ? 11.0 : clamp(6.2 - (G.speed - 90) / 95, 2.1, 6.2);
    G.lateralVelocity += (targetLatVel - G.lateralVelocity) * Math.min(1, dt * latInertia);

    const roadCurvature = G.roadDDX(G.playerS);
    const gripStability = (hasWideTires ? 0.82 : 1.0) * (G.keys.brake && hasUpgradedBrakes ? 0.65 : 1.0);
    const centrifugalDrift = -roadCurvature * (G.speed * G.speed) * (isYura ? 0.055 : 0.042) * gripStability;
    const highSpeedSlip = (G.speed > 140 && Math.abs(dir - G.steerVisual) > 0.32)
      ? (dir * (G.speed - 140) * (isYura ? 0.025 : 0.018) * gripStability)
      : 0;
    G.slipDriftVel = lerp(G.slipDriftVel, (centrifugalDrift + highSpeedSlip) * airControlFactor, dt * 4.5);

    G.laneOffset += (G.lateralVelocity + G.slipDriftVel + wobblePenalty) * dt;

    for (const fp of G.quteFrontPivots) fp.rotation.y = -G.steerVisual * 0.42;
    G.quteSteeringWheelPivot.rotation.z = -G.steerVisual * 0.88;

    const roadEdge = 9.0;
    if (G.laneOffset >= roadEdge) {
      G.laneOffset = roadEdge;
      G.speed = 0;
      G.lateralVelocity = 0;
      G.keys.gas = false;
    } else if (G.laneOffset <= -roadEdge) {
      G.laneOffset = -roadEdge;
      G.speed = 0;
      G.lateralVelocity = 0;
      G.keys.gas = false;
    }

    // 3. Движение вперёд по трассе
    const forwardMeters = (G.speed / 3.6) * dt * 1.45;
    G.playerS += forwardMeters;
    G.distance += (G.speed * dt) / 3600;

    // 3.1 Экономика: расход топлива, износ деталей и таймер заказа
    G.tickEconomy(dt, forwardMeters);
    G.tickOrder(dt);

    // 4. ФИЗИКА ТРАМПЛИНОВ И ПРЫЖКОВ
    let surfaceRampHeight = 0;
    for (const ramp of G.rampsPool) {
      const halfL = ramp.length * 0.5;
      const dS = G.playerS - ramp.s;
      const dLat = Math.abs(G.laneOffset - ramp.lateralOffset);

      if (!G.jumpState.airborne && dLat < (ramp.width * 0.5 + 0.35) && dS >= -halfL && dS <= halfL) {
        const progress = clamp((dS + halfL) / ramp.length, 0, 1);
        surfaceRampHeight = progress * ramp.height;

        if (progress >= 0.78 && !ramp.triggeredThisPass && G.speed > 60) {
          ramp.triggeredThisPass = true;
          G.jumpState.airborne = true;
          G.jumpState.height = surfaceRampHeight + 0.08;
          const speedFactor = clamp((G.speed - 60) / 140, 0.22, 1.85);
          G.jumpState.vy = (7.4 + speedFactor * 6.4) * (bike.massFactor || 1.0);
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
      const gravity = 20.5;
      G.jumpState.vy -= gravity * dt;
      G.jumpState.height += G.jumpState.vy * dt;

      const pitchInput = (G.keys.gas ? 1 : 0) - (G.keys.brake ? 1 : 0);
      const targetAirPitch = clamp(G.jumpState.vy * 0.025 + pitchInput * 0.14, -0.42, 0.38);
      G.jumpState.pitch = lerp(G.jumpState.pitch, targetAirPitch, dt * 5.5);

      if (G.jumpState.height <= 0) {
        finishJumpLanding();
        } else {
        const jumpDistNow = Math.max(0, G.playerS - G.jumpState.startS);
        const count = G.jumpState.carsJumped;
        const mult = count >= 3 ? 2.0 : (count === 2 ? 1.5 : 1.0);
        G.jumpState.liveBonus = count * 50 * mult + Math.max(0, Math.floor((jumpDistNow - 12) / 10) * 20);
        const jumpLine = `Машин: ${count} (×${mult}) · Дист: ${jumpDistNow.toFixed(0)} м · +${Math.round(G.jumpState.liveBonus)} ₽`;
        if (jumpLine !== jumpLineShown) {
          jumpLineShown = jumpLine;
          $('jump-live-text').textContent = jumpLine;
        }
      }
    } else {
      G.jumpState.height = lerp(G.jumpState.height, surfaceRampHeight, dt * 18);
      G.jumpState.pitch = lerp(G.jumpState.pitch, surfaceRampHeight > 0.05 ? 0.15 : G.accelPitchOffset, dt * 10);
    }

    // 5. Начисление очков за дистанцию и встречную полосу
    if (G.comboTimer > 0) {
      G.comboTimer -= dt;
      if (G.comboTimer <= 0) G.comboCount = 0;
    }
    const oncomingMult = G.laneOffset < -0.15 ? 2 : 1;
    const comboMult = G.comboCount > 0 ? (1 + Math.min(G.comboCount, 5) * 0.2) : 1;
    G.score += (G.speed * dt / 6) * oncomingMult * comboMult;

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

    G.frontWheelGroup.rotation.x -= forwardMeters * 1.9;
    G.rearWheelGroup.rotation.x -= forwardMeters * 1.9;
    for (const qw of G.quteWheels) qw.rotation.x -= forwardMeters * 1.9;
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

  function updateCamera(dt, isQute) {
    const useThirdPersonCam = (!G.started || G.ended) || (G.cameraMode === 'third');
    if (!useThirdPersonCam) {
      if (G.camera.parent !== G.riderPivot) G.riderPivot.add(G.camera);
      const cockpitY = isQute ? 1.33 : 1.56;
      const cockpitZ = isQute ? -0.14 : 0.35;
      G.riderPivot.position.set(0, cockpitY, cockpitZ);
      G.camera.position.set(0, G.accelPitchOffset * 0.35, 0);
      G.camera.rotation.set(G.accelPitchOffset * 0.4, 0, -G.steerVisual * (isQute ? 0.025 : 0.04));
    } else {
      if (G.camera.parent !== G.scene) G.scene.add(G.camera);

      const roadYaw = -Math.atan(G.roadDX(G.playerS));
      const cosY = Math.cos(-roadYaw), sinY = Math.sin(-roadYaw);

      const isMenuView = !G.started && !G.ended;
      const speedPullback = clamp(G.speed / 220, 0, 1.35);
      const jumpPullback = G.jumpState.airborne ? clamp(G.jumpState.height * 0.55, 0, 2.2) : 0;
      const distBehind = isMenuView ? 6.6 : (6.1 + speedPullback + jumpPullback);
      const heightAboveRoad = isMenuView
        ? 3.35
        : (3.05 + G.jumpState.height * 0.72 + clamp(G.speed / 320, 0, 0.45));

      const camS = G.playerS - distBehind;
      const camLat = isMenuView ? (G.laneOffset - 1.4) : (G.laneOffset * 0.92);
      const camYaw = -Math.atan(G.roadDX(camS));
      const minSafeY = G.roadY(camS) + 1.85;
      const targetCamX = G.roadX(camS) + Math.cos(camYaw) * camLat;
      const targetCamZ = -camS + Math.sin(camYaw) * camLat;
      const targetCamY = Math.max(minSafeY, G.roadY(G.playerS) + heightAboveRoad);

      const followRate = Math.min(1, dt * 11.5);
      if (G.camPosSmooth.distanceToSquared(G.bikeRoot.position) > 900) {
        G.camPosSmooth.set(targetCamX, targetCamY, targetCamZ);
      } else {
        G.camPosSmooth.x = lerp(G.camPosSmooth.x, targetCamX, followRate);
        G.camPosSmooth.y = lerp(G.camPosSmooth.y, targetCamY, followRate);
        G.camPosSmooth.z = lerp(G.camPosSmooth.z, targetCamZ, followRate);
      }
      G.camera.position.copy(G.camPosSmooth);

      const lookAheadS = G.playerS + (isMenuView ? 42 : 46);
      const lookLat = isMenuView ? 0.5 : (G.laneOffset * 0.55);
      const targetLookX = G.roadX(lookAheadS) + cosY * lookLat;
      const targetLookZ = -lookAheadS + sinY * lookLat;
      const targetLookY = G.roadY(lookAheadS) + 1.25 + G.jumpState.height * 0.25;

      G.camLookSmooth.x = lerp(G.camLookSmooth.x, targetLookX, Math.min(1, dt * 13));
      G.camLookSmooth.y = lerp(G.camLookSmooth.y, targetLookY, Math.min(1, dt * 13));
      G.camLookSmooth.z = lerp(G.camLookSmooth.z, targetLookZ, Math.min(1, dt * 13));

      G.camera.lookAt(G.camLookSmooth);
      G.camera.rotation.z += -G.steerVisual * 0.025;
    }
  }

  function aimSunAtPlayer() {
    G.sunLight.position.set(G.bikeRoot.position.x - 24, G.bikeRoot.position.y + 48, G.bikeRoot.position.z - 25);
    G.sunLight.target.position.set(G.bikeRoot.position.x, G.bikeRoot.position.y, G.bikeRoot.position.z - 28);
  }

  function recycleRamps() {
    for (const ramp of G.rampsPool) {
      if (ramp.s < G.playerS - 32) {
        let maxRampS = G.playerS;
        for (const other of G.rampsPool) if (other.s > maxRampS) maxRampS = other.s;
        const nextInterval = 240 + Math.random() * 200;
        ramp.laneIdx = Math.random() < 0.5 ? 2 : 3;
        ramp.lateralOffset = G.LANE_OFFSETS[ramp.laneIdx];
        ramp.s = G.findSafeRampS(maxRampS + nextInterval);
        ramp.triggeredThisPass = false;
        ramp.placedS = NaN;
      }
      if (ramp.placedS !== ramp.s) {
        ramp.placedS = ramp.s;
        G.placeOnRoad(ramp.mesh, ramp.s, ramp.lateralOffset, 0);
      }
    }
  }

  function tickJumpParticles(dt) {
    for (const p of G.jumpParticles) {
      if (p.life > 0) {
        p.life -= dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.vy -= 14 * dt;
        p.mesh.rotation.x += 6 * dt;
        p.mesh.rotation.y += 6 * dt;
        if (p.life <= 0) p.mesh.visible = false;
      }
    }
  }

  function updateRoadside(isNightish) {
    const recycleSpan = G.NUM_ROADSIDE_SLOTS * G.SLOT_STEP;
    const nearestLampPositions = [];

    for (const slot of G.roadsideSlots) {
      if (slot.s < G.playerS - 35) slot.s += recycleSpan;
      if (slot.placedS !== slot.s) {
        slot.placedS = slot.s;
        G.placeOnRoad(slot.leftGuard, slot.s, -10.05, 0);
        G.placeOnRoad(slot.rightGuard, slot.s, 10.05, 0);
        G.placeOnRoad(slot.leftLamp, slot.s, -10.3, 0);
        G.placeOnRoad(slot.rightLamp, slot.s, 10.3, 0);
        G.placeOnRoad(slot.leftProp, slot.s, -21.5, 0);
        G.placeOnRoad(slot.rightProp, slot.s, 21.5, 0);
        if (slot.billboard) {
          G.placeOnRoad(slot.billboard.group, slot.s + 6, slot.billboard.side * 15.8, 0, slot.billboard.side * -0.22);
        }
        if (slot.portal) G.placeOnRoad(slot.portal, slot.s, 0, 0);
      }

      if (Math.abs(slot.s - G.playerS) < 85) {
        nearestLampPositions.push(slot.leftLamp.position, slot.rightLamp.position);
      }
    }

    const lampBudget = G.graphics ? G.graphics.lamps : G.lampLights.length;
    for (let i = 0; i < G.lampLights.length; i++) {
      const pl = G.lampLights[i];
      if (isNightish && i < lampBudget && i < nearestLampPositions.length) {
        const lp = nearestLampPositions[i];
        pl.position.set(lp.x, lp.y + 5.8, lp.z);
        pl.intensity = 14;
      } else {
        pl.intensity = 0;
      }
    }
  }

  function updateMegaStructures(dt) {
    for (const ms of G.megaStructures) {
      if (ms.userData.s < G.playerS - 65) ms.userData.s += G.megaStructures.length * 320;
      if (ms.userData.placedS !== ms.userData.s) {
        ms.userData.placedS = ms.userData.s;
        G.placeOnRoad(ms, ms.userData.s, 0, 0);
      }
      if (ms.userData.decoCars) {
        for (const dc of ms.userData.decoCars) {
          dc.mesh.position.x += dc.dir * 14 * dt;
          if (dc.mesh.position.x > 20) dc.mesh.position.x = -20;
          if (dc.mesh.position.x < -20) dc.mesh.position.x = 20;
        }
      }
    }
  }

  function updatePedestrians(dt, now) {
    for (const ped of G.pedestrians) {
      ped.s += ped.walkSpeed * dt;
      if (ped.s < G.playerS - 30) ped.s += 26 * 16;
      if (ped.s > G.playerS + 390) ped.s -= 26 * 16;

      const facingYaw = ped.walkSpeed >= 0 ? 0 : Math.PI;
      G.placeOnRoad(ped.group, ped.s, ped.lateralOffset, 0.11, facingYaw);

      if (ped.walkSpeed !== 0) {
        const swing = Math.sin(now * 0.008 + ped.phase) * 0.45;
        ped.legL.rotation.x = swing;
        ped.legR.rotation.x = -swing;
      }
    }
  }

  function updateTraffic(dt, now, isQute) {
    const playerHalfW = isQute ? 0.66 : 0.38;
    for (const car of G.trafficPool) {
      const isOncoming = car.laneIdx < 2;
      const moveMeters = (car.speedKmh / 3.6) * dt * 1.45;
      car.s += isOncoming ? -moveMeters : moveMeters;

      if (car.changingLane) {
        const targetOffset = G.LANE_OFFSETS[car.targetLaneIdx];
        const diff = targetOffset - car.lateralOffset;
        const step = Math.sign(diff) * Math.min(Math.abs(diff), 4.2 * dt);
        car.lateralOffset += step;
        car.steerAngle = clamp(diff * 0.25, -0.35, 0.35);
        if (Math.abs(diff) < 0.06) {
          car.lateralOffset = targetOffset;
          car.laneIdx = car.targetLaneIdx;
          car.changingLane = false;
          car.steerAngle = 0;
        }
      } else {
        car.steerAngle *= 0.85;
      }

      if (car.flashReactTimer > 0) {
        car.flashReactTimer -= dt;
        car.model.alertSprite.visible = Math.floor(now / 120) % 2 === 0;
        if (car.flashReactTimer <= 0) car.model.alertSprite.visible = false;
      }

      if (car.s < G.playerS - 28) {
        G.resetTrafficVehicle(car, G.playerS + 230 + Math.random() * 90);
      } else if (car.s > G.playerS + 340) {
        G.resetTrafficVehicle(car, G.playerS + 190 + Math.random() * 80);
      }

      if (!G.started && !G.ended && Math.abs(car.s - G.playerS) < 9 && Math.abs(car.lateralOffset - G.laneOffset) < 2.5) {
        car.s = G.playerS + 45;
      }

      const vehicleYaw = (isOncoming ? Math.PI : 0) - car.steerAngle * 0.45;
      G.placeOnRoad(car.model.root, car.s, car.lateralOffset, 0, vehicleYaw);

      const distToPlayer = Math.abs(car.s - G.playerS);
      const useLod = distToPlayer > 145;
      car.model.hiDetail.visible = !useLod;
      car.model.loDetail.visible = useLod;

      if (!useLod) {
        const wheelSpin = moveMeters * 1.6;
        for (const w of car.model.wheels) w.rotation.x -= wheelSpin;
        for (const fp of car.model.frontPivots) fp.rotation.y = -car.steerAngle;
      }

      if (G.started && !G.ended) {
        const dS = Math.abs(car.s - G.playerS);
        const dLat = Math.abs(car.lateralOffset - G.laneOffset);
        const horizOverlap = dS < (car.model.halfLength + 0.85) && dLat < (car.model.halfWidth + playerHalfW);

        const clearanceHeight = car.model.roofHeight * 0.58;
        if (G.jumpState.airborne && G.jumpState.height >= clearanceHeight) {
          if (!isOncoming && !car.jumpedInCurrentJump && dS < (car.model.halfLength + 1.1) && dLat < (car.model.halfWidth + 0.95)) {
            car.jumpedInCurrentJump = true;
            G.jumpState.carsJumped++;
            const cCount = G.jumpState.carsJumped;
            const mult = cCount >= 3 ? 2.0 : (cCount === 2 ? 1.5 : 1.0);
            const popVal = Math.round(50 * mult);
            G.spawnOverflyParticles(car.model.root.position);
            G.spawnFloatingPopup(`+${popVal} ₽ (ПЕРЕЛЁТ ×${cCount})`, car.model.root.position, cCount >= 2 ? '#00e5ff' : '#fff176');
            G.playJumpSound('overfly', cCount);
          }
        } else if (horizOverlap && G.speed > 22 && G.accidentCooldown <= 0) {
          G.handleAccident(car);
        } else if (!G.jumpState.airborne && !car.nearMissAwarded && dS < 2.2 && dLat < (car.model.halfWidth + 1.15) && G.speed > 80) {
          car.nearMissAwarded = true;
          G.comboCount++;
          G.comboTimer = 4.0;
          G.score += 25 * G.comboCount * (G.laneOffset < -0.15 ? 2 : 1);
        }
      }
    }
  }

  function updateHud(now) {
    const activeMult = (G.laneOffset < -0.15 ? 2 : 1);
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
    const isQute = bike.vType === 'qute' || bike.vType === 'yura';
    const isYura = bike.vType === 'yura';
    const hasUpgradedBrakes = G.hasUpgradeInstalled(bike.id, 'new_brakes');
    const hasWideTires = G.hasUpgradeInstalled(bike.id, 'wide_tires');

    if (!G.started && !G.ended) advanceMenuDemo(dt, now);
    if (G.started && !G.ended) {
      simulateRun(dt, now, bike, effStats, isQute, isYura, hasUpgradedBrakes, hasWideTires);
    }

    placePlayer(isQute);
    updateCamera(dt, isQute);
    aimSunAtPlayer();
    G.updateRoadSurface(G.playerS);
    const isNightish = G.updateAtmosphereAndTimeOfDay(dt, G.playerS);
    recycleRamps();
    tickJumpParticles(dt);
    updateRoadside(isNightish);
    updateMegaStructures(dt);
    G.updateExitWorld(dt);
    G.updateDeliveryMarker();
    updatePedestrians(dt, now);
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
