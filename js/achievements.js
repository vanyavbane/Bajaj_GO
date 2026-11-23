export const ACHIEVEMENT_THRESHOLDS = {
  // TODO: подобрать пороги под реальный масштаб игры
  pilot: [1000, 5000, 15000, 50000, 150000], // метры в полёте
  closeCall: [3, 8, 15, 30, 50], // максимальное комбо
  dealer: [1, 5, 15, 40, 100], // ремонты на СТО
  towCalled: [1, 3, 10, 25, 50], // вызовы эвакуатора
  towRefused: [1, 3, 10, 25, 50], // отказы от эвакуатора
  collector: [1, 2, 4, 7, 12], // куплено мотоциклов (кроме стартового)
  courier: [1, 10, 30, 75, 150], // успешные доставки
  trucker: [10000, 50000, 150000, 500000, 1500000], // общий пробег, метры
  petersburger: [5000, 20000, 60000, 150000, 400000], // пробег Набережная, метры
  forester: [5000, 20000, 60000, 150000, 400000], // пробег Лес, метры
  disturber: [5000, 20000, 60000, 150000, 400000], // пробег Город, метры
  mountaineer: [5000, 20000, 60000, 150000, 400000], // пробег Горы, метры
  mkadWarrior: [5000, 20000, 60000, 150000, 400000], // пробег МКАД, метры
  speedDemon: [80, 120, 160, 220, 300], // максимальная скорость, км/ч
  leftTurner: [1, 10, 30, 75, 150], // повороты налево на развязке
};

export const ACHIEVEMENT_DEFS = [
  { id: 'pilot', title: 'Лётчик', description: 'Суммарное расстояние в полёте на мотоцикле.', icon: '🪽', type: 'counter', stat: 'flightDistanceM', unit: 'm' },
  { id: 'closeCall', title: 'В притирку', description: 'Максимальное накопленное комбо.', icon: '⚡', type: 'counter', stat: 'maxCombo', unit: '' },
  { id: 'dealer', title: 'Официальный диллер', description: 'Заезды на СТО с выполненным ремонтом.', icon: '🔧', type: 'counter', stat: 'stoRepairs', unit: '' },
  { id: 'towCalled', title: 'Расчётливый', description: 'Вызовы эвакуатора при пустом баке.', icon: '🚚', type: 'counter', stat: 'fuelTowCalls', unit: '' },
  { id: 'towRefused', title: 'Сэкономил — заработал', description: 'Отказы от эвакуатора при пустом баке.', icon: '💰', type: 'counter', stat: 'fuelTowRefusals', unit: '' },
  { id: 'collector', title: 'Коллекционер', description: 'Куплено мотоциклов в магазине.', icon: '🏍️', type: 'counter', stat: 'bikesBought', unit: '' },
  { id: 'courier', title: 'Успешный курьер', description: 'Успешно доставленные заказы.', icon: '📦', type: 'counter', stat: 'successfulDeliveries', unit: '' },
  { id: 'trucker', title: 'Дальнобойщик', description: 'Общий пробег по всем биомам.', icon: '🛣️', type: 'counter', stat: 'totalBiomeDistanceM', unit: 'm' },
  { id: 'petersburger', title: 'Питербуржец', description: 'Пробег по биому «Набережная».', icon: '🌉', type: 'counter', stat: 'biomeDistanceM.embankment', unit: 'm' },
  { id: 'forester', title: 'Лесник', description: 'Пробег по биому «Лес».', icon: '🌲', type: 'counter', stat: 'biomeDistanceM.forest', unit: 'm' },
  { id: 'disturber', title: 'Нарушитель спокойствия', description: 'Пробег по биому «Город».', icon: '🏙️', type: 'counter', stat: 'biomeDistanceM.city', unit: 'm' },
  { id: 'mountaineer', title: 'Горец', description: 'Пробег по биому «Горы».', icon: '⛰️', type: 'counter', stat: 'biomeDistanceM.mountain', unit: 'm' },
  { id: 'mkadWarrior', title: 'МКАД-ый воин', description: 'Пробег по биому «МКАД».', icon: '🛣️', type: 'counter', stat: 'biomeDistanceM.mkad', unit: 'm' },
  { id: 'speedDemon', title: 'Бл#ь я второй', description: 'Максимальная скорость на любом мотоцикле.', icon: '🏁', type: 'counter', stat: 'maxSpeedKmh', unit: 'kmh' },
  { id: 'leftTurner', title: 'Ходок', description: 'Выбор левого поворота на развязке.', icon: '⬅️', type: 'counter', stat: 'forkLeftChoices', unit: '' },
  { id: 'traveler', title: 'Путешественник', description: 'Посетить все биомы.', icon: '🧭', type: 'boolean', stat: 'allBiomesVisited' },
];

function readStat(stats, path) {
  if (!path) return 0;
  const parts = path.split('.');
  let cur = stats;
  for (const p of parts) {
    if (cur == null) return 0;
    cur = cur[p];
  }
  return cur;
}

export function achievementLevel(value, thresholds) {
  let level = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (value >= thresholds[i]) level = i + 1;
  }
  return level;
}

export function evaluateAchievements(stats) {
  const src = stats && typeof stats === 'object' ? stats : {};
  return ACHIEVEMENT_DEFS.map((def) => {
    if (def.type === 'boolean') {
      const unlocked = !!readStat(src, def.stat);
      return { id: def.id, value: unlocked ? 1 : 0, level: unlocked ? 1 : 0, unlocked };
    }
    const value = Number(readStat(src, def.stat)) || 0;
    const thresholds = ACHIEVEMENT_THRESHOLDS[def.id] || [];
    const level = achievementLevel(value, thresholds);
    return { id: def.id, value, level, unlocked: level > 0 };
  });
}
