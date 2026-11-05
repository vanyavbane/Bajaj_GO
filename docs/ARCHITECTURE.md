# Архитектура

Всё приложение — один файл `bajaj go.html`. Внутри он логически разбит на 16 секций,
помеченных комментариями вида `/* ===== N. НАЗВАНИЕ ===== */`.

> Номера строк — ориентир на момент коммита `c5ba168`. После правок они смещаются,
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
| 16 | Главный цикл | `animate(now)`: физика, трафик, коллизии, HUD, рендер |

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

**Состояние заезда (в памяти):** `speed`, `distance`, `score`, `playerS`,
`laneOffset`, `lateralVelocity`, `jumpState`, `comboCount`, `todCycleTime`.

**Мир:** `trafficPool` (18 машин), `roadsideSlots`, `megaStructures`,
`rampsPool`, `pedestrians`, `lampLights` (8 активных фонарей).

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
  ├─ updateAtmosphereAndTimeOfDay()  → небо, туман, свет, фазы суток
  ├─ ввод → speed, lateralOffset, прыжок
  ├─ дорога/ленты → updateRoadSurface()
  ├─ трафик → движение, перестроения, коллизии
  ├─ рампы/прыжки → перелёты, бонусы
  ├─ HUD → приборная панель, бейджи, подсказки
  └─ renderer.render(scene, camera)
```

## Где что менять

| Задача | Где |
|---|---|
| Добавить машину в трафик | `createVehicleModel` (новая ветка) + `vehicleTypes` |
| Добавить мотоцикл в магазин | `bikeCatalog` (секция 1) |
| Добавить улучшение тюнинга | `tuningCatalog` (секция 1) |
| Цвета неба, тумана, света | `todPalettes` + `updateAtmosphereAndTimeOfDay` (секция 12) |
| Рекламные баннеры | `buildBillboardTextures`, `createBillboardMesh` (секция 6) |
| Физика разгона/торможения | `animate` (секция 16) |
| Прыжки и бонусы за перелёт | `jumpState`, `finishJumpLanding`, секция 16 |
| Экономика (цены, награды) | `bikeCatalog`, `tuningCatalog`, `crashGame` |

## Технические ограничения

- **ES-модуль**: все переменные живут в области модуля, в `window` их нет.
  Из консоли браузера к ним не достучаться — только через отладчик/точки останова.
- **Three.js с CDN**: единственная внешняя зависимость. Для офлайна и APK
  библиотеку нужно положить рядом с HTML и поменять `import`.
- **Никаких сборщиков**: нет `package.json`, нет бандлера. Правки — прямо в HTML.
