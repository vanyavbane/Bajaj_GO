/** Чистая логика звуковой системы: настройки, шины, кривые и ограничение SFX. */

export const AUDIO_BUS_KEYS = ['engine', 'ambient', 'weather', 'sfx', 'ui', 'master'] as const;
export type AudioBus = (typeof AUDIO_BUS_KEYS)[number];

export interface AudioSettings {
  engine: number;
  ambient: number;
  sfx: number;
  weather: number;
  ui: number;
  master: number;
  soundOn: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: Readonly<AudioSettings> = Object.freeze({
  engine: 70,
  ambient: 45,
  sfx: 60,
  weather: 55,
  ui: 50,
  master: 80,
  soundOn: true,
});

export const VOLUME_STORAGE_PREFIX = 'bajajGO_vol_';
export const SOUND_ON_KEY = 'bajajGO_sound_on';
export const LEGACY_MUTED_KEY = 'bajajGO_soundMuted';

export type AudioStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export const ENGINE_IDS = [
  'ns125', 'ns200', 'n250', 'dominar400', 'dominar1000', 'qute', 'qute_yura',
  'boxer100es', 'boxer125', 'boxer150', 'pulsar150ns', 'pulsar180',
  'avenger220', 'dominar250',
] as const;

export const SFX_KEYS = [
  'crash', 'jump_launch', 'jump_land', 'jump_overfly', 'near_miss', 'high_beam',
  'order_pickup', 'order_deliver', 'order_fail', 'refuel', 'repair', 'purchase', 'click',
] as const;

export const AMBIENT_KEYS = ['city_day', 'city_night', 'wind_high_speed'] as const;
export const WEATHER_KEYS = ['rain_loop', 'thunder_01', 'thunder_02', 'thunder_03'] as const;

export type SfxKey = (typeof SFX_KEYS)[number];

/** Все заменяемые файлы и их фиксированные имена в папке sounds/. */
export const AUDIO_FILES: Readonly<Record<string, string>> = Object.freeze({
  ...Object.fromEntries(ENGINE_IDS.map((id) => [`engine:${id}`, `sounds/engines/${id}.mp3`])),
  ...Object.fromEntries(SFX_KEYS.map((key) => [`sfx:${key}`, `sounds/sfx/${key}.mp3`])),
  ...Object.fromEntries(AMBIENT_KEYS.map((key) => [`ambient:${key}`, `sounds/ambient/${key}.mp3`])),
  ...Object.fromEntries(WEATHER_KEYS.map((key) => [`weather:${key}`, `sounds/weather/${key}.mp3`])),
});

export interface EngineVoice {
  /** Базовая частота синтетического fallback-двигателя, Гц. */
  baseHz: number;
  /** Расстройка второго осциллятора, центы. */
  detune: number;
  /** Частота среза фильтра, Гц. */
  filterHz: number;
  type: 'sawtooth' | 'square' | 'triangle';
  /** Дополнительный высокочастотный слой у Qute Юры Волкова, Гц. */
  electricHz?: number;
}

/** Разные характеры двигателей для случая, когда MP3-файла нет. */
export const ENGINE_VOICES: Readonly<Record<string, EngineVoice>> = Object.freeze({
  ns125:       { baseHz: 118, detune: 8,  filterHz: 900,  type: 'sawtooth' },
  ns200:       { baseHz: 104, detune: 11, filterHz: 820,  type: 'sawtooth' },
  n250:        { baseHz: 92,  detune: 13, filterHz: 740,  type: 'sawtooth' },
  dominar400:  { baseHz: 76,  detune: 17, filterHz: 640,  type: 'sawtooth' },
  dominar1000: { baseHz: 132, detune: 23, filterHz: 1500, type: 'sawtooth' },
  qute:        { baseHz: 84,  detune: 19, filterHz: 680,  type: 'square' },
  qute_yura:   { baseHz: 96,  detune: 27, filterHz: 1250, type: 'square', electricHz: 720 },
  boxer100es:  { baseHz: 128, detune: 6,  filterHz: 760,  type: 'triangle' },
  boxer125:    { baseHz: 112, detune: 9,  filterHz: 800,  type: 'triangle' },
  boxer150:    { baseHz: 102, detune: 10, filterHz: 860,  type: 'triangle' },
  pulsar150ns: { baseHz: 110, detune: 12, filterHz: 940,  type: 'sawtooth' },
  pulsar180:   { baseHz: 98,  detune: 14, filterHz: 880,  type: 'sawtooth' },
  avenger220:  { baseHz: 78,  detune: 16, filterHz: 560,  type: 'sawtooth' },
  dominar250:  { baseHz: 88,  detune: 12, filterHz: 700,  type: 'sawtooth' },
});

export const ENGINE_RATE_MIN = 0.55;
export const ENGINE_RATE_MAX = 1.35;
export const SFX_COOLDOWN_MS: Readonly<Record<string, number>> = Object.freeze({
  click: 30,
  near_miss: 90,
  jump_overfly: 60,
  jump_land: 120,
  high_beam: 250,
  crash: 400,
  purchase: 120,
  default: 40,
});

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function clampPercent(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : finite(value, NaN);
  if (!Number.isFinite(n)) return clampDefault(fallback);
  return Math.round(Math.max(0, Math.min(100, n)));
}

function clampDefault(fallback: number): number {
  return Math.round(Math.max(0, Math.min(100, finite(fallback, 0))));
}

/** Старый ключ `bajajGO_soundMuted` остаётся совместимым, но не перебивает новый. */
export function parseSoundOn(raw: string | null, legacyMuted: string | null): boolean {
  if (raw === '0' || raw === 'false') return false;
  if (raw === '1' || raw === 'true') return true;
  return legacyMuted !== '1';
}

export function readAudioSettings(storage: Pick<AudioStorage, 'getItem'>): AudioSettings {
  const get = (key: string) => {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  };
  const settings: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };
  for (const bus of AUDIO_BUS_KEYS) {
    settings[bus] = clampPercent(get(VOLUME_STORAGE_PREFIX + bus), DEFAULT_AUDIO_SETTINGS[bus]);
  }
  settings.soundOn = parseSoundOn(get(SOUND_ON_KEY), get(LEGACY_MUTED_KEY));
  return settings;
}

export function settingsToStorage(settings: AudioSettings): Record<string, string> {
  const out: Record<string, string> = {
    [SOUND_ON_KEY]: settings.soundOn ? '1' : '0',
    [LEGACY_MUTED_KEY]: settings.soundOn ? '0' : '1',
  };
  for (const bus of AUDIO_BUS_KEYS) {
    out[VOLUME_STORAGE_PREFIX + bus] = String(clampPercent(settings[bus], DEFAULT_AUDIO_SETTINGS[bus]));
  }
  return out;
}

export function saveAudioSettings(storage: AudioStorage, settings: AudioSettings): void {
  const values = settingsToStorage(settings);
  try {
    for (const [key, value] of Object.entries(values)) storage.setItem(key, value);
  } catch {
    // Приватный режим браузера может запретить localStorage — игра продолжает работать.
  }
}

/** Обороты: 0.55 на холостом ходу и 1.35 в красной зоне выбранной передачи. */
export function engineRate(rpmFrac: number): number {
  const t = Math.max(0, Math.min(1, finite(rpmFrac, 0)));
  return ENGINE_RATE_MIN + (ENGINE_RATE_MAX - ENGINE_RATE_MIN) * t;
}

/** Громкость растёт вместе с оборотами и падает при переключении передачи. */
export function engineGain(rpmFrac: number): number {
  const t = Math.max(0, Math.min(1, finite(rpmFrac, 0)));
  return 0.12 + 0.5 * t;
}

export function windGain(speed: number): number {
  return Math.max(0, Math.min(1, (finite(speed, 0) - 60) / 180)) * 0.6;
}

/** Ночной фон: те же границы, что у иконки «moon» в atmosfere.js. */
export function isNightish(todCycleTime: number): boolean {
  const t = finite(todCycleTime, 0);
  return t >= 0.475 && t < 0.9;
}

export function rainSoundGain(level: number): number {
  return Math.max(0, Math.min(1, finite(level, 0))) * 0.32;
}

/** Перелёт: тон растёт с комбо, slow-mo понижает общий тон. */
export function sfxRate(combo = 1, pitch = 1): number {
  const n = Math.max(1, finite(combo, 1));
  const p = Math.max(0.45, Math.min(1, finite(pitch, 1)));
  return Math.min(1.5, (1 + Math.min(n, 8) * 0.08) * p);
}

export function thunderDelay(roll = Math.random()): number {
  const r = Math.max(0, Math.min(1, finite(roll, 0.5)));
  return 1 + r * 0.5;
}

export function thunderRate(roll = Math.random()): number {
  const r = Math.max(0, Math.min(1, finite(roll, 0.5)));
  return 0.9 + r * 0.2;
}

export function thunderFile(roll = Math.random()): string {
  const r = Math.max(0, Math.min(1, finite(roll, 0)));
  return `thunder_0${1 + Math.min(2, Math.floor(r * 3))}`;
}

/** Не больше трёх одинаковых SFX в коротком окне: кажется одной волной, не кашей. */
export function allowSfx(key: string, nowMs: number, lastPlayed: Record<string, number>): boolean {
  const cooldown = SFX_COOLDOWN_MS[key] ?? SFX_COOLDOWN_MS.default;
  const previous = lastPlayed[key];
  if (Number.isFinite(previous) && nowMs - previous < cooldown) return false;
  lastPlayed[key] = nowMs;
  return true;
}
