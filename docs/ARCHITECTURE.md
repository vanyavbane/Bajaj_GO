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
|   | `js/biome.js` | биомы: детерминированный календарь зон по 1500 м, кросс-фейд 150 м, аналитические профили дороги, пул декораций поля/леса/гор, баннер локации, сохранение `bajajGO_biomeKm` |
|   | `js/graphics.js` | настройки графики: режим, тени, масштаб, фонари, отражения, `applyGraphics`; экран — вкладка «Графика» в настройках |
| 1 | `js/catalog.js` | `bikeCatalog` (14 моделей, поля `variant` и `hudStyle`), `tuningCatalog`, цены, характеристики, свотчи, `purchaseUpgrade` и `toggleUpgrade` |
| 2 | `js/scene.js` | `scene`, `camera`, `renderer`, `createCanvasTexture`, PBR-генераторы асфальта и тротуара, объект материалов `M` |
| 3 | `js/road.js` | `ROAD_WIDTH`, `ROAD_EDGE`, `LANE_OFFSETS`, `START_LANE`, `roadX/roadY/roadDX/roadDY/roadDDX` (делегируют биомному профилю), `placeOnRoad` |
|   | `js/engine/` | чистые модули без Three.js: `rules`, `motion`, `stream`, `vehicle`, `money` |
| 4 | `js/sky.js` | `skyDome` (шейдер), `FogExp2`, `hemiLight`, `sunLight`, солнце/луна, воксельные облака, пул фонарных `PointLight` |
| 5 | `js/roadSurface.js` | ленты (ribbon) асфальта, разметка, тротуары и бордюры по весу города, откосы |
| 6 | `js/roadside.js` | процедурные текстуры билбордов и биомных указателей, `createBillboardMesh`, `createBuildingGroup`, эстакады; плотность и тексты зависят от биома. Текстуру щита/портала выбирает `G.AdManager.pickBannerForSlot`, без баннера остаётся процедурная |
|   | `js/adManager.js` | реклама из папки `AdManager/` рядом с игрой: `manifest.json` → автолистинг каталога → процедурный fallback, `sessionStorage`-кэш `bajajGO_adManagerDiscovery`, загрузка JPG/PNG/WebP и MP4/WebM без звука, постеры, лимит двух активных видео, доля показов и API для будущего Google Play |
| 7 | `js/structures.js` | `createOverpassStructure`, `createShortTunnelStructure`, `createVoxelRampMesh`, `findSafeRampS`; мосты/тоннели реже вне города |
|   | `js/effects.js` | частицы прыжка, фид комбо и улучшений со стороной события (слева/справа/центр), звуки прыжка, фида и маркерной зоны, slow-mo (`triggerSlowMo` / `updateSlowMo` / `endSlowMo`, виньетка и бейдж) |
| 8 | `js/pedestrians.js` | пешеходы на тротуарах; вне города скрываются и сжимаются по `cityWeightAtS` |
| 9 | `js/traffic.js` | пул из 20 машин (sedan×3, hatchback×2, crossover×2, taxi×2, suv×2, gazelle_flatbed×2, gazelle_van×2, kamaz, truck, bus, qute_traffic×2), маски активности по биомам (лимит и предпочтения) с гарантией тяжёлой машины, плавная скорость по `LANE_SPEEDS`, `resetTrafficVehicle`, `updateTraffic`, мигание поворотников по `flashReactTimer`, запуск slow-mo на третьей перелетённой машине |
|   | `js/models/vehicles.js` | `createVehicleModel(type, color, variant)`: 11 типов трафика; общие материалы и кэш `box`/`cylinder`, детализированные двери/арки/диски/оптика/номера, `hiDetail`/`loDetail`, `blinkers`, additive-спрайты бликов фар `G.glowTex` |
|   | `js/geom.js` | общий кэш `BoxGeometry` / `CylinderGeometry` / `PlaneGeometry` |
| 10 | `js/bike.js` | сборка байка: материалы, фары, `applyBikeVariant` (Pulsar / Boxer / Avenger), `applyVisualTuningToModel` |
|   | `js/models/motorcycle.js` | меш мотоцикла, варианты Boxer и чоппер Avenger, райдер, детали тюнинга |
|   | `js/models/qute.js` | Bajaj Qute и обвес Юры. Пропорции не менять |
|   | `js/models/cockpit.js` | кокпит мотоцикла (Pulsar / Boxer / Avenger) и Qute от первого лица; кокпит — дочерний к `G.riderPivot`, а не к камере |
| 11 | `js/camera.js` | переключение кокпита/третьего лица, приборная панель `updateCockpitDashboard` (цифровая и круглая `drawRoundDashboard`), профили кокпита `getCamProfile` / `saveCamProfiles` (FOV и высота камеры), экран `renderCameraSettings` с живым предпросмотром |
| 12 | `js/atmosphere.js` | `todPalettes` (day/sunset/night), `biomeAtmos` (тинты и плотность по биомам), `updateAtmosphereAndTimeOfDay`, `todCycleTime`; гасит небо/свет и сгущает туман по `G.weather` |
|   | `js/weather.js` | расписание дождя, `InstancedMesh` капель, грозовые тучи, мокрый асфальт, молнии и звук; `G.updateWeather` / `G.resetWeather`, состояние `G.weather` |
| 13 | `js/highbeam.js` | `triggerHighBeam` (клавиша F), реакция трафика |
| 14 | `js/ui.js` | `startGame`, `crashGame`, `renderMainMenu` (полоска биома), `renderShop`, экран «Настройки» с вкладками (`renderSettings`), включая «Управление», модалки Motion Blur и God Rays. Тюнинг только на съезде |
| 15 | `js/input.js` | `handleKey`, экранные кнопки, свайп-руление (`G.swipeActive` перебивает наклон) |
| 15b | `js/controls.js` | режим управления: `controlMode` (`buttons` / `tilt`), разрешение iOS `requestPermission`, подписка на `deviceorientation`, автокалибровка и кнопка калибровки, аналоговое сглаживание наклона в `G.tiltSmoothed` (без мёртвой зоны) и передача его в `stepSteer` через `spec.steer`, прозрачные зоны газа/тормоза по `pointerId`, `#btn-flash-tilt`, видимость tilt-оверлея |
| 16 | `js/economy.js` | `exitPool`, отдельные остановки `rest_N` для каждого ресторана, маркерные зоны съездов (`EXIT_MARKER_COLORS`, `createExitMarker`, `getExitGlowLevel`), меню POI (`renderRestaurantMenu`, `renderFuelMenu`, `renderServiceMenu`, `renderExitTuning`), заказы, топливо/износ, `handleAccident`, `togglePause`, `renderPauseMenu` (строка «Локация», пункт «Управление») |
| 17 | `js/loop.js` | `animate(now)`: `realDt`, множитель slow-mo (`dt = realDt × G.slowMoFactor`), физика, `updateBiome`, трафик, коллизии, HUD, вызов `G.renderFrame` |
| 18 | `js/postfx.js` | `EffectComposer`: `RenderPass` → `GodRaysPass` → `MotionBlurPass` → `OutputPass`; слой 1 (байк) поверх composer; настройки `G.visual`, авто-качество по FPS, `G.renderFrame` |
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
| `visual.motionBlur` | `bajajGO_motionBlur` | `'on'` \| `'off'` — включён ли Motion Blur |
| `visual.motionBlurIntensity` | `bajajGO_motionBlurIntensity` | 0–100 %, по умолчанию 60 (36 на слабом устройстве) |
| `visual.motionBlurComfort` | `bajajGO_motionBlurComfort` | `'on'` \| `'off'` — уменьшить укачивание |
| `visual.godRays` | `bajajGO_godRays` | `'on'` \| `'off'` — включены ли лучи от солнца |
| `visual.godRaysIntensity` | `bajajGO_godRaysIntensity` | 0–100 %, по умолчанию 55 |
| `visual.godRaysLength` | `bajajGO_godRaysLength` | 0–100 %, по умолчанию 50 |
| `fuelM` | `bajajGO_fuel` | Остаток топлива в метрах (0…`FUEL_RANGE_M` = 25 000) |
| `wearM` | `bajajGO_wear` | JSON `{pads, oil, plugs}` — пройденные метры с момента замены |
| `limpMode` | `bajajGO_limp` | `'1'` — езда «своим ходом» после пустого бака (5 км/ч) |
| `activeOrder` | `bajajGO_order` | JSON активного заказа: ресторан, остаток пути/времени, награда |
| `biomeStoredMeters` | `bajajGO_biomeKm` | Пройденный по трассе путь в километрах (в памяти — метры). Задаёт зону биома; между заездами не сбрасывается. |
| `AdManager` (доля) | `bajajGO_adUploadedShare` | 0…1 — вероятность показа файла из `AdManager/` вместо процедурной рекламы; по умолчанию 0.5 |
| `AdManager` (вкл/выкл) | `bajajGO_adEnabled` | `'0'` полностью отключает `AdManager`; любое другое значение или отсутствие ключа — включено |
| `controlMode` | `bajajGO_controlMode` | `'buttons'` \| `'tilt'` — способ управления; по умолчанию кнопки. `tilt` включается только при доступных датчиках |
| `tiltCalibration` | `bajajGO_tiltCalibration` | JSON `{beta, gamma, calibratedAt}` — нейтральное положение устройства; свежее 30 дней |
| `tiltSensitivity` | `bajajGO_tiltSensitivity` | 0.5…2.0 — множитель наклона, по умолчанию 1 |
| `tiltInvert` | `bajajGO_tiltInvert` | `'1'` — инверсия руления наклоном |

Кэш обнаружения рекламы лежит в `sessionStorage` под ключом
`bajajGO_adManagerDiscovery` и сбрасывается при перезагрузке страницы.

**Состояние заезда (в памяти):** `speed`, `distance`, `score`, `playerS`,
`laneOffset`, `lateralVelocity`, `jumpState`, `comboCount`, `todCycleTime`,
`paused`, `uiModal`, `bankedOrderRun`.

**Биомы (в памяти):** `biomeOffsetM` — сохранённый пробег на старте заезда,
`biomeState` = `{ meters, zone, current, next, t, dominant, weights, cityWeight, id }`,
`biomeDominant`, `biomeTransition`, `biomeScenery` (пул декораций).
Абсолютные метры маршрута = `biomeOffsetM + playerS`; все системы читают одну
и ту же точку, поэтому переход бесшовный.

**Погода (в памяти):** `G.weather` = `{ rain, cloud, wet, raining, elapsed,
nextRainAt, rainEndsAt, flashes }`. `rain`/`cloud`/`wet` — плавные 0…1;
`wet` сохнет медленнее, чем рассеивается дождь.

`bankedOrderRun` — сколько рублей за заказы уже зачислено на баланс во время
заезда. В конце заезда `score - bankedOrderRun` добавляется к `bankPoints`,
чтобы награда не зачислилась дважды.

**Мир:** `trafficPool` (20 машин, активных по лимиту биома), `roadsideSlots`,
`megaStructures`, `G.AdManager` (обнаружение и пул рекламных материалов),
`rampsPool`, `pedestrians`, `lampLights` (8 активных фонарей), `exitPool`
(5 съездов с маркерными зонами), `deliveryMarker`, `biomeScenery`.

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

## Биомы и локации

Биом — функция пройденного пути, а не кадра. Все системы читают одну точку
`biomeMetersAt(s) = G.biomeOffsetM + s`, поэтому дорога, небо, трафик и
декорации меняются согласованно и без стыков.

- **Календарь.** Четыре локации `city`, `field`, `forest`, `mountain`
  (`G.BIOMES`) идут зонами по `ZONE_M` = 1500 м. Зоны собраны в группы по
  четыре: каждая группа — перемешанная перестановка всех локаций, поэтому
  внутри группы нет повторов; первая группа фиксирована
  `[city, field, forest, mountain]`. Перестановка детерминированная
  (`mulberry32` + `groupCache` в `js/biome.js`). Проверено: в группе ровно
  4 разных биома, повторов подряд не больше двух.
- **Кросс-фейд.** Последние `FADE_M` = 150 м зоны — плавный переход по
  `smoothstep`. `biomeState` хранит `current`/`next` и `t` 0…1,
  `weights` — доли четырёх биомов, `dominant` — тот, чья доля больше 0.5.
  Новый пейзаж виден заранее: декорации следующего биома проявляются ещё до
  формальной границы.
- **Профиль дороги.** У каждого биома своя пара синусоид (`PROFILES`):
  город — широкие изгибы, поле — почти прямая с длинными волнами, лес —
  плавные «змейки», горы — серпантин с дугами ~90–180 м и подъёмами до
  3.5 м. `G.biomeRoadX/DX/DDX/Y/DY` смешивают позиции и аналитические
  производные в одной точке, поэтому `roadDDX` не даёт скачков и NaN.
  `js/road.js` только делегирует эти функции.
- **Декорации.** `initBiomeWorld` строит пул `SCENERY_SLOTS` = 20 слотов
  через `SCENERY_STEP` = 28 м на обе стороны дороги и на три биома
  (поле/лес/горы). Видимость и масштаб задаются весом биома: на переходе
  старые объекты сжимаются и гаснут, новые растут. Дальше 165 м включается
  LOD — остаются 1–2 блока. Горные хребты дополнительно увеличены ×2.15.
  Городская инфраструктура остаётся в `js/roadside.js` и сжимается по
  `cityWeightAtS`.
- **Поле:** стога, ветряки с вращающимися лопастями, амбары, заборы,
  силосные башни. **Лес:** густые ели, поваленные стволы, валуны, кустарник.
  **Горы:** скалы со снежными шапками, осыпи, редкие сосны, дальние хребты.
- **Инфраструктура.** Фонари, отбойники, тротуары и пешеходы есть только в
  городе; вне города они скрываются по `cityWeightAtS`. Билборды, километровые
  столбы и мосты/эстакады разрешены везде, но реже: в городе два щита на круг
  (`idx 3` слева, `idx 17` справа), вне города один (`idx 7`); тексты
  прокручиваются по абсолютному пробегу, поэтому встречаются все бренды.
  Порталы: в городе прежние (`idx % 6 === 0`), вне города — биомные зелёные
  указатели «ПОДМОСКОВНЫЕ ПОЛЯ», «ЛЕСНАЯ ДОРОГА», «ГОРНЫЙ СЕРПАНТИН»,
  «ПЕРЕВАЛ», «СМОТРОВАЯ ПЛОЩАДКА». Мосты/тоннели вне города появляются окном
  `roadMeters % 1600 < 320` и плавно масштабируются на краях.
- **Трафик.** Пул — 20 слотов: sedan×3, hatchback×2, crossover×2, taxi×2,
  suv×2, Газель-бортовая×2, Газель-фургон×2, КАМАЗ, фура, автобус и Qute×2.
  Для каждого биома строится маска активности по лимиту и предпочтениям
  `BIOMES[i].traffic`: город 18 (легковые/такси/автобус), поле 12 (грузовики
  и фургоны), лес 9, горы 10. Если предпочтения не выбрали ни одной тяжёлой
  машины, одна принудительно добавляется в маску. Цвет кузова детерминирован
  по индексу пула (`variant`), поэтому после recycling машина не
  перекрашивается. Машины плавно вводятся и выводятся (`active`/`retiring`),
  скорость тянется к `G.LANE_SPEEDS`; базовые скорости по биомам —
  `[40,60,70,55]`, `[38,58,68,52]`, `[35,55,65,50]`, `[30,45,55,40]`.
- **Небо и погода.** `biomeAtmos` в `js/atmosphere.js` задаёт цвета-множители
  неба, тумана и облаков, плотность дымки, высоту и масштаб облаков; в горах
  облака опускаются ниже хребтов. Цикл день → закат → ночь и погода работают
  во всех биомах. Ночью вне города светят только луна, звёзды и фары.
- **Камера.** В поворотах появляется крен от `roadDDX` с усилением в горах и
  сглаживанием ~6/с; работает в кокпите и третьем лице без прыжков.
- **UI и сохранение.** Баннер `#biome-banner` показывается ~2 с при входе в
  новую зону и не перекрывает приборку и `#tp-hud`. Главное меню показывает
  полоску «биом · прогресс», в паузе есть строка «Локация». Прогресс пишется
  в `bajajGO_biomeKm` (километры) каждые 2.5 с, при аварии, выходе в меню и
  выгрузке страницы; `resetBiomeRun` продолжает маршрут с сохранённого места, а не с
  нуля. Старый HUD справа сверху не возвращается.

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
  ├─ updateBiome(dt): веса зон, баннер, тинт травы, скорости полос, декорации
  ├─ placeOnRoad байка, updateWeather(dt), updateFollowCamera, aimSunAtPlayer
  ├─ updateRoadSurface + updateAtmosphereAndTimeOfDay
  ├─ recycleRamps и tickJumpParticles
  ├─ updateRoadside, updateAdManager, updateMegaStructures
  ├─ updateExitWorld / updateDeliveryMarker
  ├─ updatePedestrians
  ├─ updateTraffic: движение, перелёты, столкновения → handleAccident()
  ├─ HUD → приборная панель, бейджи, updateEcoHud()
  └─ G.renderFrame(realDt): composer (слой 0) → слой 1 поверх
```

Slow-mo меняет только `dt` игрового мира. `updateSlowMo` продолжает плавно
возвращать время к 1.0 даже при открытом модальном окне, чтобы эффект не завис.

## Своя реклама (AdManager)

Владелец кладёт файлы в `AdManager/` рядом с игрой: `billboards/` — обычные
щиты (картинки и видео), `overheads/` — указатели над дорогой (картинка или
постер видео), `manifest.json` — необязательный список файлов. UI загрузки и
`<input type="file">` нет: всё обнаруживается при запуске.

Порядок обнаружения: `manifest.json` → `fetch` содержимого папок (если сервер
отдаёт directory listing) → только процедурная реклама с одним `console.warn`.
Результат кэшируется в `sessionStorage` (`bajajGO_adManagerDiscovery`) и
сбрасывается при перезагрузке. Изображения — JPG/PNG/WebP; видео — MP4/WebM
без звука, не длиннее 10 с, не больше 10 МБ и 1024 px по большей стороне,
иначе файл пропускается с предупреждением.

`pickBannerForSlot` сначала отдаёт внешнего провайдера (будущий Google Play),
затем с вероятностью `AD_UPLOADED_SHARE` (0.5) файл из папки, иначе `null` —
`roadside.js` оставляет процедурную текстуру. Видео играют только на щитах
впереди в пределах 120 м и не больше двух одновременно; остальные щиты и все
overheads показывают постер. Загрузка асинхронная, любая ошибка ловится и не
роняет игру.

`vite.config.js` копирует `AdManager/` в `dist/AdManager/`, чтобы папка лежала
рядом с собранным `bajaj-go.html`.

Обочина, рампы, мосты, указатели съездов и штрихи разметки стоят в мире,
пока не уедут за спину. Пока `s` тот же, `placeOnRoad` для них не вызывается.
Нормали бордюра и тротуара копируются с полотна. Нормали откосов
пересчитываются, когда игрок проехал около 3 м.

## Экономика и съезды

- `exitPool` — 5 объектов-съездов, которые переиспользуются (пулинг): когда съезд
  уходит за игрока, он переносится вперёд на `EXIT_MIN_GAP…EXIT_MAX_GAP` (300–800 м).
- Типы съездов: `fuel`, `sto`, `tuning` и семь отдельных ресторанов
  `rest_0…rest_6`. Общего типа `restaurant` больше нет: каждый ресторан из
  `RESTAURANTS` — своя остановка со своим щитом, иконкой, подписью и меню.
  При старте заезда ставится три сервиса и два разных ресторана; дальше
  `chooseExitType` сохраняет приоритет «АЗС → ресторан (если нет заказа) →
  СТО → тюнинг» и подбирает ресторан, которого ещё нет впереди.
- Меню `rest_N` (`renderRestaurantMenu`) показывает карточку только этого
  ресторана. Кнопка «Взять заказ на доставку» вызывает `createOrder(name)`;
  если заказ уже активен, кнопка заблокирована, а для того же ресторана
  выводится «Заказ этого ресторана уже активен».
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
  Меню: продолжить, настройки (свет/камера, Motion Blur и God Rays), в главное меню.

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
  круглые иконки типов и подписи. Для каждого `rest_N` — свой щит
  (`EXIT_META`), своя иконка-эмодзи и подпись с названием ресторана;
  цвет щита и рамки берётся из фирменного `RESTAURANTS[i].color`.
  Цвет зоны задаётся `material.color`, поэтому одна текстура работает
  для обоих цветов.
- Пульсация и свечение: `exitPulseT` + `getExitGlowLevel()` — днём ~0.45,
  ночью 1.0; у каждой зоны свой `pulsePhase`. Подпись (название ресторана,
  «АЗС», «СТО», «ТЮНИНГ») появляется на дистанции ближе 105 м.
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

### Уведомления (event-feed)

- `G.pushFeed(text, tone, level, side)` принимает четвёртый аргумент
  `'left' | 'right' | 'center'` (по умолчанию `'center'`). Класс
  `.side-left/.side-right/.side-center` ставится на сам `.feed-item`,
  поэтому один контейнер `#event-feed` обслуживает все три положения.
- `js/traffic.js` передаёт сторону для «КОМБО» и «ПЕРЕЛЁТ»:
  `car.lateralOffset < G.laneOffset ? 'left' : 'right'`. Посадка, тюнинг,
  топливо, СТО и пауза остаются по центру.
- `#event-feed` растянут на всю ширину (`width: 100vw`, `padding: 0 3vw`),
  элементы прижимаются через `align-self`, `max-width` — `min(440px, 60vw)`.
  Верх — `clamp(200px, 24vh, 240px)`, ниже `#eco-hud` и `#status-badges`,
  чтобы уведомления не перекрывали HUD; стек ограничен `max-height: 42vh`.
  На мобильных — `max-width: 70vw` и свой `clamp`.
- `tickFeed`/`clearFeed`/`frozen` не изменились: массив `feedItems` хранит
  элементы, удаление идёт через `el.remove()` из общего контейнера.

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
  (по умолчанию 0). Заводские дефолты отдельных моделей — `CAM_PROFILE_DEFAULTS`
  (Avenger 220: 78° / +0.15 м). База кокпита — 1.56 м у мотоцикла, 1.33 м
  у Qute/Юры. Высота профиля применяется только к `G.camera.position.y`
  внутри `G.riderPivot`: камера поднимается или опускается, а мотоцикл,
  кокпит и приборка остаются на месте.
- Профиль применяется только в кокпите (`updateFollowCamera` и
  `applyCamProfileToCamera`). Третье лицо фиксированное: FOV 75°, профиль
  на него не влияет.
- Экран «КАМЕРА · ПЕРВОЕ ЛИЦО» (`renderCameraSettings`) открывается из главного
  меню кнопкой ⚙ и из паузы: «Настройки» → «Кокпит: FOV / высота» → «Настроить».
  Слева ползунки FOV и высоты, справа живой предпросмотр.
- Предпросмотр — второй маленький `WebGLRenderer` с ограничением ~30 fps,
  без теней. Он рендерит основную сцену: камера временно ставится в
  `riderPivot` выбранного байка на высоту профиля, кузов скрывается, после
  кадра состояние восстанавливается.
- «Применить» сохраняет профиль и сразу обновляет активную камеру,
  «Сбросить по умолчанию» удаляет запись байка (75° / 0 м). Esc и «Назад»
  возвращают на предыдущий экран: в главное меню или в настройки паузы.

## Мотоциклы, варианты и приборка

- В каталоге 14 машин: 5 старых Pulsar/Dominar, Qute и Юра, плюс 7 новых —
  Boxer 100 ES / 125 / 150, Pulsar 150 NS / 180 NS, Avenger 220 и Dominar 250.
  Стартовый байк нового игрока — бесплатный `boxer100es`; `ns125` стоит 850 ₽.
  Старые сохранения с `ownedBikes: ['ns125']` продолжают работать.
- Витрина магазина (`renderShop` в `js/ui.js`) сортирует карточки по
  `maxSpeed` от низкой к высокой; при равной скорости — по цене, затем по
  названию. Порядок массива `bikeCatalog` на витрину не влияет.
- `variant` задаёт семейство обвеса: `pulsar` (спортивный нейкед), `boxer`
  (утилитарный дорожник) или `avenger` (круизер). `hudStyle` задаёт приборку:
  `digital` — штатная панель, `round` — аналоговый спидометр и одометр
  (Boxer'ы и Avenger).
- Внутри трёх семейств собраны 12 отдельных версий (`G.bikeVersionGroups[id]`):
  у каждой своя группа шасси, третьего лица и переднего крыла. `applyBikeVariant()`
  показывает ровно одну версию и переключает общий стиль колёс
  (`G.bikeWheelStyles`: `spokedDrum`, `spokedDisc`, `alloy5`, `alloyPerf`,
  `cruiser5`), семейные контейнеры `bikeVariantGroups` / `bikeThirdPersonVariants`,
  посадку райдера и вынос переднего колеса Avenger
  (`G.frontWheelGroup.position.z = -1.78`).
- Общие колёса, двигатель, выхлоп и слоты тюнинга одни на все модели, поэтому
  тюнинг визуально работает на любом байке: `tuneBikeWindshieldExt`,
  `tuneZeroFilterGroup`, `tuneCarbReplaceGroup`, `tuneCarbScrewMesh`,
  `tuneIridiumPlugGroup`, `tuneSprocketMesh`, `tuneChainGuard`,
  `tuneUpgradedBrakesGroup`. Диски тормозов висят на группах колёс и переезжают
  вместе с Avenger. Широкие шины масштабируют `fTire/fRim/rTire/rRim`
  (`1.52 / 1.40 / 1.64 / 1.44`), крылья — `1.38`.
- Кокпиты: базовый Pulsar (`G.pulsarCockpitGroup`), Boxer, Dominar и Avenger
  (`G.avengerCockpitGroup` — высокий руль, зеркала, длинная вилка); базовый бак —
  `G.bikeCockpitTankGroup`, у семейств свои tank-группы. Руль и зеркала Pulsar —
  `G.bikeCockpitHandlebarGroup`. Цифровая и аналоговая приборки рисуются в один
  `G.dashTex`, поэтому экран не скрывается; `G.roundDashBezelGroup` — только
  декоративные хром-ободки, видны при `hudStyle === 'round'`.
- Qute: пропорции, позиции колёс, передних пивотов и руля не менялись; добавлены
  арки, двери, решётка, оптика, номера, поворотники, зеркала, крыша, стёкла,
  пороги, бамперы, спицы колёс и детали Юры. В кокпите — педали газа/тормоза
  ниже руля, коврик, дефлекторы, обод руля и рычаг КПП.
- `drawRoundDashboard` рисует на том же `G.dashTex` (512×256): круглый
  спидометр (шкала 0…максималка, стрелка, дуга прогресса цветом акцента,
  синяя точка дальнего света) и круглый одометр (`000.00` км, 5 цифр по дуге,
  подпись «ОБЩИЙ ПРОБЕГ»). Баланс и множитель встречки — внизу панели.
- В карточке магазина выводится бейдж «Круглая приборка» или
  «Цифровая приборка».
- Заводские дефолты камеры для отдельных моделей лежат в
  `CAM_PROFILE_DEFAULTS` (`js/camera.js`): у Avenger FOV 78° и высота +0.15 м,
  остальные — 75° / 0. Пользовательский профиль из `bajajGO_camprofiles`
  по-прежнему важнее дефолта.

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

## Пост-эффекты: Motion Blur и God Rays

Оба эффекта живут в `js/postfx.js` и включаются в экране «Настройки» на вкладке
«Освещение» (в главном меню — кнопка «⚙ Настройки»; в паузе — блок «Настройки»).
Старый экран «Графика» стал вкладкой этого экрана, отражения перенесены во
вкладку «Освещение». Состояние — `G.visual`, ключи localStorage перечислены выше.

- **Порядок рендера.** `EffectComposer`: `RenderPass` (слой 0 — мир) →
  `GodRaysPass` → `MotionBlurPass` → `OutputPass`. После композера мотоцикл,
  кокпит и приборка (слой 1) рисуются напрямую в canvas через `clearDepth()`:
  их не размывает и не засвечивает лучами. HUD — отдельный HTML, эффектов не
  касается. Функция кадра — `G.renderFrame(dt)`, ею пользуется `js/loop.js`
  и пауза; resize и смена качества графики вызывают `G.applyPostFxSize()`.
- **Слои.** Все не-световые объекты `G.bikeRoot` рекурсивно переводятся на
  слой 1, источники света — на слои 0+1. Камера для композера стоит на слое 0;
  `sunLight.shadow.camera.layers.enable(1)` сохраняет тень байка. Живой
  предпросмотр кокпита временно включает слой 1 и возвращает его обратно.
- **Motion Blur.** Лёгкий горизонтальный 7-tap blur: сила растёт от 35 %
  максимальной скорости (≈80 км/ч), усиливается к краям, в центре ослаблена,
  верхняя и нижняя полосы не размываются. Максимум около 8 px на 1920 px.
  Настройки: включение, интенсивность 0–100 %, чекбокс «Уменьшить укачивание».
  На паузе и в модальных окнах размытие выключается.
- **God Rays.** Радиальный screen-space blur ярких пикселей: 16 сэмплов в
  буфер половинного (или четвертного) разрешения, затем аддитивное наложение.
  Цвет берётся из `sunLight.color` (день — тёплый бело-жёлтый, закат —
  оранжево-красный), низ кадра приглушён. Источник лучей — только солнце:
  яркость сэмпла дополнительно умножается на near-sun маску
  `1 - smoothstep(0.06, 0.30, distance(suv, uSunScreenUV))`, поэтому окна,
  фары и фонари по всему кадру лучей не дают. Лучи видны, только когда солнце
  в кадре; плавно гаснут в дождь/плотные тучи, ночью и в тоннеле (fade 3–5 с,
  тоннель 0.3–0.5 с) и так же плавно возвращаются. Настройки: включение,
  интенсивность 0–100 %, длина лучей 0–100 %.
- **Блики фар.** Чтобы встречные машины не потеряли свет вместе с лучами,
  `addHeadlight` в `js/models/vehicles.js` добавляет каждой фаре отдельный
  additive-спрайт `G.glowTex` (общий ленивый материал `getHeadGlowMat`).
  Блик не зависит от God Rays и от настроек постобработки.
- **Авто-качество.** Скользящее среднее FPS за 60 кадров: ниже 34 —
  эффекты выключаются, ниже 42 — включаются в полсилы (лучи в четвертном
  разрешении), выше 50 — полная сила. На слабых устройствах старт сразу
  с пониженного уровня и меньшей интенсивности Motion Blur.

## Где что менять

| Задача | Где |
|---|---|
| Добавить биом / поменять порядок локаций | `BIOMES`, `PROFILES`, `biomeForZone` в `js/biome.js` |
| Настроить длину зоны или кросс-фейд | `ZONE_M`, `FADE_M` в `js/biome.js` |
| Декорации поля, леса и гор | `buildFieldVariant`, `buildForestVariant`, `buildMountainVariant`, `updateBiomeScenery` в `js/biome.js` |
| Оттенки неба и облака по биомам | `biomeAtmos` + `blendBiomeAtmosphere` в `js/atmosphere.js` |
| Трафик по биомам | `traffic` в `BIOMES`, `LANE_SPEEDS_BY_BIOME`, `activeMask` в `js/traffic.js` |
| Баннер, меню и сохранение биома | `showBiomeBanner`, `biomeMenuMarkup`, `biomePauseValue`, `persistBiome` в `js/biome.js` |
| Добавить машину в трафик | `createVehicleModel` в `js/models/vehicles.js` + `vehicleTypes` в `js/traffic.js`; габариты `halfWidth` / `halfLength` / `roofHeight` возвращает билдер |
| Общая геометрия кузовов | `box` / `cylinder` / `plane` в `js/geom.js`. Геометрию после выдачи не крутить |
| Добавить мотоцикл в магазин | `bikeCatalog` в `js/catalog.js` (поля `variant` и `hudStyle`); при новой геометрии — `js/models/motorcycle.js` + `applyBikeVariant` в `js/bike.js` |
| Добавить улучшение тюнинга | `tuningCatalog` в `js/catalog.js` |
| Цвета неба, тумана, света | `todPalettes` + `updateAtmosphereAndTimeOfDay` в `js/atmosphere.js` |
| Рекламные баннеры | Процедурные текстуры — `buildBillboardTextures`, `createBillboardMesh` в `js/roadside.js`; свои файлы — папка `AdManager/`, выбор — `pickBannerForSlot` в `js/adManager.js` |
| Лимиты и доля показов рекламы | `AD_*` в `js/adManager.js`; пользовательские переопределения — `bajajGO_adUploadedShare`, `bajajGO_adEnabled` |
| Будущая реклама Google Play | `registerExternalProvider` / `unregisterExternalProvider` в `js/adManager.js`; провайдер получает приоритет над папкой, показ и клик репортятся через `reportImpression` / `reportClick` |
| Частицы, фид и звуки | `spawnOverflyParticles`, `pushFeed(text, tone, level, side)`, `playJumpSound`, `playExitChime` в `js/effects.js` |
| Сторона уведомления комбо/перелёта | `side` в вызовах `G.pushFeed` из `js/traffic.js`; классы `.side-*` в `css/game.css` |
| Физика разгона/торможения | `animate` в `js/loop.js` |
| Прыжки и бонусы за перелёт | `jumpState` в `js/ui.js`, `finishJumpLanding` в `js/loop.js` |
| Экономика (цены, награды) | `bikeCatalog`, `tuningCatalog` в `js/catalog.js`, `crashGame` в `js/ui.js`, доставка в `js/economy.js` |
| Съезды и точки интереса | `EXIT_TYPES`, `EXIT_META`, `RESTAURANT_EXIT_TYPES`, `chooseExitType`, `resetExits`, `openExitMenu` в `js/economy.js` |
| Маркерные зоны съездов | `crossedExitBox` в `js/engine/rules.js`; рисунок и `refreshExitHint` в `js/economy.js` |
| Заказы и доставка | `RESTAURANTS`, `createOrder`, `tickOrder`, `deliverOrder` в `js/economy.js` |
| Топливо и износ | `FUEL_RANGE_M`, `WEAR_LIMITS`, `tickEconomy`, `applyWearToStats` в `js/economy.js` |
| Критические ситуации | `openFuelEmpty`, `handleAccident` в `js/economy.js` |
| Пауза | `togglePause`, `renderPauseMenu`, `resumeGame` в `js/economy.js` |
| Slow-Mo при перелётах | `SLOWMO_TARGET`, `SLOWMO_MAX_SECONDS`, `triggerSlowMo`, `updateSlowMo`, `endSlowMo` в `js/effects.js`; вызов в `overfly` (`js/traffic.js`); `dt` в `js/loop.js` |
| Погода, дождь и мокрый асфальт | `RAIN_MIN/RAIN_MAX`, `GAP_MIN`, `initWeather` / `updateWeather` в `js/weather.js`; `storm` в `todPalettes` и `updateAtmosphereAndTimeOfDay`; `G.stormClouds` в `js/sky.js` |
| Профиль камеры кокпита | `CAM_FOV_*`, `CAM_HEIGHT_*`, `getCamProfile`, `saveCamProfiles`, `renderCameraSettings` в `js/camera.js` |
| Motion Blur и God Rays | `MOTION_BLUR_FRAGMENT`, `GOD_RAYS_FRAGMENT`, `MotionBlurPass`, `GodRaysPass`, `initPostFx`, `G.renderFrame` в `js/postfx.js` |
| Экран настроек с вкладками | `renderSettings`, `renderMotionBlurSettings`, `renderGodRaysSettings` в `js/ui.js`; стили `.ds-tab*`, `.fx-check` в `css/game.css` |

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
