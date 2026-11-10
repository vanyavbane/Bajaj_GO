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
| 1 | `js/catalog.js` | `bikeCatalog`, `tuningCatalog`, цены, характеристики, свотчи, `purchaseUpgrade` и `toggleUpgrade` |
| 2 | `js/scene.js` | `scene`, `camera`, `renderer`, `createCanvasTexture`, PBR-генераторы асфальта и тротуара, объект материалов `M` |
| 3 | `js/road.js` | `ROAD_WIDTH`, `ROAD_EDGE`, `LANE_OFFSETS`, `START_LANE`, функции `roadX/roadY/roadDX/roadDY`, `placeOnRoad` |
|   | `js/engine/` | чистые модули без Three.js: `rules`, `motion`, `stream`, `vehicle`, `money` |
| 4 | `js/sky.js` | `skyDome` (шейдер), `FogExp2`, `hemiLight`, `sunLight`, солнце/луна, воксельные облака, пул фонарных `PointLight` |
| 5 | `js/roadSurface.js` | ленты (ribbon) асфальта, разметка, тротуары, откосы |
| 6 | `js/roadside.js` | процедурные текстуры билбордов, `createBillboardMesh`, `createBuildingGroup`, эстакады |
| 7 | `js/structures.js` | `createOverpassStructure`, `createShortTunnelStructure`, `createVoxelRampMesh`, `findSafeRampS` |
|   | `js/effects.js` | частицы прыжка, фид комбо и улучшений по центру, звуки прыжка, фида и маркерной зоны, slow-mo (`triggerSlowMo` / `updateSlowMo` / `endSlowMo`, виньетка и бейдж) |
| 8 | `js/pedestrians.js` | пешеходы на тротуарах |
| 9 | `js/traffic.js` | пул машин, `resetTrafficVehicle`, `updateTraffic`, запуск slow-mo на третьей перелетённой машине |
|   | `js/models/vehicles.js` | `createVehicleModel`: седан, такси, газель, автобус, Qute в трафике |
|   | `js/geom.js` | общий кэш `BoxGeometry` / `CylinderGeometry` / `PlaneGeometry` |
| 10 | `js/bike.js` | сборка байка: материалы, фары, `applyVisualTuningToModel` |
|   | `js/models/motorcycle.js` | меш мотоцикла, райдер, детали тюнинга |
|   | `js/models/qute.js` | Bajaj Qute и обвес Юры. Пропорции не менять |
|   | `js/models/cockpit.js` | кокпит мотоцикла и Qute от первого лица |
| 11 | `js/camera.js` | переключение кокпита/третьего лица, приборная панель `updateCockpitDashboard`, профили кокпита `getCamProfile` / `saveCamProfiles` (FOV и высота), экран `renderCameraSettings` с живым предпросмотром |
| 12 | `js/atmosphere.js` | `todPalettes` (day/sunset/night), `updateAtmosphereAndTimeOfDay`, `todCycleTime`; гасит небо/свет и сгущает туман по `G.weather` |
|   | `js/weather.js` | расписание дождя, `InstancedMesh` капель, грозовые тучи, мокрый асфальт, молнии и звук; `G.updateWeather` / `G.resetWeather`, состояние `G.weather` |
| 13 | `js/highbeam.js` | `triggerHighBeam` (клавиша F), реакция трафика |
| 14 | `js/ui.js` | `startGame`, `crashGame`, `renderMainMenu`, `renderShop`. Тюнинг только на съезде |
| 15 | `js/input.js` | `handleKey`, экранные кнопки |
| 16 | `js/economy.js` | `exitPool`, маркерные зоны съездов (`EXIT_MARKER_COLORS`, `createExitMarker`, `getExitGlowLevel`), меню POI (`renderRestaurantMenu`, `renderFuelMenu`, `renderServiceMenu`, `renderExitTuning`), заказы, топливо/износ, `handleAccident`, `togglePause` |
| 17 | `js/loop.js` | `animate(now)`: `realDt`, множитель slow-mo (`dt = realDt × G.slowMoFactor`), физика, трафик, коллизии, HUD, рендер |
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
| `camProfiles` | `bajajGO_camprofiles` | JSON `{ bikeId: { fov, height } }` — профиль кокпита для каждого байка: FOV 60–110°, высота −1.5…+1.5 м |
| `fuelM` | `bajajGO_fuel` | Остаток топлива в метрах (0…`FUEL_RANGE_M` = 25 000) |
| `wearM` | `bajajGO_wear` | JSON `{pads, oil, plugs}` — пройденные метры с момента замены |
| `limpMode` | `bajajGO_limp` | `'1'` — езда «своим ходом» после пустого бака (5 км/ч) |
| `activeOrder` | `bajajGO_order` | JSON активного заказа: ресторан, остаток пути/времени, награда |

**Состояние заезда (в памяти):** `speed`, `distance`, `score`, `playerS`,
`laneOffset`, `lateralVelocity`, `jumpState`, `comboCount`, `todCycleTime`,
`paused`, `uiModal`, `bankedOrderRun`.

**Погода (в памяти):** `G.weather` = `{ rain, cloud, wet, raining, elapsed,
nextRainAt, rainEndsAt, flashes }`. `rain`/`cloud`/`wet` — плавные 0…1;
`wet` сохнет медленнее, чем рассеивается дождь.

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
  ├─ realDt; updateSlowMo(realDt) → G.slowMoFactor
  ├─ dt = realDt × slowMoFactor
  ├─ предпросмотр камеры, если открыт экран настроек
  ├─ пауза / открытое модальное окно → только renderer.render, симуляция стоит
  ├─ таймеры дальнего света и плашки прыжка
  ├─ меню: демо-проезд
  ├─ заезд: скорость, руль, tickEconomy / tickOrder, прыжок, очки
  ├─ placeOnRoad байка, updateWeather(dt), updateFollowCamera, aimSunAtPlayer
  ├─ updateRoadSurface + updateAtmosphereAndTimeOfDay
  ├─ recycleRamps и tickJumpParticles
  ├─ updateRoadside, updateMegaStructures
  ├─ updateExitWorld / updateDeliveryMarker
  ├─ updatePedestrians
  ├─ updateTraffic: движение, перелёты, столкновения → handleAccident()
  ├─ HUD → приборная панель, бейджи, updateEcoHud()
  └─ renderer.render(scene, camera)
```

Slow-mo меняет только `dt` игрового мира. `updateSlowMo` продолжает плавно
возвращать время к 1.0 даже при открытом модальном окне, чтобы эффект не завис.

Обочина, рампы, мосты, указатели съездов и штрихи разметки стоят в мире,
пока не уедут за спину. Пока `s` тот же, `placeOnRoad` для них не вызывается.
Нормали бордюра и тротуара копируются с полотна. Нормали откосов
пересчитываются, когда игрок проехал около 3 м.

## Экономика и съезды

- `exitPool` — 5 объектов-съездов, которые переиспользуются (пулинг): когда съезд
  уходит за игрока, он переносится вперёд на `EXIT_MIN_GAP…EXIT_MAX_GAP` (300–800 м).
- Съезд без кнопки. Меню открывается в коробке, только если скорость ниже
  `EXIT_ENTER_SPEED` (50 км/ч). Быстрее — коробку можно проехать. Пока коробка
  впереди, карточка зелёная ниже 50 и красная от 50, чтобы скорость было видно
  заранее. `crossedExitBox` проверяет отрезок кадра, поэтому коробку не
  перепрыгивает даже на скорости.
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
- Размер: `EXIT_ZONE_WIDTH` = 4.8 м, `EXIT_ZONE_LENGTH` = 5.4 м.
  Центр — `exitBoxCenter`, на 12.5 м раньше щита, в полосе `e.side * 7.1`.
  Те же числа рисуют коробку и открывают меню.
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
- Въезд в коробку медленнее 50 км/ч вспыхивает (`zoneFlash`), играет
  `playExitChime()` и открывает меню. Быстрее 50 меню не открывается.
- Пока коробка ближе 160 м, `#exit-hint` показывает тип, сторону, метры
  и скорость. Класс `slow` — зелёный, «можно съехать». Класс `fast` — красный,
  «сбрось ниже 50». Кнопки съезда нет.
- Пулинг: зона живёт внутри объекта `exitPool`; при переносе съезда вперёд
  `resetExits`/`updateExitWorld` сбрасывают `used`, `zoneFlash`
  и `pulsePhase`, а `updateExitSign` меняет цвет, иконку и подпись.
- Позиционирование — через `placeOnRoad`, поэтому зона следует поворотам,
  подъёмам и спускам; работает в обеих камерах и не перекрывает HUD.

## Slow-Mo при перелётах

- Триггер — третий перелетённый автомобиль за один прыжок (`cCount >= 3`
  в ветке `overfly` из `js/traffic.js`). Один раз за прыжок: флаг
  `slowMoUsedThisJump` сбрасывается на старте прыжка `G.resetSlowMoJump()`
  и при общем сбросе `G.resetSlowMo()`.
- Время мира плавно замедляется до `SLOWMO_TARGET` = 0.4: `dt` умножается на
  `G.slowMoFactor`, поэтому замедляются трафик, частицы и анимации, а не
  отдельные системы. Управление и физика продолжают работать.
- Завершение — при приземлении (`finishJumpLanding`) или ДТП (`handleAccident`):
  `G.endSlowMo()` плавно возвращает множитель к 1.0. Страховка
  `SLOWMO_MAX_SECONDS` = 6 с не даёт эффекту зависнуть.
- Бонусы и комбо не отменяются: slow-mo не трогает `jumpState`, счёт и фид.
- Визуал — виньетка `#slowmo-vignette` и бейдж `#slowmo-badge` в `#jump-live`.
  На входе играет низкий звук `playSlowMoEnter()`, тон остальных звуков
  понижается через `slowMoPitch`.

## Камера от первого лица

- Профиль кокпита хранится отдельно для каждого байка: `camProfiles` в
  `localStorage` под ключом `bajajGO_camprofiles`, вид `{ bikeId: { fov, height } }`.
  `getCamProfile(id)` подставляет значения по умолчанию, если записи нет или
  она битая.
- Диапазоны: FOV 60–110° (по умолчанию 75°), высота −1.5…+1.5 м
  (по умолчанию 0). Высота прибавляется к базе кокпита: 1.56 м у мотоцикла,
  1.33 м у Qute/Юры.
- Профиль применяется только в кокпите (`updateFollowCamera` и
  `applyCamProfileToCamera`). Третье лицо фиксированное: FOV 75°, профиль
  на него не влияет.
- Экран «КАМЕРА · ПЕРВОЕ ЛИЦО» (`renderCameraSettings`) открывается из главного
  меню кнопкой ⚙ и из паузы: «Настройки» → «Кокпит: FOV / высота» → «Настроить».
  Слева ползунки FOV и высоты, справа живой предпросмотр.
- Предпросмотр — второй маленький `WebGLRenderer` с ограничением ~30 fps,
  без теней. Он рендерит основную сцену: камера временно переносится в кокпит
  выбранного байка, кузов скрывается, после кадра состояние восстанавливается.
- «Применить» сохраняет профиль и сразу обновляет активную камеру,
  «Сбросить по умолчанию» удаляет запись байка (75° / 0 м). Esc и «Назад»
  возвращают на предыдущий экран: в главное меню или в настройки паузы.

## Динамическая погода

- **Расписание.** Первый дождь — через 30–60 с активного заезда, каждый
  следующий — не раньше чем через 90 с после окончания предыдущего.
  Длительность эпизода случайная: 25–65 с. В меню, гараже, магазине, паузе и
  модальных окнах `elapsed` не растёт. `G.resetWeather()` вызывается на старте
  заезда, аварии и возврате в меню и обнуляет таймеры.
- **Переходы.** `rain` идёт к цели за ~3.6 с, `cloud` — за ~4.2 с, `wet`
  набирается вместе с дождём, а сохнет ~9.5 с. Всё семейство параметров
  (`rain`, `cloud`, `wet`) живёт в `G.weather`.
- **Капли.** Один `InstancedMesh` на 1000 тонких боксов; позиции лежат в
  типизированных массивах, матрицы обновляются через один переиспользуемый
  `Object3D`. Капли живут в мире вокруг байка, при вылете из зоны
  переиспользуются. Число активных инстансов = `MAX_DROPS × rain`. Материал
  общий, `depthWrite: false`, наклон геометрии задан один раз.
- **Тучи.** `G.stormClouds` — предсозданный слой из 26 voxel-групп в `sky.js`
  с общим `G.stormCloudMat` (transparent). Плотность проявляется через
  `opacity`, обычные `G.clouds` темнеют и опускаются на `12 × cloud`.
  Цвет берётся из `todPalettes[*].storm`: день — серо-синий, закат — тёмный
  багровый, ночь — почти чёрный. Новых объектов в кадре не создаётся.
- **Атмосфера.** `updateAtmosphereAndTimeOfDay` затемняет купол неба и туман,
  поднимает `FogExp2.density` до +85 %, ослабляет солнце до −50 % и слегка
  поднимает полусферический свет — тени становятся мягче. Ночью на мокрой
  дороге фары и фонари светят ярче (`wetBoost` и `wetGlow`).
- **Мокрая дорога.** У `M.road` меняются `roughness` (0.86 → 0.42),
  `metalness` (0.04 → 0.36) и `envMapIntensity` (×2.55 от базы). База
  отражений хранится в `road.userData.baseEnvIntensity`, её выставляет
  `applyGraphics`, поэтому переключение качества не сбрасывает погоду.
  На мокрой дороге торможение слабее на 15 % (`brakeDecel` в `js/loop.js`).
- **Молнии и звук.** За эпизод 1–2 вспышки: `#lightning-flash` (CSS-оверлей,
  максимум 0.20) и раскат `G.playThunder()` с задержкой. Дождь звучит через
  общий `AudioContext` в `js/effects.js` (`G.setRainSound`), плавно
  нарастает/затихает, на паузе гасится. Уровень низкий, игровые звуки важнее.
- **Совместимость.** Работает в обеих камерах, не перекрывает HUD, не трогает
  физику кроме торможения, экономику, сохранения, трамплины и съезды.

## Где что менять

| Задача | Где |
|---|---|
| Добавить машину в трафик | `createVehicleModel` в `js/models/vehicles.js` + `vehicleTypes` в `js/traffic.js` |
| Общая геометрия кузовов | `box` / `cylinder` / `plane` в `js/geom.js`. Геометрию после выдачи не крутить |
| Добавить мотоцикл в магазин | `bikeCatalog` в `js/catalog.js` |
| Добавить улучшение тюнинга | `tuningCatalog` в `js/catalog.js` |
| Цвета неба, тумана, света | `todPalettes` + `updateAtmosphereAndTimeOfDay` в `js/atmosphere.js` |
| Рекламные баннеры | `buildBillboardTextures`, `createBillboardMesh` в `js/roadside.js` |
| Частицы, фид и звуки | `spawnOverflyParticles`, `pushFeed`, `playJumpSound`, `playExitChime` в `js/effects.js` |
| Физика разгона/торможения | `animate` в `js/loop.js` |
| Прыжки и бонусы за перелёт | `jumpState` в `js/ui.js`, `finishJumpLanding` в `js/loop.js` |
| Экономика (цены, награды) | `bikeCatalog`, `tuningCatalog` в `js/catalog.js`, `crashGame` в `js/ui.js`, доставка в `js/economy.js` |
| Съезды и точки интереса | `EXIT_TYPES`, `EXIT_META`, `resetExits`, `openExitMenu` в `js/economy.js` |
| Маркерные зоны съездов | `crossedExitBox` в `js/engine/rules.js`; рисунок и `refreshExitHint` в `js/economy.js` |
| Заказы и доставка | `RESTAURANTS`, `createOrder`, `tickOrder`, `deliverOrder` в `js/economy.js` |
| Топливо и износ | `FUEL_RANGE_M`, `WEAR_LIMITS`, `tickEconomy`, `applyWearToStats` в `js/economy.js` |
| Критические ситуации | `openFuelEmpty`, `handleAccident` в `js/economy.js` |
| Пауза | `togglePause`, `renderPauseMenu`, `resumeGame` в `js/economy.js` |
| Slow-Mo при перелётах | `SLOWMO_TARGET`, `SLOWMO_MAX_SECONDS`, `triggerSlowMo`, `updateSlowMo`, `endSlowMo` в `js/effects.js`; вызов в `overfly` (`js/traffic.js`); `dt` в `js/loop.js` |
| Погода, дождь и мокрый асфальт | `RAIN_MIN/RAIN_MAX`, `GAP_MIN`, `initWeather` / `updateWeather` в `js/weather.js`; `storm` в `todPalettes` и `updateAtmosphereAndTimeOfDay`; `G.stormClouds` в `js/sky.js` |
| Профиль камеры кокпита | `CAM_FOV_*`, `CAM_HEIGHT_*`, `getCamProfile`, `saveCamProfiles`, `renderCameraSettings` в `js/camera.js` |

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
