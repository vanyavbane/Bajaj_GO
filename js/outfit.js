import { G } from './state.js';

const KEY = 'bajajgo.outfit';
export const OUTFIT_COLORS = [
  { id: 'black',    name: 'Чёрный',     hex: '#111111' },
  { id: 'white',    name: 'Белый',      hex: '#e8eaee' },
  { id: 'red',      name: 'Красный',    hex: '#c62828' },
  { id: 'blue',     name: 'Синий',      hex: '#1565c0' },
  { id: 'purple',   name: 'Фиолетовый', hex: '#6a1b9a' },
  { id: 'green',    name: 'Зелёный',    hex: '#2e7d32' },
];

export const OUTFIT_ACH_MAP = {
  helmet: 'mountaineer',
  jacket: 'forester',
  pants: 'petersburger',
  boots: 'mkadWarrior',
};

export function getOutfitAchLevel(part) {
  const achId = OUTFIT_ACH_MAP[part];
  if (!achId || typeof G.getPlayerStats !== 'function') return null;
  const stats = G.getPlayerStats();
  const a = Array.isArray(stats?.achievements) ? stats.achievements.find(x => x.id === achId) : null;
  return Math.max(0, Math.min(5, Number(a?.level) || 0));
}

export function isOutfitColorUnlocked(part, hex) {
  const idx = OUTFIT_COLORS.findIndex(c => c.hex === sanitizeHex(hex, ''));
  if (idx <= 0) return true; // black/default/unknown
  const lvl = getOutfitAchLevel(part);
  if (lvl == null) return true; // stats not ready - don't wipe
  return lvl >= idx;
}

export function clampOutfitToAchievements(outfit) {
  const o = normalizeOutfit(outfit);
  for (const part of Object.keys(OUTFIT_DEFAULT)) {
    if (!isOutfitColorUnlocked(part, o[part])) o[part] = OUTFIT_DEFAULT[part];
  }
  return o;
}

export const OUTFIT_DEFAULT = {
  helmet: '#111111',
  jacket: '#111111',
  pants: '#111111',
  boots: '#111111',
};

function sanitizeHex(v, fallback) {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : fallback;
}

export function normalizeOutfit(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    helmet: sanitizeHex(src.helmet, OUTFIT_DEFAULT.helmet),
    jacket: sanitizeHex(src.jacket, OUTFIT_DEFAULT.jacket),
    pants: sanitizeHex(src.pants, OUTFIT_DEFAULT.pants),
    boots: sanitizeHex(src.boots, OUTFIT_DEFAULT.boots),
  };
}

export function loadOutfit() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...OUTFIT_DEFAULT };
    return normalizeOutfit(JSON.parse(raw));
  } catch {
    return { ...OUTFIT_DEFAULT };
  }
}

export function saveOutfit(outfit) {
  try { localStorage.setItem(KEY, JSON.stringify(normalizeOutfit(outfit))); } catch {}
}

export function applyOutfit(outfit) {
  const o = normalizeOutfit(outfit);
  G.outfit = o;
  const parts = G.outfitParts;
  if (!parts) return o;
  if (parts.helmetMat) parts.helmetMat.color.set(o.helmet);
  if (parts.jacketMat) parts.jacketMat.color.set(o.jacket);
  if (parts.pantsMat) parts.pantsMat.color.set(o.pants);
  if (parts.bootsMat) parts.bootsMat.color.set(o.boots);
  return o;
}

export function setOutfitPart(part, hex) {
  if (!Object.prototype.hasOwnProperty.call(OUTFIT_DEFAULT, part)) return G.outfit || { ...OUTFIT_DEFAULT };
  const safeHex = sanitizeHex(hex, OUTFIT_DEFAULT[part]);
  if (!isOutfitColorUnlocked(part, safeHex)) return G.outfit || { ...OUTFIT_DEFAULT };
  const next = { ...(G.outfit || loadOutfit()), [part]: safeHex };
  saveOutfit(next);
  return applyOutfit(next);
}

export function resetOutfit() {
  const next = { ...OUTFIT_DEFAULT };
  saveOutfit(next);
  return applyOutfit(next);
}

export function initOutfit() {
  G.outfit = clampOutfitToAchievements(loadOutfit());
  G.applyOutfit = applyOutfit;
  G.setOutfitPart = setOutfitPart;
  G.resetOutfit = resetOutfit;
  G.OUTFIT_COLORS = OUTFIT_COLORS;
  G.OUTFIT_DEFAULT = OUTFIT_DEFAULT;
  G.isOutfitColorUnlocked = isOutfitColorUnlocked;
  G.clampOutfitToAchievements = clampOutfitToAchievements;
  // Apply if rider materials already exist (usually called after initBike).
  applyOutfit(G.outfit);
}
