import {
  applyGameplayTuning,
  BLACK_HOLE_SPEC,
  BOOST_SPEC,
  cloneGameTuningDocument,
  CURRENT_GAME_TUNING,
  CURRENT_TUNING_BY_MODE,
  sanitizeGameTuning,
  SHIELD_SPEC,
  type GameTuningDocument,
  type TuningMode,
} from "@3body/shared";

interface RuntimeViewportDefaults {
  blackHoleSettings: typeof BLACK_HOLE_SPEC;
  boostSettings: typeof BOOST_SPEC;
  cacheBadgeScale: number;
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
  mode: TuningMode = "online",
  fetchImpl: typeof fetch = fetch,
): Promise<GameTuningDocument> => {
  const fallback = CURRENT_TUNING_BY_MODE[mode];
  try {
    const response = await fetchImpl(`/api/editor/tuning/${mode}`);
    if (!response.ok) {
      applyRuntimeTuningDocument(fallback);
      return runtimeTuningDocument;
    }

    const nextDocument = sanitizeGameTuning(await response.json(), fallback);
    applyRuntimeTuningDocument(nextDocument);
  } catch {
    applyRuntimeTuningDocument(fallback);
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
      profilingEnabled: false,
      shieldSettings: {
        cooldownSec: SHIELD_SPEC.cooldownSec,
        durationSec: SHIELD_SPEC.durationSec,
      },
    };
  };
