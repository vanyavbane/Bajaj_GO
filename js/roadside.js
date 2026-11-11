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

  /* Зелёные указатели новых локаций: рисуются той же процедурой, что и МКАД. */
  function biomeSignTexture(title, subtitle) {
    return G.createCanvasTexture(512, 140, (ctx, w, h) => {
      ctx.fillStyle = '#006b2d'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.fillStyle = '#ffffff'; ctx.font = '900 30px Arial'; ctx.textAlign = 'center';
      ctx.fillText(title, w / 2, 54);
      ctx.fillStyle = '#ffeb3b'; ctx.font = '800 22px Arial';
      ctx.fillText(subtitle + '  ⬇', w / 2, 102);
    });
  }
  const biomeSignTextures = [
    overheadSignTextures,
    [
      biomeSignTexture('ПОДМОСКОВНЫЕ ПОЛЯ', 'ПШЕНИЦА · ВЕТРЯКИ · АМБАРЫ')
    ],
    [
      biomeSignTexture('ЛЕСНАЯ ДОРОГА', 'ЕЛИ · ВАЛУНЫ · ПРОСЕКИ')
    ],
    [
      biomeSignTexture('ГОРНЫЙ СЕРПАНТИН', 'ПЕРЕВАЛ · СМОТРОВАЯ ПЛОЩАДКА'),
      biomeSignTexture('ПЕРЕВАЛ', 'ВНИМАНИЕ · КРУТЫЕ ПОВОРОТЫ'),
      biomeSignTexture('СМОТРОВАЯ ПЛОЩАДКА', 'ОСТАНОВКА · ОТДЫХ · ВИД')
    ]
  ];

  // Индексы текстур билбордов по биомам: город — весь набор, остальным
  // достаются только логотип, PULSAR/DOMINAR и заправка.
  const billboardIndexByBiome = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8],
    [2, 0, 8],
    [2, 0],
    [1, 2]
  ];

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

  const brickMat = new THREE.MeshStandardMaterial({ color: 0x7a4033, roughness: 0.92 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2f343d, roughness: 0.85 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xa9b3c0, roughness: 0.75 });

  function createBuildingGroup(seed) {
    const g = new THREE.Group();
    const w = 8 + (seed % 5) * 1.4;
    const h = 12 + (seed % 7) * 3.2;
    const d = 8 + (seed % 3) * 1.6;
    const facade = (seed % 4 === 1) ? brickMat : buildingMats[seed % buildingMats.length];

    // Фундамент и бетонная плита вокруг здания.
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 1.6, 0.55, d + 1.6), G.M.concrete);
    slab.position.y = 0.28;
    slab.castShadow = true;
    slab.receiveShadow = true;
    g.add(slab);

    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), facade);
    body.position.y = h / 2 + 0.4;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    // Парапет крыши и техническая надстройка.
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.55, d + 0.5), roofMat);
    parapet.position.y = h + 0.55;
    parapet.castShadow = true;
    g.add(parapet);
    const roofBox = new THREE.Mesh(new THREE.BoxGeometry(w * 0.34, 1.2, d * 0.3), trimMat);
    roofBox.position.set(w * 0.16, h + 1.4, -d * 0.12);
    g.add(roofBox);

    // Эркер на одном из фасадов: выступающий объём со своими окнами.
    const bayW = 1.5;
    const bay = new THREE.Mesh(new THREE.BoxGeometry(bayW, h * 0.58, Math.min(4.2, d * 0.48)), facade);
    bay.position.set(-w / 2 - bayW / 2 + 0.05, h * 0.42, 0);
    bay.castShadow = true;
    g.add(bay);
    for (let y = 3.2; y < h * 0.62; y += 2.6) {
      const bayWin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.85), ((seed + Math.floor(y)) % 3) ? G.windowLitMat : windowOffMat);
      bayWin.position.set(-w / 2 - bayW + 0.02, y, 0);
      g.add(bayWin);
    }

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

    // Вход: тёмный проём с козырьком на противоположном фасаде.
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.4, 1.9), windowOffMat);
    door.position.set(w / 2 + 0.05, 1.6, -d * 0.18);
    g.add(door);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 2.6), trimMat);
    canopy.position.set(w / 2 + 0.4, 2.95, -d * 0.18);
    g.add(canopy);
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
      idx: i,
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
      slot.billboard = { group: bb.group, faceMat: bb.faceMat, texIndex: i, biome: -1, side: i % 4 === 1 ? 1 : -1 };
      G.scene.add(bb.group);
    }

    // Порталы: в городе — каждые 6 слотов, вне города — один на весь круг.
    // Меняем только видимость, геометрия создаётся один раз.
    if (i % 6 === 0 || i === 7) {
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
      slot.portal = { group: pg, boardMat, biome: -1, texIndex: 0 };
      G.scene.add(pg);
    }

    G.roadsideSlots.push(slot);
  }

  /* Доминирующий биом в точке s. Массив весов общий, поэтому забираем только скаляр. */
  function dominantBiomeAt(s) {
    const w = G.biomeWeightsAtS(s);
    let dom = 0;
    let best = -1;
    for (let b = 0; b < 4; b++) {
      if (w[b] > best) { best = w[b]; dom = b; }
    }
    return dom;
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
        if (slot.portal) G.placeOnRoad(slot.portal.group, slot.s, 0, 0);
      });

      // Городская инфраструктура живёт только в городе: вне его отбойники,
      // фонари и здания сжимаются до нуля и перестают рендериться.
      const cw = G.cityWeightAtS(slot.s);
      const cityVisible = cw > 0.02;
      const cityScale = cityVisible ? cw : 0;
      slot.leftGuard.visible = cityVisible;
      slot.rightGuard.visible = cityVisible;
      slot.leftLamp.visible = cityVisible;
      slot.rightLamp.visible = cityVisible;
      slot.leftProp.visible = cityVisible;
      slot.rightProp.visible = cityVisible;
      if (cityVisible) {
        slot.leftGuard.scale.setScalar(cityScale);
        slot.rightGuard.scale.setScalar(cityScale);
        slot.leftLamp.scale.setScalar(cityScale);
        slot.rightLamp.scale.setScalar(cityScale);
        slot.leftProp.scale.setScalar(cityScale);
        slot.rightProp.scale.setScalar(cityScale);
      }

      // Билборды разрешены везде, но вне города реже, и текст релевантен биому.
      // В городе два щита на круг (200–280 м друг от друга), по бокам дороги;
      // текст прокручивается по абсолютному пробегу, поэтому со временем
      // встречаются все обязательные бренды, а не одна и та же пара.
      const dom = dominantBiomeAt(slot.s);
      const roadM = G.biomeOffsetM + slot.s;
      const inCity = cw > 0.5;
      if (slot.billboard) {
        const bb = slot.billboard;
        const show = inCity ? (slot.idx === 3 || slot.idx === 17) : slot.idx === 7;
        bb.group.visible = show;
        if (show) {
          const list = billboardIndexByBiome[dom];
          const rot = Math.floor(roadM / 240) + (inCity && bb.side > 0 ? 1 : 0);
          const texIndex = list[((rot % list.length) + list.length) % list.length];
          if (bb.biome !== dom || bb.texIndex !== texIndex) {
            bb.biome = dom;
            bb.texIndex = texIndex;
            bb.faceMat.map = billboardTextures[texIndex];
            bb.faceMat.needsUpdate = true;
          }
        }
      }

      if (slot.portal) {
        const po = slot.portal;
        const show = inCity ? slot.idx % 6 === 0 : slot.idx === 7;
        po.group.visible = show;
        if (show) {
          const list = biomeSignTextures[dom];
          const texIndex = inCity
            ? Math.floor(slot.idx / 6) % list.length
            : Math.floor(roadM / 480) % list.length;
          if (po.biome !== dom || po.texIndex !== texIndex) {
            po.biome = dom;
            po.texIndex = texIndex;
            po.boardMat.map = list[texIndex];
            po.boardMat.needsUpdate = true;
          }
        }
      }

      if (cw > 0.45 && Math.abs(slot.s - G.playerS) < 85) {
        nearestLampPositions.push(slot.leftLamp.position, slot.rightLamp.position);
      }
    }

    const lampBudget = G.graphics ? G.graphics.lamps : G.lampLights.length;
    const wetGlow = 1 + 0.55 * (G.weather ? G.weather.wet : 0);
    for (let i = 0; i < G.lampLights.length; i++) {
      const pl = G.lampLights[i];
      if (isNightish && i < lampBudget && i < nearestLampPositions.length) {
        const lp = nearestLampPositions[i];
        pl.position.set(lp.x, lp.y + 5.8, lp.z);
        pl.intensity = 14 * wetGlow;
      } else {
        pl.intensity = 0;
      }
    }
  }
  G.updateRoadside = updateRoadside;
}
