import type {
  GameTuningDocument,
  HudVisualTuning,
  RocketKind,
} from "@3body/shared";
import type { CSSProperties } from "react";
import { CombatHud } from "./CombatHud";
import { ShowcaseViewportPanel } from "./ShowcaseViewportPanel";
import { SunInteractionViewportPanel } from "./SunInteractionViewportPanel";
import {
  createInitialHudState,
  type GameViewportHudState,
} from "./game/viewportHud";

export type EditorPreviewStageMode =
  | { kind: "blank" }
  | { kind: "blackHole" }
  | { kind: "boost" }
  | { kind: "drone" }
  | { kind: "foresight" }
  | { kind: "orbits" }
  | { kind: "shield" }
  | {
      focus: "all" | "caches" | "planets" | "rockets" | "suns";
      kind: "showcase";
      rocketKind?: RocketKind;
    };

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const formatPreviewValue = (value: number, suffix: string) =>
  `${Math.round(value * 10) / 10}${suffix}`;

function PreviewBlackHoleSurface({
  documentValue,
}: {
  documentValue: GameTuningDocument;
}) {
  const { blackHole } = documentValue.visuals;
  const maxRadius = Math.max(
    blackHole.coreRadius,
    blackHole.ringRadius,
    blackHole.lensRadius,
    1,
  );

  return (
    <div className="editor-preview-surface editor-preview-surface--focus">
      <div className="editor-preview-black-hole">
        <div
          className="editor-preview-black-hole__lens"
          style={
            {
              "--black-hole-size": `${(blackHole.lensRadius / maxRadius) * 100}%`,
            } as CSSProperties
          }
        />
        <div
          className="editor-preview-black-hole__ring"
          style={
            {
              "--black-hole-size": `${(blackHole.ringRadius / maxRadius) * 100}%`,
            } as CSSProperties
          }
        />
        <div
          className="editor-preview-black-hole__core"
          style={
            {
              "--black-hole-size": `${(blackHole.coreRadius / maxRadius) * 100}%`,
            } as CSSProperties
          }
        />
      </div>
      <div className="editor-preview-readout">
        <span>
          Spawn{" "}
          {formatPreviewValue(documentValue.gameplay.blackHole.spawnSec, "s")}
        </span>
        <span>
          Mass {Math.round(documentValue.gameplay.blackHole.mass / 1_000_000)}M
        </span>
        <span>
          Kill{" "}
          {formatPreviewValue(documentValue.gameplay.blackHole.killRadius, "r")}
        </span>
      </div>
    </div>
  );
}

function PreviewForesightSurface({
  documentValue,
}: {
  documentValue: GameTuningDocument;
}) {
  const { foresightColor } = documentValue.visuals.abilities;
  const steps = Math.max(
    5,
    Math.min(
      9,
      Math.round(documentValue.gameplay.abilities.foresight.durationSec * 0.9),
    ),
  );
  const dots = Array.from({ length: steps }, (_, index) => {
    const t = (index + 1) / (steps + 1);
    const x = (1 - t) * (1 - t) * 26 + 2 * (1 - t) * t * 54 + t * t * 78;
    const y = (1 - t) * (1 - t) * 74 + 2 * (1 - t) * t * 26 + t * t * 44;
    return {
      opacity: 0.3 + t * 0.55,
      size: 8 + t * 10,
      x,
      y,
    };
  });

  return (
    <div className="editor-preview-surface editor-preview-surface--focus">
      <div
        className="editor-preview-foresight"
        style={
          {
            "--preview-accent": foresightColor,
          } as CSSProperties
        }
      >
        <div className="editor-preview-foresight__origin" />
        {dots.map((dot, index) => (
          <span
            key={index}
            className="editor-preview-foresight__dot"
            style={
              {
                height: `${dot.size}px`,
                left: `${dot.x}%`,
                opacity: `${dot.opacity}`,
                top: `${dot.y}%`,
                width: `${dot.size}px`,
              } as CSSProperties
            }
          />
        ))}
        <div className="editor-preview-foresight__target" />
      </div>
      <div className="editor-preview-readout">
        <span>
          Duration{" "}
          {formatPreviewValue(
            documentValue.gameplay.abilities.foresight.durationSec,
            "s",
          )}
        </span>
        <span>
          Cooldown{" "}
          {formatPreviewValue(
            documentValue.gameplay.abilities.foresight.cooldownSec,
            "s",
          )}
        </span>
      </div>
    </div>
  );
}

function PreviewShieldSurface({
  documentValue,
}: {
  documentValue: GameTuningDocument;
}) {
  const arcDeg = Math.max(
    1,
    Math.min(359, documentValue.gameplay.abilities.shield.arcDeg),
  );

  return (
    <div className="editor-preview-surface editor-preview-surface--focus">
      <div
        className="editor-preview-shield"
        style={
          {
            "--preview-accent": documentValue.visuals.abilities.shieldColor,
            "--shield-angle": `${arcDeg}deg`,
          } as CSSProperties
        }
      >
        <div className="editor-preview-shield__planet" />
        <div className="editor-preview-shield__arc" />
      </div>
      <div className="editor-preview-readout">
        <span>Arc {arcDeg}deg</span>
        <span>
          Duration{" "}
          {formatPreviewValue(
            documentValue.gameplay.abilities.shield.durationSec,
            "s",
          )}
        </span>
        <span>
          Cooldown{" "}
          {formatPreviewValue(
            documentValue.gameplay.abilities.shield.cooldownSec,
            "s",
          )}
        </span>
      </div>
    </div>
  );
}

function PreviewBoostSurface({
  documentValue,
}: {
  documentValue: GameTuningDocument;
}) {
  const { boostColor } = documentValue.visuals.abilities;
  const wakeScale =
    0.4 +
    clamp01(documentValue.gameplay.abilities.boost.magnitude / 4000) * 0.8;
  const charges = Math.max(
    1,
    Math.min(5, documentValue.gameplay.abilities.boost.charges),
  );

  return (
    <div className="editor-preview-surface editor-preview-surface--focus">
      <div
        className="editor-preview-boost"
        style={
          {
            "--boost-wake-scale": `${wakeScale}`,
            "--preview-accent": boostColor,
          } as CSSProperties
        }
      >
        <div className="editor-preview-boost__wake" />
        <div className="editor-preview-boost__planet" />
        <div className="editor-preview-boost__shock" />
        <div className="editor-preview-boost__charges">
          {Array.from({ length: charges }, (_, index) => (
            <span key={index} className="editor-preview-boost__charge" />
          ))}
        </div>
      </div>
      <div className="editor-preview-readout">
        <span>Charges {charges}</span>
        <span>
          Impulse{" "}
          {formatPreviewValue(
            documentValue.gameplay.abilities.boost.magnitude,
            "",
          )}
        </span>
        <span>
          Cooldown{" "}
          {formatPreviewValue(
            documentValue.gameplay.abilities.boost.cooldownSec,
            "s",
          )}
        </span>
      </div>
    </div>
  );
}

function PreviewDroneSurface({
  documentValue,
}: {
  documentValue: GameTuningDocument;
}) {
  return (
    <div className="editor-preview-surface editor-preview-surface--focus">
      <div className="editor-preview-drone">
        <div
          className="editor-preview-drone__body"
          style={
            {
              "--preview-accent": documentValue.visuals.drone.activeColor,
            } as CSSProperties
          }
        />
        <div
          className="editor-preview-drone__path"
          style={
            {
              "--preview-accent": documentValue.visuals.drone.returnColor,
            } as CSSProperties
          }
        />
        <div
          className="editor-preview-drone__return"
          style={
            {
              "--preview-accent": documentValue.visuals.drone.returnColor,
            } as CSSProperties
          }
        />
      </div>
      <div className="editor-preview-readout">
        <span>
          Speed {formatPreviewValue(documentValue.gameplay.drone.speed, "")}
        </span>
        <span>
          Fuel {formatPreviewValue(documentValue.gameplay.drone.fuel, "s")}
        </span>
        <span>
          TTL {formatPreviewValue(documentValue.gameplay.drone.ttlSec, "s")}
        </span>
      </div>
    </div>
  );
}

const createPreviewHudState = (
  documentValue: GameTuningDocument,
): GameViewportHudState => {
  const base = createInitialHudState();

  return {
    ...base,
    abilities: [
      {
        accent: documentValue.visuals.abilities.foresightColor,
        id: "foresight",
        keyLabel: "Q",
        label: "Foresight",
        mode: "cooldown",
        progress: 0.42,
        statusText: "6s cd",
      },
      {
        accent: documentValue.visuals.abilities.shieldColor,
        id: "shield",
        keyLabel: "E",
        label: "Shield",
        mode: "active",
        progress: 0.58,
        statusText: "tracking",
      },
      {
        accent: documentValue.visuals.abilities.boostColor,
        id: "boost",
        keyLabel: "Space",
        label: "Boost",
        mode: "ready",
        progress: 1,
        statusText: "ready",
      },
      {
        accent: documentValue.visuals.drone.activeColor,
        id: "drone",
        keyLabel: "R",
        label: "Drone",
        mode: "active",
        progress: 0.76,
        statusText: "pilot",
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
    foresightSettings: { ...documentValue.gameplay.abilities.foresight },
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
    playerHp: 82,
    playerHpPulse: 0.18,
    playerLabel: "Atlas",
    sandboxControlsEnabled: true,
    shieldSettings: { ...documentValue.gameplay.abilities.shield },
    timerElapsedSec: 173,
    totalPlayerCount: 5,
    weapons: [
      {
        accent: documentValue.visuals.rockets.light.hudAccent,
        ammo: Math.max(
          0,
          Math.min(
            documentValue.gameplay.rockets.light.maxAmmo,
            Math.max(1, documentValue.gameplay.rockets.light.startAmmo),
          ),
        ),
        kind: "light",
        label: "Light",
        maxAmmo: documentValue.gameplay.rockets.light.maxAmmo,
        reloadRemainingSec: 0,
        selected: true,
      },
      {
        accent: documentValue.visuals.rockets.heavy.hudAccent,
        ammo: Math.max(
          0,
          Math.min(2, documentValue.gameplay.rockets.heavy.maxAmmo),
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
        ammo: Math.max(
          0,
          Math.min(1, documentValue.gameplay.rockets.seeker.maxAmmo),
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
  hudTuning,
  mode,
  showHud,
}: {
  documentValue: GameTuningDocument;
  hudTuning: HudVisualTuning;
  mode: EditorPreviewStageMode;
  showHud: boolean;
}) {
  const hudState = createPreviewHudState(documentValue);

  return (
    <div className="game-stage game-stage--editor">
      {mode.kind === "showcase" ? (
        <ShowcaseViewportPanel
          className="editor-preview-surface"
          focus={mode.focus}
          rocketKind={mode.rocketKind}
        />
      ) : mode.kind === "orbits" ? (
        <SunInteractionViewportPanel className="editor-preview-surface" />
      ) : mode.kind === "blackHole" ? (
        <PreviewBlackHoleSurface documentValue={documentValue} />
      ) : mode.kind === "foresight" ? (
        <PreviewForesightSurface documentValue={documentValue} />
      ) : mode.kind === "shield" ? (
        <PreviewShieldSurface documentValue={documentValue} />
      ) : mode.kind === "boost" ? (
        <PreviewBoostSurface documentValue={documentValue} />
      ) : mode.kind === "drone" ? (
        <PreviewDroneSurface documentValue={documentValue} />
      ) : (
        <div className="editor-preview-surface editor-preview-surface--blank" />
      )}
      {showHud ? (
        <div className="hud-root">
          <CombatHud
            controller={null}
            hud={hudState}
            hudTuning={hudTuning}
            showSandboxTools={false}
          />
        </div>
      ) : null}
    </div>
  );
}
