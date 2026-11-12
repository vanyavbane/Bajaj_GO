import * as THREE from 'three';
import { G } from './state.js';

/* =============================================================================
 * РЕКЛАМА ИЗ ПАПКИ AdManager/
 *
 * Владелец кладёт изображения и видео рядом с игрой:
 *
 *   AdManager/
 *   ├── billboards/   — обычные щиты: картинки и видео
 *   ├── overheads/    — указатели над дорогой: только картинка/постер
 *   ├── manifest.json — необязательный список файлов (рекомендуется)
 *   └── README.txt    — инструкция
 *
 * Никаких кнопок и <input type="file"> здесь нет: файлы обнаруживаются сами.
 * Три уровня: manifest.json → directory listing → только процедурная реклама.
 * Модуль — единая точка выбора баннера. Будущий Google Play подключается через
 * registerExternalProvider(), игровая логика при этом не меняется.
 * ========================================================================== */

const AD_UPLOADED_SHARE = 0.5;          // 0..1 — доля загруженных материалов в показе
const AD_MAX_ACTIVE_VIDEOS = 2;         // максимум одновременно воспроизводимых видео
const AD_VIDEO_MAX_DURATION_SEC = 10;   // лимит длительности видео
const AD_VIDEO_MAX_SIZE_MB = 10;        // лимит размера видео
const AD_VIDEO_MAX_RESOLUTION = 1024;   // макс. ширина видео по горизонтали
const AD_VIDEO_ACTIVE_DISTANCE_M = 120; // дистанция, на которой видео воспроизводится
const AD_AUTODETECT_ENABLED = true;     // включить автообнаружение файлов

const DISCOVERY_KEY = 'bajajGO_adManagerDiscovery';
const ENABLED_KEY = 'bajajGO_adEnabled';
const SHARE_KEY = 'bajajGO_adUploadedShare';
const MANIFEST_PATH = 'AdManager/manifest.json';

const FOLDERS = {
  billboards: 'AdManager/billboards/',
  overheads: 'AdManager/overheads/'
};

const IMAGE_RE = /\.(?:jpe?g|png|webp)$/i;
const VIDEO_RE = /\.(?:mp4|webm)$/i;

const DISCOVERY_WARNING = 'AdManager: не удалось обнаружить файлы рекламы. '
  + 'Создайте AdManager/manifest.json со списком файлов (см. AdManager/README.txt). '
  + 'Игра продолжит работу с процедурной рекламой.';

/** @typedef {import('./game-state.d.ts').ExternalAdProvider} ExternalAdProvider */
/** @typedef {import('./game-state.d.ts').ExternalAdBanner} ExternalAdBanner */
/** @typedef {import('./game-state.d.ts').AdManagerSlot} AdManagerSlot */
/** @typedef {import('./game-state.d.ts').AdManagerBanner} AdManagerBanner */

/**
 * @typedef {Object} AdAsset
 * @property {string} file
 * @property {string} url
 * @property {'billboards'|'overheads'} kind
 * @property {boolean} isVideo
 * @property {boolean} videoPlayable
 * @property {THREE.Texture} texture
 * @property {THREE.Texture | null} posterTexture
 * @property {HTMLVideoElement | null} videoEl
 * @property {THREE.VideoTexture | null} videoTexture
 * @property {number} duration
 * @property {number} width
 * @property {number} height
 * @property {number} lastActive
 * @property {boolean} playing
 * @property {boolean} external
 * @property {ExternalAdProvider | null} provider
 * @property {string} providerBannerId
 * @property {string} bannerId
 * @property {boolean} disabled
 */

/**
 * @typedef {Object} VideoPlacement
 * @property {string} key
 * @property {AdAsset} asset
 * @property {THREE.MeshStandardMaterial | null} material
 * @property {any} slot
 * @property {number} sOffset
 */

/**
 * @typedef {Object} AssetMeta
 * @property {boolean} [external]
 * @property {ExternalAdProvider | null} [provider]
 * @property {string} [providerBannerId]
 * @property {string} [url]
 */

/**
 * @typedef {Object} DiscoveryResult
 * @property {'manifest'|'listing'|'fallback'} source
 * @property {string[]} billboards
 * @property {string[]} overheads
 */

/**
 * @typedef {Object} AdState
 * @property {boolean} initStarted
 * @property {boolean} discoveryStarted
 * @property {boolean} ready
 * @property {boolean} enabled
 * @property {number} uploadedShare
 * @property {'manifest'|'listing'|'fallback'} source
 * @property {number} version
 * @property {boolean} warnedDiscovery
 * @property {number} billboardsTotal
 * @property {number} overheadsTotal
 * @property {AdAsset[]} billboards
 * @property {AdAsset[]} overheads
 * @property {AdAsset[]} videoAssets
 * @property {AdAsset[]} externalAssets
 * @property {Map<string, AdAsset>} externalByBannerId
 * @property {Map<string, ExternalAdProvider>} providers
 * @property {Map<string, number>} providerTokens
 * @property {Map<string, VideoPlacement>} placements
 * @property {boolean} settingsBound
 * @property {number} updateClock
 * @property {string} lastBillboard
 * @property {string} lastOverhead
 */

/** @type {AdState} */
const state = {
  initStarted: false,
  discoveryStarted: false,
  ready: false,
  enabled: true,
  uploadedShare: AD_UPLOADED_SHARE,
  source: 'fallback',
  version: 0,
  warnedDiscovery: false,
  billboardsTotal: 0,
  overheadsTotal: 0,
  billboards: [],
  overheads: [],
  videoAssets: [],
  externalAssets: [],
  externalByBannerId: new Map(),
  providers: new Map(),
  providerTokens: new Map(),
  placements: new Map(),
  settingsBound: false,
  updateClock: 0,
  lastBillboard: '',
  lastOverhead: ''
};

const materialIds = new WeakMap();
let materialIdSeq = 0;

function bumpVersion() {
  state.version += 1;
}

function isSupportedFile(name) {
  return IMAGE_RE.test(name) || VIDEO_RE.test(name);
}

function isVideoFile(name) {
  return VIDEO_RE.test(name);
}

function assetUrl(folder, file) {
  return new URL(folder + encodeURIComponent(file), document.baseURI).href;
}

function manifestUrl() {
  return new URL(MANIFEST_PATH, document.baseURI).href;
}

function sanitizeFileName(item) {
  if (typeof item !== 'string') return null;
  let value = item.trim();
  if (!value) return null;
  value = value.split('\\').pop() || '';
  value = value.split('/').pop() || '';
  try {
    value = decodeURIComponent(value);
  } catch {
    // Оставляем имя как есть: decodeURIComponent падает на одиночном `%`.
  }
  value = value.split('?')[0].split('#')[0];
  return isSupportedFile(value) ? value : null;
}

/** @param {any} raw */
function sanitizeFileList(raw) {
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  if (!Array.isArray(raw)) return out;
  for (const item of raw) {
    const file = sanitizeFileName(item);
    if (!file) continue;
    const key = file.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(file);
  }
  return out;
}

/** @param {string} href */
function fileNameFromHref(href) {
  if (!href) return null;
  try {
    const url = new URL(href, document.baseURI);
    return sanitizeFileName(url.pathname);
  } catch {
    return sanitizeFileName(href);
  }
}

/** @param {string} text */
function parseDirectoryListing(text) {
  /** @type {string[]} */
  const names = [];
  const seen = new Set();
  const hrefRe = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let match;
  while ((match = hrefRe.exec(text))) {
    const file = fileNameFromHref(match[1] || match[2] || '');
    if (!file) continue;
    const key = file.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(file);
  }
  return names;
}

/** @param {string} text */
function parseJsonListing(text) {
  try {
    const data = JSON.parse(text);
    const raw = Array.isArray(data)
      ? data
      : (data && Array.isArray(data.files) ? data.files : null);
    if (!raw) return [];
    return sanitizeFileList(raw.map((item) => (
      typeof item === 'string' ? item : (item && typeof item.name === 'string' ? item.name : '')
    )));
  } catch {
    return [];
  }
}

function ignoreCacheOnReload() {
  try {
    const nav = /** @type {PerformanceNavigationTiming | undefined} */ (
      /** @type {PerformanceEntry | undefined} */ (performance.getEntriesByType('navigation')[0])
    );
    return !!nav && nav.type === 'reload';
  } catch {
    return false;
  }
}

function clearDiscoveryCache() {
  try {
    sessionStorage.removeItem(DISCOVERY_KEY);
  } catch {
    // sessionStorage может быть недоступен в приватном режиме.
  }
}

/** @returns {DiscoveryResult | null} */
function readDiscoveryCache() {
  if (ignoreCacheOnReload()) {
    clearDiscoveryCache();
    return null;
  }
  try {
    const raw = sessionStorage.getItem(DISCOVERY_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    const source = data.source === 'manifest' || data.source === 'listing' || data.source === 'fallback'
      ? data.source
      : 'fallback';
    return {
      source,
      billboards: sanitizeFileList(data.billboards),
      overheads: sanitizeFileList(data.overheads)
    };
  } catch {
    return null;
  }
}

/** @param {DiscoveryResult} result */
function writeDiscoveryCache(result) {
  try {
    sessionStorage.setItem(DISCOVERY_KEY, JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      source: result.source,
      billboards: result.billboards,
      overheads: result.overheads
    }));
  } catch {
    // Без кэша игра тоже работает.
  }
}

async function discoverFromManifest() {
  let response;
  try {
    response = await fetch(manifestUrl(), { cache: 'no-store' });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  let data;
  try {
    data = await response.json();
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  if (!Array.isArray(data.billboards) && !Array.isArray(data.overheads)) return null;
  /** @type {DiscoveryResult} */
  const result = {
    source: 'manifest',
    billboards: sanitizeFileList(data.billboards),
    overheads: sanitizeFileList(data.overheads)
  };
  return result;
}

/**
 * @param {'billboards'|'overheads'} kind
 * @returns {Promise<string[] | null>}
 */
async function listFolder(kind) {
  let response;
  try {
    response = await fetch(new URL(FOLDERS[kind], document.baseURI).href, { cache: 'no-store' });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  let text;
  try {
    text = await response.text();
  } catch {
    return null;
  }
  const fromHtml = parseDirectoryListing(text);
  if (fromHtml.length) return fromHtml;
  return parseJsonListing(text);
}

/** @returns {Promise<DiscoveryResult | null>} */
async function discoverFromListing() {
  const [billboards, overheads] = await Promise.all([
    listFolder('billboards'),
    listFolder('overheads')
  ]);
  if (!billboards && !overheads) return null;
  /** @type {DiscoveryResult} */
  const result = {
    source: 'listing',
    billboards: billboards || [],
    overheads: overheads || []
  };
  if (!result.billboards.length && !result.overheads.length) return null;
  return result;
}

/** @returns {Promise<DiscoveryResult>} */
async function discover() {
  const cached = readDiscoveryCache();
  if (cached) return cached;

  const fromManifest = await discoverFromManifest();
  if (fromManifest) {
    writeDiscoveryCache(fromManifest);
    return fromManifest;
  }

  const fromListing = await discoverFromListing();
  if (fromListing) {
    writeDiscoveryCache(fromListing);
    return fromListing;
  }

  /** @type {DiscoveryResult} */
  const fallback = { source: 'fallback', billboards: [], overheads: [] };
  writeDiscoveryCache(fallback);
  return fallback;
}

function warnDiscoveryOnce() {
  if (state.warnedDiscovery) return;
  state.warnedDiscovery = true;
  console.warn(DISCOVERY_WARNING);
}

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function refreshSettings() {
  const wasEnabled = state.enabled;
  const wasShare = state.uploadedShare;

  state.enabled = readStorage(ENABLED_KEY) !== '0';
  const rawShare = readStorage(SHARE_KEY);
  if (rawShare != null && rawShare !== '') {
    const share = Number(rawShare);
    state.uploadedShare = Number.isFinite(share)
      ? Math.max(0, Math.min(1, share))
      : AD_UPLOADED_SHARE;
  } else {
    state.uploadedShare = AD_UPLOADED_SHARE;
  }

  if (wasEnabled !== state.enabled || wasShare !== state.uploadedShare) {
    clearPlacements();
    bumpVersion();
  }

  if (state.enabled && state.initStarted && !state.discoveryStarted && AD_AUTODETECT_ENABLED) {
    startLoading();
  }
}

function registerSettingsListeners() {
  refreshSettings();
  if (state.settingsBound) return;
  state.settingsBound = true;
  try {
    addEventListener('storage', (event) => {
      if (event.key === null || event.key === ENABLED_KEY || event.key === SHARE_KEY) {
        refreshSettings();
      }
    });
  } catch {
    // addEventListener есть всегда, но модуль не должен падать на экзотике.
  }
}

function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('timeout: ' + label)), timeoutMs);
    })
  ]);
}

/**
 * @param {HTMLVideoElement} video
 * @param {string} eventName
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 */
function waitForEvent(video, eventName, timeoutMs) {
  return withTimeout(new Promise((resolve, reject) => {
    const onDone = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('media error: ' + eventName));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('timeout: ' + eventName));
    }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      video.removeEventListener(eventName, onDone);
      video.removeEventListener('error', onError);
    }
    video.addEventListener(eventName, onDone, { once: true });
    video.addEventListener('error', onError, { once: true });
  }), timeoutMs + 250, 'wait ' + eventName);
}

/**
 * @param {HTMLImageElement} image
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 */
function waitForImage(image, timeoutMs) {
  return withTimeout(new Promise((resolve, reject) => {
    const onDone = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('image error'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('image timeout'));
    }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      image.removeEventListener('load', onDone);
      image.removeEventListener('error', onError);
    }
    image.addEventListener('load', onDone, { once: true });
    image.addEventListener('error', onError, { once: true });
  }), timeoutMs + 250, 'image');
}

/** @param {string} file @param {AssetMeta | null | undefined} meta */
function makeBannerId(file, meta) {
  if (meta && meta.external && meta.provider) {
    return meta.provider.id + ':' + (meta.providerBannerId || file);
  }
  return file;
}

/** @param {string} label */
function createFallbackPoster(label) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 288;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#141a26');
    gradient.addColorStop(0.55, '#243656');
    gradient.addColorStop(1, '#20242c');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#d9a878';
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    ctx.fillStyle = '#d9a878';
    ctx.font = '900 38px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('ВИДЕО', canvas.width / 2, 124);
    ctx.fillStyle = '#e8eef5';
    ctx.font = '700 20px Arial';
    const text = String(label || '').slice(0, 42);
    ctx.fillText(text, canvas.width / 2, 166);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * @param {string} dataUrl
 * @returns {Promise<THREE.Texture>}
 */
function textureFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(dataUrl, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      resolve(texture);
    }, undefined, reject);
  });
}

/**
 * @param {HTMLVideoElement} video
 * @param {string} file
 * @returns {Promise<{ texture: THREE.Texture, playable: boolean }>}
 */
async function createVideoPoster(video, file) {
  try {
    if (video.readyState < 2) {
      await waitForEvent(video, 'loadeddata', 6000);
    }
    const target = Math.min(0.2, Math.max(0.01, (video.duration || 0) * 0.02));
    if (Math.abs(video.currentTime - target) > 0.001) {
      video.currentTime = target;
      await waitForEvent(video, 'seeked', 6000);
    }
    const width = Math.min(video.videoWidth || 1024, 1024);
    const height = Math.max(1, Math.round(width * (video.videoHeight || 576) / (video.videoWidth || 1024)));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d недоступен');
    ctx.drawImage(video, 0, 0, width, height);
    // toDataURL заодно проверяет, не «испорчен» ли canvas cross-origin видео.
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return { texture: await textureFromDataUrl(dataUrl), playable: true };
  } catch (error) {
    console.warn('AdManager: не удалось взять кадр видео ' + file + ', показываю постер-заглушку', error);
    return { texture: createFallbackPoster(file), playable: false };
  }
}

/**
 * @param {string} url
 * @returns {Promise<number | null>}
 */
async function remoteFileSize(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) return null;
    const raw = response.headers.get('content-length');
    if (!raw) return null;
    const size = Number(raw);
    return Number.isFinite(size) && size > 0 ? size : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} url
 * @param {string} file
 * @param {'billboards'|'overheads'} kind
 * @param {AssetMeta | null | undefined} meta
 * @returns {Promise<AdAsset | null>}
 */
async function loadImageAsset(url, file, kind, meta) {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.decoding = 'async';
  image.src = url;
  if (typeof image.decode === 'function') {
    await withTimeout(image.decode(), 15000, 'decode ' + file);
  } else {
    await waitForImage(image, 15000);
  }

  const texture = new THREE.Texture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  return {
    file,
    url,
    kind,
    isVideo: false,
    videoPlayable: false,
    texture,
    posterTexture: null,
    videoEl: null,
    videoTexture: null,
    duration: 0,
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
    lastActive: 0,
    playing: false,
    external: !!(meta && meta.external),
    provider: (meta && meta.provider) || null,
    providerBannerId: (meta && meta.providerBannerId) || '',
    bannerId: makeBannerId(file, meta),
    disabled: false
  };
}

/**
 * @param {string} url
 * @param {string} file
 * @param {'billboards'|'overheads'} kind
 * @param {AssetMeta | null | undefined} meta
 * @returns {Promise<AdAsset | null>}
 */
async function loadVideoAsset(url, file, kind, meta) {
  const size = await remoteFileSize(url);
  if (size != null && size > AD_VIDEO_MAX_SIZE_MB * 1024 * 1024) {
    console.warn('AdManager: видео ' + file + ' больше ' + AD_VIDEO_MAX_SIZE_MB + ' МБ — пропуск');
    return null;
  }

  const video = document.createElement('video');
  video.muted = true;
  video.defaultMuted = true;
  video.volume = 0;
  video.playsInline = true;
  video.loop = true;
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';
  video.src = url;
  video.load();

  try {
    await waitForEvent(video, 'loadedmetadata', 10000);
    if (!(video.duration > 0) || !Number.isFinite(video.duration)) {
      console.warn('AdManager: у видео ' + file + ' нет корректной длительности — пропуск');
      return null;
    }
    if (video.duration > AD_VIDEO_MAX_DURATION_SEC + 0.1) {
      console.warn('AdManager: видео ' + file + ' длиннее ' + AD_VIDEO_MAX_DURATION_SEC + ' с — пропуск');
      return null;
    }
    if (video.videoWidth > AD_VIDEO_MAX_RESOLUTION || video.videoHeight > AD_VIDEO_MAX_RESOLUTION) {
      console.warn('AdManager: видео ' + file + ' больше ' + AD_VIDEO_MAX_RESOLUTION + ' px по стороне — пропуск');
      return null;
    }

    const poster = await createVideoPoster(video, file);
    return {
      file,
      url,
      kind,
      isVideo: true,
      videoPlayable: poster.playable,
      texture: poster.texture,
      posterTexture: poster.texture,
      videoEl: video,
      videoTexture: null,
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      lastActive: 0,
      playing: false,
      external: !!(meta && meta.external),
      provider: (meta && meta.provider) || null,
      providerBannerId: (meta && meta.providerBannerId) || '',
      bannerId: makeBannerId(file, meta),
      disabled: false
    };
  } catch (error) {
    console.warn('AdManager: не удалось загрузить ' + file, error);
    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch {
      // Элемент и так не используется.
    }
    return null;
  }
}

/**
 * @param {'billboards'|'overheads'} kind
 * @param {string} file
 * @param {AssetMeta | null} [meta]
 * @returns {Promise<AdAsset | null>}
 */
async function loadAsset(kind, file, meta) {
  const url = (meta && meta.url) || assetUrl(FOLDERS[kind], file);
  if (isVideoFile(file)) return loadVideoAsset(url, file, kind, meta);
  return loadImageAsset(url, file, kind, meta);
}

/**
 * @template T
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<void>} worker
 */
async function runWithConcurrency(items, limit, worker) {
  if (!items.length) return;
  let next = 0;
  const runners = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: runners }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await worker(item);
    }
  }));
}

/**
 * @param {'billboards'|'overheads'} kind
 * @param {string[]} files
 */
async function loadFolder(kind, files) {
  const list = kind === 'billboards' ? state.billboards : state.overheads;
  await runWithConcurrency(files, 3, async (file) => {
    try {
      const asset = await loadAsset(kind, file, null);
      if (!asset) return;
      if (list.some((item) => item.file === file)) return;
      list.push(asset);
      if (asset.isVideo) state.videoAssets.push(asset);
      bumpVersion();
    } catch (error) {
      console.warn('AdManager: не удалось загрузить ' + file, error);
    }
  });
}

async function runDiscoveryAndLoad() {
  /** @type {DiscoveryResult} */
  let discovery;
  try {
    discovery = await discover();
  } catch (error) {
    console.warn('AdManager: ошибка обнаружения файлов', error);
    discovery = { source: 'fallback', billboards: [], overheads: [] };
  }

  state.source = discovery.source;
  state.billboardsTotal = discovery.billboards.length;
  state.overheadsTotal = discovery.overheads.length;
  if (state.billboardsTotal + state.overheadsTotal === 0) warnDiscoveryOnce();

  await Promise.all([
    loadFolder('billboards', discovery.billboards),
    loadFolder('overheads', discovery.overheads)
  ]);
  state.ready = true;
}

function startLoading() {
  if (state.discoveryStarted) return;
  state.discoveryStarted = true;
  void runDiscoveryAndLoad();
}

function init() {
  if (state.initStarted) return;
  state.initStarted = true;
  registerSettingsListeners();
  if (!AD_AUTODETECT_ENABLED || !state.enabled) {
    state.ready = true;
    return;
  }
  startLoading();
}

/** @param {THREE.MeshStandardMaterial | null} material @param {THREE.Texture | null | undefined} texture */
function swapMaterialMap(material, texture) {
  if (!material || !texture) return;
  if (material.map === texture) return;
  material.map = texture;
  material.needsUpdate = true;
}

/** @param {AdAsset} asset */
function ensureVideoTexture(asset) {
  if (!asset.videoEl) return null;
  if (!asset.videoTexture) {
    const texture = new THREE.VideoTexture(asset.videoEl);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    asset.videoTexture = texture;
  }
  return asset.videoTexture;
}

/** @param {AdAsset} asset */
function playVideo(asset) {
  const video = asset.videoEl;
  if (!video) return;
  video.muted = true;
  video.volume = 0;
  asset.playing = true;
  asset.lastActive = performance.now();
  try {
    const started = video.play();
    if (started && typeof started.catch === 'function') {
      started.catch(() => {
        asset.playing = false;
      });
    }
  } catch {
    asset.playing = false;
  }
}

/** @param {AdAsset} asset */
function pauseVideo(asset) {
  const video = asset.videoEl;
  asset.playing = false;
  if (!video) return;
  try {
    if (!video.paused) video.pause();
  } catch {
    // Видео могло быть выгружено браузером — это не ошибка игры.
  }
}

function countPlayingVideos() {
  let count = 0;
  for (const asset of state.videoAssets) {
    if (asset.playing) count += 1;
  }
  return count;
}

/** @param {any} material */
function materialId(material) {
  if (!material) return 'none';
  let id = materialIds.get(material);
  if (!id) {
    materialIdSeq += 1;
    id = materialIdSeq;
    materialIds.set(material, id);
  }
  return String(id);
}

/** @param {AdManagerSlot} slot @param {'billboards'|'overheads'} kind */
function placementKey(slot, kind) {
  if (slot && typeof slot.id === 'string' && slot.id) return kind + ':' + slot.id;
  if (slot && slot.slot && Number.isFinite(slot.slot.idx)) return kind + ':' + slot.slot.idx;
  return kind + ':material-' + materialId(slot && slot.material);
}

/** @param {AdManagerSlot} slot */
function slotWorldS(slot) {
  const offset = slot && Number.isFinite(slot.sOffset) ? Number(slot.sOffset) : 0;
  if (slot && slot.slot && Number.isFinite(slot.slot.s)) return slot.slot.s + offset;
  if (slot && Number.isFinite(slot.s)) return Number(slot.s) + offset;
  return null;
}

/** @param {VideoPlacement} placement */
function placementWorldS(placement) {
  const slot = placement.slot;
  if (slot && Number.isFinite(slot.s)) return slot.s + placement.sOffset;
  return null;
}

/** @param {VideoPlacement} placement */
function placementVisible(placement) {
  const roadSlot = placement.slot;
  if (roadSlot && roadSlot.billboard && roadSlot.billboard.group) {
    return roadSlot.billboard.group.visible !== false;
  }
  return true;
}

/** @param {AdManagerSlot} slot */
function slotVisible(slot) {
  if (slot && slot.slot && slot.slot.billboard && slot.slot.billboard.group) {
    return slot.slot.billboard.group.visible !== false;
  }
  return true;
}

/** @param {string} key */
function releasePlacement(key) {
  const placement = state.placements.get(key);
  if (!placement) return;
  state.placements.delete(key);
  if (placement.asset && placement.asset.isVideo) {
    let used = false;
    for (const other of state.placements.values()) {
      if (other.asset === placement.asset) {
        used = true;
        break;
      }
    }
    if (!used) pauseVideo(placement.asset);
  }
}

function clearPlacements() {
  for (const key of Array.from(state.placements.keys())) releasePlacement(key);
  for (const asset of state.videoAssets) pauseVideo(asset);
}

/** @param {AdAsset} asset @param {THREE.Texture} texture @param {boolean} isVideo @returns {AdManagerBanner} */
function makeBanner(asset, texture, isVideo) {
  return {
    texture,
    isVideo,
    videoEl: asset.videoEl || undefined,
    videoTexture: asset.videoTexture || undefined,
    posterTexture: asset.posterTexture || undefined,
    bannerId: asset.bannerId,
    file: asset.file,
    banner: asset
  };
}

/** @param {AdAsset[]} pool @param {'billboards'|'overheads'} kind */
function pickRandomAsset(pool, kind) {
  if (!pool.length) return null;
  const lastName = kind === 'overheads' ? state.lastOverhead : state.lastBillboard;
  let asset = pool[Math.floor(Math.random() * pool.length)];
  for (let attempt = 0; attempt < 4 && pool.length > 1 && asset.file === lastName; attempt += 1) {
    asset = pool[Math.floor(Math.random() * pool.length)];
  }
  if (kind === 'overheads') state.lastOverhead = asset.file;
  else state.lastBillboard = asset.file;
  return asset;
}

/**
 * @param {AdAsset} asset
 * @param {'billboards'|'overheads'} kind
 * @param {AdManagerSlot} slot
 * @param {string} key
 * @returns {AdManagerBanner}
 */
function deliverAsset(asset, kind, slot, key) {
  releasePlacement(key);

  if (kind === 'overheads') {
    return makeBanner(asset, asset.posterTexture || asset.texture, false);
  }

  if (!asset.isVideo || !asset.videoPlayable) {
    return makeBanner(asset, asset.texture, false);
  }

  /** @type {VideoPlacement} */
  const placement = {
    key,
    asset,
    material: slot.material || null,
    slot: slot.slot || null,
    sOffset: Number.isFinite(slot.sOffset) ? Number(slot.sOffset) : 0
  };
  state.placements.set(key, placement);

  const worldS = slotWorldS(slot);
  const near = worldS == null || (worldS - G.playerS >= -6 && worldS - G.playerS <= AD_VIDEO_ACTIVE_DISTANCE_M);
  if (near && slotVisible(slot) && (asset.playing || countPlayingVideos() < AD_MAX_ACTIVE_VIDEOS)) {
    const videoTexture = ensureVideoTexture(asset);
    if (videoTexture) {
      playVideo(asset);
      return makeBanner(asset, videoTexture, true);
    }
  }
  return makeBanner(asset, asset.posterTexture || asset.texture, false);
}

/** @param {AdManagerSlot} slot @returns {AdManagerBanner | null} */
function pickBannerForSlot(slot) {
  if (!state.enabled) return null;

  const kind = slot && slot.kind === 'overhead' ? 'overheads' : 'billboards';
  const key = placementKey(slot, kind);

  // Внешний провайдер (будущий Google Play) имеет приоритет и не зависит
  // от доли загруженных файлов.
  const externalPool = state.externalAssets.filter((asset) => asset.kind === kind);
  if (externalPool.length) {
    return deliverAsset(pickRandomAsset(externalPool, kind), kind, slot, key);
  }

  if (Math.random() >= state.uploadedShare) {
    releasePlacement(key);
    return null;
  }

  const pool = kind === 'overheads' ? state.overheads : state.billboards;
  const asset = pickRandomAsset(pool, kind);
  if (!asset) {
    releasePlacement(key);
    return null;
  }
  return deliverAsset(asset, kind, slot, key);
}

/** @returns {{ billboardsLoaded: number, overheadsLoaded: number, billboardsTotal: number, overheadsTotal: number }} */
function getStats() {
  return {
    billboardsLoaded: state.billboards.length,
    overheadsLoaded: state.overheads.length,
    billboardsTotal: state.billboardsTotal,
    overheadsTotal: state.overheadsTotal
  };
}

/** @param {AdAsset} asset */
function disposeAsset(asset) {
  pauseVideo(asset);
  const disposed = new Set();
  for (const texture of [asset.texture, asset.posterTexture, asset.videoTexture]) {
    if (texture && !disposed.has(texture)) {
      disposed.add(texture);
      texture.dispose();
    }
  }
  const video = asset.videoEl;
  if (video) {
    try {
      video.removeAttribute('src');
      video.load();
    } catch {
      // Элемент уже выгружен.
    }
  }
}

/** @param {AdAsset} asset */
function addExternalAsset(asset) {
  state.externalAssets.push(asset);
  state.externalByBannerId.set(asset.bannerId, asset);
  if (asset.isVideo) state.videoAssets.push(asset);
}

/** @param {string} providerId */
function removeProviderAssets(providerId) {
  const removed = state.externalAssets.filter((asset) => asset.provider && asset.provider.id === providerId);
  for (const asset of removed) {
    const index = state.externalAssets.indexOf(asset);
    if (index >= 0) state.externalAssets.splice(index, 1);
    state.externalByBannerId.delete(asset.bannerId);
    const videoIndex = state.videoAssets.indexOf(asset);
    if (videoIndex >= 0) state.videoAssets.splice(videoIndex, 1);
    for (const [key, placement] of Array.from(state.placements)) {
      if (placement.asset === asset) state.placements.delete(key);
    }
    disposeAsset(asset);
  }
}

/**
 * @param {ExternalAdProvider} provider
 * @param {ExternalAdBanner} banner
 * @returns {Promise<AdAsset | null>}
 */
async function loadExternalBanner(provider, banner) {
  if (!banner || banner.enabled === false) return null;
  const id = String(banner.id || '');
  if (!id || !banner.srcUrl) return null;
  const kind = banner.kind === 'overhead' ? 'overheads' : 'billboards';
  const meta = {
    external: true,
    provider,
    providerBannerId: id,
    url: banner.srcUrl
  };
  if (banner.type === 'video') {
    if (banner.duration && banner.duration > AD_VIDEO_MAX_DURATION_SEC + 0.1) {
      console.warn('AdManager: внешнее видео ' + id + ' длиннее ' + AD_VIDEO_MAX_DURATION_SEC + ' с — пропуск');
      return null;
    }
    return loadVideoAsset(banner.srcUrl, id, kind, meta);
  }
  return loadImageAsset(banner.srcUrl, id, kind, meta);
}

/** @param {ExternalAdProvider} provider */
async function refreshProvider(provider) {
  const token = (state.providerTokens.get(provider.id) || 0) + 1;
  state.providerTokens.set(provider.id, token);

  let banners;
  try {
    banners = await provider.getBanners();
  } catch (error) {
    console.warn('AdManager: внешний провайдер ' + provider.id + ' не отдал баннеры', error);
    banners = [];
  }

  /** @type {AdAsset[]} */
  const next = [];
  const list = Array.isArray(banners) ? banners : [];
  for (const banner of list) {
    try {
      const asset = await loadExternalBanner(provider, banner);
      if (asset) next.push(asset);
    } catch (error) {
      console.warn('AdManager: не удалось загрузить внешний баннер ' + (banner && banner.id), error);
    }
  }

  if (state.providerTokens.get(provider.id) !== token || !state.providers.has(provider.id)) {
    for (const asset of next) disposeAsset(asset);
    return;
  }

  removeProviderAssets(provider.id);
  for (const asset of next) addExternalAsset(asset);
  bumpVersion();
}

/** @param {ExternalAdProvider} provider */
function registerExternalProvider(provider) {
  if (!provider || !provider.id) return;
  state.providers.set(provider.id, provider);
  void refreshProvider(provider);
}

/** @param {string} providerId */
function unregisterExternalProvider(providerId) {
  if (!providerId) return;
  state.providers.delete(providerId);
  state.providerTokens.delete(providerId);
  removeProviderAssets(providerId);
  bumpVersion();
}

/** @param {string} bannerId */
function reportImpression(bannerId) {
  if (!bannerId) return;
  const asset = state.externalByBannerId.get(bannerId);
  if (!asset || !asset.provider) return;
  try {
    if (asset.provider.onShown) asset.provider.onShown(asset.providerBannerId);
  } catch (error) {
    console.warn('AdManager: onShown внешнего провайдера упал', error);
  }
}

/** @param {string} bannerId */
function reportClick(bannerId) {
  if (!bannerId) return;
  const asset = state.externalByBannerId.get(bannerId);
  if (!asset || !asset.provider) return;
  try {
    if (asset.provider.onClicked) asset.provider.onClicked(asset.providerBannerId);
  } catch (error) {
    console.warn('AdManager: onClicked внешнего провайдера упал', error);
  }
}

/** @param {VideoPlacement} placement */
function showPoster(placement) {
  swapMaterialMap(placement.material, placement.asset.posterTexture || placement.asset.texture);
}

function updateVideoPlayback() {
  /** @type {{ placement: VideoPlacement, ahead: number }[]} */
  const candidates = [];
  for (const placement of state.placements.values()) {
    const asset = placement.asset;
    if (!asset || !asset.isVideo || !asset.videoPlayable) continue;
    if (!placement.material) continue;
    if (!placementVisible(placement)) continue;
    const worldS = placementWorldS(placement);
    if (worldS == null) continue;
    const ahead = worldS - G.playerS;
    if (ahead < -6 || ahead > AD_VIDEO_ACTIVE_DISTANCE_M) continue;
    candidates.push({ placement, ahead });
  }
  candidates.sort((a, b) => a.ahead - b.ahead);

  /** @type {Set<AdAsset>} */
  const active = new Set();
  for (const { placement } of candidates) {
    const asset = placement.asset;
    if (!active.has(asset) && active.size >= AD_MAX_ACTIVE_VIDEOS) {
      showPoster(placement);
      continue;
    }
    const videoTexture = ensureVideoTexture(asset);
    if (!videoTexture) {
      showPoster(placement);
      continue;
    }
    active.add(asset);
    playVideo(asset);
    swapMaterialMap(placement.material, videoTexture);
  }

  for (const placement of state.placements.values()) {
    const asset = placement.asset;
    if (!asset || !asset.isVideo) continue;
    if (!active.has(asset)) showPoster(placement);
  }

  for (const asset of state.videoAssets) {
    if (!active.has(asset)) pauseVideo(asset);
  }
  const now = performance.now();
  for (const asset of active) {
    if (asset.videoTexture) asset.videoTexture.needsUpdate = true;
    asset.lastActive = now;
  }
}

/** @param {number} dt */
function update(dt) {
  const step = Number.isFinite(dt) ? dt : 0;
  state.updateClock += step;
  if (state.updateClock < 0.5) return;
  state.updateClock = 0;

  if (!state.enabled) {
    clearPlacements();
    return;
  }
  updateVideoPlayback();
}

/** @type {import('./game-state.d.ts').AdManagerApi} */
const api = {
  get version() {
    return state.version;
  },
  init,
  pickBannerForSlot,
  getStats,
  registerExternalProvider,
  unregisterExternalProvider,
  reportImpression,
  reportClick,
  registerSettingsListeners,
  update
};

export function initAdManager() {
  G.AdManager = api;
  G.updateAdManager = (dt) => api.update(dt);
  api.init();
}
