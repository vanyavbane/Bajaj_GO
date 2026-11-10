import * as THREE from 'three';
import { G } from '../state.js';
import { box, cylinder } from '../geom.js';

function mesh(geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

function axle(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.rotation.z = Math.PI / 2;
  return m;
}

export function buildMotorcycle() {
  G.bikeChassisGroup = new THREE.Group();
  G.bikeRoot.add(G.bikeChassisGroup);

  G.frontWheelGroup = new THREE.Group();
  G.frontWheelGroup.position.set(0, 0.34, -1.42);
  const fTire = axle(cylinder(0.33, 0.33, 0.16, 16), G.M.rubber);
  fTire.castShadow = true;
  const fRim = axle(cylinder(0.22, 0.22, 0.17, 10), G.M.metalDark);
  const brakeDisc = axle(cylinder(0.17, 0.17, 0.02, 12), G.M.chrome);
  brakeDisc.position.x = 0.095;
  G.frontWheelGroup.add(fTire, fRim, brakeDisc);
  G.bikeChassisGroup.add(G.frontWheelGroup);

  G.rearWheelGroup = new THREE.Group();
  G.rearWheelGroup.position.set(0, 0.34, 0.68);
  const rTire = axle(cylinder(0.34, 0.34, 0.22, 16), G.M.rubber);
  rTire.castShadow = true;
  const rRim = axle(cylinder(0.22, 0.22, 0.23, 10), G.M.metalDark);
  G.rearWheelGroup.add(rTire, rRim);
  G.bikeChassisGroup.add(G.rearWheelGroup);

  const brakeCaliper = mesh(box(0.06, 0.11, 0.11), G.accentMat, 0.11, 0.42, -1.32);
  const frontFender = mesh(box(0.22, 0.12, 0.46), G.accentMat, 0, 0.64, -1.42);
  frontFender.rotation.x = 0.18;
  const engineBlock = mesh(box(0.46, 0.48, 0.58), G.M.metalDark, 0, 0.55, -0.62);
  engineBlock.castShadow = true;
  G.bikeChassisGroup.add(brakeCaliper, frontFender, engineBlock);
  const pulsarFender = frontFender;

  /* =========================================================================
   * ВАРИАНТЫ ВНЕШНЕГО ВИДА: BOXER И AVENGER (ТЗ v19)
   * Общие колёса, двигатель и слоты тюнинга остаются одни на все модели,
   * поэтому тюнинг визуально работает на любом байке.
   * ========================================================================= */
  G.bikeVariantGroups = { boxer: new THREE.Group(), avenger: new THREE.Group() };
  G.bikeChassisGroup.add(G.bikeVariantGroups.boxer, G.bikeVariantGroups.avenger);

  const boxerFender = mesh(box(0.24, 0.11, 0.5), G.tankMat, 0, 0.64, -1.42);
  boxerFender.rotation.x = 0.16;
  const avengerFender = mesh(box(0.26, 0.1, 0.58), G.tankMat, 0, 0.6, -1.78);
  avengerFender.rotation.x = 0.14;
  G.bikeVariantGroups.boxer.add(boxerFender);
  G.bikeVariantGroups.avenger.add(avengerFender);

  {
    // Boxer: одна круглая фара вместо двойной, простая вилка и выхлоп.
    const headlightBucket = new THREE.Mesh(cylinder(0.135, 0.115, 0.16, 16), G.M.chrome);
    headlightBucket.rotation.x = Math.PI / 2;
    headlightBucket.position.set(0, 0.92, -1.44);
    const headlightLens = new THREE.Mesh(cylinder(0.112, 0.112, 0.03, 16), G.M.glass);
    headlightLens.rotation.x = Math.PI / 2;
    headlightLens.position.set(0, 0.92, -1.53);
    for (const side of [-1, 1]) {
      const forkLeg = new THREE.Mesh(cylinder(0.035, 0.035, 0.86, 8), G.M.chrome);
      forkLeg.position.set(side * 0.1, 0.68, -1.5);
      forkLeg.rotation.x = 0.42;
      G.bikeVariantGroups.boxer.add(forkLeg);
    }
    const simplePipe = new THREE.Mesh(cylinder(0.055, 0.05, 1.05, 10), G.M.chrome);
    simplePipe.rotation.x = Math.PI / 2;
    simplePipe.position.set(0.24, 0.34, 0.12);
    G.bikeVariantGroups.boxer.add(headlightBucket, headlightLens, simplePipe);
  }

  {
    // Avenger: длинная вилка, большой круглый хром-фонарь, хром-дуги,
    // низкое сиденье, sissy bar и один длинный выхлоп справа.
    for (const side of [-1, 1]) {
      const forkLeg = new THREE.Mesh(cylinder(0.036, 0.036, 1.02, 8), G.M.chrome);
      forkLeg.position.set(side * 0.1, 0.7, -1.58);
      forkLeg.rotation.x = 0.545;
      const crashBar = new THREE.Mesh(cylinder(0.035, 0.035, 0.66, 8), G.M.chrome);
      crashBar.position.set(side * 0.42, 0.5, -0.34);
      crashBar.rotation.z = side * 0.95;
      crashBar.rotation.x = 0.22;
      G.bikeVariantGroups.avenger.add(forkLeg, crashBar);
    }
    const bigBucket = new THREE.Mesh(cylinder(0.16, 0.14, 0.2, 16), G.M.chrome);
    bigBucket.rotation.x = Math.PI / 2;
    bigBucket.position.set(0, 0.86, -1.8);
    const bigLens = new THREE.Mesh(cylinder(0.14, 0.14, 0.03, 16), G.M.glass);
    bigLens.rotation.x = Math.PI / 2;
    bigLens.position.set(0, 0.86, -1.91);
    const rearFender = mesh(box(0.3, 0.1, 0.62), G.M.chrome, 0, 0.63, 0.7);
    rearFender.rotation.x = -0.12;
    const sissyBar = mesh(box(0.06, 0.54, 0.06), G.M.chrome, 0, 1.02, 0.86);
    const sissyPad = mesh(box(0.3, 0.16, 0.1), G.M.mattePlastic, 0, 1.18, 0.86);
    const longPipe = new THREE.Mesh(cylinder(0.07, 0.06, 1.78, 10), G.M.chrome);
    longPipe.rotation.x = Math.PI / 2;
    longPipe.position.set(0.3, 0.3, 0.3);
    G.bikeVariantGroups.avenger.add(bigBucket, bigLens, rearFender, sissyBar, sissyPad, longPipe);
  }

  const tuneUpgradedBrakesGroup = new THREE.Group();
  {
    const bigDiscL = axle(cylinder(0.245, 0.245, 0.026, 14), G.M.chrome);
    bigDiscL.position.x = -0.105;
    const bigDiscR = bigDiscL.clone();
    bigDiscR.position.x = 0.105;
    const innerRingL = axle(cylinder(0.16, 0.16, 0.03, 10), G.M.goldMetal);
    innerRingL.position.x = -0.105;
    const innerRingR = innerRingL.clone();
    innerRingR.position.x = 0.105;
    G.frontWheelGroup.add(bigDiscL, bigDiscR, innerRingL, innerRingR);

    const rearDisc = axle(cylinder(0.21, 0.21, 0.025, 12), G.M.chrome);
    rearDisc.position.x = 0.135;
    G.rearWheelGroup.add(rearDisc);

    const calL = mesh(box(0.08, 0.15, 0.14), G.M.goldMetal, -0.125, 0.43, -1.30);
    const calR = calL.clone();
    calR.position.x = 0.125;
    const calRear = mesh(box(0.075, 0.12, 0.12), G.M.goldMetal, 0.15, 0.44, 0.58);
    tuneUpgradedBrakesGroup.add(calL, calR, calRear);
    tuneUpgradedBrakesGroup.userData = { discs: [bigDiscL, bigDiscR, innerRingL, innerRingR, rearDisc] };
  }
  G.bikeChassisGroup.add(tuneUpgradedBrakesGroup);

  const tuneZeroFilterGroup = new THREE.Group();
  {
    const intakePipe = axle(cylinder(0.045, 0.045, 0.18, 10), G.M.chrome);
    intakePipe.position.set(0.26, 0.62, -0.46);
    const filterCone = new THREE.Mesh(cylinder(0.062, 0.092, 0.18, 12), G.M.filterRed);
    filterCone.rotation.x = Math.PI / 2;
    filterCone.position.set(0.35, 0.62, -0.39);
    const filterCap = new THREE.Mesh(cylinder(0.064, 0.064, 0.025, 12), G.M.chrome);
    filterCap.rotation.x = Math.PI / 2;
    filterCap.position.set(0.35, 0.62, -0.29);
    tuneZeroFilterGroup.add(intakePipe, filterCone, filterCap);
  }
  G.bikeChassisGroup.add(tuneZeroFilterGroup);

  const tuneCarbReplaceGroup = new THREE.Group();
  {
    const carbBody = mesh(box(0.18, 0.18, 0.16), G.M.chrome, -0.26, 0.62, -0.50);
    const floatBowl = mesh(box(0.15, 0.10, 0.14), G.M.copperMetal, -0.26, 0.50, -0.50);
    const bellmouth = axle(cylinder(0.065, 0.045, 0.10, 10), G.M.goldMetal);
    bellmouth.position.set(-0.37, 0.62, -0.50);
    tuneCarbReplaceGroup.add(carbBody, floatBowl, bellmouth);
  }
  G.bikeChassisGroup.add(tuneCarbReplaceGroup);

  const tuneCarbScrewMesh = axle(cylinder(0.032, 0.032, 0.09, 8), G.M.goldMetal);
  tuneCarbScrewMesh.position.set(-0.27, 0.68, -0.38);
  G.bikeChassisGroup.add(tuneCarbScrewMesh);

  const tuneIridiumPlugGroup = new THREE.Group();
  {
    const boot = mesh(box(0.08, 0.14, 0.08), G.M.iridiumBlue, 0.25, 0.73, -0.68);
    const wire = mesh(cylinder(0.018, 0.018, 0.24, 8), G.M.iridiumBlue, 0.25, 0.84, -0.68);
    tuneIridiumPlugGroup.add(boot, wire);
  }
  G.bikeChassisGroup.add(tuneIridiumPlugGroup);

  const tuneSprocketMesh = new THREE.Group();
  {
    const mainPlate = axle(cylinder(0.24, 0.24, 0.032, 16), G.M.goldMetal);
    mainPlate.position.x = -0.14;
    const innerCut = axle(cylinder(0.14, 0.14, 0.036, 10), G.M.metalDark);
    innerCut.position.x = -0.14;
    tuneSprocketMesh.add(mainPlate, innerCut);
  }
  G.rearWheelGroup.add(tuneSprocketMesh);

  const tuneChainGuard = mesh(box(0.035, 0.09, 0.88), G.M.goldMetal, -0.16, 0.44, 0.22);
  G.bikeChassisGroup.add(tuneChainGuard);

  const tuneBikeWindshieldExt = new THREE.Group();
  {
    const shieldMain = mesh(box(0.48, 0.44, 0.035), G.M.smokedGlass, 0, 1.32, -1.04);
    shieldMain.rotation.x = -0.44;
    const shieldTopLip = mesh(box(0.38, 0.14, 0.032), G.M.smokedGlass, 0, 1.50, -0.95);
    shieldTopLip.rotation.x = -0.30;
    const bracketL = mesh(box(0.035, 0.24, 0.04), G.M.metalDark, -0.18, 1.22, -1.02);
    bracketL.rotation.x = -0.44;
    const bracketR = bracketL.clone();
    bracketR.position.x = 0.18;
    tuneBikeWindshieldExt.add(shieldMain, shieldTopLip, bracketL, bracketR);
  }
  G.bikeChassisGroup.add(tuneBikeWindshieldExt);

  G.bikeThirdPersonBody = new THREE.Group();
  G.bikeChassisGroup.add(G.bikeThirdPersonBody);
  {
    const jacketMat = new THREE.MeshStandardMaterial({ color: 0x182232, roughness: 0.7 });
    const swingarm = mesh(box(0.32, 0.12, 0.95), G.M.metalDark, 0, 0.38, 0.22);
    const exhaust = mesh(box(0.14, 0.16, 0.85), G.M.chrome, 0.26, 0.36, 0.25);
    exhaust.rotation.x = 0.18;
    const extTank = mesh(box(0.58, 0.38, 0.78), G.tankMat, 0, 0.96, -0.52);
    extTank.castShadow = true;
    const seat = mesh(box(0.44, 0.16, 0.82), G.M.mattePlastic, 0, 0.92, 0.22);
    const tailCowling = mesh(box(0.38, 0.18, 0.52), G.accentMat, 0, 1.0, 0.68);
    tailCowling.rotation.x = 0.16;
    const tailLamp = mesh(box(0.24, 0.09, 0.06), G.tailLightBrakeMat, 0, 1.04, 0.95);

    const riderGroup = new THREE.Group();
    const torso = mesh(box(0.52, 0.64, 0.32), jacketMat, 0, 1.38, 0.05);
    torso.rotation.x = -0.34;
    torso.castShadow = true;
    const stripe = mesh(box(0.54, 0.12, 0.34), G.accentMat, 0, 1.42, 0.06);
    stripe.rotation.x = -0.34;
    const helmet = mesh(box(0.36, 0.38, 0.40), G.tankMat, 0, 1.78, -0.14);
    helmet.castShadow = true;
    const visor = mesh(box(0.38, 0.16, 0.22), G.M.glass, 0, 1.79, -0.26);
    riderGroup.add(torso, stripe, helmet, visor);

    for (const side of [-1, 1]) {
      const arm = mesh(box(0.16, 0.16, 0.62), jacketMat, side * 0.34, 1.36, -0.34);
      arm.rotation.x = 0.22;
      arm.rotation.y = -side * 0.15;
      const leg = mesh(box(0.18, 0.56, 0.22), G.M.mattePlastic, side * 0.28, 0.72, 0.02);
      leg.rotation.x = 0.35;
      riderGroup.add(arm, leg);
    }

    const pulsarTp = new THREE.Group();
    pulsarTp.add(swingarm, exhaust, extTank, seat, tailCowling, tailLamp);

    // Boxer: хромированный простой бак, плоское сиденье, овальная задняя фара.
    const boxerTp = new THREE.Group();
    {
      const chromeTank = mesh(box(0.5, 0.34, 0.68), G.tankMat, 0, 0.94, -0.52);
      chromeTank.castShadow = true;
      const flatSeat = mesh(box(0.42, 0.13, 0.92), G.M.mattePlastic, 0, 0.88, 0.2);
      const simplePipe = mesh(box(0.13, 0.14, 1.0), G.M.chrome, 0.24, 0.33, 0.15);
      const ovalTail = mesh(box(0.3, 0.1, 0.06), G.tailLightBrakeMat, 0, 0.98, 0.88);
      boxerTp.add(chromeTank, flatSeat, simplePipe, ovalTail);
    }

    // Avenger: низкое сиденье, sissy bar, длинный выхлоп и чоппер-посадка.
    const avengerTp = new THREE.Group();
    {
      const lowSeat = mesh(box(0.42, 0.14, 1.06), G.M.mattePlastic, 0, 0.7, 0.2);
      const cruiserTank = mesh(box(0.52, 0.4, 0.72), G.tankMat, 0, 0.84, -0.5);
      cruiserTank.castShadow = true;
      const sissyBar = mesh(box(0.06, 0.54, 0.06), G.M.chrome, 0, 1.02, 0.86);
      const sissyPad = mesh(box(0.3, 0.16, 0.1), G.M.mattePlastic, 0, 1.18, 0.86);
      const longPipe = mesh(box(0.14, 0.16, 1.5), G.M.chrome, 0.3, 0.3, 0.32);
      avengerTp.add(lowSeat, cruiserTank, sissyBar, sissyPad, longPipe);
    }

    G.bikeThirdPersonBody.add(pulsarTp, boxerTp, avengerTp, riderGroup);
    G.bikeThirdPersonVariants = { pulsar: pulsarTp, boxer: boxerTp, avenger: avengerTp };
    G.bikeThirdPersonRider = riderGroup;
  }

  return {
    fTire, fRim, rTire, rRim, frontFender,
    frontFenders: { pulsar: pulsarFender, boxer: boxerFender, avenger: avengerFender },
    tuneUpgradedBrakesGroup,
    tuneZeroFilterGroup,
    tuneCarbReplaceGroup,
    tuneCarbScrewMesh,
    tuneIridiumPlugGroup,
    tuneSprocketMesh,
    tuneChainGuard,
    tuneBikeWindshieldExt
  };
}
