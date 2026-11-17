import * as THREE from 'three';
import { G } from './state.js';
import { bikePaint } from './engine/vehicle.js';

/**
 * Витрина магазина: отдельная мини-сцена на своём WebGLRenderer.
 * Модель собирается клоном уже построенной техники, поэтому геометрия
 * и материалы общие с заездом — клон ничего не двигает и не портит.
 */
export function initShopPreview() {
  let active = false;
  let builtKey = '';
  let renderer = null;
  let scene = null;
  let camera = null;
  let stage = null;
  let previewTank = null;
  let previewAccent = null;
  let lastTime = 0;
  let sizeW = 0;
  let sizeH = 0;
  let paths = null;

  G.shopPreviewActive = false;
  G.shopPreviewId = null;

  /* ---------- пути к частям модели ---------- */

  function pathFrom(root, node) {
    if (!root || !node) return null;
    const path = [];
    let cur = node;
    while (cur && cur !== root) {
      const parent = cur.parent;
      if (!parent) return null;
      const idx = parent.children.indexOf(cur);
      if (idx < 0) return null;
      path.unshift(idx);
      cur = parent;
    }
    return cur === root ? path : null;
  }

  function nodeAt(root, path) {
    if (!path) return null;
    let node = root;
    for (const idx of path) {
      node = node && node.children[idx];
      if (!node) return null;
    }
    return node;
  }

  function buildPaths() {
    if (paths) return paths;
    const chassis = G.bikeChassisGroup;
    const versions = {};
    for (const [id, data] of Object.entries(G.bikeVersionGroups || {})) {
      versions[id] = {
        chassis: pathFrom(chassis, data.chassis),
        tp: pathFrom(chassis, data.tp),
        fender: pathFrom(chassis, data.fender),
        style: data.style
      };
    }
    const wheels = {};
    for (const [style, pair] of Object.entries(G.bikeWheelStyles || {})) {
      wheels[style] = { front: pathFrom(chassis, pair.front), rear: pathFrom(chassis, pair.rear) };
    }
    const tuningNames = [
      'tuneUpgradedBrakesGroup',
      'tuneZeroFilterGroup',
      'tuneCarbReplaceGroup',
      'tuneCarbScrewMesh',
      'tuneIridiumPlugGroup',
      'tuneSprocketMesh',
      'tuneChainGuard',
      'tuneBikeWindshieldExt'
    ];
    const tuning = tuningNames
      .map(name => (G.bikeParts && G.bikeParts[name] ? pathFrom(chassis, G.bikeParts[name]) : null))
      .filter(Boolean);
    // Контейнеры семейств могли быть скрыты под выбранный для игры мотоцикл.
    // В витрине показываем их все, а лишние версии прячем по одной.
    const containers = [
      G.bikeThirdPersonBody,
      G.bikeVariantGroups && G.bikeVariantGroups.boxer,
      G.bikeVariantGroups && G.bikeVariantGroups.avenger,
      G.bikeThirdPersonVariants && G.bikeThirdPersonVariants.pulsar,
      G.bikeThirdPersonVariants && G.bikeThirdPersonVariants.boxer,
      G.bikeThirdPersonVariants && G.bikeThirdPersonVariants.avenger,
      G.frontWheelGroup,
      G.rearWheelGroup
    ].map(node => pathFrom(chassis, node)).filter(Boolean);
    const quteRoot = G.quteExteriorGroup;
    paths = {
      rider: pathFrom(chassis, G.bikeThirdPersonRider),
      frontWheel: pathFrom(chassis, G.frontWheelGroup),
      versions,
      wheels,
      tuning,
      containers,
      quteYura: pathFrom(quteRoot, G.yuraTuningGroup),
      quteWindshield: G.bikeParts && G.bikeParts.tuneBikeWindshieldExt
        ? pathFrom(quteRoot, G.bikeParts.tuneBikeWindshieldExt)
        : null
    };
    return paths;
  }

  /* ---------- сцена и рендерер ---------- */

  function ensureScene() {
    if (scene) return;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080c12);
    camera = new THREE.PerspectiveCamera(34, 4 / 3, 0.1, 200);

    const hemi = new THREE.HemisphereLight(0xd6e9ff, 0x0a1016, 1.25);
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(3.2, 5.4, 2.8);
    const fill = new THREE.DirectionalLight(0x8fb9dd, 0.9);
    fill.position.set(-3.6, 2.2, 1.6);
    const rim = new THREE.DirectionalLight(0x6fc3e8, 1.7);
    rim.position.set(-1.4, 2.8, -3.8);
    scene.add(hemi, key, fill, rim);

    previewTank = new THREE.MeshStandardMaterial({ color: 0xcbd0d6, roughness: 0.25, metalness: 0.55, envMapIntensity: 1.2 });
    previewAccent = new THREE.MeshStandardMaterial({ color: 0xd9363e, roughness: 0.32, metalness: 0.35 });

    stage = new THREE.Group();
    scene.add(stage);
  }

  function ensureRenderer() {
    if (renderer) return renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.shadowMap.enabled = false;
    } catch {
      renderer = null;
    }
    return renderer;
  }

  function makePodium(radius) {
    const group = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 0.94, 0.06, 48),
      new THREE.MeshStandardMaterial({ color: 0x0e1620, roughness: 0.86, metalness: 0.16 })
    );
    disc.position.y = -0.03;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.97, 0.012, 6, 72),
      new THREE.MeshStandardMaterial({ color: 0x6fc3e8, emissive: 0x2b6a86, emissiveIntensity: 1.2, roughness: 0.4 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.004;
    group.add(disc, ring);
    return group;
  }

  /* ---------- сборка модели ---------- */

  function cloneVehicle(bike) {
    const p = buildPaths();
    const isQute = bike.vType === 'qute' || bike.vType === 'yura';
    let root;

    if (isQute) {
      root = G.quteExteriorGroup.clone(true);
      const yura = nodeAt(root, p.quteYura);
      if (yura) yura.visible = bike.vType === 'yura';
      const deflector = nodeAt(root, p.quteWindshield);
      if (deflector) deflector.visible = false;
    } else {
      root = G.bikeChassisGroup.clone(true);
      for (const path of p.containers) {
        const node = nodeAt(root, path);
        if (node) node.visible = true;
      }
      for (const [id, data] of Object.entries(p.versions)) {
        const on = id === bike.id;
        const chassis = nodeAt(root, data.chassis);
        const tp = nodeAt(root, data.tp);
        const fender = nodeAt(root, data.fender);
        if (chassis) chassis.visible = on;
        if (tp) tp.visible = on;
        if (fender) fender.visible = on;
      }
      const rider = nodeAt(root, p.rider);
      if (rider) rider.visible = false;

      const chosenStyle = p.versions[bike.id] ? p.versions[bike.id].style : null;
      for (const [style, pair] of Object.entries(p.wheels)) {
        const on = style === chosenStyle;
        const front = nodeAt(root, pair.front);
        const rear = nodeAt(root, pair.rear);
        if (front) front.visible = on;
        if (rear) rear.visible = on;
      }
      // У Avenger длинная вилка: колесо в клоне стоит так же, как в заезде.
      const frontWheel = nodeAt(root, p.frontWheel);
      if (frontWheel) frontWheel.position.z = bike.variant === 'avenger' ? -1.78 : -1.42;
      // Тюнинг в витрине не показываем: у просматриваемого мотоцикла он свой.
      for (const path of p.tuning) {
        const node = nodeAt(root, path);
        if (node) node.visible = false;
      }
    }

    root.visible = true;
    return root;
  }

  function rebuild(bike, color) {
    ensureScene();
    const root = cloneVehicle(bike);

    if (previewTank) previewTank.color.setHex(color);
    if (previewAccent) previewAccent.color.setHex(bike.accent);
    root.traverse(obj => {
      if (!obj.isMesh) return;
      if (obj.material === G.tankMat) obj.material = previewTank;
      else if (obj.material === G.accentMat) obj.material = previewAccent;
    });

    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= box.min.y;

    stage.clear();
    stage.add(root);

    const radius = Math.max(size.x, size.z) * 0.66 + 0.18;
    stage.add(makePodium(radius));
    stage.rotation.y = 0;

    const maxDim = Math.max(size.x, size.z, size.y);
    const dist = maxDim * 1.5 + 1.1;
    camera.position.set(dist * 0.62, size.y * 0.9 + maxDim * 0.26, dist * 0.82);
    camera.lookAt(0, size.y * 0.42, 0);
  }

  /* ---------- публичное API ---------- */

  function openShopPreview(bikeId) {
    const bike = G.bikeCatalog.find(b => b.id === bikeId) || G.selectedBike();
    const color = bikePaint(bike, G.customColors);
    const key = `${bike.id}:${color}`;
    active = true;
    G.shopPreviewActive = true;
    G.shopPreviewId = bike.id;
    ensureScene();
    if (key !== builtKey) {
      builtKey = key;
      rebuild(bike, color);
    }
  }

  function closeShopPreview() {
    active = false;
    G.shopPreviewActive = false;
    G.shopPreviewId = null;
    builtKey = '';
    lastTime = 0;
    if (renderer && renderer.domElement.parentElement) {
      renderer.domElement.parentElement.removeChild(renderer.domElement);
    }
  }

  function renderShopPreview(now) {
    if (!active) return;
    const container = document.getElementById('shop-preview');
    if (!container) return;
    const w = Math.floor(container.clientWidth);
    const h = Math.floor(container.clientHeight);
    if (w < 8 || h < 8) return;
    const pr = ensureRenderer();
    if (!pr || !scene) return;
    if (document.hidden) {
      lastTime = 0;
      return;
    }

    if (pr.domElement.parentElement !== container) container.appendChild(pr.domElement);
    if (w !== sizeW || h !== sizeH) {
      sizeW = w;
      sizeH = h;
      pr.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    // Вращение не зависит от FPS: оборот идёт по реальному времени.
    const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0;
    lastTime = now;
    if (stage) stage.rotation.y += dt * 0.35;

    pr.render(scene, camera);
  }

  G.openShopPreview = openShopPreview;
  G.closeShopPreview = closeShopPreview;
  G.renderShopPreview = renderShopPreview;
}
