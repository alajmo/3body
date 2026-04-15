import type { AbilitySpec, BlackHoleSpec, BoostSpec } from "@3body/shared";
import { BLACK_HOLE_SPEC } from "@3body/shared";
import {
  DEFAULT_ORBIT_PRESET,
  ORBIT_PRESET_BY_ID,
  type OrbitPreset,
} from "../orbitPresets";
import { createViewportDefaultsFromRuntimeTuning } from "../runtimeTuning";
import {
  DEFAULT_FORESIGHT_SETTINGS,
  DEFAULT_SHIELD_SETTINGS,
  createInitialHudState,
  type GameViewportController,
  type GameViewportHudState,
} from "../viewportHud";
import {
  applyAbilitySettingsToSpecs as syncAbilitySettingsToSpecs,
  loadViewportSettings,
  persistBlackHoleSettings as persistStoredBlackHoleSettings,
  persistBoostSettings as persistStoredBoostSettings,
  persistCacheBadgeScale as persistStoredCacheBadgeScale,
  persistForesightSettings as persistStoredForesightSettings,
  persistOrbitPresetId,
  persistPlanetAuraGap as persistStoredPlanetAuraGap,
  persistPlanetAuraScale as persistStoredPlanetAuraScale,
  persistPlanetBodyScale as persistStoredPlanetBodyScale,
  persistProfilingEnabled as persistStoredProfilingEnabled,
  persistShieldSettings as persistStoredShieldSettings,
  sanitizeAbilitySettings as sanitizeStoredAbilitySettings,
  sanitizeBlackHoleSettings as sanitizeStoredBlackHoleSettings,
  sanitizeBoostSettings as sanitizeStoredBoostSettings,
  sanitizeCacheBadgeScale as sanitizeStoredCacheBadgeScale,
  sanitizePlanetAuraGap as sanitizeStoredPlanetAuraGap,
  sanitizePlanetAuraScale as sanitizeStoredPlanetAuraScale,
  sanitizePlanetBodyScale as sanitizeStoredPlanetBodyScale,
  sanitizeProfilingEnabled as sanitizeStoredProfilingEnabled,
} from "./settings";

export interface GameViewportSandboxSettingsState {
  activePreset: OrbitPreset;
  blackHoleSettings: BlackHoleSpec;
  boostSettings: BoostSpec;
  cacheBadgeScale: number;
  foresightSettings: AbilitySpec;
  planetAuraGap: number;
  planetAuraScale: number;
  planetBodyScale: number;
  profilingEnabled: boolean;
  sandboxPaused: boolean;
  shieldSettings: AbilitySpec;
}

interface CreateGameViewportSandboxSettingsStoreOptions {
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

const sanitizePlanetAuraScale = (value: unknown): number =>
  sanitizeStoredPlanetAuraScale(value);

const sanitizePlanetAuraGap = (value: unknown): number =>
  sanitizeStoredPlanetAuraGap(value);

const sanitizePlanetBodyScale = (value: unknown): number =>
  sanitizeStoredPlanetBodyScale(value);

const sanitizeCacheBadgeScale = (value: unknown): number =>
  sanitizeStoredCacheBadgeScale(value);

const createInitialSandboxSettingsState = (
  storage: Storage | null,
): GameViewportSandboxSettingsState => {
  const persistedSettings =
    storage !== null
      ? loadViewportSettings(storage)
      : createViewportDefaultsFromRuntimeTuning();
  const storedPresetId = persistedSettings.orbitPresetId;

  return {
    activePreset:
      (storedPresetId !== null
        ? ORBIT_PRESET_BY_ID.get(storedPresetId)
        : undefined) ?? DEFAULT_ORBIT_PRESET,
    blackHoleSettings: persistedSettings.blackHoleSettings,
    boostSettings: persistedSettings.boostSettings,
    cacheBadgeScale: persistedSettings.cacheBadgeScale,
    foresightSettings: persistedSettings.foresightSettings,
    planetAuraGap: persistedSettings.planetAuraGap,
    planetAuraScale: persistedSettings.planetAuraScale,
    planetBodyScale: persistedSettings.planetBodyScale,
    profilingEnabled: sanitizeStoredProfilingEnabled(
      persistedSettings.profilingEnabled,
    ),
    sandboxPaused: false,
    shieldSettings: persistedSettings.shieldSettings,
  };
};

const applySandboxSettingsToHudState = (
  baseState: GameViewportHudState,
  sandboxState: GameViewportSandboxSettingsState,
): GameViewportHudState => ({
  ...baseState,
  blackHoleSettings: sandboxState.blackHoleSettings,
  boostSettings: { ...sandboxState.boostSettings },
  cacheBadgeScale: sandboxState.cacheBadgeScale,
  currentPresetId: sandboxState.activePreset.id,
  foresightSettings: { ...sandboxState.foresightSettings },
  planetBodyScale: sandboxState.planetBodyScale,
  planetAuraGap: sandboxState.planetAuraGap,
  planetAuraScale: sandboxState.planetAuraScale,
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
  const state = createInitialSandboxSettingsState(options.storage);
  syncAbilitySettingsToSpecs(
    state.foresightSettings,
    state.shieldSettings,
    state.boostSettings,
  );

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

  const persistBlackHoleSettings = () => {
    persistStoredBlackHoleSettings(options.storage, state.blackHoleSettings);
  };
  const persistForesightSettings = () => {
    persistStoredForesightSettings(options.storage, state.foresightSettings);
  };
  const persistShieldSettings = () => {
    persistStoredShieldSettings(options.storage, state.shieldSettings);
  };
  const persistBoostSettings = () => {
    persistStoredBoostSettings(options.storage, state.boostSettings);
  };
  const persistPlanetBodyScale = () => {
    persistStoredPlanetBodyScale(options.storage, state.planetBodyScale);
  };
  const persistPlanetAuraGap = () => {
    persistStoredPlanetAuraGap(options.storage, state.planetAuraGap);
  };
  const persistPlanetAuraScale = () => {
    persistStoredPlanetAuraScale(options.storage, state.planetAuraScale);
  };
  const persistCacheBadgeScale = () => {
    persistStoredCacheBadgeScale(options.storage, state.cacheBadgeScale);
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
        state.foresightSettings = { ...runtimeDefaults.foresightSettings };
        state.shieldSettings = { ...runtimeDefaults.shieldSettings };
        state.boostSettings = { ...runtimeDefaults.boostSettings };
        syncAbilitySettingsToSpecs(
          state.foresightSettings,
          state.shieldSettings,
          state.boostSettings,
        );
        persistForesightSettings();
        persistShieldSettings();
        persistBoostSettings();
        emitSandboxHudState();
        options.onResetSandboxRequested();
      },
      resetBlackHoleSettings: () => {
        state.blackHoleSettings = { ...BLACK_HOLE_SPEC };
        persistBlackHoleSettings();
        emitSandboxHudState();
        options.onResetSandboxRequested();
      },
      resetPlanetVisualSettings: () => {
        const runtimeDefaults = createViewportDefaultsFromRuntimeTuning();
        state.planetBodyScale = runtimeDefaults.planetBodyScale;
        state.planetAuraGap = runtimeDefaults.planetAuraGap;
        state.planetAuraScale = runtimeDefaults.planetAuraScale;
        state.cacheBadgeScale = runtimeDefaults.cacheBadgeScale;
        persistPlanetBodyScale();
        persistPlanetAuraGap();
        persistPlanetAuraScale();
        persistCacheBadgeScale();
        emitSandboxHudState();
      },
      setBlackHoleSetting: (key, value) => {
        state.blackHoleSettings = sanitizeBlackHoleSettings({
          ...state.blackHoleSettings,
          [key]: value,
        });
        persistBlackHoleSettings();
        emitSandboxHudState();
        options.onResetSandboxRequested();
      },
      setBoostSetting: (key, value) => {
        state.boostSettings = sanitizeBoostSettings({
          ...state.boostSettings,
          [key]: value,
        });
        syncAbilitySettingsToSpecs(
          state.foresightSettings,
          state.shieldSettings,
          state.boostSettings,
        );
        persistBoostSettings();
        emitSandboxHudState();
        options.onResetSandboxRequested();
      },
      setCacheBadgeScale: (value) => {
        state.cacheBadgeScale = sanitizeCacheBadgeScale(value);
        persistCacheBadgeScale();
        emitSandboxHudState();
      },
      setForesightSetting: (key, value) => {
        state.foresightSettings = sanitizeAbilitySettings(
          {
            ...state.foresightSettings,
            [key]: value,
          },
          DEFAULT_FORESIGHT_SETTINGS,
        );
        syncAbilitySettingsToSpecs(
          state.foresightSettings,
          state.shieldSettings,
          state.boostSettings,
        );
        persistForesightSettings();
        emitSandboxHudState();
        options.onResetSandboxRequested();
      },
      setOrbitPreset: (presetId) => {
        const nextPreset = ORBIT_PRESET_BY_ID.get(presetId);
        if (!nextPreset) {
          return;
        }

        state.activePreset = nextPreset;
        persistOrbitPresetId(options.storage, nextPreset.id);
        emitSandboxHudState();
        options.onResetSandboxRequested();
      },
      setPlanetAuraGap: (value) => {
        state.planetAuraGap = sanitizePlanetAuraGap(value);
        persistPlanetAuraGap();
        emitSandboxHudState();
      },
      setPlanetAuraScale: (value) => {
        state.planetAuraScale = sanitizePlanetAuraScale(value);
        persistPlanetAuraScale();
        emitSandboxHudState();
      },
      setPlanetBodyScale: (value) => {
        state.planetBodyScale = sanitizePlanetBodyScale(value);
        persistPlanetBodyScale();
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
        syncAbilitySettingsToSpecs(
          state.foresightSettings,
          state.shieldSettings,
          state.boostSettings,
        );
        persistShieldSettings();
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
