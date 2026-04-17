import {
  applyGameplayTuning,
  BLACK_HOLE_SPEC,
  BOOST_SPEC,
  cloneGameTuningDocument,
  CURRENT_GAME_TUNING,
  FORESIGHT_SPEC,
  sanitizeGameTuning,
  SHIELD_SPEC,
  type GameTuningDocument,
} from "@3body/shared";

export interface RuntimeViewportDefaults {
  blackHoleSettings: typeof BLACK_HOLE_SPEC;
  boostSettings: typeof BOOST_SPEC;
  cacheBadgeScale: number;
  foresightSettings: typeof FORESIGHT_SPEC;
  orbitPresetId: string | null;
  profilingEnabled: boolean;
  shieldSettings: {
    cooldownSec: number;
    durationSec: number;
  };
}

let runtimeTuningDocument = cloneGameTuningDocument(CURRENT_GAME_TUNING);

export const getRuntimeTuningDocument = (): GameTuningDocument =>
  runtimeTuningDocument;

export const applyRuntimeTuningDocument = (value: GameTuningDocument) => {
  runtimeTuningDocument = cloneGameTuningDocument(value);
  applyGameplayTuning(runtimeTuningDocument.gameplay);
};

export const loadRuntimeTuningDocument = async (
  fetchImpl: typeof fetch = fetch,
): Promise<GameTuningDocument> => {
  try {
    const response = await fetchImpl("/api/editor/tuning");
    if (!response.ok) {
      return runtimeTuningDocument;
    }

    const nextDocument = sanitizeGameTuning(await response.json());
    applyRuntimeTuningDocument(nextDocument);
  } catch {
    return runtimeTuningDocument;
  }

  return runtimeTuningDocument;
};

export const createViewportDefaultsFromRuntimeTuning =
  (): RuntimeViewportDefaults => {
    const tuning = runtimeTuningDocument;

    return {
      blackHoleSettings: { ...BLACK_HOLE_SPEC },
      boostSettings: { ...BOOST_SPEC },
      cacheBadgeScale: tuning.visuals.caches.badgeScale,
      foresightSettings: { ...FORESIGHT_SPEC },
      orbitPresetId: null,
      profilingEnabled: false,
      shieldSettings: {
        cooldownSec: SHIELD_SPEC.cooldownSec,
        durationSec: SHIELD_SPEC.durationSec,
      },
    };
  };
