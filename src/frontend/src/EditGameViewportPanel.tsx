import type {
  AbilitySpec,
  BlackHoleSpec,
  BoostSpec,
  GameTuningDocument,
  HudVisualTuning,
} from "@3body/shared";
import { startTransition, useEffect, useRef, useState } from "react";
import { CombatHud } from "./CombatHud";
import { createGameViewport } from "./game/createGameViewport";
import {
  createInitialHudState,
  type GameViewportController,
} from "./game/viewportHud";

const VIEWPORT_REFRESH_DEBOUNCE_MS = 140;
const BLACK_HOLE_SETTING_KEYS = [
  "spawnSec",
  "mass",
  "killRadius",
  "rampSec",
] as const satisfies readonly (keyof BlackHoleSpec)[];
const ABILITY_SETTING_KEYS = [
  "cooldownSec",
  "durationSec",
] as const satisfies readonly (keyof AbilitySpec)[];
const BOOST_SETTING_KEYS = [
  "charges",
  "cooldownSec",
  "magnitude",
] as const satisfies readonly (keyof BoostSpec)[];

const createViewportRefreshSignature = (
  documentValue: GameTuningDocument,
): string =>
  JSON.stringify({
    abilities: {
      boostColor: documentValue.visuals.abilities.boostColor,
      shieldColor: documentValue.visuals.abilities.shieldColor,
      shieldArcDeg: documentValue.gameplay.abilities.shield.arcDeg,
    },
    background: documentValue.visuals.background,
    blackHole: documentValue.visuals.blackHole,
    camera: documentValue.gameplay.camera,
    planets: {
      archetypes: documentValue.visuals.planets.archetypes,
    },
    rockets: documentValue.visuals.rockets,
    suns: documentValue.visuals.suns,
  });

const syncSandboxSettings = (
  controller: GameViewportController,
  previousDocument: GameTuningDocument,
  nextDocument: GameTuningDocument,
) => {
  for (const key of BLACK_HOLE_SETTING_KEYS) {
    if (
      previousDocument.gameplay.blackHole[key] !==
      nextDocument.gameplay.blackHole[key]
    ) {
      controller.setBlackHoleSetting(
        key,
        nextDocument.gameplay.blackHole[key],
      );
    }
  }

  for (const key of ABILITY_SETTING_KEYS) {
    if (
      previousDocument.gameplay.abilities.foresight[key] !==
      nextDocument.gameplay.abilities.foresight[key]
    ) {
      controller.setForesightSetting(
        key,
        nextDocument.gameplay.abilities.foresight[key],
      );
    }

    if (
      previousDocument.gameplay.abilities.shield[key] !==
      nextDocument.gameplay.abilities.shield[key]
    ) {
      controller.setShieldSetting(key, nextDocument.gameplay.abilities.shield[key]);
    }
  }

  for (const key of BOOST_SETTING_KEYS) {
    if (
      previousDocument.gameplay.abilities.boost[key] !==
      nextDocument.gameplay.abilities.boost[key]
    ) {
      controller.setBoostSetting(key, nextDocument.gameplay.abilities.boost[key]);
    }
  }

  if (
    previousDocument.visuals.caches.badgeScale !==
    nextDocument.visuals.caches.badgeScale
  ) {
    controller.setCacheBadgeScale(nextDocument.visuals.caches.badgeScale);
  }
};

export function EditGameViewportPanel({
  className = "app-shell",
  documentValue,
  hudTuning,
  showHud,
}: {
  className?: string;
  documentValue: GameTuningDocument;
  hudTuning: HudVisualTuning;
  showHud: boolean;
}) {
  const viewportElementRef = useRef<HTMLDivElement | null>(null);
  const disposeViewportRef = useRef<(() => void) | null>(null);
  const refreshTimeoutRef = useRef<number | null>(null);
  const lastRefreshSignatureRef = useRef(
    createViewportRefreshSignature(documentValue),
  );
  const lastSyncedDocumentRef = useRef(documentValue);
  const [hudState, setHudState] = useState(() => ({
    ...createInitialHudState(),
    botsEnabled: true,
  }));
  const [viewportController, setViewportController] =
    useState<GameViewportController | null>(null);

  const restartViewport = () => {
    const viewportElement = viewportElementRef.current;
    if (viewportElement === null) {
      return;
    }

    disposeViewportRef.current?.();
    disposeViewportRef.current = createGameViewport(viewportElement, {
      defaultBotsEnabled: true,
      enableSandboxStorage: false,
      onControllerReady: setViewportController,
      onHudStateChange: (nextState) => {
        startTransition(() => {
          setHudState(nextState);
        });
      },
    });
  };

  useEffect(() => {
    restartViewport();

    return () => {
      if (refreshTimeoutRef.current !== null) {
        window.clearTimeout(refreshTimeoutRef.current);
      }
      refreshTimeoutRef.current = null;
      disposeViewportRef.current?.();
      disposeViewportRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (viewportController === null) {
      lastSyncedDocumentRef.current = documentValue;
      return;
    }

    syncSandboxSettings(
      viewportController,
      lastSyncedDocumentRef.current,
      documentValue,
    );
    lastSyncedDocumentRef.current = documentValue;
  }, [documentValue, viewportController]);

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current !== null) {
        window.clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const nextSignature = createViewportRefreshSignature(documentValue);
    if (lastRefreshSignatureRef.current === nextSignature) {
      return;
    }

    lastRefreshSignatureRef.current = nextSignature;
    if (refreshTimeoutRef.current !== null) {
      window.clearTimeout(refreshTimeoutRef.current);
    }
    refreshTimeoutRef.current = window.setTimeout(() => {
      refreshTimeoutRef.current = null;
      restartViewport();
    }, VIEWPORT_REFRESH_DEBOUNCE_MS);
  }, [documentValue]);

  return (
    <div className={className}>
      <div ref={viewportElementRef} className="canvas-root" />
      {showHud ? (
        <div className="hud-root">
          <CombatHud
            controller={viewportController}
            hud={hudState}
            hudTuning={hudTuning}
            showPerformanceTools={false}
          />
        </div>
      ) : null}
    </div>
  );
}
