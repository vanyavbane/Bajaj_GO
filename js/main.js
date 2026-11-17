import { initAdManager } from './adManager.js';
import { initAtmosphere } from './atmosphere.js';
import { initBike } from './bike.js';
import { initBiome, initBiomeWorld } from './biome.js';
import { initCamera } from './camera.js';
import { initCatalog } from './catalog.js';
import { initControls } from './controls.js';
import { initDebug } from './debug.js';
import { initEconomy } from './economy.js';
import { initEffects } from './effects.js';
import { initGraphics } from './graphics.js';
import { initHighbeam } from './highbeam.js';
import { initInput } from './input.js';
import { initLoop } from './loop.js';
import { initMileage } from './mileage.js';
import { initPedestrians } from './pedestrians.js';
import { initPostFx } from './postfx.js';
import { initRepair } from './repair.js';
import { initRoad } from './road.js';
import { initRoadside } from './roadside.js';
import { initRoadSurface } from './roadSurface.js';
import { initScene } from './scene.js';
import { initShopPreview } from './shopPreview.js';
import { initSky } from './sky.js';
import { initStructures } from './structures.js';
import { initTraffic } from './traffic.js';
import { initUi } from './ui.js';
import { initWeather } from './weather.js';

initGraphics();
initCatalog();
initMileage();

// Биом задаёт профиль дороги до того, как его прочитают road/roadSurface.
initBiome();
initScene();
initRoad();
initBiomeWorld();
initSky();
initWeather();
initRoadSurface();
// Реклама стартует до roadside: модуль уже существует, а файлы догружаются
// асинхронно и в любой момент увеличивают version — слоты перевыберут баннер.
initAdManager();
initRoadside();
initStructures();
initEffects();
initPedestrians();

initTraffic();
initBike();
initShopPreview();
initCamera();
initPostFx();
initAtmosphere();
initHighbeam();

initUi();
initControls();
initInput();
initEconomy();
initRepair();
initLoop();
initDebug();
