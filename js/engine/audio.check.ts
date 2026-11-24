/**
 * Звук: настройки, кривые двигателя/ветра/дождя и ограничение повторов SFX.
 * Проверки чистые: не трогают DOM, WebAudio и localStorage браузера.
 */
declare const console: { log(message: string): void };

import {
  AUDIO_BUS_KEYS,
  AUDIO_FILES,
  DEFAULT_AUDIO_SETTINGS,
  ENGINE_IDS,
  ENGINE_RATE_MAX,
  ENGINE_RATE_MIN,
  ENGINE_VOICES,
  LEGACY_MUTED_KEY,
  SFX_KEYS,
  SOUND_ON_KEY,
  VOLUME_STORAGE_PREFIX,
  allowSfx,
  engineGain,
  engineRate,
  isNightish,
  parseSoundOn,
  rainSoundGain,
  readAudioSettings,
  saveAudioSettings,
  settingsToStorage,
  sfxRate,
  thunderDelay,
  thunderFile,
  thunderRate,
  windGain,
  type AudioSettings,
  type AudioStorage,
} from './audio.ts';

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

function near(a: number, b: number, message: string, eps = 1e-9): void {
  assert(Math.abs(a - b) < eps, `${message}: ${a} != ${b}`);
}

/* ---------- Настройки ---------- */

assert(AUDIO_BUS_KEYS.length === 6, 'ровно шесть шин');
assert(AUDIO_BUS_KEYS.includes('sfx') && AUDIO_BUS_KEYS.includes('master'), 'шины sfx и master есть');
assert(DEFAULT_AUDIO_SETTINGS.engine === 70 && DEFAULT_AUDIO_SETTINGS.ambient === 45, 'дефолты мотора и окружения');
assert(DEFAULT_AUDIO_SETTINGS.sfx === 60 && DEFAULT_AUDIO_SETTINGS.weather === 55, 'дефолты SFX и погоды');
assert(DEFAULT_AUDIO_SETTINGS.ui === 50 && DEFAULT_AUDIO_SETTINGS.master === 80, 'дефолты UI и мастера');
assert(DEFAULT_AUDIO_SETTINGS.soundOn, 'звук по умолчанию включён');

assert(parseSoundOn('0', '0') === false, 'sound_on=0 выключает звук');
assert(parseSoundOn('1', '1') === true, 'новый ключ важнее старого');
assert(parseSoundOn(null, '1') === false, 'старый soundMuted всё ещё работает');
assert(parseSoundOn(null, null) === true, 'пустые ключи — звук включён');

const memory = new Map<string, string>();
const storage: AudioStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => { memory.set(key, value); },
};
const fresh = readAudioSettings(storage);
assert(JSON.stringify(fresh) === JSON.stringify({ ...DEFAULT_AUDIO_SETTINGS }), 'пустое хранилище даёт дефолты');

memory.set(VOLUME_STORAGE_PREFIX + 'engine', '33');
memory.set(VOLUME_STORAGE_PREFIX + 'master', '900');
memory.set(VOLUME_STORAGE_PREFIX + 'sfx', '-12');
memory.set(VOLUME_STORAGE_PREFIX + 'weather', 'abc');
memory.set(SOUND_ON_KEY, '0');
memory.set(LEGACY_MUTED_KEY, '0');
const parsed = readAudioSettings(storage);
assert(parsed.engine === 33, 'громкость движка читается');
assert(parsed.master === 100, 'значение выше 100 обрезается');
assert(parsed.sfx === 0, 'отрицание обрезается в ноль');
assert(parsed.weather === DEFAULT_AUDIO_SETTINGS.weather, 'нечисловое значение заменяется дефолтом');
assert(parsed.soundOn === false, 'выключенный звук читается');

const saved: AudioSettings = { engine: 12, ambient: 34, sfx: 56, weather: 78, ui: 90, master: 100, soundOn: false };
saveAudioSettings(storage, saved);
assert(memory.get(VOLUME_STORAGE_PREFIX + 'engine') === '12', 'сохранение громкости движка');
assert(memory.get(SOUND_ON_KEY) === '0', 'сохранение sound_on');
assert(memory.get(LEGACY_MUTED_KEY) === '1', 'старый ключ синхронизируется');
assert(JSON.stringify(settingsToStorage(saved)) === JSON.stringify(settingsToStorage(saved)), 'сериализация стабильна');

const brokenStorage: AudioStorage = {
  getItem: () => { throw new Error('denied'); },
  setItem: () => { throw new Error('denied'); },
};
assert(readAudioSettings(brokenStorage).engine === 70, 'закрытый localStorage не ломает чтение');
saveAudioSettings(brokenStorage, saved);

/* ---------- Файлы и голоса ---------- */

assert(ENGINE_IDS.length === 14, 'каталог двигателей из 14 машин');
for (const id of ENGINE_IDS) {
  assert(AUDIO_FILES[`engine:${id}`] === `sounds/engines/${id}.mp3`, `файл двигателя ${id}`);
  assert(!!ENGINE_VOICES[id], `процедурный голос ${id}`);
}
assert(ENGINE_VOICES.qute_yura.electricHz === 720, 'электрический слой Qute Юры задан');
for (const key of SFX_KEYS) {
  assert(AUDIO_FILES[`sfx:${key}`] === `sounds/sfx/${key}.mp3`, `файл SFX ${key}`);
}
for (const key of ['city_day', 'city_night', 'wind_high_speed'] as const) {
  assert(AUDIO_FILES[`ambient:${key}`] === `sounds/ambient/${key}.mp3`, `файл окружения ${key}`);
}
for (const key of ['rain_loop', 'thunder_01', 'thunder_02', 'thunder_03'] as const) {
  assert(AUDIO_FILES[`weather:${key}`] === `sounds/weather/${key}.mp3`, `файл погоды ${key}`);
}
assert(Object.keys(AUDIO_FILES).length === 14 + 13 + 3 + 4, 'всего 34 заменяемых файла');

/* ---------- Кривые ---------- */

near(engineRate(0), ENGINE_RATE_MIN, 'холостой ход');
near(engineRate(1), ENGINE_RATE_MAX, 'красная зона передачи');
near(engineRate(0.5), (ENGINE_RATE_MIN + ENGINE_RATE_MAX) / 2, 'середина оборотов');
near(engineRate(2), ENGINE_RATE_MAX, 'обороты выше красной зоны не уходят выше 1.35');
assert(Number.isFinite(engineRate(Number.NaN)) && engineRate(Number.NaN) === ENGINE_RATE_MIN, 'битые обороты не дают NaN');
near(engineGain(0), 0.12, 'громкость на холостых');
near(engineGain(1), 0.62, 'громкость в красной зоне');
near(engineGain(0.5), 0.37, 'громкость на средних оборотах');
assert(engineGain(1) > engineGain(0.5) && engineGain(0.5) > engineGain(0), 'громкость растёт с оборотами');
near(windGain(60), 0, 'ветер не звучит до 60 км/ч');
near(windGain(150), 0.3, 'ветер на 150 км/ч');
near(windGain(300), 0.6, 'ветер насыщается на 0.6');
near(rainSoundGain(0), 0, 'дождя нет');
near(rainSoundGain(1), 0.32, 'максимальный дождь тихий');
assert(!isNightish(0.3) && isNightish(0.55) && isNightish(0.85) && !isNightish(0.95), 'ночной фон совпадает с иконкой луны');
near(sfxRate(1, 1), 1.08, 'перелёт без комбо');
near(sfxRate(5, 1), 1.4, 'перелёт с комбо');
near(sfxRate(20, 1), 1.5, 'перелёт ограничен сверху');
near(sfxRate(5, 0.45), 0.63, 'slow-mo понижает тон перелёта');
assert(thunderDelay(0) >= 1 && thunderDelay(1) <= 1.5, 'гром через 1–1.5 с');
assert(thunderRate(0) === 0.9 && thunderRate(1) === 1.1, 'варианты тона грома 0.9–1.1');
assert(thunderFile(0) === 'thunder_01' && thunderFile(0.5) === 'thunder_02' && thunderFile(0.99) === 'thunder_03', 'три варианта грома');

/* ---------- Ограничение SFX ---------- */

const last: Record<string, number> = {};
assert(allowSfx('near_miss', 1000, last), 'первый близкий пролёт разрешён');
assert(!allowSfx('near_miss', 1050, last), 'слишком частые пролёты режутся');
assert(allowSfx('near_miss', 1100, last), 'после 90 мс пролёт снова разрешён');
assert(allowSfx('click', 1100, last), 'другой тип звука не зависит от предыдущего');
assert(!allowSfx('click', 1105, last), 'клики не сливаются в кашу');
assert(allowSfx('jump_overfly', 2000, last), 'перелёт не блокируется кликом');

console.log('audio.check: ok');
