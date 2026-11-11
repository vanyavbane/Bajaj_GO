import { initAtmosphere } from './atmosphere.js';
import { initBike } from './bike.js';
import { initBiome, initBiomeWorld } from './biome.js';
import { initCamera } from './camera.js';
import { initCatalog } from './catalog.js';
import { initDebug } from './debug.js';
import { initEconomy } from './economy.js';
import { initEffects } from './effects.js';
import { initGraphics } from './graphics.js';
import { initHighbeam } from './highbeam.js';
import { initInput } from './input.js';
import { initLoop } from './loop.js';
import { initPedestrians } from './pedestrians.js';
import { initPostFx } from './postfx.js';
import { initRoad } from './road.js';
import { initRoadside } from './roadside.js';
import { initRoadSurface } from './roadSurface.js';
import { initScene } from './scene.js';
import { initSky } from './sky.js';
import { initStructures } from './structures.js';
import { initTraffic } from './traffic.js';
import { initUi } from './ui.js';
import { initWeather } from './weather.js';

initGraphics();
initCatalog();

// Биом задаёт профиль дороги до того, как его прочитают road/roadSurface.
initBiome();
initScene();
initRoad();
initBiomeWorld();
initSky();
initWeather();
initRoadSurface();
initRoadside();
initStructures();
initEffects();
initPedestrians();

initTraffic();
initBike();
initCamera();
initPostFx();
initAtmosphere();
initHighbeam();

initUi();
initInput();
initEconomy();
initLoop();
initDebug();
