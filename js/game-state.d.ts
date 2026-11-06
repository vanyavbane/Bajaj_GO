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
  keys: Record<string, boolean>;
  M: Record<string, THREE.Material>;

  [key: string]: any;
}
