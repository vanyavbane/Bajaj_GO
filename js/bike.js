import * as THREE from 'three';
import { G } from './state.js';

export function initBike() {
  const $ = G.$;
  const clamp = G.clamp;
  const lerp = G.lerp;

  /* =========================================================================
   * 10. ТРАНСПОРТ ИГРОКА И 3D-ДЕТАЛИ ТЮНИНГА (КОКПИТ + 3-Е ЛИЦО)
   * ========================================================================= */
  G.bikeRoot = new THREE.Group();
  G.scene.add(G.bikeRoot);

  G.tankMat = new THREE.MeshStandardMaterial({ color: 0xcbd0d6, roughness: 0.25, metalness: 0.55, envMapIntensity: 1.4 });
  G.accentMat = new THREE.MeshStandardMaterial({ color: 0xd9363e, roughness: 0.32, metalness: 0.35 });
  G.tailLightBrakeMat = new THREE.MeshStandardMaterial({ color: 0xff1744, emissive: 0xd50000, emissiveIntensity: 1.4 });

  const dashCanvas = document.createElement('canvas');
  dashCanvas.width = 512;
  dashCanvas.height = 256;
  G.dashCtx = dashCanvas.getContext('2d');
  G.dashTex = new THREE.CanvasTexture(dashCanvas);
  G.dashTex.colorSpace = THREE.SRGBColorSpace;

  // --- 10.1. МОДЕЛЬ МОТОЦИКЛА, РАЙДЕРА И 3D-УЛУЧШЕНИЯ ---
  G.bikeChassisGroup = new THREE.Group();
  G.bikeRoot.add(G.bikeChassisGroup);

  G.frontWheelGroup = new THREE.Group();
  G.frontWheelGroup.position.set(0, 0.34, -1.42);
  const fTire = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.16, 16), G.M.rubber);
  fTire.rotation.z = Math.PI / 2;
  fTire.castShadow = true;
  const fRim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.17, 10), G.M.metalDark);
  fRim.rotation.z = Math.PI / 2;
  const brakeDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 12), G.M.chrome);
  brakeDisc.rotation.z = Math.PI / 2;
  brakeDisc.position.x = 0.095;
  G.frontWheelGroup.add(fTire, fRim, brakeDisc);
  G.bikeChassisGroup.add(G.frontWheelGroup);

  G.rearWheelGroup = new THREE.Group();
  G.rearWheelGroup.position.set(0, 0.34, 0.68);
  const rTire = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 16), G.M.rubber);
  rTire.rotation.z = Math.PI / 2;
  rTire.castShadow = true;
  const rRim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.23, 10), G.M.metalDark);
  rRim.rotation.z = Math.PI / 2;
  G.rearWheelGroup.add(rTire, rRim);
  G.bikeChassisGroup.add(G.rearWheelGroup);

  const brakeCaliper = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.11, 0.11), G.accentMat);
  brakeCaliper.position.set(0.11, 0.42, -1.32);
  const frontFender = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.46), G.accentMat);
  frontFender.position.set(0, 0.64, -1.42);
  frontFender.rotation.x = 0.18;
  const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.48, 0.58), G.M.metalDark);
  engineBlock.position.set(0, 0.55, -0.62);
  engineBlock.castShadow = true;
  G.bikeChassisGroup.add(brakeCaliper, frontFender, engineBlock);

  // ВИЗУАЛЬНЫЕ 3D-УЛУЧШЕНИЯ ТЮНИНГА НА ШАССИ МОТОЦИКЛА
  // 1) Усиленные перфорированные тормоза (двойные лепестковые диски + крупные золотые суппорты + задний диск)
  const tuneUpgradedBrakesGroup = new THREE.Group();
  {
    const bigDiscL = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.026, 14), G.M.chrome);
    bigDiscL.rotation.z = Math.PI / 2;
    bigDiscL.position.x = -0.105;
    const bigDiscR = bigDiscL.clone();
    bigDiscR.position.x = 0.105;
    const innerRingL = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 10), G.M.goldMetal);
    innerRingL.rotation.z = Math.PI / 2;
    innerRingL.position.x = -0.105;
    const innerRingR = innerRingL.clone();
    innerRingR.position.x = 0.105;
    G.frontWheelGroup.add(bigDiscL, bigDiscR, innerRingL, innerRingR);

    const rearDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.025, 12), G.M.chrome);
    rearDisc.rotation.z = Math.PI / 2;
    rearDisc.position.x = 0.135;
    G.rearWheelGroup.add(rearDisc);

    const calL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.14), G.M.goldMetal);
    calL.position.set(-0.125, 0.43, -1.30);
    const calR = calL.clone();
    calR.position.x = 0.125;
    const calRear = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.12, 0.12), G.M.goldMetal);
    calRear.position.set(0.15, 0.44, 0.58);
    tuneUpgradedBrakesGroup.add(calL, calR, calRear);
    tuneUpgradedBrakesGroup.userData = { discs: [bigDiscL, bigDiscR, innerRingL, innerRingR, rearDisc] };
  }
  G.bikeChassisGroup.add(tuneUpgradedBrakesGroup);

  // 2) Фильтр нулевого сопротивления (конусный красный фильтр с хромированным патрубком справа у двигателя)
  const tuneZeroFilterGroup = new THREE.Group();
  {
    const intakePipe = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.18, 10), G.M.chrome);
    intakePipe.rotation.z = Math.PI / 2;
    intakePipe.position.set(0.26, 0.62, -0.46);
    const filterCone = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.092, 0.18, 12), G.M.filterRed);
    filterCone.rotation.x = Math.PI / 2;
    filterCone.position.set(0.35, 0.62, -0.39);
    const filterCap = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.064, 0.025, 12), G.M.chrome);
    filterCap.rotation.x = Math.PI / 2;
    filterCap.position.set(0.35, 0.62, -0.29);
    tuneZeroFilterGroup.add(intakePipe, filterCone, filterCap);
  }
  G.bikeChassisGroup.add(tuneZeroFilterGroup);

  // 3) Спортивный карбюратор + латунный винт настройки + высоковольтный колпачок иридиевой свечи
  const tuneCarbReplaceGroup = new THREE.Group();
  {
    const carbBody = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.16), G.M.chrome);
    carbBody.position.set(-0.26, 0.62, -0.50);
    const floatBowl = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.10, 0.14), G.M.copperMetal);
    floatBowl.position.set(-0.26, 0.50, -0.50);
    const bellmouth = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.045, 0.10, 10), G.M.goldMetal);
    bellmouth.rotation.z = Math.PI / 2;
    bellmouth.position.set(-0.37, 0.62, -0.50);
    tuneCarbReplaceGroup.add(carbBody, floatBowl, bellmouth);
  }
  G.bikeChassisGroup.add(tuneCarbReplaceGroup);

  const tuneCarbScrewMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.09, 8), G.M.goldMetal);
  tuneCarbScrewMesh.rotation.z = Math.PI / 2;
  tuneCarbScrewMesh.position.set(-0.27, 0.68, -0.38);
  G.bikeChassisGroup.add(tuneCarbScrewMesh);

  const tuneIridiumPlugGroup = new THREE.Group();
  {
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.08), G.M.iridiumBlue);
    boot.position.set(0.25, 0.73, -0.68);
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.24, 8), G.M.iridiumBlue);
    wire.position.set(0.25, 0.84, -0.68);
    tuneIridiumPlugGroup.add(boot, wire);
  }
  G.bikeChassisGroup.add(tuneIridiumPlugGroup);

  // 4) Скоростная звезда (золотая ведомая звезда с зубьями на заднем колесе и цепью)
  const tuneSprocketMesh = new THREE.Group();
  {
    const mainPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.032, 16), G.M.goldMetal);
    mainPlate.rotation.z = Math.PI / 2;
    mainPlate.position.x = -0.14;
    const innerCut = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.036, 10), G.M.metalDark);
    innerCut.rotation.z = Math.PI / 2;
    innerCut.position.x = -0.14;
    tuneSprocketMesh.add(mainPlate, innerCut);
  }
  G.rearWheelGroup.add(tuneSprocketMesh);

  const tuneChainGuard = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.09, 0.88), G.M.goldMetal);
  tuneChainGuard.position.set(-0.16, 0.44, 0.22);
  G.bikeChassisGroup.add(tuneChainGuard);

  // 5) Дымчатое прозрачное ветровое стекло на мотоцикле (вид от 3-го лица)
  const tuneBikeWindshieldExt = new THREE.Group();
  {
    const shieldMain = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.44, 0.035), G.M.smokedGlass);
    shieldMain.position.set(0, 1.32, -1.04);
    shieldMain.rotation.x = -0.44;
    const shieldTopLip = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.032), G.M.smokedGlass);
    shieldTopLip.position.set(0, 1.50, -0.95);
    shieldTopLip.rotation.x = -0.30;
    const bracketL = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.24, 0.04), G.M.metalDark);
    bracketL.position.set(-0.18, 1.22, -1.02);
    bracketL.rotation.x = -0.44;
    const bracketR = bracketL.clone();
    bracketR.position.x = 0.18;
    tuneBikeWindshieldExt.add(shieldMain, shieldTopLip, bracketL, bracketR);
  }
  G.bikeChassisGroup.add(tuneBikeWindshieldExt);

  // Детали мотоцикла и силуэта райдера для камеры от 3-го лица
  G.bikeThirdPersonBody = new THREE.Group();
  G.bikeChassisGroup.add(G.bikeThirdPersonBody);
  {
    const swingarm = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.95), G.M.metalDark);
    swingarm.position.set(0, 0.38, 0.22);
    const exhaust = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.85), G.M.chrome);
    exhaust.position.set(0.26, 0.36, 0.25);
    exhaust.rotation.x = 0.18;
    const extTank = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.38, 0.78), G.tankMat);
    extTank.position.set(0, 0.96, -0.52);
    extTank.castShadow = true;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.82), G.M.mattePlastic);
    seat.position.set(0, 0.92, 0.22);
    const tailCowling = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.52), G.accentMat);
    tailCowling.position.set(0, 1.0, 0.68);
    tailCowling.rotation.x = 0.16;
    const tailLamp = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.09, 0.06), G.tailLightBrakeMat);
    tailLamp.position.set(0, 1.04, 0.95);

    const jacketMat = new THREE.MeshStandardMaterial({ color: 0x182232, roughness: 0.7 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.64, 0.32), jacketMat);
    torso.position.set(0, 1.38, 0.05);
    torso.rotation.x = -0.34;
    torso.castShadow = true;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.12, 0.34), G.accentMat);
    stripe.position.set(0, 1.42, 0.06);
    stripe.rotation.x = -0.34;
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.40), G.tankMat);
    helmet.position.set(0, 1.78, -0.14);
    helmet.castShadow = true;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.22), G.M.glass);
    visor.position.set(0, 1.79, -0.26);

    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.62), jacketMat);
      arm.position.set(side * 0.34, 1.36, -0.34);
      arm.rotation.x = 0.22;
      arm.rotation.y = -side * 0.15;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.56, 0.22), G.M.mattePlastic);
      leg.position.set(side * 0.28, 0.72, 0.02);
      leg.rotation.x = 0.35;
      G.bikeThirdPersonBody.add(arm, leg);
    }

    G.bikeThirdPersonBody.add(swingarm, exhaust, extTank, seat, tailCowling, tailLamp, torso, stripe, helmet, visor);
  }

  // --- 10.2. МОДЕЛЬ BAJAJ QUTE И BAJAJ QUTE ЮРЫ ВОЛКОВА (ВИД СНАРУЖИ + ДЕТАЛИ ТЮНИНГА) ---
  G.quteExteriorGroup = new THREE.Group();
  G.bikeRoot.add(G.quteExteriorGroup);

  G.quteWheels = [];
  G.quteFrontPivots = [];
  G.yuraTuningGroup = new THREE.Group();
  G.yuraFlames = [];
  let quteWindshieldExtMesh = null;
  const quteSmokedDeflectorExt = new THREE.Group();

  {
    const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.72, 2.84), G.tankMat);
    lowerBody.position.set(0, 0.62, -0.35);
    lowerBody.castShadow = true;
    lowerBody.receiveShadow = true;

    const frontHood = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.52, 0.65), G.tankMat);
    frontHood.position.set(0, 0.72, -1.52);
    frontHood.rotation.x = 0.18;

    const roofTop = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.10, 1.98), G.tankMat);
    roofTop.position.set(0, 1.66, -0.18);
    roofTop.castShadow = true;
    for (const rx of [-0.42, 0, 0.42]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 1.82), G.accentMat);
      rib.position.set(rx, 1.72, -0.18);
      G.quteExteriorGroup.add(rib);
    }

    for (const side of [-1, 1]) {
      const pillarF = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.72, 0.10), G.tankMat);
      pillarF.position.set(side * 0.65, 1.30, -1.08);
      pillarF.rotation.x = -0.14;
      const pillarM = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.70, 0.12), G.M.mattePlastic);
      pillarM.position.set(side * 0.66, 1.30, -0.15);
      const pillarR = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.70, 0.18), G.tankMat);
      pillarR.position.set(side * 0.65, 1.30, 0.72);

      const handle1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.18), G.M.mattePlastic);
      handle1.position.set(side * 0.74, 0.88, -0.35);
      const handle2 = handle1.clone();
      handle2.position.z = 0.35;

      const mirrorArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.05), G.M.mattePlastic);
      mirrorArm.position.set(side * 0.78, 1.12, -1.02);
      const mirrorHead = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.08), G.M.mattePlastic);
      mirrorHead.position.set(side * 0.88, 1.14, -1.02);

      const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.56, 1.62), G.M.glassWindow);
      sideGlass.position.set(side * 0.67, 1.30, -0.16);

      G.quteExteriorGroup.add(pillarF, pillarM, pillarR, handle1, handle2, mirrorArm, mirrorHead, sideGlass);
    }

    quteWindshieldExtMesh = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.64, 0.05), G.M.glassWindow);
    quteWindshieldExtMesh.position.set(0, 1.30, -1.12);
    quteWindshieldExtMesh.rotation.x = -0.14;

    // Дымчатый козырёк/обтекатель ветрового стекла для Qute при покупке «Поставить ветровое стекло»
    const visorShield = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.22, 0.14), G.M.smokedGlass);
    visorShield.position.set(0, 1.56, -1.16);
    visorShield.rotation.x = -0.28;
    quteSmokedDeflectorExt.add(visorShield);
    G.quteExteriorGroup.add(quteSmokedDeflectorExt);

    const rearGlassExt = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.54, 0.05), G.M.glassWindow);
    rearGlassExt.position.set(0, 1.30, 0.80);

    const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.26, 0.22), G.M.mattePlastic);
    bumperF.position.set(0, 0.42, -1.78);
    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.22, 0.06), G.M.metalDark);
    grille.position.set(0, 0.66, -1.79);
    const bumperR = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.28, 0.22), G.M.mattePlastic);
    bumperR.position.set(0, 0.42, 1.06);

    const headMat = new THREE.MeshStandardMaterial({ color: 0xfff8e1, emissive: 0xffe082, emissiveIntensity: 1.8 });
    for (const lx of [-0.50, 0.50]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.20, 0.08), headMat);
      hl.position.set(lx, 0.78, -1.77);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.08), G.tailLightBrakeMat);
      tl.position.set(lx, 0.82, 1.08);
      G.quteExteriorGroup.add(hl, tl);
    }

    for (const [wx, wz, isFront] of [
      [-0.70, -1.24, true],
      [ 0.70, -1.24, true],
      [-0.70,  0.62, false],
      [ 0.70,  0.62, false]
    ]) {
      const pivot = new THREE.Group();
      pivot.position.set(wx, 0.31, wz);
      const wMesh = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.20, 14), G.M.rubber);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.21, 8), G.accentMat);
      rim.rotation.z = Math.PI / 2;
      wMesh.add(tire, rim);
      pivot.add(wMesh);
      G.quteExteriorGroup.add(pivot);
      G.quteWheels.push(wMesh);
      if (isFront) G.quteFrontPivots.push(pivot);
    }

    G.quteExteriorGroup.add(lowerBody, frontHood, roofTop, quteWindshieldExtMesh, rearGlassExt, bumperF, grille, bumperR);

    const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.10, 0.38), G.M.neonCyan);
    splitter.position.set(0, 0.26, -1.86);

    const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.12, 0.26), G.M.neonMagenta);
    diffuser.position.set(0, 0.26, 1.12);

    for (const side of [-1, 1]) {
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.10, 2.55), G.M.neonCyan);
      skirt.position.set(side * 0.79, 0.26, -0.32);
      const fenderArch = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 2.75), G.M.mattePlastic);
      fenderArch.position.set(side * 0.76, 0.52, -0.32);
      const stripeTop = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 1.96), G.M.neonMagenta);
      stripeTop.position.set(side * 0.24, 1.725, -0.18);
      G.yuraTuningGroup.add(skirt, fenderArch, stripeTop);
    }

    for (const sx of [-0.52, 0.52]) {
      const wingStrut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.46, 0.24), G.M.metalDark);
      wingStrut.position.set(sx, 1.84, 0.72);
      wingStrut.rotation.x = -0.25;
      G.yuraTuningGroup.add(wingStrut);
    }
    const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.08, 0.42), G.M.neonMagenta);
    wingBlade.position.set(0, 2.06, 0.84);
    wingBlade.rotation.x = 0.16;

    const lightBar = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.12, 0.16), G.M.neonCyan);
    lightBar.position.set(0, 1.76, -1.04);

    for (const ex of [-0.36, 0.36]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.36, 10), G.M.chrome);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(ex, 0.34, 1.18);
      const flame = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.45), G.M.neonYellow);
      flame.position.set(ex, 0.34, 1.48);
      G.yuraTuningGroup.add(pipe, flame);
      G.yuraFlames.push(flame);
    }

    G.yuraTuningGroup.add(splitter, diffuser, wingBlade, lightBar);
    G.quteExteriorGroup.add(G.yuraTuningGroup);
  }

  // --- 10.3. КОКПИТ ОТ ПЕРВОГО ЛИЦА (ВКЛЮЧАЯ ДЫМЧАТОЕ ВЕТРОВОЕ СТЕКЛО И УСИЛЕННЫЙ БАЧОК ТОРМОЗОВ) ---
  G.riderPivot = new THREE.Group();
  G.riderPivot.position.set(0, 1.56, 0.35);
  G.bikeRoot.add(G.riderPivot);
  G.riderPivot.add(G.camera);

  G.bikeCockpitGroup = new THREE.Group();
  G.quteCockpitGroup = new THREE.Group();
  G.camera.add(G.bikeCockpitGroup);
  G.camera.add(G.quteCockpitGroup);

  function addCockpitBox(targetGrp, w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    targetGrp.add(m);
    return m;
  }
  function addCockpitCyl(targetGrp, rt, rb, h, mat, x, y, z, rx = 0, rz = 0) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 10), mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.rotation.z = rz;
    targetGrp.add(m);
    return m;
  }

  addCockpitBox(G.bikeCockpitGroup, 0.92, 0.34, 0.95, G.tankMat, 0, -0.78, -0.82, -0.15, 0, 0);
  addCockpitBox(G.bikeCockpitGroup, 0.72, 0.22, 0.52, G.tankMat, 0, -0.66, -1.16, -0.25, 0, 0);
  for (const side of [-1, 1]) {
    addCockpitBox(G.bikeCockpitGroup, 0.14, 0.26, 0.82, G.M.mattePlastic, side * 0.46, -0.76, -0.86, -0.12, 0, side * 0.16);
    addCockpitBox(G.bikeCockpitGroup, 0.04, 0.10, 0.48, G.accentMat, side * 0.535, -0.72, -0.94, -0.12, 0, side * 0.16);
    addCockpitCyl(G.bikeCockpitGroup, 0.038, 0.038, 0.95, G.M.chrome, side * 0.22, -0.62, -1.12, 0.32, 0);
  }
  addCockpitCyl(G.bikeCockpitGroup, 0.14, 0.14, 0.035, G.M.chrome, 0, -0.59, -0.82, Math.PI / 2, 0);
  addCockpitCyl(G.bikeCockpitGroup, 0.09, 0.09, 0.04, G.M.mattePlastic, 0, -0.58, -0.82, Math.PI / 2, 0);
  addCockpitBox(G.bikeCockpitGroup, 0.56, 0.34, 0.28, G.tankMat, 0, -0.42, -1.42, -0.18, 0, 0);
  addCockpitBox(G.bikeCockpitGroup, 0.42, 0.06, 0.04, G.accentMat, 0, -0.26, -1.52, -0.22, 0, 0);

  // Дымчатое прозрачное ветровое стекло в кокпите мотоцикла (визуально появляется при установке тюнинга)
  const tuneBikeWindshieldCockpit = new THREE.Group();
  {
    const glassPanel = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.46, 0.025), G.M.smokedGlass);
    glassPanel.position.set(0, -0.02, -1.26);
    glassPanel.rotation.x = -0.36;
    const topDeflector = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.028), G.M.smokedGlass);
    topDeflector.position.set(0, 0.20, -1.18);
    topDeflector.rotation.x = -0.20;
    const mountL = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.22, 0.035), G.M.metalDark);
    mountL.position.set(-0.24, -0.12, -1.26);
    mountL.rotation.x = -0.36;
    const mountR = mountL.clone();
    mountR.position.x = 0.24;
    tuneBikeWindshieldCockpit.add(glassPanel, topDeflector, mountL, mountR);
  }
  G.bikeCockpitGroup.add(tuneBikeWindshieldCockpit);

  // Радиальный золотой тормозной цилиндр на руле в кокпите (при установке «Новые тормоза»)
  const tuneBikeMasterCylCockpit = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.09, 10), G.M.goldMetal);
  tuneBikeMasterCylCockpit.position.set(0.56, -0.11, -0.86);
  G.bikeCockpitGroup.add(tuneBikeMasterCylCockpit);

  addCockpitBox(G.bikeCockpitGroup, 0.68, 0.31, 0.14, G.M.mattePlastic, 0, -0.35, -1.18, -0.28, 0, 0);
  const bikeDashScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.58, 0.26),
    new THREE.MeshBasicMaterial({ map: G.dashTex })
  );
  bikeDashScreen.position.set(0, -0.345, -1.106);
  bikeDashScreen.rotation.x = -0.28;
  G.bikeCockpitGroup.add(bikeDashScreen);

  addCockpitBox(G.bikeCockpitGroup, 1.12, 0.055, 0.06, G.M.chrome, 0, -0.24, -0.92);
  for (const side of [-1, 1]) {
    addCockpitCyl(G.bikeCockpitGroup, 0.04, 0.048, 0.28, G.M.chrome, side * 0.32, -0.28, -0.94, 0, side * 0.12);
    addCockpitBox(G.bikeCockpitGroup, 0.22, 0.09, 0.34, G.M.mattePlastic, side * 0.78, -0.18, -0.82, 0, 0, side * 0.08);
    addCockpitBox(G.bikeCockpitGroup, 0.16, 0.12, 0.18, G.M.metalDark, side * 0.58, -0.19, -0.86);
    addCockpitBox(G.bikeCockpitGroup, 0.18, 0.025, 0.04, G.M.chrome, side * 0.74, -0.18, -0.97, 0, -side * 0.18, 0);
    addCockpitCyl(G.bikeCockpitGroup, 0.018, 0.024, 0.55, G.M.mattePlastic, side * 0.82, 0.02, -0.78, 0, -side * 0.48);
    addCockpitBox(G.bikeCockpitGroup, 0.34, 0.19, 0.045, G.M.mattePlastic, side * 1.05, 0.21, -0.72, 0, -side * 0.2, side * 0.12);
    addCockpitBox(G.bikeCockpitGroup, 0.29, 0.15, 0.015, G.M.glass, side * 1.05, 0.21, -0.695, 0, -side * 0.2, side * 0.12);
    addCockpitBox(G.bikeCockpitGroup, 0.22, 0.24, 0.68, new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 }), side * 0.68, -0.34, -0.24, 0.15, 0, -side * 0.14);
    addCockpitBox(G.bikeCockpitGroup, 0.18, 0.14, 0.22, G.M.mattePlastic, side * 0.77, -0.19, -0.64, 0, 0, -side * 0.08);
  }

  G.quteSteeringWheelPivot = new THREE.Group();
  G.quteYuraInteriorNeon = new THREE.Group();
  let quteCockpitWindshieldMesh = null;
  {
    const cabinRoofMat = new THREE.MeshStandardMaterial({ color: 0x1e2634, roughness: 0.85 });
    addCockpitBox(G.quteCockpitGroup, 1.56, 0.08, 1.38, cabinRoofMat, 0, 0.43, -0.52, 0.05, 0, 0);
    for (const side of [-1, 1]) {
      addCockpitBox(G.quteCockpitGroup, 0.42, 0.11, 0.03, G.M.mattePlastic, side * 0.34, 0.33, -0.94, 0.18, 0, 0);
      addCockpitBox(G.quteCockpitGroup, 0.095, 0.88, 0.11, G.tankMat, side * 0.68, 0.02, -0.96, -0.22, 0, -side * 0.06);
      addCockpitBox(G.quteCockpitGroup, 0.03, 0.68, 0.92, G.M.glassWindow, side * 0.73, 0.02, -0.52);
      addCockpitBox(G.quteCockpitGroup, 0.24, 0.15, 0.05, G.M.mattePlastic, side * 0.86, -0.08, -0.88, 0, -side * 0.26, 0);
      addCockpitBox(G.quteCockpitGroup, 0.20, 0.12, 0.02, G.M.glass, side * 0.85, -0.08, -0.85, 0, -side * 0.26, 0);
    }
    addCockpitBox(G.quteCockpitGroup, 0.28, 0.08, 0.04, G.M.mattePlastic, 0, 0.28, -0.88);
    addCockpitBox(G.quteCockpitGroup, 0.25, 0.06, 0.015, G.M.glass, 0, 0.28, -0.86);
    addCockpitBox(G.quteCockpitGroup, 0.16, 0.03, 0.10, G.windowLitMat, 0, 0.38, -0.62);

    quteCockpitWindshieldMesh = addCockpitBox(G.quteCockpitGroup, 1.32, 0.72, 0.015, G.M.glassWindow, 0, 0.04, -1.04, -0.20, 0, 0);
    addCockpitBox(G.quteCockpitGroup, 0.56, 0.025, 0.03, G.M.mattePlastic, 0.12, -0.24, -1.05, 0, 0, 0.14);

    addCockpitBox(G.quteCockpitGroup, 1.48, 0.34, 0.48, G.M.mattePlastic, 0, -0.44, -0.96, -0.08, 0, 0);
    addCockpitBox(G.quteCockpitGroup, 0.62, 0.28, 0.22, G.M.metalDark, 0, -0.30, -0.96, -0.22, 0, 0);

    const quteDashScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.52, 0.23),
      new THREE.MeshBasicMaterial({ map: G.dashTex })
    );
    quteDashScreen.position.set(0, -0.295, -0.845);
    quteDashScreen.rotation.x = -0.22;
    G.quteCockpitGroup.add(quteDashScreen);

    const neonStrip1 = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.022, 0.025), G.M.neonCyan);
    neonStrip1.position.set(0, -0.27, -0.74);
    const neonStrip2 = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.02, 0.025), G.M.neonMagenta);
    neonStrip2.position.set(0, 0.37, -0.92);
    G.quteYuraInteriorNeon.add(neonStrip1, neonStrip2);
    G.quteCockpitGroup.add(G.quteYuraInteriorNeon);

    addCockpitCyl(G.quteCockpitGroup, 0.055, 0.065, 0.32, G.M.metalDark, 0, -0.34, -0.72, 1.22, 0);

    G.quteSteeringWheelPivot.position.set(0, -0.28, -0.58);
    G.quteSteeringWheelPivot.rotation.x = -0.32;

    const wheelRadius = 0.215;
    const segCount = 12;
    for (let i = 0; i < segCount; i++) {
      const a = (i / segCount) * Math.PI * 2;
      const segMat = (i === 3) ? G.accentMat : G.M.mattePlastic;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.042, 0.042), segMat);
      seg.position.set(Math.cos(a) * wheelRadius, Math.sin(a) * wheelRadius, 0);
      seg.rotation.z = a + Math.PI / 2;
      G.quteSteeringWheelPivot.add(seg);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.048, 10), G.M.metalDark);
    hub.rotation.x = Math.PI / 2;
    const hubLogo = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.028, 0.055), G.accentMat);
    const spokeL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.036, 0.032), G.M.chrome);
    spokeL.position.set(-0.10, -0.02, 0);
    spokeL.rotation.z = 0.18;
    const spokeR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.036, 0.032), G.M.chrome);
    spokeR.position.set(0.10, -0.02, 0);
    spokeR.rotation.z = -0.18;
    const spokeB = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.16, 0.032), G.M.chrome);
    spokeB.position.set(0, -0.11, 0);

    for (const side of [-1, 1]) {
      const glove = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.085, 0.09), G.M.mattePlastic);
      glove.position.set(side * wheelRadius, 0.02, 0.02);
      G.quteSteeringWheelPivot.add(glove);
    }

    G.quteSteeringWheelPivot.add(hub, hubLogo, spokeL, spokeR, spokeB);
    G.quteCockpitGroup.add(G.quteSteeringWheelPivot);
  }

  G.bikeSpotLights = [];
  for (const lx of [-0.28, 0.28]) {
    const sp = new THREE.SpotLight(0xfff6d6, 2.5, 95, Math.PI / 5.0, 0.62, 1.35);
    sp.position.set(lx, 0.92, -1.55);
    sp.target.position.set(lx * 1.5, 0.0, -38);
    G.bikeRoot.add(sp);
    G.bikeRoot.add(sp.target);
    G.bikeSpotLights.push(sp);
  }

  G.yuraUnderGlowLight = new THREE.PointLight(0x00e5ff, 0, 9.5, 1.8);
  G.yuraUnderGlowLight.position.set(0, 0.35, -0.3);
  G.bikeRoot.add(G.yuraUnderGlowLight);

  // Применение 3D-деталей установленного тюнинга к выбранной модели
  function applyVisualTuningToModel() {
    const bId = G.selectedBikeId;
    const hasFilter = G.hasUpgradeInstalled(bId, 'zero_filter');
    const hasCarb = G.hasUpgradeInstalled(bId, 'carb_replace');
    const hasCarbTune = G.hasUpgradeInstalled(bId, 'carb_tune');
    const hasIridium = G.hasUpgradeInstalled(bId, 'iridium_plugs');
    const hasSprocket = G.hasUpgradeInstalled(bId, 'speed_sprocket');
    const hasWideTires = G.hasUpgradeInstalled(bId, 'wide_tires');
    const hasWindshield = G.hasUpgradeInstalled(bId, 'windshield');
    const hasBrakes = G.hasUpgradeInstalled(bId, 'new_brakes');

    // Ветровое стекло (обязательная дымчатая прозрачная деталь снаружи и в кокпите)
    tuneBikeWindshieldExt.visible = hasWindshield;
    tuneBikeWindshieldCockpit.visible = hasWindshield;
    if (quteWindshieldExtMesh) {
      quteWindshieldExtMesh.material = hasWindshield ? G.M.smokedGlass : G.M.glassWindow;
    }
    if (quteCockpitWindshieldMesh) {
      quteCockpitWindshieldMesh.material = hasWindshield ? G.M.smokedGlass : G.M.glassWindow;
    }
    quteSmokedDeflectorExt.visible = hasWindshield;

    // Широкая резина (увеличение ширины покрышек и крыла)
    const tireScaleX = hasWideTires ? 1.52 : 1.0;
    fTire.scale.set(tireScaleX, 1, 1);
    fRim.scale.set(tireScaleX * 0.92, 1, 1);
    rTire.scale.set(tireScaleX * 1.08, 1, 1);
    rRim.scale.set(tireScaleX * 0.95, 1, 1);
    frontFender.scale.set(hasWideTires ? 1.38 : 1.0, 1, 1);
    for (const qw of G.quteWheels) {
      qw.scale.set(hasWideTires ? 1.44 : 1.0, 1, 1);
    }

    // Новые тормоза (увеличенные двойные диски, золотые суппорты и тормозной цилиндр на руле)
    tuneUpgradedBrakesGroup.visible = hasBrakes;
    if (tuneUpgradedBrakesGroup.userData.discs) {
      for (const dm of tuneUpgradedBrakesGroup.userData.discs) dm.visible = hasBrakes;
    }
    tuneBikeMasterCylCockpit.visible = hasBrakes;

    // Фильтр-нулевик, карбюратор, свечи, скоростная звезда
    tuneZeroFilterGroup.visible = hasFilter;
    tuneCarbReplaceGroup.visible = hasCarb;
    tuneCarbScrewMesh.visible = hasCarbTune;
    tuneIridiumPlugGroup.visible = hasIridium;
    tuneSprocketMesh.visible = hasSprocket;
    tuneChainGuard.visible = hasSprocket;
  }
  G.applyVisualTuningToModel = applyVisualTuningToModel;
}
