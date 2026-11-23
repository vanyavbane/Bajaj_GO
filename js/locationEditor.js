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

function defaultItem(type, pos) {
  return {
    id: uid(),
    type,
    x: pos.x, y: pos.y, z: pos.z,
    ry: 0,
    sx: 1, sy: 1, sz: 1,
    color: '#7aa8c7',
    label: ''
  };
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

  const byId = new Map(); // id -> {item, obj}

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {}
  }
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
    renderPanel();
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

  function select(id) {
    selectedId = id;
    syncSelectionVisual();
    renderPanel();
  }

  function addObject(type) {
    const pos = { x: 0, y: 0, z: 0 };
    if (G.bikeRoot) pos.x = G.bikeRoot.position.x, pos.y = G.bikeRoot.position.y, pos.z = G.bikeRoot.position.z;
    // Немного впереди по курсу
    const yaw = G.bikeRoot ? G.bikeRoot.rotation.y : 0;
    pos.x += Math.sin(yaw) * 8;
    pos.z += Math.cos(yaw) * 8;
    const item = defaultItem(type, pos);
    items.push(item);
    const obj = makeMesh(item);
    applyTransform(obj, item);
    obj.userData.editorId = item.id;
    group.add(obj);
    byId.set(item.id, { item, obj });
    selectedId = item.id;
    save();
    syncSelectionVisual();
    renderPanel();
  }

  function updateSelected(patch) {
    const item = selected();
    if (!item) return;
    Object.assign(item, patch);
    const entry = byId.get(item.id);
    if (entry) {
      // color/type changes may require rebuild of mesh
      if (patch.type && patch.type !== entry.obj.userData.type) { /* not used */ }
      if (patch.color !== undefined) {
        entry.obj.traverse?.(n => {
          if (n.isMesh && n.material && n.material.color) n.material.color.set(item.color);
          if (n.userData?.isSign && n.userData.boardMat) n.userData.boardMat.color.set(item.color);
        });
      }
      applyTransform(entry.obj, item);
    }
    save();
    renderPanel();
  }

  function deleteSelected() {
    const id = selectedId;
    if (!id) return;
    const idx = items.findIndex(i => i.id === id);
    if (idx >= 0) items.splice(idx, 1);
    const entry = byId.get(id);
    if (entry) {
      group.remove(entry.obj);
      entry.obj.traverse?.(n => { if (n.geometry) n.geometry.dispose(); if (n.material) { if (Array.isArray(n.material)) n.material.forEach(m=>m.dispose()); else n.material.dispose(); } });
      byId.delete(id);
    }
    selectedId = items[idx]?.id || items[idx - 1]?.id || null;
    save();
    syncSelectionVisual();
    renderPanel();
  }

  function duplicateSelected() {
    const item = selected();
    if (!item) return;
    const copy = { ...item, id: uid(), x: item.x + 1.5, z: item.z + 1.5, label: item.label ? item.label + ' copy' : '' };
    items.push(copy);
    const obj = makeMesh(copy);
    applyTransform(obj, copy);
    obj.userData.editorId = copy.id;
    group.add(obj);
    byId.set(copy.id, { item: copy, obj });
    selectedId = copy.id;
    save();
    syncSelectionVisual();
    renderPanel();
  }

  // --- UI panel ---
  let panelEl = null;

  function closePanel() {
    if (panelEl) { panelEl.remove(); panelEl = null; }
  }

  function renderPanel() {
    if (!panelEl) return;
    const sel = selected();
    const listHtml = items.map(it => {
      const on = it.id === selectedId;
      return `<button class="le-item ${on ? 'is-on' : ''}" data-sel="${it.id}">${it.type}${it.label ? ' · ' + escapeHtml(it.label) : ''} <small>${it.x.toFixed(1)},${it.y.toFixed(1)},${it.z.toFixed(1)}</small></button>`;
    }).join('');

    const selHtml = sel ? `
      <div class="le-sec">
        <div class="le-row"><label>Тип</label><b>${sel.type}</b></div>
        <div class="le-row"><label>Метка</label><input data-k="label" value="${escapeAttr(sel.label || '')}" maxlength="60"></div>
        <div class="le-row"><label>Цвет</label><input data-k="color" type="color" value="${escapeAttr(sel.color || '#7aa8c7')}"></div>
        <div class="le-grid">
          ${numInput('X','x',sel.x,0.5)}${numInput('Y','y',sel.y,0.5)}${numInput('Z','z',sel.z,0.5)}
          ${numInput('RotY','ry',sel.ry,0.1)}${numInput('SX','sx',sel.sx,0.1)}${numInput('SY','sy',sel.sy,0.1)}${numInput('SZ','sz',sel.sz,0.1)}
        </div>
        <div class="le-actions">
          <button data-act="dup">Дублировать</button>
          <button data-act="del" class="danger">Удалить</button>
        </div>
      </div>` : `<div class="le-sec le-empty">Нет выбранного объекта</div>`;

    panelEl.innerHTML = `
      <div class="le-head">
        <b>Редактор локаций</b>
        <button data-act="close" class="le-x">×</button>
      </div>
      <div class="le-sec">
        <div class="le-adds">${TYPES.map(t => `<button data-add="${t.id}">+ ${t.label}</button>`).join('')}</div>
      </div>
      <div class="le-sec le-list">${listHtml || '<div class="le-empty">Объектов пока нет</div>'}</div>
      ${selHtml}
      <div class="le-sec le-actions">
        <button data-act="export">Экспорт JSON</button>
        <button data-act="import">Импорт JSON</button>
        <button data-act="clear" class="danger">Очистить всё</button>
      </div>
      <div class="le-sec le-hint">Объекты сохраняются в localStorage и появляются в сцене.</div>
    `;

    bindPanel();
  }

  function numInput(label, k, v, step) {
    return `<label class="le-num"><span>${label}</span><input data-k="${k}" type="number" step="${step}" value="${Number(v).toFixed(3)}"></label>`;
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function escapeAttr(s) { return escapeHtml(s); }

  function bindPanel() {
    if (!panelEl) return;
    panelEl.querySelectorAll('[data-add]').forEach(btn => btn.addEventListener('click', () => addObject(btn.getAttribute('data-add'))));
    panelEl.querySelectorAll('[data-sel]').forEach(btn => btn.addEventListener('click', () => select(btn.getAttribute('data-sel'))));
    panelEl.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', () => {
      const act = btn.getAttribute('data-act');
      if (act === 'close') closePanel();
      else if (act === 'del') deleteSelected();
      else if (act === 'dup') duplicateSelected();
      else if (act === 'clear') { if (confirm('Удалить все объекты редактора?')) { items = []; selectedId = null; rebuild(); save(); } }
      else if (act === 'export') exportJson();
      else if (act === 'import') importJson();
    }));
    panelEl.querySelectorAll('input[data-k]').forEach(inp => {
      inp.addEventListener('change', () => {
        const k = inp.getAttribute('data-k');
        if (!k) return;
        if (k === 'label' || k === 'color') updateSelected({ [k]: inp.value });
        else updateSelected({ [k]: Number(inp.value) });
      });
    });
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
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const raw = JSON.parse(text);
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
        rebuild();
        save();
      } catch (e) { alert('Ошибка импорта: ' + (e?.message || e)); }
    };
    input.click();
  }

  function openPanel() {
    if (panelEl) { renderPanel(); return; }
    panelEl = document.createElement('div');
    panelEl.className = 'le-panel';
    document.body.appendChild(panelEl);
    renderPanel();
  }

  load();
  rebuild();

  G.openLocationEditor = () => openPanel();
  G.closeLocationEditor = () => closePanel();
  G.getLocationEditorItems = () => items.map(i => ({ ...i }));
}