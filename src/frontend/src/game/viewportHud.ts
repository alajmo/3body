import {
  BLACK_HOLE_SPEC,
  BOOST_SPEC,
  CURRENT_GAME_TUNING,
  FORESIGHT_SPEC,
  type AbilitySpec,
  type BlackHoleSpec,
  type BoostSpec,
  type RocketKind,
  SHIELD_SPEC,
} from "@3body/shared";
import { DEFAULT_ORBIT_PRESET } from "./orbitPresets";

export const DEFAULT_PLANET_BODY_SCALE =
  CURRENT_GAME_TUNING.visuals.planets.bodyScale;
export const DEFAULT_PLANET_AURA_SCALE =
  CURRENT_GAME_TUNING.visuals.planets.auraScale;
export const DEFAULT_PLANET_AURA_GAP =
  CURRENT_GAME_TUNING.visuals.planets.auraGap;
export const DEFAULT_CACHE_BADGE_SCALE =
  CURRENT_GAME_TUNING.visuals.caches.badgeScale;
export const DEFAULT_FORESIGHT_SETTINGS: AbilitySpec = { ...FORESIGHT_SPEC };
export const DEFAULT_SHIELD_SETTINGS: AbilitySpec = {
  cooldownSec: SHIELD_SPEC.cooldownSec,
  durationSec: SHIELD_SPEC.durationSec,
};
export const DEFAULT_BOOST_SETTINGS: BoostSpec = { ...BOOST_SPEC };

export type HudStatusMode = "ready" | "active" | "cooldown";

export interface GameViewportHudAbility {
  accent: string;
  id: "foresight" | "shield" | "boost" | "drone" | "wildcard";
  keyLabel: string;
  label: string;
  mode: HudStatusMode;
  progress: number;
  statusText: string;
  valueText?: string;
}

export interface GameViewportWeaponStatus {
  accent: string;
  ammo: number;
  kind: RocketKind;
  label: string;
  maxAmmo: number;
  reloadRemainingSec: number;
  selected: boolean;
}

export interface GameViewportPlanetBar {
  color: string;
  hp: number;
  id: number;
  label: string;
  maxHp: number;
  pulse: number;
  screenX: number;
  screenY: number;
}

export interface GameViewportKillFeedEntry {
  accent: string;
  ageSec: number;
  id: number;
  text: string;
}

export interface GameViewportDebugItem {
  label: string;
  value: string;
}

export interface GameViewportShortcut {
  active?: boolean;
  detail?: string;
  id: string;
  keyLabel: string;
  label: string;
}

export interface GameViewportConnectionState {
  extrapolating: boolean;
  fps: number;
  frameTimeMs: number;
  label: string;
  rttMs: number | null;
  state: "connected" | "local" | "reconnecting";
}

export interface GameViewportHudState {
  alivePlayerCount: number;
  abilities: GameViewportHudAbility[];
  blackHoleActive: boolean;
  blackHoleRemainingSec: number;
  blackHoleSettings: BlackHoleSpec;
  blackHoleWarning: boolean;
  boostSettings: BoostSpec;
  cacheBadgeScale: number;
  connection: GameViewportConnectionState;
  contextualShortcuts: GameViewportShortcut[];
  controlMode: "drone" | "planet";
  currentPresetId: string;
  damageFlash: number;
  debugItems: GameViewportDebugItem[];
  droneCargoLabel: string | null;
  foresightSettings: AbilitySpec;
  hudOpacity: number;
  killFeed: GameViewportKillFeedEntry[];
  planetBars: GameViewportPlanetBar[];
  planetBodyScale: number;
  planetAuraGap: number;
  planetAuraScale: number;
  profilingEnabled: boolean;
  playerArchetype: string;
  playerHp: number;
  playerHpPulse: number;
  playerLabel: string;
  primaryShortcuts: GameViewportShortcut[];
  sandboxPaused: boolean;
  sandboxControlsEnabled: boolean;
  selectedWeapon: RocketKind;
  shieldSettings: AbilitySpec;
  timerElapsedSec: number;
  totalPlayerCount: number;
  weapons: GameViewportWeaponStatus[];
}

export interface GameViewportController {
  resetProfiling: () => void;
  resetAbilitySettings: () => void;
  resetBlackHoleSettings: () => void;
  resetPlanetVisualSettings: () => void;
  setBoostSetting: <K extends keyof BoostSpec>(
    key: K,
    value: BoostSpec[K],
  ) => void;
  setBlackHoleSetting: <K extends keyof BlackHoleSpec>(
    key: K,
    value: BlackHoleSpec[K],
  ) => void;
  setCacheBadgeScale: (value: number) => void;
  setForesightSetting: <K extends keyof AbilitySpec>(
    key: K,
    value: AbilitySpec[K],
  ) => void;
  setPlanetBodyScale: (value: number) => void;
  setPlanetAuraGap: (value: number) => void;
  setPlanetAuraScale: (value: number) => void;
  setProfilingEnabled: (value: boolean) => void;
  pauseSandbox: () => void;
  playSandbox: () => void;
  resetSandbox: () => void;
  setShieldSetting: <K extends keyof AbilitySpec>(
    key: K,
    value: AbilitySpec[K],
  ) => void;
  setOrbitPreset: (presetId: string) => void;
}

export interface CreateGameViewportOptions {
  enableSandboxStorage?: boolean;
  onControllerReady?: (controller: GameViewportController | null) => void;
  onHudStateChange?: (state: GameViewportHudState) => void;
}

export const createInitialHudState = (): GameViewportHudState => ({
  alivePlayerCount: 0,
  abilities: [],
  blackHoleActive: false,
  blackHoleRemainingSec: 0,
  blackHoleSettings: { ...BLACK_HOLE_SPEC },
  blackHoleWarning: false,
  boostSettings: { ...DEFAULT_BOOST_SETTINGS },
  cacheBadgeScale: DEFAULT_CACHE_BADGE_SCALE,
  connection: {
    extrapolating: false,
    fps: 0,
    frameTimeMs: 0,
    label: "Local sandbox",
    rttMs: 0,
    state: "local",
  },
  contextualShortcuts: [],
  controlMode: "planet",
  currentPresetId: DEFAULT_ORBIT_PRESET.id,
  damageFlash: 0,
  debugItems: [],
  droneCargoLabel: null,
  foresightSettings: { ...DEFAULT_FORESIGHT_SETTINGS },
  hudOpacity: 1,
  killFeed: [],
  planetBars: [],
  planetBodyScale: DEFAULT_PLANET_BODY_SCALE,
  planetAuraGap: DEFAULT_PLANET_AURA_GAP,
  planetAuraScale: DEFAULT_PLANET_AURA_SCALE,
  profilingEnabled: false,
  playerArchetype: "--",
  playerHp: 0,
  playerHpPulse: 0,
  playerLabel: "Player",
  primaryShortcuts: [],
  sandboxPaused: false,
  sandboxControlsEnabled: true,
  selectedWeapon: "light",
  shieldSettings: { ...DEFAULT_SHIELD_SETTINGS },
  timerElapsedSec: 0,
  totalPlayerCount: 0,
  weapons: [],
});

const areObjectsEqual = <T>(
  current: readonly T[],
  next: readonly T[],
  isEqual: (left: T, right: T) => boolean,
): boolean =>
  current.length === next.length &&
  current.every((item, index) => isEqual(item, next[index]!));

const areConnectionStatesEqual = (
  current: GameViewportConnectionState,
  next: GameViewportConnectionState,
) =>
  current.extrapolating === next.extrapolating &&
  current.fps === next.fps &&
  current.frameTimeMs === next.frameTimeMs &&
  current.label === next.label &&
  current.rttMs === next.rttMs &&
  current.state === next.state;

const areSettingsEqual = (
  current: AbilitySpec | BlackHoleSpec | BoostSpec,
  next: AbilitySpec | BlackHoleSpec | BoostSpec,
) =>
  Object.keys(current).every(
    (key) =>
      current[key as keyof typeof current] === next[key as keyof typeof next],
  );

export const areHudStatesEqual = (
  current: GameViewportHudState,
  next: GameViewportHudState,
): boolean =>
  current.alivePlayerCount === next.alivePlayerCount &&
  current.blackHoleActive === next.blackHoleActive &&
  current.blackHoleRemainingSec === next.blackHoleRemainingSec &&
  current.blackHoleWarning === next.blackHoleWarning &&
  current.cacheBadgeScale === next.cacheBadgeScale &&
  areConnectionStatesEqual(current.connection, next.connection) &&
  current.controlMode === next.controlMode &&
  current.currentPresetId === next.currentPresetId &&
  current.damageFlash === next.damageFlash &&
  current.droneCargoLabel === next.droneCargoLabel &&
  current.hudOpacity === next.hudOpacity &&
  current.planetBodyScale === next.planetBodyScale &&
  current.planetAuraGap === next.planetAuraGap &&
  current.planetAuraScale === next.planetAuraScale &&
  current.profilingEnabled === next.profilingEnabled &&
  current.playerArchetype === next.playerArchetype &&
  current.playerHp === next.playerHp &&
  current.playerHpPulse === next.playerHpPulse &&
  current.playerLabel === next.playerLabel &&
  current.sandboxPaused === next.sandboxPaused &&
  current.sandboxControlsEnabled === next.sandboxControlsEnabled &&
  current.selectedWeapon === next.selectedWeapon &&
  current.timerElapsedSec === next.timerElapsedSec &&
  current.totalPlayerCount === next.totalPlayerCount &&
  areSettingsEqual(current.blackHoleSettings, next.blackHoleSettings) &&
  areSettingsEqual(current.boostSettings, next.boostSettings) &&
  areSettingsEqual(current.foresightSettings, next.foresightSettings) &&
  areSettingsEqual(current.shieldSettings, next.shieldSettings) &&
  areObjectsEqual(
    current.abilities,
    next.abilities,
    (left, right) =>
      left.accent === right.accent &&
      left.id === right.id &&
      left.keyLabel === right.keyLabel &&
      left.label === right.label &&
      left.mode === right.mode &&
      left.progress === right.progress &&
      left.statusText === right.statusText &&
      left.valueText === right.valueText,
  ) &&
  areObjectsEqual(
    current.contextualShortcuts,
    next.contextualShortcuts,
    (left, right) =>
      left.active === right.active &&
      left.detail === right.detail &&
      left.id === right.id &&
      left.keyLabel === right.keyLabel &&
      left.label === right.label,
  ) &&
  areObjectsEqual(
    current.debugItems,
    next.debugItems,
    (left, right) => left.label === right.label && left.value === right.value,
  ) &&
  areObjectsEqual(
    current.killFeed,
    next.killFeed,
    (left, right) =>
      left.accent === right.accent &&
      left.ageSec === right.ageSec &&
      left.id === right.id &&
      left.text === right.text,
  ) &&
  areObjectsEqual(
    current.planetBars,
    next.planetBars,
    (left, right) =>
      left.color === right.color &&
      left.hp === right.hp &&
      left.id === right.id &&
      left.label === right.label &&
      left.maxHp === right.maxHp &&
      left.pulse === right.pulse &&
      left.screenX === right.screenX &&
      left.screenY === right.screenY,
  ) &&
  areObjectsEqual(
    current.primaryShortcuts,
    next.primaryShortcuts,
    (left, right) =>
      left.active === right.active &&
      left.detail === right.detail &&
      left.id === right.id &&
      left.keyLabel === right.keyLabel &&
      left.label === right.label,
  ) &&
  areObjectsEqual(
    current.weapons,
    next.weapons,
    (left, right) =>
      left.accent === right.accent &&
      left.ammo === right.ammo &&
      left.kind === right.kind &&
      left.label === right.label &&
      left.maxAmmo === right.maxAmmo &&
      left.reloadRemainingSec === right.reloadRemainingSec &&
      left.selected === right.selected,
  );
