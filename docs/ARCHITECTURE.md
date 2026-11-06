# Архитектура

Всё приложение — один файл `bajaj go.html`. Внутри он логически разбит на 17 секций,
помеченных комментариями вида `/* ===== N. НАЗВАНИЕ ===== */`.

> Номера строк — ориентир на момент коммита `46e8e28`. После правок они смещаются,
> ищите по названию секции.

## Карта секций

| № | Секция | Что внутри |
|---|---|---|
| 1 | Каталог техники и тюнинг | `bikeCatalog`, `tuningCatalog`, цены, характеристики, свотчи цветов, гаража |
| 2 | Сцена, рендерер, материалы | `scene`, `camera`, `renderer`, `createCanvasTexture`, PBR-генераторы асфальта и тротуара, объект материалов `M` |
| 3 | Геометрия дороги | `ROAD_WIDTH`, `LANE_OFFSETS`, `LANE_SPEEDS`, функции `roadX/roadY/roadDX/roadDY`, `placeOnRoad` |
| 4 | Небо, свет | `skyDome` (шейдер), `FogExp2`, `hemiLight`, `sunLight`, солнце/луна, воксельные облака, пул фонарных `PointLight` |
| 5 | Дорожное полотно | ленты (ribbon) асфальта, разметка, тротуары, откосы |
| 6 | Реклама и здания | процедурные текстуры билбордов, `createBillboardMesh`, `createBuildingGroup`, эстакады |
| 7 | Мосты, тоннели, рампы | `createOverpassStructure`, `createShortTunnelStructure`, `createVoxelRampMesh`, `findSafeRampS` |
| 8 | Частицы и эффекты | `spawnOverflyParticles`, `spawnFloatingPopup`, звуки прыжка |
| 9 | Трафик | `createVehicleModel`, `vehicleTypes`, `trafficPool`, `resetTrafficVehicle`, перестроения, мигание фар |
| 10 | Байк игрока | сборка моделей мотоциклов, кокпит, тюнинг-детали, `applyVisualTuningToModel` |
| 11 | Камера и HUD | переключение кокпита/третьего лица, приборная панель `updateCockpitDashboard` |
| 12 | Время суток | `todPalettes` (day/sunset/night), `updateAtmosphereAndTimeOfDay`, `todCycleTime` |
| 13 | Дальний свет | `triggerHighBeam` (клавиша F), реакция трафика |
| 14 | Состояние игры и UI | `startGame`, `crashGame`, `renderMainMenu`, `renderShop`, `renderTuning` |
| 15 | Ввод | `handleKey`, экранные кнопки |
| 16 | Съезды, экономика, критические ситуации и пауза | `exitPool`, маркерные зоны съездов (`EXIT_MARKER_COLORS`, `createExitMarker`, `getExitGlowLevel`), меню POI (`renderRestaurantMenu`, `renderFuelMenu`, `renderServiceMenu`, `renderExitTuning`), заказы, топливо/износ, `handleAccident`, `togglePause` |
| 17 | Главный цикл | `animate(now)`: физика, трафик, коллизии, HUD, рендер |

## Ключевые переменные

**Гараж и прогресс (персистентные, `localStorage`):**

| Переменная | Ключ | Смысл |
|---|---|---|
| `bankPoints` | `bajajGO_bank` | Баланс в рублях |
| `ownedBikes` | `bajajGO_owned` | Массив id купленных байков |
| `selectedBikeId` | `bajajGO_selected` | Выбранный байк |
| `customColors` | `bajajGO_colors` | Пользовательские цвета по id |
| `bikeTuningData` | `bajajGO_tuning` | Установленные улучшения |
| `lightingQuality` | `bajajGO_lighting` | `'dlss'` \| `'normal'` |
| `cameraMode` | `bajajGO_camera` | `'cockpit'` \| `'third'` |
| `fuelM` | `bajajGO_fuel` | Остаток топлива в метрах (0…`FUEL_RANGE_M` = 25 000) |
| `wearM` | `bajajGO_wear` | JSON `{pads, oil, plugs}` — пройденные метры с момента замены |
| `limpMode` | `bajajGO_limp` | `'1'` — езда «своим ходом» после пустого бака (5 км/ч) |
| `activeOrder` | `bajajGO_order` | JSON активного заказа: ресторан, остаток пути/времени, награда |

**Состояние заезда (в памяти):** `speed`, `distance`, `score`, `playerS`,
`laneOffset`, `lateralVelocity`, `jumpState`, `comboCount`, `todCycleTime`,
`paused`, `uiModal`, `bankedOrderRun`.

`bankedOrderRun` — сколько рублей за заказы уже зачислено на баланс во время
заезда. В конце заезда `score - bankedOrderRun` добавляется к `bankPoints`,
чтобы награда не зачислилась дважды.

**Мир:** `trafficPool` (18 машин), `roadsideSlots`, `megaStructures`,
`rampsPool`, `pedestrians`, `lampLights` (8 активных фонарей), `exitPool`
(5 съездов с маркерными зонами), `deliveryMarker`.

## Система координат

Дорога описывается параметром `s` — пройденный путь вдоль трассы.

```
x = roadX(s) + lateralOffset   // lateralOffset из LANE_OFFSETS
y = roadY(s)                   // рельеф
z = -s
```

`placeOnRoad(obj, s, lateralOffset, heightOffset)` — ставит объект на дорогу
с учётом поворота и уклона. Любой новый объект на трассе ставить только через неё,
иначе он «повиснет» в воздухе или уедет с полотна.

## Цикл игры

```
animate(now)
  ├─ dt
  ├─ пауза / открытое модальное окно → только renderer.render, симуляция стоит
  ├─ updateAtmosphereAndTimeOfDay()  → небо, туман, свет, фазы суток
  ├─ ввод → speed, lateralOffset, прыжок
  ├─ tickEconomy() → топливо, износ; tickOrder() → таймер и доставка
  ├─ дорога/ленты → updateRoadSurface()
  ├─ трафик → движение, перестроения, коллизии → handleAccident()
  ├─ рампы/прыжки → перелёты, бонусы
  ├─ updateExitWorld(dt) / updateDeliveryMarker() → съезды, маркерные зоны, точка заказа
  ├─ HUD → приборная панель, бейджи, updateEcoHud()
  └─ renderer.render(scene, camera)
```

## Экономика и съезды

- `exitPool` — 5 объектов-съездов, которые переиспользуются (пулинг): когда съезд
  уходит за игрока, он переносится вперёд на `EXIT_MIN_GAP…EXIT_MAX_GAP` (300–800 м).
- Съезд срабатывает, когда игрок прижимается к краю (`laneOffset > 7.45` справа
  или `< -7.45` слева) в радиусе 11 м от `exit.s`. Открывается локальное меню.
- Топливо: полного бака хватает на 25 000 м. Заправка — 500 ₽.
- Пустой бак: эвакуатор за 1000 ₽ (перемещает на 120 м вперёд и открывает АЗС)
  либо отказ → `limpMode`, максимум 5 км/ч, аварийная АЗС ставится в 70 м.
- Износ: колодки 60 000 м (−35% торможения), масло 40 000 м (−30% динамики),
  свечи 100 000 м (−18% максималки). Замена — на СТО.
- Заказ: 150–760 м, 30–120 с, база 300–1000 ₽. Награда = база × (0.45 + 0.55 ×
  доля оставшегося времени). Просрочка — штраф 25% базы (мин. 100 ₽), заказ
  остаётся. Награда сразу зачисляется на баланс.
- ДТП с активным заказом: скорая 250 ₽ (заказ сохраняется) или конец заезда.
  Без заказа — прежний `crashGame()`.
- Пауза (Esc / P / кнопка ⏸): замораживает `animate`, включая таймер заказа.
  Меню: продолжить, настройки (свет/камера), в главное меню.

### Маркерные зоны съездов

Перед каждым съездом на полосе, ведущей к нему, лежит светящаяся прямоугольная
зона в духе маркеров входа из GTA Vice City. Она не перегораживает дорогу —
её можно проехать мимо.

- Цвет: зелёный `EXIT_MARKER_COLORS.food` (`0x3ce07d`) — рестораны,
  жёлтый `EXIT_MARKER_COLORS.service` (`0xffd24a`) — АЗС, СТО, тюнинг.
- Размер: `EXIT_ZONE_WIDTH` = 4.8 м (чуть шире полосы), `EXIT_ZONE_LENGTH` = 5.4 м
  (ТЗ: 3–6 м). Центр зоны — на `EXIT_ZONE_OFFSET` = 12.5 м раньше центра съезда,
  в полосе `e.side * 7.1`.
- Материал: `MeshBasicMaterial` с `AdditiveBlending`, `toneMapped: false`,
  `depthWrite: false`. Яркость имитирует emissive + мягкий Bloom без
  постобработки и без дополнительных источников света.
- Текстуры (`exitMarkerTextures`) процедурные: белая рамка/шевроны зоны,
  круглые иконки типов и подписи. Цвет зоны задаётся `material.color`,
  поэтому одна текстура работает для обоих цветов.
- Пульсация и свечение: `exitPulseT` + `getExitGlowLevel()` — днём ~0.45,
  ночью 1.0; у каждой зоны свой `pulsePhase`. Подпись («РЕСТОРАН», «АЗС»,
  «СТО», «ТЮНИНГ») появляется на дистанции ближе 105 м.
- Иконка типа — `Sprite` (`iconSprite`) над зоной, подпись — второй `Sprite`
  (`labelSprite`). Оба `fog: false`, чтобы не тонуть в тумане.
- Отклик при въезде: если игрок в полосе зоны (`|laneOffset - side*7.1| < 2.6`)
  и попал в её длину, зона вспыхивает (`zoneFlash`), в HUD показывается
  `#exit-hint` (иконка, тип, стрелка направления) и играет `playExitChime()`.
- Пулинг: зона живёт внутри объекта `exitPool`; при переносе съезда вперёд
  `resetExits`/`updateExitWorld` сбрасывают `used`, `zoneEntered`, `zoneFlash`
  и `pulsePhase`, а `updateExitSign` меняет цвет, иконку и подпись.
- Позиционирование — через `placeOnRoad`, поэтому зона следует поворотам,
  подъёмам и спускам; работает в обеих камерах и не перекрывает HUD.

## Где что менять

| Задача | Где |
|---|---|
| Добавить машину в трафик | `createVehicleModel` (новая ветка) + `vehicleTypes` |
| Добавить мотоцикл в магазин | `bikeCatalog` (секция 1) |
| Добавить улучшение тюнинга | `tuningCatalog` (секция 1) |
| Цвета неба, тумана, света | `todPalettes` + `updateAtmosphereAndTimeOfDay` (секция 12) |
| Рекламные баннеры | `buildBillboardTextures`, `createBillboardMesh` (секция 6) |
| Физика разгона/торможения | `animate` (секция 16) |
| Прыжки и бонусы за перелёт | `jumpState`, `finishJumpLanding`, секция 17 |
| Экономика (цены, награды) | `bikeCatalog`, `tuningCatalog`, `crashGame`, секция 16 |
| Съезды и точки интереса | `EXIT_TYPES`, `EXIT_META`, `resetExits`, `openExitMenu` (секция 16) |
| Маркерные зоны съездов | `EXIT_MARKER_COLORS`, `createExitMarker`, `updateExitSign`, `getExitGlowLevel`, `showExitHint` (секция 16) |
| Заказы и доставка | `RESTAURANTS`, `createOrder`, `tickOrder`, `deliverOrder` (секция 16) |
| Топливо и износ | `FUEL_RANGE_M`, `WEAR_LIMITS`, `tickEconomy`, `applyWearToStats` (секция 16) |
| Критические ситуации | `openFuelEmpty`, `handleAccident` (секция 16) |
| Пауза | `togglePause`, `renderPauseMenu`, `resumeGame` (секция 16) |

## Технические ограничения

- **ES-модуль**: все переменные живут в области модуля, в `window` их нет.
  Из консоли браузера к ним не достучаться — только через отладчик/точки останова.
- **Three.js с CDN**: единственная внешняя зависимость. Для офлайна и APK
  библиотеку нужно положить рядом с HTML и поменять `import`.
- **Никаких сборщиков**: нет `package.json`, нет бандлера. Правки — прямо в HTML.
