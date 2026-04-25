import type { AbilitySpec, BlackHoleSpec, BoostSpec } from "@3body/shared";
import { BLACK_HOLE_SPEC } from "@3body/shared";
import {
  DEFAULT_ORBIT_PRESET,
  ORBIT_PRESET_BY_ID,
  type OrbitPreset,
} from "../orbitPresets";
import { createViewportDefaultsFromRuntimeTuning } from "../runtimeTuning";
import {
  DEFAULT_SHIELD_SETTINGS,
  createInitialHudState,
  type GameViewportController,
  type GameViewportHudState,
} from "../viewportHud";
import {
  applyAbilitySettingsToSpecs as syncAbilitySettingsToSpecs,
  loadViewportSettings,
  persistProfilingEnabled as persistStoredProfilingEnabled,
  sanitizeAbilitySettings as sanitizeStoredAbilitySettings,
  sanitizeBlackHoleSettings as sanitizeStoredBlackHoleSettings,
  sanitizeBoostSettings as sanitizeStoredBoostSettings,
  sanitizeCacheBadgeScale as sanitizeStoredCacheBadgeScale,
  sanitizeProfilingEnabled as sanitizeStoredProfilingEnabled,
} from "./settings";

interface GameViewportSandboxSettingsState {
  activePreset: OrbitPreset;
  blackHoleSettings: BlackHoleSpec;
  botsEnabled: boolean;
  boostSettings: BoostSpec;
  cacheBadgeScale: number;
  profilingEnabled: boolean;
  sandboxPaused: boolean;
  shieldSettings: AbilitySpec;
}

interface CreateGameViewportSandboxSettingsStoreOptions {
  defaultBotsEnabled: boolean;
  emitHudState: (state: GameViewportHudState) => void;
  getCurrentHudState: () => GameViewportHudState;
  onResetProfilingRequested: () => void;
  onResetSandboxRequested: () => void;
  onSimulationAccumulatorResetRequested: () => void;
  storage: Storage | null;
}

export const sandboxControlsEnabled = (
  state: Pick<GameViewportSandboxSettingsState, "activePreset">,
): boolean => state.activePreset.id === DEFAULT_ORBIT_PRESET.id;

const sanitizeBlackHoleSettings = (
  value: Partial<BlackHoleSpec> | null | undefined,
): BlackHoleSpec => sanitizeStoredBlackHoleSettings(value);

const sanitizeAbilitySettings = (
  value: Partial<AbilitySpec> | null | undefined,
  defaults: AbilitySpec,
): AbilitySpec => sanitizeStoredAbilitySettings(value, defaults);

const sanitizeBoostSettings = (
  value: Partial<BoostSpec> | null | undefined,
): BoostSpec => sanitizeStoredBoostSettings(value);

const sanitizeCacheBadgeScale = (value: unknown): number =>
  sanitizeStoredCacheBadgeScale(value);

const createInitialSandboxSettingsState = (
  storage: Storage | null,
  defaultBotsEnabled: boolean,
): GameViewportSandboxSettingsState => {
  const tuningDefaults = createViewportDefaultsFromRuntimeTuning();
  const profilingEnabled =
    storage !== null
      ? loadViewportSettings(storage).profilingEnabled
      : tuningDefaults.profilingEnabled;

  return {
    activePreset: DEFAULT_ORBIT_PRESET,
    blackHoleSettings: tuningDefaults.blackHoleSettings,
    botsEnabled: defaultBotsEnabled,
    boostSettings: tuningDefaults.boostSettings,
    cacheBadgeScale: tuningDefaults.cacheBadgeScale,
    profilingEnabled: sanitizeStoredProfilingEnabled(profilingEnabled),
    sandboxPaused: false,
    shieldSettings: tuningDefaults.shieldSettings,
  };
};

const applySandboxSettingsToHudState = (
  baseState: GameViewportHudState,
  sandboxState: GameViewportSandboxSettingsState,
): GameViewportHudState => ({
  ...baseState,
  blackHoleSettings: sandboxState.blackHoleSettings,
  botsEnabled: sandboxState.botsEnabled,
  boostSettings: { ...sandboxState.boostSettings },
  cacheBadgeScale: sandboxState.cacheBadgeScale,
  currentPresetId: sandboxState.activePreset.id,
  profilingEnabled: sandboxState.profilingEnabled,
  sandboxControlsEnabled: sandboxControlsEnabled(sandboxState),
  sandboxPaused: sandboxState.sandboxPaused,
  shieldSettings: { ...sandboxState.shieldSettings },
});

export const createGameViewportSandboxSettingsStore = (
  options: CreateGameViewportSandboxSettingsStoreOptions,
): {
  controller: GameViewportController;
  emitInitialHudState: () => void;
  emitSandboxHudState: () => void;
  state: GameViewportSandboxSettingsState;
} => {
  const state = createInitialSandboxSettingsState(
    options.storage,
    options.defaultBotsEnabled,
  );
  syncAbilitySettingsToSpecs(state.shieldSettings, state.boostSettings);

  const emitSandboxHudState = () => {
    options.emitHudState(
      applySandboxSettingsToHudState(options.getCurrentHudState(), state),
    );
  };

  const emitInitialHudState = () => {
    options.emitHudState(
      applySandboxSettingsToHudState(createInitialHudState(), state),
    );
  };

  const persistProfilingEnabled = () => {
    persistStoredProfilingEnabled(options.storage, state.profilingEnabled);
  };

  return {
    controller: {
      resetProfiling: () => {
        options.onResetProfilingRequested();
        emitSandboxHudState();
      },
      resetAbilitySettings: () => {
        const runtimeDefaults = createViewportDefaultsFromRuntimeTuning();
        state.shieldSettings = { ...runtimeDefaults.shieldSettings };
        state.boostSettings = { ...runtimeDefaults.boostSettings };
        syncAbilitySettingsToSpecs(state.shieldSettings, state.boostSettings);
        emitSandboxHudState();
        options.onResetSandboxRequested();
      },
      resetBlackHoleSettings: () => {
        state.blackHoleSettings = { ...BLACK_HOLE_SPEC };
        emitSandboxHudState();
        options.onResetSandboxRequested();
      },
      resetPlanetVisualSettings: () => {
        emitSandboxHudState();
      },
      setBotsEnabled: (value) => {
        state.botsEnabled = value === true;
        emitSandboxHudState();
        options.onResetSandboxRequested();
      },
      setBlackHoleSetting: (key, value) => {
        state.blackHoleSettings = sanitizeBlackHoleSettings({
          ...state.blackHoleSettings,
          [key]: value,
        });
        emitSandboxHudState();
        options.onResetSandboxRequested();
      },
      setBoostSetting: (key, value) => {
        state.boostSettings = sanitizeBoostSettings({
          ...state.boostSettings,
          [key]: value,
        });
        syncAbilitySettingsToSpecs(state.shieldSettings, state.boostSettings);
        emitSandboxHudState();
        options.onResetSandboxRequested();
      },
      setCacheBadgeScale: (value) => {
        state.cacheBadgeScale = sanitizeCacheBadgeScale(value);
        emitSandboxHudState();
      },
      setOrbitPreset: (presetId) => {
        const nextPreset = ORBIT_PRESET_BY_ID.get(presetId);
        if (!nextPreset) {
          return;
        }

        state.activePreset = nextPreset;
        emitSandboxHudState();
        options.onResetSandboxRequested();
      },
      setPlanetAuraGap: (_value) => {
        emitSandboxHudState();
      },
      setPlanetAuraScale: (_value) => {
        emitSandboxHudState();
      },
      setPlanetBodyScale: (_value) => {
        emitSandboxHudState();
      },
      setProfilingEnabled: (value) => {
        state.profilingEnabled = sanitizeStoredProfilingEnabled(value);
        persistProfilingEnabled();
        options.onResetProfilingRequested();
        emitSandboxHudState();
      },
      setShieldSetting: (key, value) => {
        state.shieldSettings = sanitizeAbilitySettings(
          {
            ...state.shieldSettings,
            [key]: value,
          },
          DEFAULT_SHIELD_SETTINGS,
        );
        syncAbilitySettingsToSpecs(state.shieldSettings, state.boostSettings);
        emitSandboxHudState();
        options.onResetSandboxRequested();
      },
      pauseSandbox: () => {
        state.sandboxPaused = true;
        options.onSimulationAccumulatorResetRequested();
        emitSandboxHudState();
      },
      playSandbox: () => {
        state.sandboxPaused = false;
        options.onSimulationAccumulatorResetRequested();
        emitSandboxHudState();
      },
      resetSandbox: () => {
        options.onResetSandboxRequested();
      },
    },
    emitInitialHudState,
    emitSandboxHudState,
    state,
  };
};
