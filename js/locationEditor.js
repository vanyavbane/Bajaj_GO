import * as THREE from 'three';
import { G } from './state.js';

const KEY = 'bajajgo.locationEditor.v1';
const TYPES = [
  { id: 'box', label: 'Куб' },
  { id: 'cylinder', label: 'Цилиндр' },
  { id: 'sphere', label: 'Сфера' },
  { id: 'cone', label: 'Конус' },
  { id: 'sign', label: 'Знак' },
];

function uid() { return 'le_' + Math.random().toString(36).slice(2, 10); }
function clamp(v, a, b) { v = Number(v); return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : a; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s) { return escapeHtml(s); }

function defaultItem(type, pos) {
  return { id: uid(), type, x: pos.x, y: pos.y, z: pos.z, ry: 0, sx: 1, sy: 1, sz: 1, color: '#7aa8c7', label: '' };
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
      group.userData.isSign = true;
      group.userData.boardMat = mat;
      return group;
    }
    case 'box':
    default: geo = new THREE.BoxGeometry(1.4, 1.4, 1.4); break;
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function applyTransform(obj, item) {
  obj.position.set(Number(item.x) || 0, Number(item.y) || 0, Number(item.z) || 0);
  obj.rotation.set(0, Number(item.ry) || 0, 0);
  obj.scale.set(clamp(item.sx, 0.05, 50), clamp(item.sy, 0.05, 50), clamp(item.sz, 0.05, 50));
}

export function initLocationEditor() {
  let items = [];
  let selectedId = null;
  const group = new THREE.Group();
  group.name = 'location-editor';
  G.scene.add(group);
  const byId = new Map();

  // Editor camera / state
  const editorCam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 4000);
  editorCam.position.set(0, 180, 0);
  editorCam.lookAt(0, 0, 0);
  G.editorCamera = editorCam;

  let active = false;
  let rootEl = null;
  let camTarget = new THREE.Vector3(0, 0, 0);
  let camHeight = 180;
  let camYaw = 0;      // radians, around Y
  let camPitch = -1.25; // looking down
  let camDist = 0.01;  // for perspective top-down use height offset
  let dragging = false;
  let dragLast = null;
  let keys = {};

  function save() { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {} }
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (Array.isArray(raw)) items = raw.filter(x => x && typeof x === 'object').map(x => ({
        id: String(x.id || uid()),
        type: TYPES.some(t => t.id === x.type) ? x.type : 'box',
        x: Number(x.x) || 0, y: Number(x.y) || 0, z: Number(x.z) || 0,
        ry: Number(x.ry) || 0,
        sx: clamp(x.sx ?? 1, 0.05, 50), sy: clamp(x.sy ?? 1, 0.05, 50), sz: clamp(x.sz ?? 1, 0.05, 50),
        color: typeof x.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(x.color) ? x.color : '#7aa8c7',
        label: typeof x.label === 'string' ? x.label.slice(0, 60) : ''
      }));
    } catch { items = []; }
  }

  function rebuild() {
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
    syncSelectionVisual();
    renderUI();
  }

  function syncSelectionVisual() {
    for (const [id, entry] of byId.entries()) {
      const on = id === selectedId;
      entry.obj.traverse?.(n => {
        if (n.isMesh && n.material && n.material.emissive) {
          n.material.emissive.set(on ? 0x335577 : 0x000000);
          n.material.emissiveIntensity = on ? 0.35 : 0;
        }
      });
    }
  }

  function selected() { return items.find(i => i.id === selectedId) || null; }
  function select(id) { selectedId = id; syncSelectionVisual(); renderUI(); }

  function addObject(type) {
    const p = camTarget.clone();
    p.y = Math.max(0, p.y);
    const item = defaultItem(type, { x: p.x, y: p.y, z: p.z });
    items.push(item);
    const obj = makeMesh(item);
    applyTransform(obj, item);
    obj.userData.editorId = item.id;
    group.add(obj);
    byId.set(item.id, { item, obj });
    selectedId = item.id;
    save(); syncSelectionVisual(); renderUI();
  }

  function updateSelected(patch) {
    const item = selected(); if (!item) return;
    Object.assign(item, patch);
    const entry = byId.get(item.id);
    if (entry) {
      if (patch.color !== undefined) {
        entry.obj.traverse?.(n => { if (n.isMesh && n.material && n.material.color) n.material.color.set(item.color); });
      }
      applyTransform(entry.obj, item);
    }
    save(); renderUI();
  }

  function deleteSelected() {
    const id = selectedId; if (!id) return;
    const idx = items.findIndex(i => i.id === id);
    if (idx >= 0) items.splice(idx, 1);
    const entry = byId.get(id);
    if (entry) {
      group.remove(entry.obj);
      entry.obj.traverse?.(n => { if (n.geometry) n.geometry.dispose(); if (n.material) { if (Array.isArray(n.material)) n.material.forEach(m=>m.dispose()); else n.material.dispose(); } });
      byId.delete(id);
    }
    selectedId = items[idx]?.id || items[idx - 1]?.id || null;
    save(); syncSelectionVisual(); renderUI();
  }

  function duplicateSelected() {
    const item = selected(); if (!item) return;
    const copy = { ...item, id: uid(), x: item.x + 1.5, z: item.z + 1.5, label: item.label ? item.label + ' copy' : '' };
    items.push(copy);
    const obj = makeMesh(copy);
    applyTransform(obj, copy);
    obj.userData.editorId = copy.id;
    group.add(obj);
    byId.set(copy.id, { item: copy, obj });
    selectedId = copy.id;
    save(); syncSelectionVisual(); renderUI();
  }

  function exportJson() {
    const data = JSON.stringify(items, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bajajgo-location-editor.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importJson() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      try {
        const raw = JSON.parse(await file.text());
        if (!Array.isArray(raw)) throw new Error('JSON должен быть массивом');
        items = raw.filter(x => x && typeof x === 'object').map(x => ({
          id: String(x.id || uid()),
          type: TYPES.some(t => t.id === x.type) ? x.type : 'box',
          x: Number(x.x) || 0, y: Number(x.y) || 0, z: Number(x.z) || 0,
          ry: Number(x.ry) || 0,
          sx: clamp(x.sx ?? 1, 0.05, 50), sy: clamp(x.sy ?? 1, 0.05, 50), sz: clamp(x.sz ?? 1, 0.05, 50),
          color: typeof x.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(x.color) ? x.color : '#7aa8c7',
          label: typeof x.label === 'string' ? x.label.slice(0, 60) : ''
        }));
        selectedId = items[0]?.id || null;
        rebuild(); save();
      } catch (e) { alert('Ошибка импорта: ' + (e?.message || e)); }
    };
    input.click();
  }

  // --- Biome/location helpers ---
  function findBiomeS(biomeId) {
    const biomes = G.BIOMES || [];
    const idx = biomes.findIndex(b => b.id === biomeId);
    if (idx < 0) return G.playerS || 0;
    // Scan forward from near player for a spot where this biome dominates
    const start = Math.max(0, (G.playerS || 0) - 200);
    for (let s = start; s < start + 12000; s += 40) {
      if (G.biomeWeightsAtS) {
        const w = G.biomeWeightsAtS(s);
        let dom = 0, best = -1;
        for (let i = 0; i < w.length; i++) if (w[i] > best) { best = w[i]; dom = i; }
        if (dom === idx && best > 0.55) return s;
      }
    }
    return G.playerS || 0;
  }

  function teleportToS(s) {
    const pose = G.embedRoad ? G.embedRoad(s, 0) : null;
    const x = pose ? pose.x : 0;
    const z = pose ? pose.z : s;
    camTarget.set(x, 0, z);
  }

  function teleportToBiome(id) {
    teleportToS(findBiomeS(id));
    renderUI();
  }

  function teleportToPlayer() {
    if (G.bikeRoot) camTarget.set(G.bikeRoot.position.x, 0, G.bikeRoot.position.z);
    else teleportToS(G.playerS || 0);
    renderUI();
  }

  // --- Camera ---
  function updateEditorCam() {
    const h = clamp(camHeight, 20, 900);
    camHeight = h;
    const back = Math.cos(camPitch) * h * 0.35;
    const up = Math.sin(-camPitch) * h;
    const x = camTarget.x + Math.sin(camYaw) * back;
    const z = camTarget.z + Math.cos(camYaw) * back;
    editorCam.position.set(x, Math.max(15, up), z);
    editorCam.lookAt(camTarget.x, 0, camTarget.z);
  }

  function onWheel(e) {
    if (!active) return;
    e.preventDefault();
    camHeight = clamp(camHeight * (e.deltaY > 0 ? 1.08 : 0.92), 20, 900);
  }

  function onPointerDown(e) {
    if (!active) return;
    if (e.target.closest('.le-ui')) return;
    dragging = true; dragLast = { x: e.clientX, y: e.clientY };
  }
  function onPointerMove(e) {
    if (!dragging || !dragLast) return;
    const dx = e.clientX - dragLast.x;
    const dy = e.clientY - dragLast.y;
    dragLast = { x: e.clientX, y: e.clientY };
    const panScale = camHeight * 0.0022;
    // pan in camera-local XZ
    const cos = Math.cos(camYaw), sin = Math.sin(camYaw);
    camTarget.x -= (dx * cos - dy * sin) * panScale;
    camTarget.z -= (dx * sin + dy * cos) * panScale;
  }
  function onPointerUp() { dragging = false; dragLast = null; }
  function onKeyDown(e) { keys[e.code] = true; }
  function onKeyUp(e) { keys[e.code] = false; }

  let editorS = G.playerS || 0;
  function nearestSForPoint(x, z) {
    // Грубый поиск ближайшего S вокруг editorS, затем уточнение.
    let bestS = editorS, bestD = Infinity;
    for (let s = editorS - 1200; s <= editorS + 1200; s += 80) {
      const p = G.embedRoad ? G.embedRoad(s, 0) : null;
      if (!p) continue;
      const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      if (d < bestD) { bestD = d; bestS = s; }
    }
    for (let s = bestS - 120; s <= bestS + 120; s += 10) {
      const p = G.embedRoad ? G.embedRoad(s, 0) : null;
      if (!p) continue;
      const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      if (d < bestD) { bestD = d; bestS = s; }
    }
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
    if (mx || mz) {
      camTarget.x += (mx * cos - mz * sin) * speed;
      camTarget.z += (mx * sin + mz * cos) * speed;
    }
    if (keys['KeyQ']) camYaw -= dt * 1.2;
    if (keys['KeyE']) camYaw += dt * 1.2;
    if (keys['KeyR']) camHeight = clamp(camHeight - speed * 40, 20, 900);
    if (keys['KeyF']) camHeight = clamp(camHeight + speed * 40, 20, 900);

    editorS = nearestSForPoint(camTarget.x, camTarget.z);
    const savedS = G.playerS;
    G.playerS = editorS;
    if (G.updateBiome) G.updateBiome(dt);
    if (G.updateRoadSurface) G.updateRoadSurface(editorS);
    if (G.updateAtmosphereAndTimeOfDay) G.updateAtmosphereAndTimeOfDay(0, editorS);
    if (G.updateRoadside) G.updateRoadside();
    if (G.updateMegaStructures) G.updateMegaStructures(dt);
    if (G.updateForest) G.updateForest();
    if (G.updateMountain) G.updateMountain();
    if (G.updateEmbankment) G.updateEmbankment(dt);
    G.playerS = savedS;

    updateEditorCam();
  };

  G.onEditorResize = (w, h) => {
    editorCam.aspect = w / h;
    editorCam.updateProjectionMatrix();
  };

  // --- UI ---
  function closeEditor() {
    active = false;
    G.locationEditorActive = false;
    dragging = false; dragLast = null; keys = {};
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    if (rootEl) { rootEl.remove(); rootEl = null; }
    const hud = document.getElementById('hud');
    if (hud) hud.style.display = '';
  }

  function numInput(label, k, v, step) {
    return `<label class="le-num"><span>${label}</span><input data-k="${k}" type="number" step="${step}" value="${Number(v).toFixed(3)}"></label>`;
  }

  function renderUI() {
    if (!rootEl) return;
    const sel = selected();
    const biomes = (G.BIOMES || []).map(b => `<button class="le-loc ${''}" data-loc="${escapeAttr(b.id)}">${escapeHtml(b.name || b.id)}</button>`).join('');
    const listHtml = items.map(it => {
      const on = it.id === selectedId;
      return `<button class="le-item ${on ? 'is-on' : ''}" data-sel="${it.id}">${it.type}${it.label ? ' · ' + escapeHtml(it.label) : ''} <small>${Number(it.x).toFixed(1)},${Number(it.y).toFixed(1)},${Number(it.z).toFixed(1)}</small></button>`;
    }).join('');

    const selHtml = sel ? `
      <div class="le-sec">
        <div class="le-sec-title">Выбранный объект</div>
        <div class="le-row"><label>Тип</label><b>${sel.type}</b></div>
        <div class="le-row"><label>Метка</label><input data-k="label" value="${escapeAttr(sel.label || '')}" maxlength="60"></div>
        <div class="le-row"><label>Цвет</label><input data-k="color" type="color" value="${escapeAttr(sel.color || '#7aa8c7')}"></div>
        <div class="le-grid">
          ${numInput('X','x',sel.x,0.5)}${numInput('Y','y',sel.y,0.5)}${numInput('Z','z',sel.z,0.5)}
          ${numInput('RotY','ry',sel.ry,0.1)}${numInput('SX','sx',sel.sx,0.1)}${numInput('SY','sy',sel.sy,0.1)}${numInput('SZ','sz',sel.sz,0.1)}
        </div>
        <div class="le-actions"><button data-act="dup">Дублировать</button><button data-act="del" class="danger">Удалить</button></div>
      </div>` : `<div class="le-sec le-empty">Выберите объект в списке или добавьте новый.</div>`;

    rootEl.innerHTML = `
      <div class="le-ui le-topbar">
        <div class="le-topbar-left">
          <b>Редактор локаций</b>
          <span class="le-hint-inline">ЛКМ-перетаскивание: панорама · Колесо: zoom · WASD/QE/RF: камера</span>
        </div>
        <div class="le-topbar-right">
          <button data-act="to-player">К игроку</button>
          <button data-act="close" class="danger">Закрыть</button>
        </div>
      </div>
      <div class="le-ui le-sidebar">
        <div class="le-sec">
          <div class="le-sec-title">Локации</div>
          <div class="le-locs">${biomes}</div>
        </div>
        <div class="le-sec">
          <div class="le-sec-title">Добавить объект</div>
          <div class="le-adds">${TYPES.map(t => `<button data-add="${t.id}">+ ${t.label}</button>`).join('')}</div>
        </div>
        <div class="le-sec">
          <div class="le-sec-title">Объекты (${items.length})</div>
          <div class="le-list">${listHtml || '<div class="le-empty">Объектов пока нет</div>'}</div>
        </div>
        ${selHtml}
        <div class="le-sec le-actions">
          <button data-act="export">Экспорт</button>
          <button data-act="import">Импорт</button>
          <button data-act="clear" class="danger">Очистить</button>
        </div>
      </div>
    `;
    bindUI();
  }

  function bindUI() {
    if (!rootEl) return;
    rootEl.querySelectorAll('[data-loc]').forEach(btn => btn.addEventListener('click', () => teleportToBiome(btn.getAttribute('data-loc'))));
    rootEl.querySelectorAll('[data-add]').forEach(btn => btn.addEventListener('click', () => addObject(btn.getAttribute('data-add'))));
    rootEl.querySelectorAll('[data-sel]').forEach(btn => btn.addEventListener('click', () => select(btn.getAttribute('data-sel'))));
    rootEl.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', () => {
      const act = btn.getAttribute('data-act');
      if (act === 'close') closeEditor();
      else if (act === 'to-player') teleportToPlayer();
      else if (act === 'del') deleteSelected();
      else if (act === 'dup') duplicateSelected();
      else if (act === 'clear') { if (confirm('Удалить все объекты редактора?')) { items = []; selectedId = null; rebuild(); save(); } }
      else if (act === 'export') exportJson();
      else if (act === 'import') importJson();
    }));
    rootEl.querySelectorAll('input[data-k]').forEach(inp => {
      inp.addEventListener('change', () => {
        const k = inp.getAttribute('data-k');
        if (!k) return;
        if (k === 'label' || k === 'color') updateSelected({ [k]: inp.value });
        else updateSelected({ [k]: Number(inp.value) });
      });
    });
  }

  function openEditor() {
    if (active) { renderUI(); return; }
    active = true;
    G.locationEditorActive = true;
    teleportToPlayer();
    updateEditorCam();
    rootEl = document.createElement('div');
    rootEl.className = 'le-root';
    document.body.appendChild(rootEl);
    const hud = document.getElementById('hud');
    if (hud) hud.style.display = 'none';
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    renderUI();
  }

  load();
  rebuild();

  G.openLocationEditor = () => openEditor();
  G.closeLocationEditor = () => closeEditor();
  G.getLocationEditorItems = () => items.map(i => ({ ...i }));
}