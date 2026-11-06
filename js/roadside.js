import * as THREE from 'three';
import { keepInWindow, placeIfMoved } from './engine/stream.js';
import { G } from './state.js';

export function initRoadside() {
  /* =========================================================================
   * 6. БИЛБОРДЫ, ЗДАНИЯ И ПРИДОРОЖНЫЕ СЛОТЫ
   * ========================================================================= */
  const billboardTextures = [];
  function buildBillboardTextures() {
    const specs = [
      (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, '#0d0d11'); g.addColorStop(0.6, '#220508'); g.addColorStop(1, '#c61a24');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#ff2a36'; ctx.lineWidth = 8; ctx.strokeRect(10, 10, w - 20, h - 20);
        ctx.fillStyle = '#ffffff'; ctx.font = 'italic 900 44px Arial'; ctx.fillText('BAJAJ PULSAR', 28, 72);
        ctx.fillStyle = '#ff3d47'; ctx.font = '900 28px Arial'; ctx.fillText('NS125 · NS200 · N250', 28, 114);
        ctx.fillStyle = '#d8dee9'; ctx.font = '700 20px Arial'; ctx.fillText('ЧИСТЫЙ ДРАЙВ В ПОТОКЕ', 28, 156);
      },
      (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, '#082618'); g.addColorStop(1, '#1b6b45');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#69f0ae'; ctx.lineWidth = 8; ctx.strokeRect(10, 10, w - 20, h - 20);
        ctx.fillStyle = '#69f0ae'; ctx.font = 'italic 900 42px Arial'; ctx.fillText('DOMINAR 400', 26, 68);
        ctx.fillStyle = '#ffffff'; ctx.font = '900 32px Arial'; ctx.fillText('BAJAJ TOURING POWER', 26, 116);
        ctx.fillStyle = '#ffd54f'; ctx.font = '800 22px Arial'; ctx.fillText('cbpnk.com · Radio · SkyLands', 26, 158);
      },
      (ctx, w, h) => {
        ctx.fillStyle = '#0d4d29'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#ffb300'; ctx.lineWidth = 8; ctx.strokeRect(10, 10, w - 20, h - 20);
        const lg = ctx.createLinearGradient(0, 25, 0, 130);
        lg.addColorStop(0, '#ffee58'); lg.addColorStop(0.5, '#ff9800'); lg.addColorStop(1, '#e53935');
        ctx.fillStyle = lg; ctx.font = 'italic 900 64px Arial'; ctx.fillText('bajaj GO', 28, 96);
        ctx.fillStyle = '#ffffff'; ctx.font = '800 24px Arial'; ctx.fillText('BAJAJ QUTE · УЖЕ В ГАРАЖЕ', 28, 148);
      },
      (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, '#5f0910'); g.addColorStop(1, '#b71c1c');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 9; ctx.strokeRect(12, 12, w - 24, h - 24);
        ctx.fillStyle = '#ffd700'; ctx.font = '900 54px Arial'; ctx.fillText('bass_by_vvb', 32, 86);
        ctx.fillStyle = '#fff8e1'; ctx.font = '800 24px Arial'; ctx.fillText('PREMIUM LOW SOUND', 32, 138);
      },
      (ctx, w, h) => {
        ctx.fillStyle = '#0b0c12'; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 18; i++) {
          ctx.fillStyle = i % 2 === 0 ? '#ff6d00' : '#ffab00';
          ctx.beginPath();
          const fx = 30 + i * 26;
          ctx.moveTo(fx, h);
          ctx.lineTo(fx + 16, 35 + (i % 3) * 22);
          ctx.lineTo(fx + 32, h);
          ctx.fill();
        }
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(w / 2 - 46, 38, 92, 68);
        ctx.fillRect(w / 2 - 30, 106, 60, 32);
        ctx.fillStyle = '#00e5ff';
        ctx.fillRect(w / 2 - 32, 58, 22, 22);
        ctx.fillRect(w / 2 + 10, 58, 22, 22);
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 24px Arial';
        ctx.fillText('QUTE ЮРЫ ВОЛКОВА · 350 КМ/Ч', 48, 174);
      },
      (ctx, w, h) => {
        ctx.fillStyle = '#142238'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#4fc3f7'; ctx.font = '900 42px Arial'; ctx.fillText('ГРУЗОПЕРЕВОЗКИ 24/7', 28, 74);
        ctx.fillStyle = '#ffffff'; ctx.font = '700 24px Arial'; ctx.fillText('ИП СОКОЛОВ · БЫСТРО', 28, 126);
      },
      (ctx, w, h) => {
        ctx.fillStyle = '#241236'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#ea80fc'; ctx.font = '900 42px Arial'; ctx.fillText('VOXEL TUNING', 26, 74);
        ctx.fillStyle = '#ffffff'; ctx.font = '700 24px Arial'; ctx.fillText('НУЛЕВИК · КАРБЮРАТОР · ТОРМОЗА', 26, 126);
      },
      (ctx, w, h) => {
        ctx.fillStyle = '#1b3826'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#ffd54f'; ctx.font = '900 42px Arial'; ctx.fillText('AB_ПОКОС', 24, 74);
        ctx.fillStyle = '#ffffff'; ctx.font = '700 24px Arial'; ctx.fillText('Покос участков ДОРОГО', 24, 126);
      },
      (ctx, w, h) => {
        ctx.fillStyle = '#2d1c14'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#ff9e80'; ctx.font = '900 42px Arial'; ctx.fillText('БЕНЗИН АИ-100', 26, 74);
        ctx.fillStyle = '#ffffff'; ctx.font = '700 24px Arial'; ctx.fillText('ДЛЯ ЗАРЯЖЕННЫХ QUTE', 26, 126);
      }
    ];
    for (const fn of specs) billboardTextures.push(G.createCanvasTexture(512, 192, fn));
  }
  buildBillboardTextures();

  const mkadDestinations = [
    ['САДОВОД · 14 КМ', 'МЕГА БЕЛАЯ ДАЧА'],
    ['ТРК VEGAS · 24 КМ', 'КАШИРСКОЕ ШОССЕ'],
    ['КРОКУС СИТИ · 66 КМ', 'ВОЛОКОЛАМСКОЕ Ш.'],
    ['ЛОСИНЫЙ ОСТРОВ · 95 КМ', 'ЯРОСЛАВСКОЕ ШОССЕ'],
    ['ЩЁЛКОВСКОЕ Ш. · 104 КМ', 'ЦЕНТР · БАЛАШИХА'],
    ['ХИМКИ · 74 КМ', 'ЛЕНИНГРАДСКОЕ ШОССЕ']
  ];
  const overheadSignTextures = mkadDestinations.map(([t1, t2]) =>
    G.createCanvasTexture(512, 140, (ctx, w, h) => {
      ctx.fillStyle = '#006b2d'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.fillStyle = '#ffffff'; ctx.font = '900 32px Arial'; ctx.textAlign = 'center';
      ctx.fillText(t1, w / 2, 54);
      ctx.fillStyle = '#ffeb3b'; ctx.font = '800 24px Arial';
      ctx.fillText(t2 + '  ⬇  ⬇', w / 2, 102);
    })
  );

  G.NUM_ROADSIDE_SLOTS = 24;
  G.SLOT_STEP = 20;
  G.roadsideSlots = [];

  const buildingMats = [
    new THREE.MeshStandardMaterial({ color: 0x4f5866, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0x5c6270, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0x695f5c, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0x3e4c5e, roughness: 0.8 })
  ];
  G.windowLitMat = new THREE.MeshStandardMaterial({ color: 0xffe082, emissive: 0xffb300, emissiveIntensity: 0.85, roughness: 0.3 });
  const windowOffMat = new THREE.MeshStandardMaterial({ color: 0x2c3847, roughness: 0.25, metalness: 0.6 });
  const lampHeadMat = new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffb74d, emissiveIntensity: 1.5 });

  function createBuildingGroup(seed) {
    const g = new THREE.Group();
    const w = 8 + (seed % 5) * 1.4;
    const h = 12 + (seed % 7) * 3.2;
    const d = 8 + (seed % 3) * 1.6;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), buildingMats[seed % buildingMats.length]);
    body.position.y = h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    for (let y = 2.5; y < h - 1.5; y += 2.6) {
      for (let z = -d / 2 + 1.4; z <= d / 2 - 1.4; z += 2.1) {
        const lit = ((Math.floor(y * 3 + z * 7 + seed) % 5) !== 0);
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.9), lit ? G.windowLitMat : windowOffMat);
        win.position.set(-w / 2 - 0.03, y, z);
        g.add(win);
        const win2 = win.clone();
        win2.position.x = w / 2 + 0.03;
        g.add(win2);
      }
    }
    return g;
  }

  function createBillboardMesh(texIndex, withSpotlights) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 7.5, 8), G.M.metalDark);
    post.position.y = 3.75;
    post.castShadow = true;
    g.add(post);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(7.6, 3.1, 0.32), G.M.metalDark);
    frame.position.set(0, 7.6, 0);
    frame.castShadow = true;
    g.add(frame);

    const faceMat = new THREE.MeshStandardMaterial({
      map: billboardTextures[texIndex % billboardTextures.length],
      roughness: 0.4,
      emissive: withSpotlights ? 0x222222 : 0x000000
    });
    const face = new THREE.Mesh(new THREE.BoxGeometry(7.2, 2.75, 0.36), faceMat);
    face.position.set(0, 7.6, 0);
    g.add(face);

    if (withSpotlights) {
      for (const sx of [-2.4, 2.4]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.7), G.M.chrome);
        bar.position.set(sx, 9.2, 0.35);
        g.add(bar);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.24), lampHeadMat);
        lamp.position.set(sx, 9.15, 0.65);
        g.add(lamp);
      }
    }
    return { group: g, faceMat };
  }

  for (let i = 0; i < G.NUM_ROADSIDE_SLOTS; i++) {
    const slot = {
      s: i * G.SLOT_STEP,
      leftGuard: new THREE.Group(),
      rightGuard: new THREE.Group(),
      leftLamp: new THREE.Group(),
      rightLamp: new THREE.Group(),
      leftProp: new THREE.Group(),
      rightProp: new THREE.Group(),
      billboard: null,
      portal: null
    };

    for (const [, grp] of [[-1, slot.leftGuard], [1, slot.rightGuard]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.62, 0.24), G.M.chrome);
      post.position.y = 0.31;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, G.SLOT_STEP + 0.2), G.M.chrome);
      rail.position.y = 0.52;
      grp.add(post, rail);
      G.scene.add(grp);
    }

    for (const [side, lgrp] of [[-1, slot.leftLamp], [1, slot.rightLamp]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 6.2, 8), G.M.metalDark);
      pole.position.y = 3.1;
      pole.castShadow = true;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.12), G.M.metalDark);
      arm.position.set(-side * 0.75, 6.1, 0);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.18, 0.32), lampHeadMat);
      head.position.set(-side * 1.45, 6.05, 0);
      lgrp.add(pole, arm, head);
      G.scene.add(lgrp);
    }

    slot.leftProp.add(createBuildingGroup(i * 3 + 1));
    slot.rightProp.add(createBuildingGroup(i * 3 + 2));

    if (i % 2 === 0) {
      const treeGrp = new THREE.Group();
      const trk = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.4, 0.55), G.M.trunk);
      trk.position.y = 1.2;
      const cr1 = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.6, 2.8), G.M.tree1);
      cr1.position.y = 3.2;
      const cr2 = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.0, 2.0), G.M.tree2);
      cr2.position.y = 4.8;
      cr1.castShadow = true;
      treeGrp.add(trk, cr1, cr2);
      treeGrp.position.set(0, 0, 7);
      slot.leftProp.add(treeGrp);
    }
    G.scene.add(slot.leftProp, slot.rightProp);

    if (i % 2 === 1) {
      const bb = createBillboardMesh(i, i % 3 === 1);
      slot.billboard = { group: bb.group, faceMat: bb.faceMat, side: i % 4 === 1 ? 1 : -1 };
      G.scene.add(bb.group);
    }

    if (i % 6 === 0) {
      const pg = new THREE.Group();
      const pL = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 7.6, 8), G.M.chrome);
      pL.position.set(-10.3, 3.8, 0);
      const pR = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 7.6, 8), G.M.chrome);
      pR.position.set(10.3, 3.8, 0);
      const beam = new THREE.Mesh(new THREE.BoxGeometry(21.2, 0.35, 0.35), G.M.chrome);
      beam.position.set(0, 7.4, 0);
      const boardMat = new THREE.MeshStandardMaterial({
        map: overheadSignTextures[(i / 6) % overheadSignTextures.length],
        roughness: 0.45
      });
      const board = new THREE.Mesh(new THREE.BoxGeometry(9.6, 2.4, 0.22), boardMat);
      board.position.set(0, 7.1, 0);
      pg.add(pL, pR, beam, board);
      slot.portal = pg;
      G.scene.add(pg);
    }

    G.roadsideSlots.push(slot);
  }

  function updateRoadside(isNightish) {
    const recycleSpan = G.NUM_ROADSIDE_SLOTS * G.SLOT_STEP;
    const nearestLampPositions = [];

    for (const slot of G.roadsideSlots) {
      slot.s = keepInWindow(slot.s, G.playerS, 35, Infinity, recycleSpan);
      slot.placedS = placeIfMoved(slot.placedS, slot.s, () => {
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
      });

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
  G.updateRoadside = updateRoadside;
}
