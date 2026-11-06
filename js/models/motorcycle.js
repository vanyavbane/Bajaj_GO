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

    const torso = mesh(box(0.52, 0.64, 0.32), jacketMat, 0, 1.38, 0.05);
    torso.rotation.x = -0.34;
    torso.castShadow = true;
    const stripe = mesh(box(0.54, 0.12, 0.34), G.accentMat, 0, 1.42, 0.06);
    stripe.rotation.x = -0.34;
    const helmet = mesh(box(0.36, 0.38, 0.40), G.tankMat, 0, 1.78, -0.14);
    helmet.castShadow = true;
    const visor = mesh(box(0.38, 0.16, 0.22), G.M.glass, 0, 1.79, -0.26);

    for (const side of [-1, 1]) {
      const arm = mesh(box(0.16, 0.16, 0.62), jacketMat, side * 0.34, 1.36, -0.34);
      arm.rotation.x = 0.22;
      arm.rotation.y = -side * 0.15;
      const leg = mesh(box(0.18, 0.56, 0.22), G.M.mattePlastic, side * 0.28, 0.72, 0.02);
      leg.rotation.x = 0.35;
      G.bikeThirdPersonBody.add(arm, leg);
    }

    G.bikeThirdPersonBody.add(swingarm, exhaust, extTank, seat, tailCowling, tailLamp, torso, stripe, helmet, visor);
  }

  return {
    fTire, fRim, rTire, rRim, frontFender,
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
