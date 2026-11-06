import * as THREE from 'three';
import { G } from './state.js';

export function initPedestrians() {
  const $ = G.$;
  const clamp = G.clamp;
  const lerp = G.lerp;

  /* =========================================================================
   * 8. ПЕШЕХОДЫ НА ТРОТУАРАХ
   * ========================================================================= */
  G.pedestrians = [];
  const pedColors = [0xd32f2f, 0x1976d2, 0x388e3c, 0xfbc02d, 0x8e24aa, 0x00838f, 0x5d4037];
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe0ac69, roughness: 0.7 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.8 });

  for (let i = 0; i < 26; i++) {
    const pg = new THREE.Group();
    const scaleH = 0.88 + (i % 4) * 0.08;
    const jacketMat = new THREE.MeshStandardMaterial({ color: pedColors[i % pedColors.length], roughness: 0.75 });

    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.75, 0.18), pantsMat);
    legL.position.set(-0.12, 0.38, 0);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.75, 0.18), pantsMat);
    legR.position.set(0.12, 0.38, 0);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.68, 0.26), jacketMat);
    torso.position.set(0, 1.08, 0);
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), skinMat);
    head.position.set(0, 1.62, 0);

    pg.add(legL, legR, torso, head);
    pg.scale.set(1, scaleH, 1);
    G.scene.add(pg);

    G.pedestrians.push({
      group: pg,
      legL,
      legR,
      s: i * 16,
      side: i % 2 === 0 ? -1 : 1,
      lateralOffset: (i % 2 === 0 ? -1 : 1) * (10.7 + (i % 3) * 0.55),
      walkSpeed: (i % 4 === 0) ? 0 : (1.1 + (i % 3) * 0.45) * (i % 2 === 0 ? 1 : -1),
      phase: i * 1.3
    });
  }
}
