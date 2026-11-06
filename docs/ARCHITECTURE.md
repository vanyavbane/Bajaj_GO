# Архитектура

Разметка каркаса — в `index.html`. Кнопки, панели, меню и списки отдаёт пакет
`@bajajgo/design`: `js/ui.js` и `js/economy.js` импортируют его функции и вставляют
готовую разметку. `css/game.css` держит HUD и карточки содержимого, не второй набор кнопок.
Логика — ES-модули в `js/`.
Точка входа — `js/main.js`: она вызывает `init…()` строго по порядку секций.
`initGraphics()` идёт первым: до неба и меню уже известно, какие тени и фонари рисовать.
Общее состояние и функции, которые нужны соседним секциям, лежат на объекте `G`
из `js/state.js`. Секции не импортируют друг друга: чужой код зовут как `G.placeOnRoad`,
`G.selectedBike` и так далее. Three.js r160 — пакет `three@0.160.0`. В исходниках
он импортируется как `import * as THREE from 'three'`, Vite находит его в
`node_modules`.

Имена секций совпадают с комментариями в файлах.

## Карта секций

| № | Файл | Что внутри |
|---|---|---|
|   | `js/graphics.js` | настройки графики: режим, тени, масштаб, фонари, отражения, `applyGraphics` |
| 1 | `js/catalog.js` | `bikeCatalog`, `tuningCatalog`, цены, характеристики, свотчи цветов, гараж |
| 2 | `js/scene.js` | `scene`, `camera`, `renderer`, `createCanvasTexture`, PBR-генераторы асфальта и тротуара, объект материалов `M` |
| 3 | `js/road.js` | `ROAD_WIDTH`, `LANE_OFFSETS`, `LANE_SPEEDS`, функции `roadX/roadY/roadDX/roadDY`, `placeOnRoad` |
| 4 | `js/sky.js` | `skyDome` (шейдер), `FogExp2`, `hemiLight`, `sunLight`, солнце/луна, воксельные облака, пул фонарных `PointLight` |
| 5 | `js/roadSurface.js` | ленты (ribbon) асфальта, разметка, тротуары, откосы |
| 6 | `js/roadside.js` | процедурные текстуры билбордов, `createBillboardMesh`, `createBuildingGroup`, эстакады |
| 7 | `js/structures.js` | `createOverpassStructure`, `createShortTunnelStructure`, `createVoxelRampMesh`, `findSafeRampS` |
|   | `js/effects.js` | частицы прыжка, всплывающие очки, звуки прыжка и маркерной зоны |
| 8 | `js/pedestrians.js` | пешеходы на тротуарах |
| 9 | `js/traffic.js` | `vehicleTypes`, `trafficPool`, `resetTrafficVehicle`, перестроения, мигание фар |
|   | `js/models/vehicles.js` | `createVehicleModel`: седан, такси, газель, автобус, Qute в трафике |
|   | `js/geom.js` | общий кэш `BoxGeometry` / `CylinderGeometry` / `PlaneGeometry` |
| 10 | `js/bike.js` | сборка байка: материалы, фары, `applyVisualTuningToModel` |
|   | `js/models/motorcycle.js` | меш мотоцикла, райдер, детали тюнинга |
|   | `js/models/qute.js` | Bajaj Qute и обвес Юры. Пропорции не менять |
|   | `js/models/cockpit.js` | кокпит мотоцикла и Qute от первого лица |
| 11 | `js/camera.js` | переключение кокпита/третьего лица, приборная панель `updateCockpitDashboard` |
| 12 | `js/atmosphere.js` | `todPalettes` (day/sunset/night), `updateAtmosphereAndTimeOfDay`, `todCycleTime` |
| 13 | `js/highbeam.js` | `triggerHighBeam` (клавиша F), реакция трафика |
| 14 | `js/ui.js` | `startGame`, `crashGame`, `renderMainMenu` (старт, магазин, освещение), `renderShop`, `renderTuning` (экран тюнинга; из главного меню убран, тюнинг доступен через съезд) |
| 15 | `js/input.js` | `handleKey`, экранные кнопки |
| 16 | `js/economy.js` | `exitPool`, маркерные зоны съездов (`EXIT_MARKER_COLORS`, `createExitMarker`, `getExitGlowLevel`), меню POI (`renderRestaurantMenu`, `renderFuelMenu`, `renderServiceMenu`, `renderExitTuning`), заказы, топливо/износ, `handleAccident`, `togglePause` |
| 17 | `js/loop.js` | `animate(now)`: физика, трафик, коллизии, HUD, рендер |
|   | `js/debug.js` | снимок сцены `window.__bajaj` в разработке и по `?debug`. На экран не выводится |

## Ключевые переменные

**Гараж и прогресс (персистентные, `localStorage`):**

| Переменная | Ключ | Смысл |
|---|---|---|
| `bankPoints` | `bajajGO_bank` | Баланс в рублях |
| `ownedBikes` | `bajajGO_owned` | Массив id купленных байков |
| `selectedBikeId` | `bajajGO_selected` | Выбранный байк |
| `customColors` | `bajajGO_colors` | Пользовательские цвета по id |
| `bikeTuningData` | `bajajGO_tuning` | Установленные улучшения |
| `graphics` | `bajajGO_lighting` | JSON: режим, тени, масштаб, фонари, отражения. Старые строки `dlss` и `normal` ещё читаются. |
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

`placeOnRoad(obj, s, lateralOffset, heightOffset, extraYaw, extraPitch, extraRoll)` —
ставит объект на дорогу. Ориентация строится по касательной `(roadDX, roadDY, -1)`,
нос модели смотрит вдоль неё (−Z). Смещение по полосе остаётся горизонтальным:
полотно без крена. Дополнительные рыскание, тангаж и крен — в локальных осях
уже поставленного объекта (руль, прыжок, наклон байка). Любой новый объект на
трассе ставить только через неё, иначе он «повиснет» в воздухе или уедет с полотна.

## Цикл игры

```
animate(now)
  ├─ dt
  ├─ пауза / открытое модальное окно → только renderer.render, симуляция стоит
  ├─ таймеры дальнего света и плашки прыжка
  ├─ меню: демо-проезд
  ├─ заезд: скорость, руль, tickEconomy / tickOrder, прыжок, очки
  ├─ placeOnRoad байка, камера, солнце за игроком
  ├─ updateRoadSurface + updateAtmosphereAndTimeOfDay
  ├─ рампы и частицы прыжка
  ├─ обочина и фонари, мосты и тоннели
  ├─ updateExitWorld / updateDeliveryMarker
  ├─ пешеходы
  ├─ трафик: движение, перелёты, столкновения → handleAccident()
  ├─ HUD → приборная панель, бейджи, updateEcoHud()
  └─ renderer.render(scene, camera)
```

Обочина, рампы, мосты, указатели съездов и штрихи разметки стоят в мире,
пока не уедут за спину. Пока `s` тот же, `placeOnRoad` для них не вызывается.
Нормали бордюра и тротуара копируются с полотна. Нормали откосов
пересчитываются, когда игрок проехал около 3 м.

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
| Добавить машину в трафик | `createVehicleModel` в `js/models/vehicles.js` + `vehicleTypes` в `js/traffic.js` |
| Общая геометрия кузовов | `box` / `cylinder` / `plane` в `js/geom.js`. Геометрию после выдачи не крутить |
| Добавить мотоцикл в магазин | `bikeCatalog` в `js/catalog.js` |
| Добавить улучшение тюнинга | `tuningCatalog` в `js/catalog.js` |
| Цвета неба, тумана, света | `todPalettes` + `updateAtmosphereAndTimeOfDay` в `js/atmosphere.js` |
| Рекламные баннеры | `buildBillboardTextures`, `createBillboardMesh` в `js/roadside.js` |
| Частицы и звуки прыжка | `spawnOverflyParticles`, `playJumpSound`, `playExitChime` в `js/effects.js` |
| Физика разгона/торможения | `animate` в `js/loop.js` |
| Прыжки и бонусы за перелёт | `jumpState` в `js/ui.js`, `finishJumpLanding` в `js/loop.js` |
| Экономика (цены, награды) | `bikeCatalog`, `tuningCatalog` в `js/catalog.js`, `crashGame` в `js/ui.js`, доставка в `js/economy.js` |
| Съезды и точки интереса | `EXIT_TYPES`, `EXIT_META`, `resetExits`, `openExitMenu` в `js/economy.js` |
| Маркерные зоны съездов | `EXIT_MARKER_COLORS`, `createExitMarker`, `updateExitSign`, `getExitGlowLevel`, `showExitHint` в `js/economy.js` |
| Заказы и доставка | `RESTAURANTS`, `createOrder`, `tickOrder`, `deliverOrder` в `js/economy.js` |
| Топливо и износ | `FUEL_RANGE_M`, `WEAR_LIMITS`, `tickEconomy`, `applyWearToStats` в `js/economy.js` |
| Критические ситуации | `openFuelEmpty`, `handleAccident` в `js/economy.js` |
| Пауза | `togglePause`, `renderPauseMenu`, `resumeGame` в `js/economy.js` |

## Технические ограничения

- **ES-модули**: состояние на объекте `G`, в `window` его нет.
  Из консоли браузера к полям не достучаться — только через отладчик/точки останова.
- **Three.js**: пакет `three@0.160.0`, лицензия MIT. Версия зафиксирована, чтобы
  картинка не прыгала при обновлении зависимостей. CDN нет.
- **Разработка**: `npm install`, затем `npm run dev` (Vite, порт 5173). Типы —
  `js/game-state.d.ts` и `npm run typecheck` (`checkJs`, без `strict`).
  `./serve` остаётся запасным сервером: он подставляет import map на
  `node_modules/three` и перезагружает вкладку при сохранении файлов.
- **Сборка**: `npm run build` или `./build` пишет один `dist/bajaj-go.html`
  (Vite + vite-plugin-singlefile). Файл открывается двойным щелчком.
  Каталог `dist/` в git не входит. Править собранный HTML не нужно.
