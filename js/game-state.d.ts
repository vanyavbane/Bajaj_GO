import type * as THREE from 'three';
import type { BiomeDef, BiomeId, BiomeTraffic, LaneLayout, RoadSample, TrafficModel } from './engine/biomes.js';
import type { CarriagePhase, DriveRoads, LiveCarriage } from './engine/carriage.js';
import type { RouteChoice } from './engine/route.js';
import type { CarriageLayout, RoadWay } from './engine/lanes.js';
import type { RoadEmbed } from './engine/branch.js';
import type { AsphaltEdges, BranchPick, ChosenSide, PlacedBlock, ShoulderProfile, SplitPick } from './engine/fork.js';
import type { BesideAsset, MedianAsset, RoadsideFrame, RoadsidePose } from './engine/roadside.js';

export interface ColorSwatch {
  name: string;
  hex: number;
}

export type VehicleKind = 'bike' | 'qute' | 'yura';

/** Внешняя модель мотоцикла: обычный Pulsar, простой Boxer или чоппер Avenger. */
export type BikeVariant = 'pulsar' | 'boxer' | 'avenger';

/** Стиль приборной панели: цифровая штатная или аналоговая круглая. */
export type HudStyle = 'digital' | 'round';

export interface BikeStats {
  id: string;
  name: string;
  vType: VehicleKind;
  typeLabel: string;
  maxSpeed: number;
  price: number;
  color: number;
  accent: number;
  accel: number;
  massFactor: number;
  variant?: BikeVariant;
  hudStyle?: HudStyle;
  swatches?: ColorSwatch[];
}

export interface TuningUpgrade {
  id: string;
  name: string;
  shortName: string;
  icon: string;
  basePrice: number;
  speedBonus: number;
  accelMult: number;
  brakeMult: number;
  effectLabel: string;
  desc: string;
  isWarn?: boolean;
}

export interface EffectiveStats {
  baseMaxSpeed: number;
  speedDelta: number;
  maxSpeed: number;
  baseAccel: number;
  accelBonusPct: number;
  accel: number;
  baseBrake: number;
  brakeBonusPct: number;
  brakeDecel: number;
  vType: VehicleKind;
  isQute: boolean;
  isYura: boolean;
  wideTires: boolean;
  upgradedBrakes: boolean;
  installedCount: number;
  ownedCount: number;
  wearBrakePct?: number;
  wearAccelPct?: number;
  wearSpeedPct?: number;
}

export interface TuningRecord {
  owned: string[];
  installed: string[];
}

export interface JumpState {
  airborne: boolean;
  height: number;
  vy: number;
  pitch: number;
  startS: number;
  carsJumped: number;
  liveBonus: number;
  wobbleTimer: number;
}

export interface TrafficCar {
  model: {
    type: TrafficModel;
    root: THREE.Object3D;
    hiDetail: THREE.Object3D;
    loDetail: THREE.Object3D;
    wheels: Array<{ rotation: THREE.Euler }>;
    frontPivots: Array<{ rotation: THREE.Euler }>;
    alertSprite: THREE.Object3D;
    blinkers?: THREE.Object3D[];
    halfWidth: number;
    halfLength: number;
    roofHeight: number;
  };
  laneIdx: number;
  targetLaneIdx: number;
  lateralOffset: number;
  s: number;
  speedKmh: number;
  changingLane: boolean;
  /** Машина уехала на ленту съезда и остаётся на ней, пока лента есть. */
  onExit: boolean;
  /** Куда смотрит кузов: 0 по ходу, π навстречу. Доворачивается, а не прыгает. */
  heading: number;
  flashReactTimer: number;
  steerAngle: number;
  nearMissAwarded: boolean;
  jumpedInCurrentJump: boolean;
  active: boolean;
  retiring: boolean;
}

export interface WeatherState {
  rain: number;
  cloud: number;
  wet: number;
  raining: boolean;
  elapsed: number;
  nextRainAt: number;
  rainEndsAt: number;
  flashes: Array<{ at: number; fired: boolean }>;
}

export interface VisualSettings {
  motionBlur: boolean;
  motionBlurIntensity: number;
  motionBlurComfort: boolean;
  godRays: boolean;
  godRaysIntensity: number;
  godRaysLength: number;
  weakDevice: boolean;
}

/** Стенд, для которого AdManager выбирает баннер. */
export type AdSlotKind = 'billboard' | 'overhead';

export interface AdManagerSlot {
  kind: AdSlotKind;
  /** Материал стенда: AdManager меняет map у видео при приближении/удалении. */
  material?: THREE.MeshStandardMaterial;
  /** Внутренний слот обочины (roadsideSlots[i]) — для дистанции и видимости. */
  slot?: any;
  /** Смещение стенда от slot.s (у билборда +6 м, у портала 0). */
  sOffset?: number;
  /** Уникальный id стенда в пуле. */
  id?: string;
  /** Готовые мировые метры, если слот не roadside. */
  s?: number;
}

/** Результат выбора баннера для одного стенда. */
export interface AdManagerBanner {
  texture: THREE.Texture;
  isVideo: boolean;
  videoEl?: HTMLVideoElement;
  videoTexture?: THREE.VideoTexture;
  posterTexture?: THREE.Texture;
  bannerId: string;
  file: string;
  banner?: any;
}

export interface AdManagerStats {
  billboardsLoaded: number;
  overheadsLoaded: number;
  billboardsTotal: number;
  overheadsTotal: number;
}

/** Баннер внешнего провайдера (заглушка под будущий Google Play). */
export interface ExternalAdBanner {
  id: string;
  type: 'image' | 'video';
  srcUrl: string;
  posterUrl?: string;
  duration?: number;
  enabled?: boolean;
  kind?: 'billboard' | 'overhead';
}

/** Внешний провайдер рекламы. Сейчас никем не зарегистрирован. */
export interface ExternalAdProvider {
  id: string;
  getName(): string;
  getBanners(): Promise<ExternalAdBanner[]>;
  onShown?(bannerId: string): void;
  onClicked?(bannerId: string): void;
}

export interface AdManagerApi {
  readonly version: number;
  init: () => void;
  pickBannerForSlot: (slot: AdManagerSlot) => AdManagerBanner | null;
  getStats: () => AdManagerStats;
  registerExternalProvider: (provider: ExternalAdProvider) => void;
  unregisterExternalProvider: (providerId: string) => void;
  reportImpression: (bannerId: string) => void;
  reportClick: (bannerId: string) => void;
  registerSettingsListeners: () => void;
  update: (dt: number) => void;
}

/** Состояние биомной системы: где игрок и какие локации смешиваются. */
export interface BiomeState {
  meters: number;
  zone: number;
  current: number;
  next: number;
  t: number;
  dominant: number;
  weights: number[];
  cityWeight: number;
  mkadWeight: number;
  id: string;
}

/** Состояние развилки: выбор ветки в реальном времени. */
export interface SplitState {
  active: boolean;
  zone: number;
  meters: number;
  splitMeters: number;
  s: number;
  d: number;
  /** Слот баннера: 0 левый, 1 правый. Не сторона оси. */
  side: BranchPick;
  previewSide: BranchPick;
  chosen: boolean;
  /** -1 пока развилка не зафиксирована, иначе слот 0 или 1. */
  chosenSide: SplitPick;
  choices: number[];
  chosenBiome: number | null;
  autoAt: number;
}

export interface BiomeTransition {
  active: boolean;
  from: number;
  to: number;
  t: number;
}

export interface ScenerySpin {
  mesh: THREE.Object3D;
  speed: number;
}

/** Один объект декора на стороне слота. Город сюда не входит. */
export interface SceneryEntry {
  biome: number;
  group: THREE.Object3D;
  meshes: THREE.Object3D[];
  lodFar: boolean;
  yaw: number;
  lat: number;
  ds: number;
  spin: ScenerySpin | null;
}

export interface ScenerySlot {
  s: number;
  placedS: number;
  left: SceneryEntry[];
  right: SceneryEntry[];
}

/** Общее состояние игры. Известные поля типизированы, остальные пока any. */
export interface GameState {
  $: <T extends HTMLElement = HTMLElement>(id: string) => T;
  clamp: (v: number, a: number, b: number) => number;
  lerp: (a: number, b: number, t: number) => number;

  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;

  placeOnRoad: (
    obj: THREE.Object3D,
    s: number,
    lateralOffset?: number,
    heightOffset?: number,
    extraYaw?: number,
    extraPitch?: number,
    extraRoll?: number,
  ) => void;
  ROAD_WIDTH: number;
  ROAD_EDGE: number;
  LANE_OFFSETS: number[];
  START_LANE: number;
  frameStats: EffectiveStats | null;
  /** Кадр кромок в точке s и постановка декора относительно них. */
  roadsideFrameAt: (s: number) => RoadsideFrame;
  besidePose: (frame: RoadsideFrame, asset: BesideAsset) => RoadsidePose;
  medianRoom: (edges: AsphaltEdges, center?: number) => number;
  medianFits: (edges: AsphaltEdges, asset: MedianAsset, center?: number) => boolean;
  medianPose: (edges: AsphaltEdges, asset: MedianAsset, center?: number) => RoadsidePose;
  biomeMetersAt: (s: number) => number;
  biomeRoadX: (s: number) => number;
  biomeRoadDX: (s: number) => number;
  biomeRoadDDX: (s: number) => number;
  biomeRoadY: (s: number) => number;
  biomeRoadDY: (s: number) => number;
  biomeRoadDDY: (s: number) => number;
  nominalRoadWidth: number;
  forkSpreadAtS: (s: number) => number;
  /** Мировой центр дороги. После взятого съезда это его линия, не ось маршрута. */
  roadOriginAt: (s: number) => number;
  /** Точка дороги в мире. На съезде это его собственный вектор, не параллель сплайна. */
  embedRoad: (s: number, lat: number) => RoadEmbed;
  roadCurvature: (s: number) => number;
  /** Блок рецепта съезда в точке s. null — здесь обычная дорога без съезда. */
  roadBlockAt: (s: number) => PlacedBlock | null;
  /** Блоки, которые выбор уже поставил в зоне точки s. До выбора здесь только подход. */
  builtBlocksAt: (s: number) => readonly string[];
  /** Полоса байка или камеры в метрах от оси, уже со съездом. */
  riderLatAt: (s: number, laneOffset?: number) => number;
  /** Справа на этом метре стоит съезд: дома и деревья туда не ставятся. */
  exitReservedAt: (s: number) => boolean;
  forkChosenSideAtS: (s: number) => ChosenSide;
  forkCloseAtS: (s: number) => number;
  roadEdgesAt: (s: number) => AsphaltEdges;
  roadOuterLat: (s: number, side: number) => number;
  asphaltSpan: (s: number) => { left: number; right: number; mid: number; width: number };
  roadBiomeAtS: (s: number) => number;
  splitCenterS: (playerS: number) => number;
  shoulder: ShoulderProfile;
  groundOffset: (lat: number, s: number) => number;
  /** 1, пока развилка в окне камеры. */
  forkView: 0 | 1;
  biomeTraffic: BiomeTraffic;
  roadEdgeMin: number;
  roadEdgeMax: number;
  biomeScenery: ScenerySlot[];
  resetBiomeScenery: () => void;
  updateBiomeScenery: () => void;
  roadX: (s: number) => number;
  roadY: (s: number) => number;
  roadDX: (s: number) => number;
  roadDY: (s: number) => number;
  roadDDX: (s: number) => number;

  biomeState: BiomeState | null;
  biomeDominant: number;
  biomeCityWeight: number;
  biomeMkadWeight: number;
  biomeStoredMeters: number;
  biomeOffsetM: number;
  biomeWeightsAtS: (s: number) => number[];
  cityWeightAtS: (s: number) => number;
  mkadWeightAtS: (s: number) => number;
  roadWidthAtS: (s: number) => number;
  splitAmountAtS: (s: number) => number;
  laneWorldOffsetAtS: (s: number, lateralOffset: number) => number;
  laneDisplayScaleAtS: (s: number) => number;
  roadWayAt: (s: number) => RoadWay;
  roadPhaseAt: (s: number) => CarriagePhase;
  roadChoiceAt: (s: number) => RouteChoice;
  roadsAt: (s: number) => DriveRoads;
  sideRibbonAt: (s: number) => LiveCarriage | null;
  trafficLatAt: (s: number, offset: number, onExit: boolean) => number;
  laneMarksAtS: (s: number) => { lat: number; w: number }[];
  ribbonMarksAtS: (s: number) => { lat: number; w: number }[];
  dominantBiomeAtS: (s: number) => number;
  nearestRunLane: (lateralOffset: number, cfg?: LaneLayout | null) => number;
  biomeProfile: (biomeId: BiomeId | number, s: number) => RoadSample;
  getLaneConfig: (biomeId: BiomeId | number) => LaneLayout;
  getBiomeChoices: (currentBiome: number, visitCounts: number[]) => number[];
  randomRunLane: (s?: number) => number;
  /** Полосы дороги в точке: биом плюс односторонний или двусторонний проезд. */
  lanesAtS: (s?: number) => CarriageLayout;
  remapTrafficLanes: (cfg?: CarriageLayout | null) => void;
  currentBiome: number;
  visitCounts: number[];
  pendingBiome: number | null;
  biomeTransition: BiomeTransition | null;
  splitState: SplitState | null;
  BIOMES: readonly BiomeDef[];
  laneCount: number;
  oncomingCount: number;
  LANE_SPEEDS: number[];
  laneAssistTarget: number | null;
  updateBiome: (dt: number) => void;
  resetBiomeRun: () => void;
  persistBiome: () => void;
  biomeMenuMarkup: () => string;
  biomePauseValue: () => string;
  showBiomeBanner: (biomeIndex: number) => void;
  hideBiomeBanner: () => void;
  hideSplitBanner: () => void;

  selectedBikeId: string;
  selectedBike: () => BikeStats;
  bikeCatalog: BikeStats[];
  tuningCatalog: TuningUpgrade[];
  getBikeEffectiveStats: (bikeId?: string) => EffectiveStats;
  getUpgradePrice: (bike: BikeStats | null | undefined, upgrade: TuningUpgrade) => number;
  getBikeTuningRecord: (bikeId: string) => TuningRecord;
  customColors: Record<string, number>;
  bankPoints: number;
  ownedBikes: string[];
  cameraMode: 'cockpit' | 'third';
  started: boolean;
  ended: boolean;
  speed: number;
  distance: number;
  score: number;
  totalJumpBonusRun: number;
  totalCarsJumpedRun: number;
  comboCount: number;
  comboTimer: number;
  playerS: number;
  laneOffset: number;
  lateralVelocity: number;
  steerVisual: number;
  slipDriftVel: number;
  accelPitchOffset: number;
  highBeamTimer: number;
  highBeamCooldown: number;
  keys: { left: boolean; right: boolean; gas: boolean; brake: boolean };
  /** Режим управления: кнопки, джойстик или наклон устройства. */
  controlMode: 'buttons' | 'stick' | 'tilt';
  soundMuted: boolean;
  setSoundMuted: (muted: boolean) => void;
  /** −1…1, горизонталь джойстика. */
  stickSteer: number;
  /** Палец на стике. Пока его нет, рулят клавиши. */
  stickHeld: boolean;
  stickGas: boolean;
  stickBrake: boolean;
  releaseStick: () => void;
  tiltAvailable: boolean;
  tiltSensitivity: number;
  tiltInvert: boolean;
  tiltCalibration: { beta: number; gamma: number; calibratedAt: number; axis: 'beta' | 'gamma' | ''; angle: number };
  tiltRaw: { beta: number; gamma: number; alpha: number };
  tiltSmoothed: number;
  /** Текущая ориентация экрана (0/90/180/270) и выбранная по ней ось наклона. */
  tiltOrientationAngle: number;
  tiltAxis: 'beta' | 'gamma';
  tiltGotEvent: boolean;
  tiltEventCount: number;
  tiltLastEventAt: number;
  tiltActive: boolean;
  tiltStartedAt: number;
  /** Идёт ли свайп-руление на #view (перебивает наклон). */
  swipeActive: boolean;
  startTilt: () => boolean;
  stopTilt: () => void;
  startTiltSession: () => void;
  setControlMode: (mode: 'buttons' | 'stick' | 'tilt') => Promise<{ ok: boolean; message?: string }>;
  requestTiltPermission: () => Promise<boolean>;
  probeTiltSensors: (timeout?: number) => Promise<boolean>;
  calibrateTilt: () => boolean;
  setTiltSensitivity: (value: number) => void;
  setTiltInvert: (value: boolean) => void;
  updateTilt: (now: number) => void;
  syncControlUi: () => void;
  jumpState: JumpState;
  trafficPool: TrafficCar[];
  weather: WeatherState;
  updateWeather: (dt: number) => void;
  resetWeather: () => void;
  setRainSound: (level: number) => void;
  playThunder: () => void;
  visual: VisualSettings;
  renderFrame: (dt: number) => void;
  saveVisualSettings: () => void;
  applyPostFxSize: () => void;
  inTunnel: boolean;
  smoothstep: (edge0: number, edge1: number, x: number) => number;
  M: Record<string, THREE.Material>;

  /** Реклама из папки AdManager/ и будущих внешних провайдеров. */
  AdManager: AdManagerApi;
  updateAdManager: (dt: number) => void;

  [key: string]: any;
}
