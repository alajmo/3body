import {
  BLACK_HOLE_SPEC,
  BOOST_SPEC,
  FORESIGHT_SPEC,
  type AbilitySpec,
  type BlackHoleSpec,
  type BoostSpec,
  type RocketKind,
  SHIELD_SPEC,
} from "@3body/shared";
import { DEFAULT_ORBIT_PRESET } from "./orbitPresets";

export const DEFAULT_PLANET_BODY_SCALE = 2;
export const DEFAULT_PLANET_AURA_SCALE = 2.2;
export const DEFAULT_PLANET_AURA_GAP = 0;
export const DEFAULT_CACHE_BADGE_SCALE = 1;
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
