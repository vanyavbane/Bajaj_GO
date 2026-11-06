import * as THREE from 'three';
import { G } from './state.js';

export function initTraffic() {
  const $ = G.$;
  const clamp = G.clamp;
  const lerp = G.lerp;

  /* =========================================================================
   * 9. ТРАФИК (СЕДАНЫ, ТАКСИ, ГАЗЕЛИ, АВТОБУСЫ И СТАНДАРТНЫЙ BAJAJ QUTE)
   * ========================================================================= */
  G.trafficPool = [];
  const vehicleColors = [0xd8dee9, 0xb71c1c, 0x1565c0, 0x2e7d32, 0x455a64, 0x6d4c41, 0x37474f, 0xf5f5f5];

  function createVehicleModel(type, colorHex) {
    const rootGrp = new THREE.Group();
    const hiDetail = new THREE.Group();
    const loDetail = new THREE.Group();
    rootGrp.add(hiDetail, loDetail);

    const isTaxi = type === 'taxi';
    const isTrafficQute = type === 'qute_traffic';
    const paintColor = isTaxi ? 0xffca28 : (isTrafficQute ? 0xffca28 : colorHex);
    const bodyMat = new THREE.MeshStandardMaterial({ color: paintColor, roughness: 0.3, metalness: 0.4, envMapIntensity: 1.2 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfff8e1, emissive: 0xffe082, emissiveIntensity: 1.5 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xff1744, emissive: 0xd50000, emissiveIntensity: 1.1 });

    const wheels = [];
    const frontPivots = [];

    function addWheel(x, y, z, radius, width, isFront) {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      const wheelMesh = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 12), G.M.rubber);
      tire.rotation.z = Math.PI / 2;
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.58, radius * 0.58, width + 0.02, 8), G.M.chrome);
      rim.rotation.z = Math.PI / 2;
      wheelMesh.add(tire, rim);
      pivot.add(wheelMesh);
      hiDetail.add(pivot);
      wheels.push(wheelMesh);
      if (isFront) frontPivots.push(pivot);
    }

    let halfWidth = 1.1, halfLength = 2.2, roofHeight = 1.55;

    if (isTrafficQute) {
      halfWidth = 0.72; halfLength = 1.45; roofHeight = 1.68;
      const lower = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.72, 2.75), bodyMat);
      lower.position.y = 0.62;
      lower.castShadow = true;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.30, 0.72, 1.95), bodyMat);
      cabin.position.set(0, 1.30, 0.12);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.33, 0.56, 1.82), G.M.glass);
      glass.position.set(0, 1.30, 0.12);
      const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.40, 0.24, 0.2), G.M.mattePlastic);
      bumperF.position.set(0, 0.42, -1.36);
      const bumperR = bumperF.clone();
      bumperR.position.z = 1.36;
      hiDetail.add(lower, cabin, glass, bumperF, bumperR);

      for (const wx of [-0.66, 0.66]) {
        addWheel(wx, 0.3, -0.95, 0.3, 0.18, true);
        addWheel(wx, 0.3, 0.95, 0.3, 0.18, false);
      }
      for (const lx of [-0.46, 0.46]) {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.08), headMat);
        hl.position.set(lx, 0.72, -1.38);
        const tl = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.08), tailMat);
        tl.position.set(lx, 0.76, 1.38);
        hiDetail.add(hl, tl);
      }
      const lodBox = new THREE.Mesh(new THREE.BoxGeometry(1.36, 1.45, 2.75), bodyMat);
      lodBox.position.y = 0.9;
      loDetail.add(lodBox);

    } else if (type === 'sedan' || type === 'taxi') {
      halfWidth = 1.12; halfLength = 2.25; roofHeight = 1.65;
      const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.76, 4.45), bodyMat);
      chassis.position.y = 0.72;
      chassis.castShadow = true; chassis.receiveShadow = true;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.66, 2.2), bodyMat);
      cabin.position.set(0, 1.38, -0.15);
      cabin.castShadow = true;
      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.56, 2.26), G.M.glass);
      glass.position.set(0, 1.38, -0.15);
      const bumpF = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.24, 0.22), G.M.mattePlastic);
      bumpF.position.set(0, 0.5, -2.24);
      const bumpR = bumpF.clone();
      bumpR.position.z = 2.24;
      hiDetail.add(chassis, cabin, glass, bumpF, bumpR);

      if (isTaxi) {
        const sign = new THREE.Mesh(
          new THREE.BoxGeometry(0.65, 0.22, 0.28),
          new THREE.MeshStandardMaterial({ color: 0xffeb3b, emissive: 0xffa000, emissiveIntensity: 0.9 })
        );
        sign.position.set(0, 1.82, -0.1);
        hiDetail.add(sign);
      }

      for (const wx of [-1.08, 1.08]) {
        addWheel(wx, 0.4, -1.38, 0.4, 0.26, true);
        addWheel(wx, 0.4, 1.38, 0.4, 0.26, false);
      }
      for (const lx of [-0.76, 0.76]) {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.08), headMat);
        hl.position.set(lx, 0.78, -2.25);
        const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.08), tailMat);
        tl.position.set(lx, 0.78, 2.25);
        hiDetail.add(hl, tl);
      }

      const lodBox = new THREE.Mesh(new THREE.BoxGeometry(2.24, 1.35, 4.45), bodyMat);
      lodBox.position.y = 0.85;
      loDetail.add(lodBox);

    } else if (type === 'gazelle_flatbed' || type === 'gazelle_van') {
      const w = 3.82;
      halfWidth = w * 0.5; halfLength = 3.15; roofHeight = 2.65;

      const cab = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 1.45, 2.1), bodyMat);
      cab.position.set(0, 1.15, -1.95);
      cab.castShadow = true;
      const windshield = new THREE.Mesh(new THREE.BoxGeometry(w * 0.84, 0.75, 0.12), G.M.glass);
      windshield.position.set(0, 1.48, -3.02);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(w * 0.88, 0.26, 6.1), G.M.metalDark);
      frame.position.set(0, 0.58, 0);
      hiDetail.add(cab, windshield, frame);

      if (type === 'gazelle_flatbed') {
        const bedMat = new THREE.MeshStandardMaterial({ color: 0x5d646e, roughness: 0.7 });
        const bed = new THREE.Mesh(new THREE.BoxGeometry(w, 0.75, 3.95), bedMat);
        bed.position.set(0, 1.08, 1.1);
        bed.castShadow = true;
        const crate = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.95, 2.4), new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.85 }));
        crate.position.set(0, 1.65, 1.1);
        hiDetail.add(bed, crate);
      } else {
        const vanMat = new THREE.MeshStandardMaterial({ color: 0xebeff5, roughness: 0.45, metalness: 0.2 });
        const vanBox = new THREE.Mesh(new THREE.BoxGeometry(w, 2.25, 4.05), vanMat);
        vanBox.position.set(0, 1.82, 1.1);
        vanBox.castShadow = true;
        hiDetail.add(vanBox);
      }

      for (const wx of [-w * 0.45, w * 0.45]) {
        addWheel(wx, 0.46, -1.95, 0.46, 0.32, true);
        addWheel(wx, 0.46, 1.85, 0.46, 0.32, false);
      }
      for (const lx of [-w * 0.34, w * 0.34]) {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.24, 0.1), headMat);
        hl.position.set(lx, 0.88, -3.02);
        const tl = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.22, 0.1), tailMat);
        tl.position.set(lx, 0.72, 3.12);
        hiDetail.add(hl, tl);
      }

      const lodBox = new THREE.Mesh(new THREE.BoxGeometry(w, 2.5, 6.1), bodyMat);
      lodBox.position.y = 1.45;
      loDetail.add(lodBox);

    } else {
      const w = 3.55;
      halfWidth = w * 0.5; halfLength = 4.1; roofHeight = 2.85;
      const busMat = new THREE.MeshStandardMaterial({ color: 0x0277bd, roughness: 0.35, metalness: 0.3 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, 2.55, 8.2), busMat);
      body.position.y = 1.72;
      body.castShadow = true;
      const winBand = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, 0.92, 7.6), G.M.glass);
      winBand.position.set(0, 2.15, 0);
      hiDetail.add(body, winBand);

      for (const wx of [-w * 0.46, w * 0.46]) {
        addWheel(wx, 0.5, -2.55, 0.5, 0.34, true);
        addWheel(wx, 0.5, 2.55, 0.5, 0.34, false);
      }
      for (const lx of [-w * 0.36, w * 0.36]) {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.1), headMat);
        hl.position.set(lx, 0.92, -4.12);
        const tl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.1), tailMat);
        tl.position.set(lx, 0.92, 4.12);
        hiDetail.add(hl, tl);
      }

      const lodBox = new THREE.Mesh(new THREE.BoxGeometry(w, 2.6, 8.2), busMat);
      lodBox.position.y = 1.72;
      loDetail.add(lodBox);
    }

    const alertSprite = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.28, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xffab00 })
    );
    alertSprite.position.set(0, 2.9, 0);
    alertSprite.visible = false;
    rootGrp.add(alertSprite);

    return {
      root: rootGrp,
      hiDetail,
      loDetail,
      wheels,
      frontPivots,
      alertSprite,
      halfWidth,
      halfLength,
      roofHeight,
      type
    };
  }

  const vehicleTypes = ['sedan', 'taxi', 'gazelle_flatbed', 'qute_traffic', 'gazelle_van', 'bus', 'sedan'];
  for (let i = 0; i < 18; i++) {
    const vType = vehicleTypes[i % vehicleTypes.length];
    const model = createVehicleModel(vType, vehicleColors[i % vehicleColors.length]);
    G.scene.add(model.root);

    const laneIdx = vType === 'qute_traffic' ? 3 : (i % 4);
    G.trafficPool.push({
      model,
      laneIdx,
      targetLaneIdx: laneIdx,
      lateralOffset: G.LANE_OFFSETS[laneIdx],
      s: 35 + i * 26,
      speedKmh: vType === 'qute_traffic' ? 50 : G.LANE_SPEEDS[laneIdx],
      changingLane: false,
      flashReactTimer: 0,
      steerAngle: 0,
      nearMissAwarded: false,
      jumpedInCurrentJump: false
    });
  }

  function resetTrafficVehicle(car, newS, forcedLane = null) {
    const isQuteTraffic = car.model.type === 'qute_traffic';
    const laneIdx = isQuteTraffic ? 3 : (forcedLane !== null ? forcedLane : Math.floor(Math.random() * 4));
    car.laneIdx = laneIdx;
    car.targetLaneIdx = laneIdx;
    car.lateralOffset = G.LANE_OFFSETS[laneIdx];
    car.s = newS;
    car.speedKmh = isQuteTraffic ? 50 : G.LANE_SPEEDS[laneIdx];
    car.changingLane = false;
    car.flashReactTimer = 0;
    car.steerAngle = 0;
    car.nearMissAwarded = false;
    car.jumpedInCurrentJump = false;
    car.model.alertSprite.visible = false;
  }
  G.resetTrafficVehicle = resetTrafficVehicle;
}
