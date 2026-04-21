import {
  clamp,
  type GameTuningDocument,
  type HudVisualTuning,
  type RocketKind,
} from "@3body/shared";
import { useEffect, useRef, useState } from "react";
import { CombatHud } from "./CombatHud";
import { EditorItemViewportPanel } from "./EditorItemViewportPanel";
import { ShowcaseViewportPanel } from "./ShowcaseViewportPanel";
import type { EditorPreviewViewportItemId } from "./game/createEditorItemPreviewViewport";
import type { ShowcaseDisplayMode } from "./game/showcaseDisplayMode";
import {
  getRocketImpactHudFlicker,
  getRocketImpactScreenFlash,
  ROCKET_IMPACT_HUD_FLICKER_DURATION_SEC,
} from "./game/viewport/cameraShake";
import {
  createInitialHudState,
  type GameViewportHudState,
} from "./game/viewportHud";

const VIEWPORT_REFRESH_DEBOUNCE_MS = 140;
const HUD_MISSILE_HIT_PREVIEW_KIND: RocketKind = "heavy";
const HUD_MISSILE_HIT_PREVIEW_DURATION_MS =
  ROCKET_IMPACT_HUD_FLICKER_DURATION_SEC * 1000;

const createViewportRefreshSignature = (
  documentValue: GameTuningDocument,
): string => {
  const { hud: _hud, ...viewportVisuals } = documentValue.visuals;

  return JSON.stringify({
    gameplay: documentValue.gameplay,
    visuals: viewportVisuals,
  });
};

const createPreviewHudState = (
  documentValue: GameTuningDocument,
  {
    damageFlash = 0,
    hudFlicker = 0,
  }: {
    damageFlash?: number;
    hudFlicker?: number;
  } = {},
): GameViewportHudState => {
  const base = createInitialHudState();

  return {
    ...base,
    abilities: [
      {
        accent: documentValue.visuals.abilities.shieldColor,
        id: "shield",
        keyLabel: "Q",
        label: "Shield",
        mode: "active",
        progress: 0.58,
        statusText: "tracking",
      },
      {
        accent: documentValue.visuals.abilities.boostColor,
        id: "boost",
        keyLabel: "W",
        label: "Boost",
        mode: "ready",
        progress: 1,
        statusText: "ready",
      },
    ],
    alivePlayerCount: 3,
    blackHoleRemainingSec: Math.max(
      8,
      Math.min(47, documentValue.gameplay.blackHole.spawnSec),
    ),
    blackHoleSettings: { ...documentValue.gameplay.blackHole },
    blackHoleWarning: true,
    boostSettings: { ...documentValue.gameplay.abilities.boost },
    cacheBadgeScale: documentValue.visuals.caches.badgeScale,
    connection: {
      extrapolating: false,
      fps: 144,
      frameTimeMs: 6.9,
      label: "Editor preview",
      rttMs: 18,
      state: "connected",
    },
    damageFlash,
    hudFlicker,
    killFeed: [
      {
        accent: documentValue.visuals.rockets.light.hudAccent,
        ageSec: 0.6,
        id: 1,
        text: "Atlas destroyed Nadir",
      },
      {
        accent: documentValue.visuals.rockets.seeker.hudAccent,
        ageSec: 1.7,
        id: 2,
        text: "Helios tagged Orbit",
      },
    ],
    playerArchetype: "terra",
    playerHeadingDeg: 38,
    playerHp: 82,
    playerHpPulse: 0.18,
    playerLabel: "Atlas",
    playerSpeed: 312,
    sandboxControlsEnabled: true,
    shieldSettings: { ...documentValue.gameplay.abilities.shield },
    timerElapsedSec: 173,
    totalPlayerCount: 5,
    weapons: [
      {
        accent: documentValue.visuals.rockets.light.hudAccent,
        ammo: clamp(
          documentValue.gameplay.rockets.light.startAmmo,
          1,
          documentValue.gameplay.rockets.light.maxAmmo,
        ),
        kind: "light",
        label: "Light",
        maxAmmo: documentValue.gameplay.rockets.light.maxAmmo,
        reloadRemainingSec: 0,
        selected: true,
      },
      {
        accent: documentValue.visuals.rockets.heavy.hudAccent,
        ammo: clamp(
          documentValue.gameplay.rockets.heavy.startAmmo,
          0,
          documentValue.gameplay.rockets.heavy.maxAmmo,
        ),
        kind: "heavy",
        label: "Heavy",
        maxAmmo: documentValue.gameplay.rockets.heavy.maxAmmo,
        reloadRemainingSec:
          documentValue.gameplay.rockets.heavy.reloadSec * 0.5,
        selected: false,
      },
      {
        accent: documentValue.visuals.rockets.seeker.hudAccent,
        ammo: clamp(
          documentValue.gameplay.rockets.seeker.startAmmo,
          0,
          documentValue.gameplay.rockets.seeker.maxAmmo,
        ),
        kind: "seeker",
        label: "Seeker",
        maxAmmo: documentValue.gameplay.rockets.seeker.maxAmmo,
        reloadRemainingSec:
          documentValue.gameplay.rockets.seeker.reloadSec * 0.22,
        selected: false,
      },
    ],
  };
};

export function EditorPreviewStage({
  documentValue,
  externalRevision = 0,
  hudTuning,
  itemId,
  overviewDisplayMode,
  showHud,
}: {
  documentValue: GameTuningDocument;
  externalRevision?: number;
  hudTuning: HudVisualTuning;
  itemId: EditorPreviewViewportItemId | "orbits";
  overviewDisplayMode?: ShowcaseDisplayMode;
  showHud: boolean;
}) {
  const useShowcaseOverview = itemId === "overview";
  const useHudBackgroundSurface = itemId === "hud";
  const refreshTimeoutRef = useRef<number | null>(null);
  const hudHitPreviewTimeoutRef = useRef<number | null>(null);
  const lastRefreshSignatureRef = useRef(
    createViewportRefreshSignature(documentValue),
  );
  const [hudHitPreviewActive, setHudHitPreviewActive] = useState(false);
  const [viewportRevision, setViewportRevision] = useState(0);
  const previewHudState = createPreviewHudState(documentValue, {
    damageFlash: hudHitPreviewActive
      ? getRocketImpactScreenFlash({
          absorbedByShield: false,
          rocketKind: HUD_MISSILE_HIT_PREVIEW_KIND,
        })
      : 0,
    hudFlicker: hudHitPreviewActive
      ? getRocketImpactHudFlicker({
          absorbedByShield: false,
          rocketKind: HUD_MISSILE_HIT_PREVIEW_KIND,
        })
      : 0,
  });
  const resolvedRevision = viewportRevision + externalRevision;

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current !== null) {
        window.clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      if (hudHitPreviewTimeoutRef.current !== null) {
        window.clearTimeout(hudHitPreviewTimeoutRef.current);
        hudHitPreviewTimeoutRef.current = null;
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
      setViewportRevision((current) => current + 1);
    }, VIEWPORT_REFRESH_DEBOUNCE_MS);
  }, [documentValue]);

  const triggerHudHitPreview = () => {
    setHudHitPreviewActive(true);
    if (hudHitPreviewTimeoutRef.current !== null) {
      window.clearTimeout(hudHitPreviewTimeoutRef.current);
    }
    hudHitPreviewTimeoutRef.current = window.setTimeout(() => {
      hudHitPreviewTimeoutRef.current = null;
      setHudHitPreviewActive(false);
    }, HUD_MISSILE_HIT_PREVIEW_DURATION_MS);
  };

  return (
    <div className="game-stage game-stage--editor">
      {useShowcaseOverview ? (
        <ShowcaseViewportPanel
          className="editor-preview-surface"
          displayMode={overviewDisplayMode}
          focus="all"
          minimumWorldHeight={
            documentValue.gameplay.camera.previewCameraWorldHeight
          }
          revision={resolvedRevision}
        />
      ) : useHudBackgroundSurface ? (
        <EditorItemViewportPanel
          className="editor-preview-surface"
          itemId="hud"
          presentation="stage"
          revision={resolvedRevision}
        />
      ) : (
        <EditorItemViewportPanel
          className="editor-preview-surface"
          itemId={itemId}
          presentation="stage"
          revision={resolvedRevision}
        />
      )}
      {itemId === "hud" && showHud ? (
        <button
          type="button"
          className="edit-action-button edit-preview-overlay-button"
          onClick={triggerHudHitPreview}
        >
          Preview missile hit
        </button>
      ) : null}
      {showHud ? (
        <div
          className={`hud-root${
            overviewDisplayMode === "vhs" ? " hud-root--inside-crt" : ""
          }`}
        >
          <CombatHud
            controller={null}
            displayMode={overviewDisplayMode}
            hud={previewHudState}
            hudTuning={hudTuning}
            showPerformanceTools={false}
          />
        </div>
      ) : null}
    </div>
  );
}
