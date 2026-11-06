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
    bike.frontFender.scale.set(hasWideTires ? 1.38 : 1.0, 1, 1);
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
