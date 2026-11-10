import type * as THREE from 'three';

export interface ColorSwatch {
  name: string;
  hex: number;
}

export type VehicleKind = 'bike' | 'qute' | 'yura';

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
    type: string;
    root: THREE.Object3D;
    hiDetail: THREE.Object3D;
    loDetail: THREE.Object3D;
    wheels: Array<{ rotation: THREE.Euler }>;
    frontPivots: Array<{ rotation: THREE.Euler }>;
    alertSprite: THREE.Object3D;
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
  flashReactTimer: number;
  steerAngle: number;
  nearMissAwarded: boolean;
  jumpedInCurrentJump: boolean;
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
  roadX: (s: number) => number;
  roadY: (s: number) => number;
  roadDX: (s: number) => number;
  roadDY: (s: number) => number;
  roadDDX: (s: number) => number;

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
  playerS: number;
  laneOffset: number;
  keys: { left: boolean; right: boolean; gas: boolean; brake: boolean };
  jumpState: JumpState;
  trafficPool: TrafficCar[];
  weather: WeatherState;
  updateWeather: (dt: number) => void;
  resetWeather: () => void;
  setRainSound: (level: number) => void;
  playThunder: () => void;
  M: Record<string, THREE.Material>;

  [key: string]: any;
}
