import * as THREE from 'three';
import { G } from './state.js';
import { buildMotorcycle } from './models/motorcycle.js';
import { buildQuteExterior } from './models/qute.js';
import { buildCockpits } from './models/cockpit.js';

export function initBike() {
  /* =========================================================================
   * 10. ТРАНСПОРТ ИГРОКА: СБОРКА МОТОЦИКЛА, QUTE И КОКПИТА
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

  const bike = buildMotorcycle();
  G.bikeParts = bike;
  const qute = buildQuteExterior();
  const pit = buildCockpits();

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

  // Переключение внешнего вида мотоцикла: Pulsar (базовая модель), Boxer или Avenger.
  // Общие колёса/двигатель/тюнинг остаются на месте — меняются только обвесы и посадка.
  function applyBikeVariant() {
    const selected = G.selectedBike();
    const variant = selected.variant || 'pulsar';
    const isBoxer = variant === 'boxer';
    const isAvenger = variant === 'avenger';
    const hudStyle = selected.hudStyle || 'digital';
    const version = bike.versionGroups[selected.id] || bike.versionGroups.ns125;

    for (const data of Object.values(bike.versionGroups)) {
      const on = data === version;
      data.chassis.visible = on;
      data.tp.visible = on;
      data.fender.visible = on;
    }
    if (bike.wheelStyles) {
      for (const [key, style] of Object.entries(bike.wheelStyles)) {
        const on = key === version.style;
        style.front.visible = on;
        style.rear.visible = on;
      }
    }

    if (G.bikeVariantGroups) {
      G.bikeVariantGroups.boxer.visible = isBoxer;
      G.bikeVariantGroups.avenger.visible = isAvenger;
    }
    if (G.bikeThirdPersonVariants) {
      G.bikeThirdPersonVariants.pulsar.visible = !isBoxer && !isAvenger;
      G.bikeThirdPersonVariants.boxer.visible = isBoxer;
      G.bikeThirdPersonVariants.avenger.visible = isAvenger;
    }
    if (G.bikeThirdPersonRider) {
      // Гонщик — часть третьего лица; в кокпите его скрывает родительская
      // группа bikeThirdPersonBody. Флаг сбрасываем, чтобы после отладки или
      // переключения вида райдер не остался невидимым.
      G.bikeThirdPersonRider.visible = true;
      G.bikeThirdPersonRider.position.set(0, isAvenger ? -0.2 : 0, isAvenger ? 0.08 : 0);
      G.bikeThirdPersonRider.rotation.x = isAvenger ? 0.08 : 0;
    }

    // У Avenger длинная вилка выносит переднее колесо вперёд. Тюнинг-диски
    // висят на группе колеса, поэтому переезжают вместе с ним.
    G.frontWheelGroup.position.z = isAvenger ? -1.78 : -1.42;
    bike.frontFender = version.fender;
    for (const fender of bike.allFenders) fender.visible = fender === version.fender;
    for (const [key, fender] of Object.entries(bike.frontFenders)) {
      fender.visible = key === variant;
    }

    // Ветровое стекло не должно «висеть в воздухе» над длинной вилкой.
    const isDominar = selected.id === 'dominar400' || selected.id === 'dominar250' || selected.id === 'dominar1000';
    bike.tuneBikeWindshieldExt.position.set(0, isAvenger ? -0.08 : 0, isAvenger ? -0.12 : 0);
    bike.tuneBikeWindshieldExt.scale.set(1, isAvenger ? 1.2 : 1, 1);

    if (G.bikeCockpitHandlebarGroup) {
      G.bikeCockpitHandlebarGroup.visible = !isAvenger && !isBoxer;
    }
    if (G.pulsarCockpitGroup) {
      G.pulsarCockpitGroup.visible = !isBoxer && !isAvenger && !isDominar;
    }
    if (G.avengerCockpitGroup) G.avengerCockpitGroup.visible = isAvenger;
    if (G.boxerCockpitGroup) G.boxerCockpitGroup.visible = isBoxer;
    if (G.dominarCockpitGroup) G.dominarCockpitGroup.visible = isDominar;
    if (G.bikeCockpitTankGroup) G.bikeCockpitTankGroup.visible = !isBoxer && !isAvenger && !isDominar;
    if (G.boxerCockpitTankGroup) G.boxerCockpitTankGroup.visible = isBoxer;
    if (G.avengerCockpitTankGroup) G.avengerCockpitTankGroup.visible = isAvenger;
    if (G.dominarCockpitTankGroup) G.dominarCockpitTankGroup.visible = isDominar;
    // Приборка общая: и цифровая, и аналоговая рисуются в один G.dashTex,
    // поэтому экран не скрываем — переключается только стиль отрисовки в camera.js.
    if (G.bikeCockpitDashScreen) G.bikeCockpitDashScreen.visible = true;
    if (G.roundDashBezelGroup) G.roundDashBezelGroup.visible = hudStyle === 'round';
  }
  G.applyBikeVariant = applyBikeVariant;

  function applyVisualTuningToModel() {
    applyBikeVariant();
    const installed = new Set(G.getBikeTuningRecord(G.selectedBikeId).installed);
    const hasFilter = installed.has('zero_filter');
    const hasCarb = installed.has('carb_replace');
    const hasCarbTune = installed.has('carb_tune');
    const hasIridium = installed.has('iridium_plugs');
    const hasSprocket = installed.has('speed_sprocket');
    const hasWideTires = installed.has('wide_tires');
    const hasWindshield = installed.has('windshield');
    const hasBrakes = installed.has('new_brakes');

    bike.tuneBikeWindshieldExt.visible = hasWindshield;
    pit.tuneBikeWindshieldCockpit.visible = hasWindshield;
    qute.quteWindshieldExtMesh.material = hasWindshield ? G.M.smokedGlass : G.M.glassWindow;
    pit.quteCockpitWindshieldMesh.material = hasWindshield ? G.M.smokedGlass : G.M.glassWindow;
    qute.quteSmokedDeflectorExt.visible = hasWindshield;

    const tireScaleX = hasWideTires ? 1.52 : 1.0;
    bike.fTire.scale.set(tireScaleX, 1, 1);
    bike.fRim.scale.set(tireScaleX * 0.92, 1, 1);
    bike.rTire.scale.set(tireScaleX * 1.08, 1, 1);
    bike.rRim.scale.set(tireScaleX * 0.95, 1, 1);
    const fenderScale = hasWideTires ? 1.38 : 1.0;
    for (const fender of bike.allFenders) fender.scale.set(fenderScale, 1, 1);
    for (const qw of G.quteWheels) qw.scale.set(hasWideTires ? 1.44 : 1.0, 1, 1);

    bike.tuneUpgradedBrakesGroup.visible = hasBrakes;
    for (const dm of bike.tuneUpgradedBrakesGroup.userData.discs) dm.visible = hasBrakes;
    pit.tuneBikeMasterCylCockpit.visible = hasBrakes;

    bike.tuneZeroFilterGroup.visible = hasFilter;
    bike.tuneCarbReplaceGroup.visible = hasCarb;
    bike.tuneCarbScrewMesh.visible = hasCarbTune;
    bike.tuneIridiumPlugGroup.visible = hasIridium;
    bike.tuneSprocketMesh.visible = hasSprocket;
    bike.tuneChainGuard.visible = hasSprocket;
  }
  G.applyVisualTuningToModel = applyVisualTuningToModel;
}
