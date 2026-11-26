import * as THREE from 'three';
import { G } from './state.js';

const KEY = 'bajajgo.locationEditor.v1';
const OVERRIDES_KEY = 'bajajgo.locationEditor.overrides.v1';
const TYPES = [
  { id: 'box', label: 'Куб' },
  { id: 'cylinder', label: 'Цилиндр' },
  { id: 'sphere', label: 'Сфера' },
  { id: 'cone', label: 'Конус' },
  { id: 'sign', label: 'Знак' },
];

const CATALOG = [
  { biome: 'Общее', items: [
    { id:'box', label:'Куб', color:'#7aa8c7' }, { id:'cylinder', label:'Цилиндр', color:'#8b8f96' },
    { id:'sphere', label:'Сфера', color:'#8cc3a8' }, { id:'cone', label:'Конус', color:'#d1b06a' }, { id:'sign', label:'Знак', color:'#2f7d4c' },
  ]},
  { biome: 'Город', items: [
    { id:'box', label:'Дом/блок', color:'#8f9399', sx:6, sy:10, sz:6 },
    { id:'box', label:'Тротуар/плита', color:'#9aa0a6', sx:4, sy:0.3, sz:4 },
    { id:'cylinder', label:'Фонарь/столб', color:'#555b63', sx:0.4, sy:3.5, sz:0.4 },
  ]},
  { biome: 'Лес', items: [
    { id:'cylinder', label:'Ствол', color:'#6b4f2a', sx:0.5, sy:3, sz:0.5 },
    { id:'sphere', label:'Крона', color:'#3f7a3f', sx:2.2, sy:2.2, sz:2.2 },
    { id:'cone', label:'Ель', color:'#2f6b3a', sx:1.8, sy:4, sz:1.8 },
  ]},
  { biome: 'Горы', items: [
    { id:'cone', label:'Скала/пик', color:'#7b8088', sx:3, sy:4, sz:3 },
    { id:'box', label:'Барьер', color:'#8a8f96', sx:3, sy:0.8, sz:0.6 },
  ]},
  { biome: 'Набережная', items: [
    { id:'box', label:'Фасад', color:'#8fbfb2', sx:8, sy:12, sz:6 },
    { id:'cylinder', label:'Фонарь', color:'#39424d', sx:0.35, sy:3, sz:0.35 },
    { id:'box', label:'Парапет', color:'#7d8288', sx:4, sy:0.8, sz:0.5 },
  ]},
  { biome: 'МКАД', items: [
    { id:'box', label:'Шумовой экран', color:'#7f8790', sx:8, sy:3, sz:0.4 },
    { id:'cylinder', label:'Мачта', color:'#606873', sx:0.45, sy:4, sz:0.45 },
    { id:'sign', label:'Знак/указатель', color:'#1f6b3f' },
  ]},
];

function uid() { return 'le_' + Math.random().toString(36).slice(2, 10); }
function clamp(v, a, b) { v = Number(v); return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : a; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s) { return escapeHtml(s); }

const normQ = new THREE.Quaternion();
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

function emptyScenePatch() {
  return { pos: [0, 0, 0], scale: [1, 1, 1], rot: [0, 0, 0, 1], hidden: false, label: '' };
}

function normalizeScenePatch(raw) {
  const p = emptyScenePatch();
  if (!raw || typeof raw !== 'object') return p;
  const arr3 = (v, fallback, min, max) => Array.isArray(v) && v.length === 3
    ? v.map((n, i) => clamp(n ?? fallback[i], min, max))
    : fallback.slice();
  p.pos = arr3(raw.pos, p.pos, -10000, 10000);
  p.scale = arr3(raw.scale, p.scale, 0.05, 50);
  if (Array.isArray(raw.rot) && raw.rot.length === 4) {
    normQ.fromArray(raw.rot);
    if (normQ.lengthSq() > 1e-8) { normQ.normalize(); p.rot = normQ.toArray(); }
  }
  p.hidden = !!raw.hidden;
  p.label = typeof raw.label === 'string' ? raw.label.slice(0, 60) : '';
  return p;
}

function vecNear(a, b, eps = 1e-4) {
  return !!a && !!b && Math.abs(a[0]-b[0]) < eps && Math.abs(a[1]-b[1]) < eps && Math.abs(a[2]-b[2]) < eps;
}

function quatNear(a, b, eps = 1e-4) {
  if (!a || !b) return false;
  const dot = Math.abs(a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3]);
  return dot > 1 - eps;
}

function defaultItem(type, pos, extra = {}) {
  return { id: uid(), type, x: pos.x, y: pos.y, z: pos.z, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, color: '#7aa8c7', label: '', ...extra };
}

function makeMesh(item) {
  const color = new THREE.Color(item.color || '#7aa8c7');
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.15 });
  let geo;
  switch (item.type) {
    case 'cylinder': geo = new THREE.CylinderGeometry(0.6, 0.6, 1.6, 16); break;
    case 'sphere': geo = new THREE.SphereGeometry(0.8, 18, 14); break;
    case 'cone': geo = new THREE.ConeGeometry(0.8, 1.8, 16); break;
    case 'sign': {
      const group = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 2.4, 10), new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.6 }));
      pole.position.y = 1.2;
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 0.08), mat);
      board.position.y = 2.5;
      group.add(pole, board);
      group.userData.boardMat = mat;
      return group;
    }
    case 'box':
    default: geo = new THREE.BoxGeometry(1.4, 1.4, 1.4); break;
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

function applyTransform(obj, item) {
  obj.position.set(Number(item.x) || 0, Number(item.y) || 0, Number(item.z) || 0);
  obj.rotation.set(Number(item.rx) || 0, Number(item.ry) || 0, Number(item.rz) || 0);
  obj.scale.set(clamp(item.sx, 0.05, 50), clamp(item.sy, 0.05, 50), clamp(item.sz, 0.05, 50));
}

export function initLocationEditor() {
  let items = [];
  let selectedId = null;
  let tool = 'select'; // select | move | rotate | tilt | scale
  let catalogOpen = true;
  const group = new THREE.Group();
  group.name = 'location-editor';
  G.scene.add(group);
  const byId = new Map();

  const editorCam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 5000);
  editorCam.position.set(0, 180, 0);
  G.editorCamera = editorCam;

  let active = false, rootEl = null;
  let camTarget = new THREE.Vector3(0, 0, 0);
  let camHeight = 180, camYaw = 0, camPitch = -1.25;
  let dragging = false, dragLast = null, keys = {};
  let moveDragging = false, movePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let rotateDragging = false, scaleDragging = false, transformDrag = null;
  let sceneDrag = null;
  let selectionBox = null, selectionRing = null;
  let hiddenUi = [];
  let selectedSceneKey = null;
  let overrides = {};
  const overrideRuntime = new Map();
  const qA = new THREE.Quaternion(), qB = new THREE.Quaternion();
  let raycaster = new THREE.Raycaster();
  let pointer = new THREE.Vector2();

  function save() { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {} }
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (Array.isArray(raw)) items = raw.filter(x => x && typeof x === 'object').map(x => ({
        id: String(x.id || uid()),
        type: TYPES.some(t => t.id === x.type) ? x.type : 'box',
        x: Number(x.x) || 0, y: Number(x.y) || 0, z: Number(x.z) || 0,
        rx: Number(x.rx) || 0, ry: Number(x.ry) || 0, rz: Number(x.rz) || 0,
        sx: clamp(x.sx ?? 1, 0.05, 50), sy: clamp(x.sy ?? 1, 0.05, 50), sz: clamp(x.sz ?? 1, 0.05, 50),
        color: typeof x.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(x.color) ? x.color : '#7aa8c7',
        label: typeof x.label === 'string' ? x.label.slice(0, 60) : ''
      }));
    } catch { items = []; }
  }

  function saveOverrides() {
    try { localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides)); } catch {}
  }

  function loadOverrides() {
    try {
      const raw = JSON.parse(localStorage.getItem(OVERRIDES_KEY) || '{}');
      overrides = {};
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [key, patch] of Object.entries(raw)) {
          if (typeof key === 'string' && key) overrides[key] = normalizeScenePatch(patch);
        }
      }
    } catch { overrides = {}; }
  }

  function keyForSceneRoot(obj) {
    const slots = G.roadsideSlots || [];
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (obj === s.leftLamp) return `roadside:${i}:leftLamp`;
      if (obj === s.rightLamp) return `roadside:${i}:rightLamp`;
      if (obj === s.leftProp) return `roadside:${i}:leftProp`;
      if (obj === s.rightProp) return `roadside:${i}:rightProp`;
      if (s.billboard && obj === s.billboard.group) return `roadside:${i}:billboard`;
      if (s.portal && obj === s.portal.group) return `roadside:${i}:portal`;
    }
    const scenery = G.biomeScenery || [];
    for (let i = 0; i < scenery.length; i++) {
      const slot = scenery[i];
      for (const entry of slot.left || []) if (obj === entry.group) return `scenery:${i}:L:${entry.biome}`;
      for (const entry of slot.right || []) if (obj === entry.group) return `scenery:${i}:R:${entry.biome}`;
    }
    const mega = G.megaStructures || [];
    const mi = mega.indexOf(obj);
    if (mi >= 0) return `mega:${mi}`;
    const peds = G.pedestrians || [];
    for (let i = 0; i < peds.length; i++) if (peds[i]?.group === obj) return `ped:${i}`;
    return null;
  }

  function sceneRootForObject(obj) {
    let cur = obj;
    while (cur) {
      const key = keyForSceneRoot(cur);
      if (key) return { key, obj: cur };
      if (cur === G.scene || cur === group) break;
      cur = cur.parent;
    }
    return null;
  }

  function findSceneObjectByKey(key) {
    const parts = String(key || '').split(':');
    const idx = Number(parts[1]);
    if (parts[0] === 'roadside' && Number.isFinite(idx)) {
      const s = G.roadsideSlots?.[idx];
      if (!s) return null;
      if (parts[2] === 'leftLamp') return s.leftLamp;
      if (parts[2] === 'rightLamp') return s.rightLamp;
      if (parts[2] === 'leftProp') return s.leftProp;
      if (parts[2] === 'rightProp') return s.rightProp;
      if (parts[2] === 'billboard') return s.billboard?.group || null;
      if (parts[2] === 'portal') return s.portal?.group || null;
      return null;
    }
    if (parts[0] === 'scenery' && Number.isFinite(idx)) {
      const slot = G.biomeScenery?.[idx];
      if (!slot) return null;
      const list = parts[2] === 'L' ? slot.left : parts[2] === 'R' ? slot.right : null;
      if (!list) return null;
      const biome = Number(parts[3]);
      return list.find(e => Number(e.biome) === biome)?.group || null;
    }
    if (parts[0] === 'mega' && Number.isFinite(idx)) return G.megaStructures?.[idx] || null;
    if (parts[0] === 'ped' && Number.isFinite(idx)) return G.pedestrians?.[idx]?.group || null;
    return null;
  }

  function scenePatch(key, create = false) {
    if (!overrides[key] && create) overrides[key] = emptyScenePatch();
    return overrides[key] || null;
  }

  function applyOverrideFor(key, patch, force = false) {
    if (!key || !patch) return;
    const obj = findSceneObjectByKey(key);
    if (!obj) return;
    let rt = overrideRuntime.get(key);
    const cur = {
      p: obj.position.toArray(), q: obj.quaternion.toArray(),
      s: obj.scale.toArray(), v: obj.visible
    };
    const sameAsApplied = rt?.applied && vecNear(cur.p, rt.applied.p) && quatNear(cur.q, rt.applied.q)
      && vecNear(cur.s, rt.applied.s) && cur.v === rt.applied.v;
    if (!rt || (!force && !sameAsApplied)) {
      rt = { base: { p: cur.p, q: cur.q, s: cur.s, v: cur.v }, applied: null };
    }
    obj.position.set(
      rt.base.p[0] + patch.pos[0],
      rt.base.p[1] + patch.pos[1],
      rt.base.p[2] + patch.pos[2]
    );
    qA.fromArray(rt.base.q).multiply(qB.fromArray(patch.rot));
    obj.quaternion.copy(qA);
    obj.scale.set(
      clamp(rt.base.s[0] * patch.scale[0], 0.01, 500),
      clamp(rt.base.s[1] * patch.scale[1], 0.01, 500),
      clamp(rt.base.s[2] * patch.scale[2], 0.01, 500)
    );
    obj.visible = !!rt.base.v && !patch.hidden;
    rt.applied = { p: obj.position.toArray(), q: obj.quaternion.toArray(), s: obj.scale.toArray(), v: obj.visible };
    overrideRuntime.set(key, rt);
  }

  function applyOverrides() {
    for (const [key, patch] of Object.entries(overrides)) applyOverrideFor(key, patch);
  }

  function clearSceneOverride(key) {
    const rt = overrideRuntime.get(key);
    const obj = findSceneObjectByKey(key);
    if (rt && obj) {
      obj.position.fromArray(rt.base.p);
      obj.quaternion.fromArray(rt.base.q);
      obj.scale.fromArray(rt.base.s);
      obj.visible = rt.base.v;
    }
    delete overrides[key];
    overrideRuntime.delete(key);
    saveOverrides();
  }

  function rebuild() {
    disposeSelectionHelpers();
    for (const entry of byId.values()) {
      group.remove(entry.obj);
      entry.obj.traverse?.(n => { if (n.geometry) n.geometry.dispose(); if (n.material) { if (Array.isArray(n.material)) n.material.forEach(m=>m.dispose()); else n.material.dispose(); } });
    }
    byId.clear();
    for (const item of items) {
      const obj = makeMesh(item);
      applyTransform(obj, item);
      obj.userData.editorId = item.id;
      group.add(obj);
      byId.set(item.id, { item, obj });
    }
    syncSelectionVisual(); renderUI();
  }

  function disposeSelectionHelpers() {
    for (const helper of [selectionBox, selectionRing]) {
      if (!helper) continue;
      G.scene.remove(helper);
      helper.geometry?.dispose?.();
      if (Array.isArray(helper.material)) helper.material.forEach(m => m.dispose?.());
      else helper.material?.dispose?.();
    }
    selectionBox = null;
    selectionRing = null;
  }

  function selectionSource() {
    if (selectedSceneKey) {
      const obj = findSceneObjectByKey(selectedSceneKey);
      if (!obj) return null;
      return { kind: 'scene', obj, key: selectedSceneKey, item: overrides[selectedSceneKey] || emptyScenePatch() };
    }
    const entry = byId.get(selectedId);
    if (!entry) return null;
    return { kind: 'editor', obj: entry.obj, id: selectedId, item: entry.item };
  }

  function updateSelectionHelpers() {
    const src = active ? selectionSource() : null;
    if (!src) { disposeSelectionHelpers(); return; }
    if (!selectionBox || selectionBox.object !== src.obj) {
      disposeSelectionHelpers();
      selectionBox = new THREE.BoxHelper(src.obj, 0x6fd3ff);
      selectionBox.material.depthTest = false;
      selectionBox.material.transparent = true;
      selectionBox.material.opacity = 0.95;
      selectionBox.renderOrder = 999;
      selectionBox.userData.leHelper = true;
      G.scene.add(selectionBox);

      selectionRing = new THREE.Mesh(
        new THREE.RingGeometry(1.05, 1.22, 40),
        new THREE.MeshBasicMaterial({
          color: 0x6fd3ff, transparent: true, opacity: 0.8,
          side: THREE.DoubleSide, depthTest: false
        })
      );
      selectionRing.rotation.x = -Math.PI / 2;
      selectionRing.renderOrder = 998;
      selectionRing.userData.leHelper = true;
      G.scene.add(selectionRing);
    }
    selectionBox.update();
    if (src.kind === 'editor') {
      const item = src.item;
      const radius = Math.max(0.6, Math.max(Number(item.sx) || 1, Number(item.sz) || 1) * 0.9);
      selectionRing.position.set(Number(item.x) || 0, Math.max(0.08, (Number(item.y) || 0) + 0.06), Number(item.z) || 0);
      selectionRing.scale.set(radius, radius, 1);
    } else {
      const box = new THREE.Box3().setFromObject(src.obj);
      const size = new THREE.Vector3(); box.getSize(size);
      const radius = Math.max(0.6, Math.max(size.x, size.z) * 0.7);
      selectionRing.position.set(src.obj.position.x, Math.max(0.08, src.obj.position.y + 0.06), src.obj.position.z);
      selectionRing.scale.set(radius, radius, 1);
    }
  }

  function syncSelectionVisual() {
    for (const [id, entry] of byId.entries()) {
      const on = id === selectedId;
      entry.obj.traverse?.(n => {
        if (n.isMesh && n.material && n.material.emissive) {
          n.material.emissive.set(on ? 0x446688 : 0x000000);
          n.material.emissiveIntensity = on ? 0.45 : 0;
        }
      });
    }
    updateSelectionHelpers();
  }

  function typeLabel(type) {
    return TYPES.find(t => t.id === type)?.label || String(type || 'box');
  }

  function selected() { return selectedSceneKey ? null : items.find(i => i.id === selectedId) || null; }
  function select(id) {
    selectedSceneKey = null;
    selectedId = id;
    syncSelectionVisual(); renderUI();
  }
  function selectScene(key) {
    if (!findSceneObjectByKey(key)) return;
    selectedId = null;
    selectedSceneKey = key;
    syncSelectionVisual(); renderUI();
  }

  function sceneBase(key) {
    return overrideRuntime.get(key)?.base || {
      p: findSceneObjectByKey(key)?.position.toArray() || [0, 0, 0],
      q: findSceneObjectByKey(key)?.quaternion.toArray() || [0, 0, 0, 1],
      s: findSceneObjectByKey(key)?.scale.toArray() || [1, 1, 1]
    };
  }

  function updateSceneOverride(key, patchPart) {
    const patch = scenePatch(key, true);
    if (!patch) return;
    Object.assign(patch, patchPart);
    applyOverrideFor(key, patch, true);
    saveOverrides();
    if (key === selectedSceneKey) { syncSelectionVisual(); renderUI(); }
  }

  function updateSceneSelected(patchPart) {
    if (!selectedSceneKey) return;
    updateSceneOverride(selectedSceneKey, patchPart);
  }

  function setSceneRotation(axis, angle, baseRot) {
    if (!selectedSceneKey) return;
    qA.fromArray(baseRot || scenePatch(selectedSceneKey, true)?.rot || [0, 0, 0, 1]);
    qB.setFromAxisAngle(axis, angle);
    qA.multiply(qB);
    updateSceneSelected({ rot: qA.toArray() });
  }

  function setSceneTilt(baseRot, rx, rz) {
    if (!selectedSceneKey) return;
    qA.fromArray(baseRot);
    qB.setFromEuler(new THREE.Euler(rx, 0, rz, 'YXZ'));
    qA.multiply(qB);
    updateSceneSelected({ rot: qA.toArray() });
  }

  function rotateSceneSelected(axis, angle) {
    if (!selectedSceneKey) return;
    const patch = scenePatch(selectedSceneKey, true);
    if (!patch) return;
    qB.fromArray(patch.rot).multiply(qA.setFromAxisAngle(axis, angle));
    updateSceneSelected({ rot: qB.toArray() });
  }

  function restoreSceneBases() {
    for (const [key, rt] of overrideRuntime) {
      const obj = findSceneObjectByKey(key);
      if (!obj) continue;
      obj.position.fromArray(rt.base.p);
      obj.quaternion.fromArray(rt.base.q);
      obj.scale.fromArray(rt.base.s);
      obj.visible = rt.base.v;
    }
    overrideRuntime.clear();
  }

  function toggleSceneHidden() {
    if (!selectedSceneKey) return;
    const patch = scenePatch(selectedSceneKey, true);
    patch.hidden = !patch.hidden;
    applyOverrideFor(selectedSceneKey, patch, true);
    saveOverrides(); syncSelectionVisual(); renderUI();
  }

  function cloneSceneSelection() {
    if (!selectedSceneKey) return;
    const obj = findSceneObjectByKey(selectedSceneKey);
    if (obj) cloneSceneObjectToEditor(obj, obj.position);
    selectedSceneKey = null;
    syncSelectionVisual(); renderUI();
  }

  function addObject(type, extra = {}) {
    const p = camTarget.clone(); p.y = Math.max(0, p.y);
    const item = defaultItem(type, { x: p.x, y: p.y, z: p.z }, extra);
    items.push(item);
    const obj = makeMesh(item); applyTransform(obj, item);
    obj.userData.editorId = item.id; group.add(obj);
    byId.set(item.id, { item, obj });
    selectedId = item.id; save(); syncSelectionVisual(); renderUI();
  }

  function updateSelected(patch) {
    const item = selected(); if (!item) return;
    Object.assign(item, patch);
    const entry = byId.get(item.id);
    if (entry) {
      if (patch.color !== undefined) entry.obj.traverse?.(n => { if (n.isMesh && n.material?.color) n.material.color.set(item.color); });
      applyTransform(entry.obj, item);
    }
    save(); syncSelectionVisual(); renderUI();
  }

  function deleteSelected() {
    const id = selectedId; if (!id) return;
    const idx = items.findIndex(i => i.id === id);
    if (idx >= 0) items.splice(idx, 1);
    const entry = byId.get(id);
    if (entry) { group.remove(entry.obj); entry.obj.traverse?.(n => { if (n.geometry) n.geometry.dispose(); if (n.material) { if (Array.isArray(n.material)) n.material.forEach(m=>m.dispose()); else n.material.dispose(); } }); byId.delete(id); }
    selectedId = items[idx]?.id || items[idx - 1]?.id || null;
    save(); syncSelectionVisual(); renderUI();
  }

  function duplicateSelected() {
    const item = selected(); if (!item) return;
    const copy = { ...item, id: uid(), x: item.x + 1.5, z: item.z + 1.5, label: item.label ? item.label + ' copy' : '' };
    items.push(copy);
    const obj = makeMesh(copy); applyTransform(obj, copy); obj.userData.editorId = copy.id; group.add(obj);
    byId.set(copy.id, { item: copy, obj }); selectedId = copy.id; save(); syncSelectionVisual(); renderUI();
  }

  function exportJson() {
    const data = JSON.stringify({ version: 2, items, overrides }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'bajajgo-location-editor.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importJson() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        const raw = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.items) ? parsed.items : null);
        if (!raw) throw new Error('JSON должен быть массивом или {items:[...]}');
        items = raw.filter(x => x && typeof x === 'object').map(x => ({
          id: String(x.id || uid()), type: TYPES.some(t => t.id === x.type) ? x.type : 'box',
          x: Number(x.x) || 0, y: Number(x.y) || 0, z: Number(x.z) || 0,
          rx: Number(x.rx) || 0, ry: Number(x.ry) || 0, rz: Number(x.rz) || 0,
          sx: clamp(x.sx ?? 1, 0.05, 50), sy: clamp(x.sy ?? 1, 0.05, 50), sz: clamp(x.sz ?? 1, 0.05, 50),
          color: typeof x.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(x.color) ? x.color : '#7aa8c7',
          label: typeof x.label === 'string' ? x.label.slice(0, 60) : ''
        }));
        restoreSceneBases();
        overrides = {};
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.overrides && typeof parsed.overrides === 'object' && !Array.isArray(parsed.overrides)) {
          for (const [key, patch] of Object.entries(parsed.overrides)) {
            if (typeof key === 'string' && key) overrides[key] = normalizeScenePatch(patch);
          }
        }
        selectedSceneKey = null;
        selectedId = items[0]?.id || null;
        rebuild(); save(); saveOverrides(); applyOverrides();
      } catch (e) { alert('Ошибка импорта: ' + (e?.message || e)); }
    };
    input.click();
  }

  function findBiomeS(biomeId) {
    const biomes = G.BIOMES || [];
    const idx = biomes.findIndex(b => b.id === biomeId);
    if (idx < 0) return G.playerS || 0;
    const start = Math.max(0, (G.playerS || 0) - 200);
    for (let s = start; s < start + 12000; s += 40) {
      if (G.biomeWeightsAtS) {
        const w = G.biomeWeightsAtS(s); let dom = 0, best = -1;
        for (let i = 0; i < w.length; i++) if (w[i] > best) { best = w[i]; dom = i; }
        if (dom === idx && best > 0.55) return s;
      }
    }
    return G.playerS || 0;
  }

  function teleportToS(s) { const pose = G.embedRoad ? G.embedRoad(s, 0) : null; camTarget.set(pose ? pose.x : 0, 0, pose ? pose.z : s); }
  function teleportToBiome(id) { teleportToS(findBiomeS(id)); renderUI(); }
  function teleportToPlayer() { if (G.bikeRoot) camTarget.set(G.bikeRoot.position.x, 0, G.bikeRoot.position.z); else teleportToS(G.playerS || 0); renderUI(); }

  function updateEditorCam() {
    const h = clamp(camHeight, 20, 1200); camHeight = h;
    const back = Math.cos(camPitch) * h * 0.35;
    const up = Math.sin(-camPitch) * h;
    editorCam.position.set(camTarget.x + Math.sin(camYaw) * back, Math.max(15, up), camTarget.z + Math.cos(camYaw) * back);
    editorCam.lookAt(camTarget.x, 0, camTarget.z);
  }

  function pickAt(clientX, clientY) {
    const rect = G.renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, editorCam);
    // First check editor objects
    const hits = raycaster.intersectObjects(group.children, true);
    for (const hit of hits) {
      let o = hit.object;
      while (o && !o.userData.editorId && o.parent) o = o.parent;
      if (o?.userData.editorId) return { type: 'editor', id: o.userData.editorId, hit };
    }
    // Затем редактируемые объекты самой игры (по стабильному ключу слота).
    const sceneHits = raycaster.intersectObjects(G.scene.children, true);
    for (const hit of sceneHits) {
      let o = hit.object;
      if (o.isInstancedMesh || o === G.camera || o === editorCam || o === G.bikeRoot || o.userData?.leHelper) continue;
      let inEditor = false, cur = o;
      while (cur) {
        if (cur === group || cur.userData?.leHelper) { inEditor = true; break; }
        cur = cur.parent;
      }
      if (inEditor) continue;
      const found = sceneRootForObject(o);
      if (found) return { type: 'scene', key: found.key, object: found.obj, hit };
    }
    return null;
  }

  function cloneSceneObjectToEditor(obj, hitPoint) {
    const p = hitPoint || camTarget;
    const item = defaultItem('box', { x: p.x, y: p.y, z: p.z });
    item.label = 'clone';
    // try to estimate size/color
    try {
      const box = new THREE.Box3().setFromObject(obj);
      const size = new THREE.Vector3(); box.getSize(size);
      const center = new THREE.Vector3(); box.getCenter(center);
      item.x = center.x; item.y = Math.max(0, center.y - size.y / 2); item.z = center.z;
      item.sx = clamp(size.x / 1.4, 0.05, 50); item.sy = clamp(size.y / 1.4, 0.05, 50); item.sz = clamp(size.z / 1.4, 0.05, 50);
      const mat = obj.material;
      const c = (Array.isArray(mat) ? mat[0] : mat)?.color;
      if (c) item.color = '#' + c.getHexString();
    } catch {}
    items.push(item);
    const mesh = makeMesh(item); applyTransform(mesh, item); mesh.userData.editorId = item.id; group.add(mesh);
    byId.set(item.id, { item, obj: mesh }); selectedId = item.id; save(); syncSelectionVisual(); renderUI();
  }

  function onWheel(e) { if (!active) return; e.preventDefault(); camHeight = clamp(camHeight * (e.deltaY > 0 ? 1.08 : 0.92), 20, 1200); }
  function onPointerDown(e) {
    if (!active) return; if (e.target.closest?.('.le-ui')) return;
    const pick = pickAt(e.clientX, e.clientY);
    if (pick?.type === 'editor') {
      sceneDrag = null;
      select(pick.id);
      const item = selected();
      if (tool === 'move') {
        moveDragging = true;
        movePlane.set(new THREE.Vector3(0, 1, 0), -(item?.y || 0));
      } else if (tool === 'rotate' || tool === 'tilt') {
        rotateDragging = true;
        transformDrag = {
          x: e.clientX, y: e.clientY, mode: tool,
          rx: Number(item?.rx) || 0, ry: Number(item?.ry) || 0, rz: Number(item?.rz) || 0
        };
      } else if (tool === 'scale') {
        scaleDragging = true;
        transformDrag = {
          x: e.clientX,
          sx: Number(item?.sx) || 1, sy: Number(item?.sy) || 1, sz: Number(item?.sz) || 1
        };
      }
      return;
    }
    if (pick?.type === 'scene') {
      const key = pick.key || keyForSceneRoot(pick.object);
      if (!key) return;
      selectScene(key);
      if (tool === 'select') return;
      const base = sceneBase(key);
      const patch = overrides[key] || emptyScenePatch();
      if (tool === 'move') movePlane.set(new THREE.Vector3(0, 1, 0), -base.p[1]);
      sceneDrag = {
        key, mode: tool, x: e.clientX, y: e.clientY,
        base: { p: base.p.slice(), q: base.q.slice(), s: base.s.slice() },
        rot: patch.rot.slice()
      };
      return;
    }
    sceneDrag = null;
    dragging = true; dragLast = { x: e.clientX, y: e.clientY };
  }
  function onPointerMove(e) {
    if (!active) return;
    if (sceneDrag) {
      const key = sceneDrag.key;
      if (tool === 'move' && sceneDrag.mode === 'move') {
        const rect = G.renderer.domElement.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, editorCam);
        const pt = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(movePlane, pt)) {
          updateSceneOverride(key, {
            pos: [pt.x - sceneDrag.base.p[0], pt.y - sceneDrag.base.p[1], pt.z - sceneDrag.base.p[2]]
          });
        }
        return;
      }
      if (tool === 'scale' && sceneDrag.mode === 'scale') {
        const factor = clamp(Math.exp((e.clientX - sceneDrag.x) * 0.006), 0.02, 50);
        let scale = [factor, factor, factor];
        if (e.shiftKey) scale = [factor, 1, 1];
        else if (e.altKey) scale = [1, factor, 1];
        else if (e.ctrlKey || e.metaKey) scale = [1, 1, factor];
        updateSceneOverride(key, { scale });
        return;
      }
      if (tool === 'rotate' && sceneDrag.mode === 'rotate') {
        const axis = e.shiftKey ? AXIS_X : e.altKey ? AXIS_Z : AXIS_Y;
        qB.setFromAxisAngle(axis, (e.clientX - sceneDrag.x) * 0.012);
        qA.fromArray(sceneDrag.rot).multiply(qB);
        updateSceneOverride(key, { rot: qA.toArray() });
        return;
      }
      if (tool === 'tilt' && sceneDrag.mode === 'tilt') {
        setSceneTilt(sceneDrag.rot, (e.clientY - sceneDrag.y) * 0.012, (e.clientX - sceneDrag.x) * 0.012);
        return;
      }
      return;
    }
    if (scaleDragging && selectedId && transformDrag) {
      const factor = Math.exp((e.clientX - transformDrag.x) * 0.006);
      const next = (v) => clamp(v * factor, 0.05, 50);
      const patch = {};
      if (e.shiftKey) patch.sx = next(transformDrag.sx);
      else if (e.ctrlKey || e.metaKey) patch.sz = next(transformDrag.sz);
      else if (e.altKey) patch.sy = next(transformDrag.sy);
      else {
        patch.sx = next(transformDrag.sx);
        patch.sy = next(transformDrag.sy);
        patch.sz = next(transformDrag.sz);
      }
      updateSelected(patch);
      return;
    }
    if (rotateDragging && selectedId && transformDrag) {
      const dx = e.clientX - transformDrag.x, dy = e.clientY - transformDrag.y;
      if (transformDrag.mode === 'rotate') updateSelected({ ry: transformDrag.ry + dx * 0.012 });
      else updateSelected({ rx: transformDrag.rx + dy * 0.012, rz: transformDrag.rz + dx * 0.012 });
      return;
    }
    if (moveDragging && selectedId) {
      const rect = G.renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, editorCam);
      const pt = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(movePlane, pt)) updateSelected({ x: pt.x, z: pt.z });
      return;
    }
    if (!dragging || !dragLast) {
      if (!e.target.closest?.('.le-ui')) {
        const pick = pickAt(e.clientX, e.clientY);
        const cursor = pick?.type === 'editor' || pick?.type === 'scene' ? (tool === 'select' ? 'pointer' : 'grab') : 'default';
        G.renderer.domElement.style.cursor = cursor;
      }
      return;
    }
    const dx = e.clientX - dragLast.x, dy = e.clientY - dragLast.y;
    dragLast = { x: e.clientX, y: e.clientY };
    const panScale = camHeight * 0.0022;
    const cos = Math.cos(camYaw), sin = Math.sin(camYaw);
    camTarget.x -= (dx * cos - dy * sin) * panScale;
    camTarget.z -= (dx * sin + dy * cos) * panScale;
  }
  function onPointerUp() {
    dragging = false; dragLast = null;
    moveDragging = false; rotateDragging = false; scaleDragging = false; transformDrag = null; sceneDrag = null;
    G.renderer.domElement.style.cursor = 'default';
  }
  function keyCode(e) {
    if (e.code) return e.code;
    const k = String(e.key || '').toLowerCase();
    const letters = { w:'KeyW', a:'KeyA', s:'KeyS', d:'KeyD', q:'KeyQ', e:'KeyE', c:'KeyC', f:'KeyF', v:'KeyV', g:'KeyG', b:'KeyB', t:'KeyT', r:'KeyR' };
    if (letters[k]) return letters[k];
    if (k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright') return k.replace('arrow', 'Arrow');
    return e.key;
  }

  function onKeyDown(e) {
    const code = keyCode(e);
    keys[code] = true;
    if (!active) return;
    if (e.target && ['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
    if (code === 'Escape' || e.key === 'Escape') { closeEditor(); e.preventDefault(); return; }
    if ((e.ctrlKey || e.metaKey) && (code === 'KeyD' || e.key?.toLowerCase() === 'd')) {
      if (selectedSceneKey) cloneSceneSelection();
      else duplicateSelected();
      e.preventDefault(); return;
    }
    if (code === 'KeyV') { tool = 'select'; renderUI(); return; }
    if (code === 'KeyG') { tool = 'move'; renderUI(); return; }
    if (code === 'KeyB') { tool = 'scale'; renderUI(); return; }
    if (code === 'KeyT') { tool = 'tilt'; renderUI(); return; }
    if (code === 'KeyR') {
      if (selectedSceneKey) { rotateSceneSelected(AXIS_Y, Math.PI / 12); e.preventDefault(); }
      else {
        const item = selected();
        if (item) { updateSelected({ ry: (Number(item.ry) || 0) + Math.PI / 12 }); e.preventDefault(); }
      }
    }
    if (code === 'Delete' || code === 'Backspace' || e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedSceneKey) { toggleSceneHidden(); e.preventDefault(); }
      else if (selected()) { deleteSelected(); e.preventDefault(); }
    }
  }
  function onKeyUp(e) { keys[keyCode(e)] = false; }

  let editorS = G.playerS || 0;
  function nearestSForPoint(x, z) {
    let bestS = editorS, bestD = Infinity;
    for (let s = editorS - 1200; s <= editorS + 1200; s += 80) { const p = G.embedRoad ? G.embedRoad(s, 0) : null; if (!p) continue; const d = (p.x-x)*(p.x-x)+(p.z-z)*(p.z-z); if (d < bestD) { bestD=d; bestS=s; } }
    for (let s = bestS - 120; s <= bestS + 120; s += 10) { const p = G.embedRoad ? G.embedRoad(s, 0) : null; if (!p) continue; const d = (p.x-x)*(p.x-x)+(p.z-z)*(p.z-z); if (d < bestD) { bestD=d; bestS=s; } }
    return bestS;
  }

  G.updateLocationEditor = (dt) => {
    if (!active) return;
    const speed = (camHeight * 0.8) * dt;
    const cos = Math.cos(camYaw), sin = Math.sin(camYaw);
    let mx = 0, mz = 0;
    if (keys['KeyW'] || keys['ArrowUp']) mz -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) mz += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) mx -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) mx += 1;
    if (mx || mz) { camTarget.x += (mx*cos - mz*sin)*speed; camTarget.z += (mx*sin + mz*cos)*speed; }
    if (keys['KeyQ']) camYaw -= dt * 1.2;
    if (keys['KeyE']) camYaw += dt * 1.2;
    if (keys['KeyF']) camHeight = clamp(camHeight + speed * 40, 20, 1200);
    if (keys['KeyC']) camHeight = clamp(camHeight - speed * 40, 20, 1200);

    editorS = nearestSForPoint(camTarget.x, camTarget.z);
    const savedS = G.playerS; G.playerS = editorS;
    if (G.updateBiome) G.updateBiome(0);
    if (G.updateRoadSurface) G.updateRoadSurface(editorS);
    if (G.updateGround) G.updateGround(editorS);
    if (G.updateAtmosphereAndTimeOfDay) G.updateAtmosphereAndTimeOfDay(0, editorS);
    if (G.updateRoadside) G.updateRoadside();
    if (G.updateMegaStructures) G.updateMegaStructures(0);
    if (G.updateForest) G.updateForest();
    if (G.updateMountain) G.updateMountain();
    if (G.updateEmbankment) G.updateEmbankment(0);
    if (G.updateCableBridge) G.updateCableBridge(0);
    G.playerS = savedS;
    updateEditorCam();
  };

  G.onEditorResize = (w, h) => { editorCam.aspect = w / h; editorCam.updateProjectionMatrix(); };

  function hideHostUi() {
    hiddenUi = [];
    const ids = ['overlay', 'hud', 'debug-dock', 'tilt-overlay', 'controls', 'jump-live', 'badge-beam', 'badge-oncoming'];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;
      hiddenUi.push({ el, display: el.style.display, hidden: el.hidden });
      el.style.display = 'none';
    }
  }

  function restoreHostUi() {
    for (const rec of hiddenUi) {
      rec.el.style.display = rec.display;
      if (rec.hidden !== undefined) rec.el.hidden = rec.hidden;
    }
    hiddenUi = [];
  }

  function closeEditor() {
    if (!active) return;
    active = false; G.locationEditorActive = false;
    dragging = false; dragLast = null;
    moveDragging = false; rotateDragging = false; scaleDragging = false; transformDrag = null; sceneDrag = null; keys = {};
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    disposeSelectionHelpers();
    if (rootEl) { rootEl.remove(); rootEl = null; }
    G.renderer.domElement.style.cursor = 'default';
    restoreHostUi();
  }

  function numInput(label, k, v, step) { return `<label class="le-num"><span>${label}</span><input data-k="${k}" type="number" step="${step}" value="${Number(v).toFixed(3)}"></label>`; }
  function sceneNumInput(label, kk, v, step) { return `<label class="le-num"><span>${label}</span><input data-sk="${escapeAttr(selectedSceneKey)}" data-kk="${kk}" type="number" step="${step}" value="${Number(v).toFixed(3)}"></label>`; }
  function deg(v) { return (Number(v) || 0) * 180 / Math.PI; }
  function rad(v) { return (Number(v) || 0) * Math.PI / 180; }
  function sceneEuler(patch) {
    const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(patch.rot), 'YXZ');
    return [deg(e.x), deg(e.y), deg(e.z)];
  }

  function renderUI() {
    if (!rootEl) return;
    const sel = selected();
    const biomes = (G.BIOMES || []).map(b => `<button class="le-loc" data-loc="${escapeAttr(b.id)}">${escapeHtml(b.name || b.id)}</button>`).join('');
    const listHtml = items.map(it => {
      const on = it.id === selectedId;
      const name = it.label ? escapeHtml(it.label) : typeLabel(it.type);
      return `<button class="le-item ${on ? 'is-on' : ''}" data-sel="${it.id}"><span>${name}${it.label ? ` <small>${escapeHtml(typeLabel(it.type))}</small>` : ''}</span><small>${Number(it.x).toFixed(1)}, ${Number(it.y).toFixed(1)}, ${Number(it.z).toFixed(1)}</small></button>`;
    }).join('');

    const catalogHtml = CATALOG.map(cat => `
      <div class="le-cat">
        <div class="le-cat-name">${escapeHtml(cat.biome)}</div>
        <div class="le-adds">${cat.items.map((it, i) => `<button data-cat="${escapeAttr(cat.biome)}" data-cati="${i}">+ ${escapeHtml(it.label)}</button>`).join('')}</div>
      </div>`).join('');

    const selHtml = sel ? `
      <div class="le-sec">
        <div class="le-sec-title">Выбранный объект</div>
        <div class="le-row"><label>Тип</label><b>${escapeHtml(typeLabel(sel.type))}</b></div>
        <div class="le-row"><label>Метка</label><input data-k="label" value="${escapeAttr(sel.label || '')}" maxlength="60"></div>
        <div class="le-row"><label>Цвет</label><input data-k="color" type="color" value="${escapeAttr(sel.color || '#7aa8c7')}"></div>
        <div class="le-sec-title">Позиция</div>
        <div class="le-grid">
          ${numInput('X','x',sel.x,0.5)}${numInput('Y','y',sel.y,0.5)}${numInput('Z','z',sel.z,0.5)}
        </div>
        <div class="le-sec-title">Размер (масштаб)</div>
        <div class="le-grid">
          ${numInput('Ширина','sx',sel.sx,0.1)}${numInput('Высота','sy',sel.sy,0.1)}${numInput('Глубина','sz',sel.sz,0.1)}
        </div>
        <div class="le-sec-title">Поворот / наклон (градусы)</div>
        <div class="le-grid">
          ${numInput('RX','rxDeg',deg(sel.rx),1)}${numInput('RY','ryDeg',deg(sel.ry),1)}${numInput('RZ','rzDeg',deg(sel.rz),1)}
        </div>
        <div class="le-hint">Инструмент «Размер»: тяните объект мышью. Shift — только ширина, Alt — высота, Ctrl — глубина.</div>
        <div class="le-actions"><button data-act="dup">Дублировать</button><button data-act="del" class="danger">Удалить</button></div>
      </div>` : `<div class="le-sec le-empty">Объект не выбран. Кликните по объекту редактора или по строке в списке — он выделится рамкой.</div>`;

    const sceneObj = selectedSceneKey ? findSceneObjectByKey(selectedSceneKey) : null;
    const sceneP = sceneObj ? (overrides[selectedSceneKey] || emptyScenePatch()) : null;
    const sceneE = sceneP ? sceneEuler(sceneP) : [0, 0, 0];
    const sceneHtml = sceneP ? `
      <div class="le-sec">
        <div class="le-sec-title">Объект карты</div>
        <div class="le-row"><label>Ключ</label><code class="le-key">${escapeHtml(selectedSceneKey)}</code></div>
        <div class="le-hint">Правки применяются к существующему объекту на карте. Delete скрывает его, не удаляя из сцены. Изменения сохраняются между перезапусками. Доступны объекты дорог, декораций биомов, мостов и пешеходов; инстансные леса и горы пока не редактируются.</div>
        <div class="le-sec-title">Смещение от исходной позиции (м)</div>
        <div class="le-grid">
          ${sceneNumInput('X','px',sceneP.pos[0],0.5)}${sceneNumInput('Y','py',sceneP.pos[1],0.5)}${sceneNumInput('Z','pz',sceneP.pos[2],0.5)}
        </div>
        <div class="le-sec-title">Масштаб к исходному</div>
        <div class="le-grid">
          ${sceneNumInput('Ширина','sx',sceneP.scale[0],0.1)}${sceneNumInput('Высота','sy',sceneP.scale[1],0.1)}${sceneNumInput('Глубина','sz',sceneP.scale[2],0.1)}
        </div>
        <div class="le-sec-title">Поворот (градусы)</div>
        <div class="le-grid">
          ${sceneNumInput('RX','rxDeg',sceneE[0],1)}${sceneNumInput('RY','ryDeg',sceneE[1],1)}${sceneNumInput('RZ','rzDeg',sceneE[2],1)}
        </div>
        <div class="le-hint">Инструменты работают и с объектами карты: G — перемещение, B — размер, R/T — поворот и наклон.</div>
        <div class="le-actions">
          <button data-sact="hide">${sceneP.hidden ? 'Показать' : 'Скрыть'}</button>
          <button data-sact="clone">Клонировать в редактор</button>
          <button data-sact="reset" class="danger">Сбросить правку</button>
        </div>
      </div>` : '';

    const sceneOverridesHtml = Object.keys(overrides).map(key => `
      <button class="le-item ${key === selectedSceneKey ? 'is-on' : ''}" data-selscene="${escapeAttr(key)}">
        <span>${escapeHtml(key)}</span><small>${overrides[key].hidden ? 'скрыт' : 'правка'}</small>
      </button>`).join('');

    rootEl.innerHTML = `
      <div class="le-ui le-topbar">
        <div class="le-topbar-left">
          <b>Редактор локаций</b>
          <span class="le-hint-inline">V — выделение · G — перемещение · B — размер · T — наклон · R — поворот +15° · Delete — удалить / скрыть объект карты · Ctrl+D — дублировать · WASD/QE — камера · колесо — zoom · Esc — выход</span>
        </div>
        <div class="le-topbar-right">
          ${sel ? `<button data-act="dup">Дублировать</button><button data-act="del" class="danger">Удалить</button>` : ''}
          ${sceneP ? `<button data-sact="clone">Клонировать</button><button data-sact="hide">${sceneP.hidden ? 'Показать' : 'Скрыть'}</button><button data-sact="reset" class="danger">Сбросить</button>` : ''}
          <button data-act="to-player">К игроку</button>
          <button data-act="export">Экспорт JSON</button>
          <button data-act="close" class="danger">Закрыть</button>
        </div>
      </div>
      <div class="le-ui le-sidebar">
        <div class="le-sec">
          <div class="le-sec-title">Инструменты</div>
          <div class="le-tools">
            ${[
              ['select','Выделить (V)'],
              ['move','Переместить (G)'],
              ['scale','Размер (B)'],
              ['rotate','Повернуть'],
              ['tilt','Наклон (T)']
            ].map(([id, label]) => `<button data-tool="${id}" class="${tool===id?'is-on':''}">${label}</button>`).join('')}
          </div>
          <div class="le-hint">Выделенный объект обведён рамкой и кольцом у основания. Тяните его выбранным инструментом или правьте числа ниже. Клик по объекту игры выделяет его для прямой правки.</div>
        </div>
        <div class="le-sec">
          <div class="le-sec-title">Локации</div>
          <div class="le-locs">${biomes}</div>
        </div>
        <div class="le-sec">
          <div class="le-sec-title le-row-between"><span>Каталог объектов</span><button data-act="toggle-catalog">${catalogOpen?'Скрыть':'Показать'}</button></div>
          ${catalogOpen ? `<div class="le-catalog">${catalogHtml}</div>` : `<div class="le-empty">Объекты по категориям биомов — для ручного добавления на карту.</div>`}
        </div>
        <div class="le-sec">
          <div class="le-sec-title">Объекты редактора (${items.length})</div>
          <div class="le-list">${listHtml || '<div class="le-empty">Пока нет объектов</div>'}</div>
        </div>
        <div class="le-sec">
          <div class="le-sec-title">Правки карты (${Object.keys(overrides).length})</div>
          <div class="le-list">${sceneOverridesHtml || '<div class="le-empty">Нет. Кликните по объекту игры в сцене, чтобы править его напрямую.</div>'}</div>
        </div>
        ${sceneHtml}
        ${selHtml}
        <div class="le-sec le-actions">
          <button data-act="import">Импорт</button>
          <button data-act="clear" class="danger">Очистить</button>
        </div>
        <div class="le-sec le-hint">Объекты редактора: <code>${KEY}</code>. Правки карты: <code>${OVERRIDES_KEY}</code>. Экспорт JSON содержит оба раздела.</div>
      </div>
    `;
    bindUI();
  }

  function bindUI() {
    if (!rootEl) return;
    rootEl.querySelectorAll('[data-tool]').forEach(btn => btn.addEventListener('click', () => { tool = btn.getAttribute('data-tool') || 'select'; renderUI(); }));
    rootEl.querySelectorAll('[data-loc]').forEach(btn => btn.addEventListener('click', () => teleportToBiome(btn.getAttribute('data-loc'))));
    rootEl.querySelectorAll('[data-sel]').forEach(btn => btn.addEventListener('click', () => select(btn.getAttribute('data-sel'))));
    rootEl.querySelectorAll('[data-selscene]').forEach(btn => btn.addEventListener('click', () => selectScene(btn.getAttribute('data-selscene'))));
    rootEl.querySelectorAll('[data-sact]').forEach(btn => btn.addEventListener('click', () => {
      const act = btn.getAttribute('data-sact');
      const key = selectedSceneKey;
      if (!key) return;
      if (act === 'hide') toggleSceneHidden();
      else if (act === 'clone') cloneSceneSelection();
      else if (act === 'reset') { clearSceneOverride(key); selectedSceneKey = null; syncSelectionVisual(); renderUI(); }
    }));
    rootEl.querySelectorAll('[data-cat]').forEach(btn => btn.addEventListener('click', () => {
      const catName = btn.getAttribute('data-cat'); const idx = Number(btn.getAttribute('data-cati'));
      const cat = CATALOG.find(c => c.biome === catName); const proto = cat?.items[idx];
      if (!proto) return;
      addObject(proto.id, { color: proto.color, sx: proto.sx ?? 1, sy: proto.sy ?? 1, sz: proto.sz ?? 1, label: proto.label });
    }));
    rootEl.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', () => {
      const act = btn.getAttribute('data-act');
      if (act === 'close') closeEditor();
      else if (act === 'to-player') teleportToPlayer();
      else if (act === 'del') deleteSelected();
      else if (act === 'dup') duplicateSelected();
      else if (act === 'clear') { if (confirm('Удалить все объекты редактора?')) { items = []; selectedId = null; rebuild(); save(); } }
      else if (act === 'export') exportJson();
      else if (act === 'import') importJson();
      else if (act === 'toggle-catalog') { catalogOpen = !catalogOpen; renderUI(); }
    }));
    rootEl.querySelectorAll('input[data-k]').forEach(inp => {
      inp.addEventListener('change', () => {
        const k = inp.getAttribute('data-k'); if (!k) return;
        if (k === 'label' || k === 'color') updateSelected({ [k]: inp.value });
        else if (k === 'rxDeg') updateSelected({ rx: rad(inp.value) });
        else if (k === 'ryDeg') updateSelected({ ry: rad(inp.value) });
        else if (k === 'rzDeg') updateSelected({ rz: rad(inp.value) });
        else updateSelected({ [k]: Number(inp.value) });
      });
    });
    rootEl.querySelectorAll('input[data-sk][data-kk]').forEach(inp => {
      inp.addEventListener('change', () => {
        const key = inp.getAttribute('data-sk');
        const kk = inp.getAttribute('data-kk');
        if (!key) return;
        const patch = scenePatch(key, true);
        if (!patch) return;
        const value = Number(inp.value);
        if (kk === 'px' || kk === 'py' || kk === 'pz') {
          const pos = patch.pos.slice();
          pos[kk === 'px' ? 0 : kk === 'py' ? 1 : 2] = clamp(value, -10000, 10000);
          updateSceneOverride(key, { pos });
        } else if (kk === 'sx' || kk === 'sy' || kk === 'sz') {
          const scale = patch.scale.slice();
          scale[kk === 'sx' ? 0 : kk === 'sy' ? 1 : 2] = clamp(value, 0.01, 50);
          updateSceneOverride(key, { scale });
        } else if (kk === 'rxDeg' || kk === 'ryDeg' || kk === 'rzDeg') {
          const e = sceneEuler(patch);
          if (kk === 'rxDeg') e[0] = value;
          else if (kk === 'ryDeg') e[1] = value;
          else e[2] = value;
          const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(e[0]), rad(e[1]), rad(e[2]), 'YXZ'));
          updateSceneOverride(key, { rot: q.toArray() });
        }
      });
    });
  }

  function openEditor() {
    if (active) { renderUI(); return; }
    active = true; G.locationEditorActive = true;
    teleportToPlayer(); updateEditorCam();
    rootEl = document.createElement('div'); rootEl.className = 'le-root'; document.body.appendChild(rootEl);
    hideHostUi();
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    renderUI();
  }

  load(); loadOverrides(); rebuild();
  G.applyLocationEditorOverrides = applyOverrides;
  G.openLocationEditor = () => openEditor();
  G.closeLocationEditor = () => closeEditor();
  G.getLocationEditorItems = () => items.map(i => ({ ...i }));
}
