import {
  clamp,
  DEFAULT_VIEWPORT_DISPLAY_MODE,
  type HudVisualTuning,
  PLANET_HP,
  ROCKET_SPECS,
  type RocketKind,
  type ViewportDisplayMode,
} from "@3body/shared";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import type {
  GameViewportController,
  GameViewportHudState,
  GameViewportMinimapEntityKind,
  GameViewportMinimapState,
} from "./game/viewportHud";

const KILL_FEED_DURATION_SEC = 4;

const formatRtt = (rttMs: number | null): string =>
  rttMs === null ? "--" : `${Math.max(0, Math.round(rttMs))} ms`;

const formatFps = (fps: number): string =>
  fps > 0 ? `${Math.max(0, Math.round(fps))} FPS` : "-- FPS";

export const formatHudDiagnosticsReport = (
  hud: GameViewportHudState,
  capturedAtIso = new Date().toISOString(),
): string =>
  JSON.stringify(
    {
      capturedAt: capturedAtIso,
      connection: hud.connection,
      debugItems: Object.fromEntries(
        hud.debugItems.map((item) => [item.label, item.value]),
      ),
      profilingEnabled: hud.profilingEnabled,
    },
    null,
    2,
  );

const copyTextToClipboard = (text: string): void => {
  if (navigator.clipboard?.writeText !== undefined) {
    void navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);
};

const COMPASS_POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

const formatSpeed = (speed: number): string =>
  `${Math.max(0, Math.round(speed))} M/S`;

const formatCompass = (headingDeg: number | null): string => {
  if (headingDeg === null) {
    return "--";
  }

  const roundedHeadingDeg = Math.round(headingDeg) % 360;
  const point =
    COMPASS_POINTS[Math.round(headingDeg / 45) % COMPASS_POINTS.length] ??
    COMPASS_POINTS[0];

  return `${point} · ${roundedHeadingDeg}°`;
};

const getAbilityMeterFill = ({
  progress,
}: GameViewportHudState["abilities"][number]): number => {
  return clamp(progress, 0, 1);
};

const getWeaponMeterFill = (
  weapon: GameViewportHudState["weapons"][number],
): number =>
  weapon.reloadRemainingSec > 0
    ? 1 -
      clamp(
        weapon.reloadRemainingSec / ROCKET_SPECS[weapon.kind].reloadSec,
        0,
        1,
      )
    : 1;

const getWeaponCardState = (
  weapon: GameViewportHudState["weapons"][number],
): "ready" | "active" | "cooldown" => {
  if (weapon.reloadRemainingSec > 0) {
    return "cooldown";
  }

  return weapon.ammo >= weapon.maxAmmo ? "ready" : "active";
};

const getWeaponAmmoLabel = (
  weapon: GameViewportHudState["weapons"][number],
): string => (weapon.kind === "light" ? "∞" : `${weapon.ammo}`);

const WEAPON_KEY_LABELS: Record<RocketKind, string> = {
  light: "1",
  heavy: "2",
  seeker: "3",
};
const MINIMAP_SCAN_EDGE_HOLD_MS = 90;
const MINIMAP_SCAN_CYCLE_MS = 2400;
const MINIMAP_VIEWBOX_SIZE = 160;
const MINIMAP_PADDING = 12;
const MINIMAP_DRAWABLE_RADIUS =
  (MINIMAP_VIEWBOX_SIZE - MINIMAP_PADDING * 2) / 2;
const MINIMAP_SCAN_TAIL_PX = 46;
const MINIMAP_SCAN_HEAD_PX = 9;
const MINIMAP_MARKER_PERSISTENCE_PX = 44;
const MINIMAP_MARKER_PRECHARGE_PX = 18;
const MINIMAP_RANGE_EXPONENT = 0.68;
const MINIMAP_MIN_MARKER_RADIUS: Record<GameViewportMinimapEntityKind, number> =
  {
    blackHole: 4.8,
    cache: 2.4,
    planet: 2.8,
    sun: 3.2,
  };
const MINIMAP_LAYER_ORDER: Record<GameViewportMinimapEntityKind, number> = {
  blackHole: 0,
  sun: 1,
  planet: 2,
  cache: 3,
};

const countMinimapEntities = (minimap: GameViewportMinimapState) => {
  const counts = {
    blackHole: 0,
    cache: 0,
    planet: 0,
    sun: 0,
  } satisfies Record<GameViewportMinimapEntityKind, number>;

  for (const entity of minimap.entities) {
    counts[entity.kind] += 1;
  }

  return counts;
};

const formatMinimapAriaLabel = (
  counts: Record<GameViewportMinimapEntityKind, number>,
): string =>
  [
    counts.sun > 0 ? `${counts.sun} suns` : null,
    counts.planet > 0 ? `${counts.planet} planets` : null,
    counts.cache > 0 ? `${counts.cache} caches` : null,
    counts.blackHole > 0 ? `${counts.blackHole} black holes` : null,
  ]
    .filter((value): value is string => value !== null)
    .join(", ");

const projectMinimapRadius = (radius: number, extentRadius: number): number =>
  MINIMAP_DRAWABLE_RADIUS *
  clamp(radius / extentRadius, 0, 1) ** MINIMAP_RANGE_EXPONENT;

const projectMinimapPoint = (x: number, y: number, extentRadius: number) => {
  const center = MINIMAP_VIEWBOX_SIZE / 2;
  const radialDistance = Math.hypot(x, y);
  if (!(radialDistance > 0)) {
    return {
      x: center,
      y: center,
    };
  }

  const projectedDistance = projectMinimapRadius(radialDistance, extentRadius);
  const scale = projectedDistance / radialDistance;
  return {
    x: center + x * scale,
    y: center - y * scale,
  };
};

const getMinimapMarkerRadius = (
  entity: GameViewportMinimapState["entities"][number],
  extentRadius: number,
): number => {
  const scale = MINIMAP_DRAWABLE_RADIUS / extentRadius;
  return Math.max(
    MINIMAP_MIN_MARKER_RADIUS[entity.kind],
    Math.max(entity.radius, 0) * scale * 1.15,
  );
};

const getMinimapNowMs = (): number =>
  typeof performance === "undefined" ? Date.now() : performance.now();

const getMinimapEntityKey = (
  entity: Pick<GameViewportMinimapState["entities"][number], "id" | "kind">,
): string => `${entity.kind}:${entity.id}`;

const getMinimapScanlineY = (scanProgress: number): number =>
  clamp(scanProgress, 0, 1) * MINIMAP_VIEWBOX_SIZE;

const getMinimapSwapThresholdY = ({
  extentRadius,
  sourceEntity,
  targetEntity,
}: {
  extentRadius: number;
  sourceEntity: GameViewportMinimapState["entities"][number] | null;
  targetEntity: GameViewportMinimapState["entities"][number] | null;
}): number => {
  const sourceY =
    sourceEntity === null
      ? null
      : projectMinimapPoint(
          sourceEntity.pos.x,
          sourceEntity.pos.y,
          extentRadius,
        ).y;
  const targetY =
    targetEntity === null
      ? null
      : projectMinimapPoint(
          targetEntity.pos.x,
          targetEntity.pos.y,
          extentRadius,
        ).y;

  if (sourceY === null) {
    return targetY ?? MINIMAP_VIEWBOX_SIZE / 2;
  }

  if (targetY === null) {
    return sourceY;
  }

  // Wait until the sweep has crossed both the old and new rows so markers
  // never jump ahead of the visible scanline.
  return Math.max(sourceY, targetY);
};

const getMinimapMarkerStyle = (
  pointY: number,
  scanlineY: number,
): CSSProperties => {
  const deltaY = scanlineY - pointY;
  const persistence =
    deltaY >= 0 ? Math.exp(-deltaY / MINIMAP_MARKER_PERSISTENCE_PX) : 0;
  const precharge =
    deltaY < 0 ? Math.exp(deltaY / MINIMAP_MARKER_PRECHARGE_PX) : 0;
  const energy = clamp(0.18 + persistence * 0.82 + precharge * 0.16, 0.18, 1);

  return {
    "--minimap-marker-energy": `${energy.toFixed(3)}`,
    "--minimap-marker-glow": `${(1.4 + energy * 7).toFixed(2)}px`,
    "--minimap-marker-opacity": `${clamp(0.4 + energy * 0.54, 0.4, 0.94).toFixed(3)}`,
  } as CSSProperties;
};

const createBlankMinimapState = (
  minimap: GameViewportMinimapState,
): GameViewportMinimapState => ({
  arenaRadius: minimap.arenaRadius,
  extentRadius: minimap.extentRadius,
  entities: [],
});

function WorldMinimap({ minimap }: { minimap: GameViewportMinimapState }) {
  const latestMinimapRef = useRef(minimap);
  const [scanWindow, setScanWindow] = useState(() => ({
    source: createBlankMinimapState(minimap),
    target: minimap,
  }));
  const scanStartedAtMsRef = useRef(getMinimapNowMs());
  const [scanProgress, setScanProgress] = useState(0);

  useEffect(() => {
    latestMinimapRef.current = minimap;
  }, [minimap]);

  useEffect(() => {
    let frameId = 0;

    const tick = () => {
      const nowMs = getMinimapNowMs();
      const elapsedMs = nowMs - scanStartedAtMsRef.current;
      if (elapsedMs >= MINIMAP_SCAN_CYCLE_MS) {
        setScanProgress(1);
        if (elapsedMs >= MINIMAP_SCAN_CYCLE_MS + MINIMAP_SCAN_EDGE_HOLD_MS) {
          scanStartedAtMsRef.current = nowMs;
          setScanProgress(0);
          setScanWindow((current) => ({
            source: current.target,
            target: latestMinimapRef.current,
          }));
        }
      } else {
        setScanProgress(elapsedMs / MINIMAP_SCAN_CYCLE_MS);
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const extentRadius = Math.max(
    scanWindow.source.extentRadius,
    scanWindow.source.arenaRadius,
    scanWindow.target.extentRadius,
    scanWindow.target.arenaRadius,
    1,
  );
  const sourceEntitiesByKey = new Map(
    scanWindow.source.entities.map((entity) => [
      getMinimapEntityKey(entity),
      entity,
    ]),
  );
  const targetEntitiesByKey = new Map(
    scanWindow.target.entities.map((entity) => [
      getMinimapEntityKey(entity),
      entity,
    ]),
  );
  const renderedEntities = [
    ...new Set([...sourceEntitiesByKey.keys(), ...targetEntitiesByKey.keys()]),
  ]
    .map((entityKey) => {
      const sourceEntity = sourceEntitiesByKey.get(entityKey) ?? null;
      const targetEntity = targetEntitiesByKey.get(entityKey) ?? null;
      if (sourceEntity === null && targetEntity === null) {
        return null;
      }

      const thresholdY = getMinimapSwapThresholdY({
        extentRadius,
        sourceEntity,
        targetEntity,
      });
      if (getMinimapScanlineY(scanProgress) >= thresholdY) {
        return targetEntity;
      }
      return sourceEntity;
    })
    .filter((entity): entity is NonNullable<typeof entity> => entity !== null);
  const entities = renderedEntities.sort(
    (left, right) =>
      MINIMAP_LAYER_ORDER[left.kind] - MINIMAP_LAYER_ORDER[right.kind],
  );
  const counts = countMinimapEntities({
    ...scanWindow.target,
    entities,
  });
  const minimapLabel = formatMinimapAriaLabel(counts);
  const scanlineY = getMinimapScanlineY(scanProgress);
  const scanSweepHeightPercent =
    ((MINIMAP_SCAN_TAIL_PX + MINIMAP_SCAN_HEAD_PX) / MINIMAP_VIEWBOX_SIZE) *
    100;
  const scanlinePercent = (scanlineY / MINIMAP_VIEWBOX_SIZE) * 100;
  const phosphorStyle = {
    height: `${scanlinePercent.toFixed(3)}%`,
  } as CSSProperties;
  const scanSweepStyle = {
    height: `${scanSweepHeightPercent.toFixed(3)}%`,
    top: `${(
      ((scanlineY - MINIMAP_SCAN_TAIL_PX) / MINIMAP_VIEWBOX_SIZE) * 100
    ).toFixed(3)}%`,
  } as CSSProperties;

  return (
    <section className="minimap-panel hud-panel hud-panel--subtle">
      <div className="minimap-panel__map-frame">
        <div className="minimap-panel__grid" aria-hidden="true" />
        <svg
          className="minimap-panel__map"
          viewBox={`0 0 ${MINIMAP_VIEWBOX_SIZE} ${MINIMAP_VIEWBOX_SIZE}`}
          role="img"
          aria-label={
            minimapLabel.length > 0
              ? `Delayed world minimap showing ${minimapLabel}`
              : "Delayed world minimap"
          }
        >
          {entities.map((entity) => {
            const point = projectMinimapPoint(
              entity.pos.x,
              entity.pos.y,
              extentRadius,
            );
            const markerRadius = getMinimapMarkerRadius(entity, extentRadius);
            const markerStyle = getMinimapMarkerStyle(point.y, scanlineY);
            const highlight = entity.highlighted ? (
              <circle
                key={`highlight-${entity.kind}-${entity.id}`}
                className="minimap__marker-highlight"
                cx={point.x}
                cy={point.y}
                r={markerRadius + 2.1}
              />
            ) : null;

            switch (entity.kind) {
              case "blackHole":
                return (
                  <g
                    key={`${entity.kind}-${entity.id}`}
                    className="minimap__entity"
                    style={markerStyle}
                  >
                    {highlight}
                    <circle
                      className="minimap__marker minimap__marker--black-hole"
                      cx={point.x}
                      cy={point.y}
                      r={markerRadius}
                    />
                    <circle
                      className="minimap__marker-core minimap__marker-core--black-hole"
                      cx={point.x}
                      cy={point.y}
                      r={Math.max(1.8, markerRadius * 0.24)}
                    />
                  </g>
                );
              case "cache":
                return (
                  <g
                    key={`${entity.kind}-${entity.id}`}
                    className="minimap__entity"
                    style={markerStyle}
                  >
                    {highlight}
                    <rect
                      className="minimap__marker minimap__marker--cache"
                      x={point.x - markerRadius * 0.95}
                      y={point.y - markerRadius * 0.72}
                      width={markerRadius * 1.9}
                      height={markerRadius * 1.44}
                      rx={1.4}
                    />
                    <rect
                      className="minimap__marker minimap__marker--cache-latch"
                      x={point.x - markerRadius * 0.46}
                      y={point.y - markerRadius * 0.96}
                      width={markerRadius * 0.92}
                      height={markerRadius * 0.22}
                      rx={0.5}
                    />
                    <rect
                      className="minimap__marker minimap__marker--cache-core"
                      x={point.x - markerRadius * 0.5}
                      y={point.y - markerRadius * 0.26}
                      width={markerRadius * 2}
                      height={markerRadius * 0.52}
                      rx={0.5}
                    />
                  </g>
                );
              case "sun":
                return (
                  <g
                    key={`${entity.kind}-${entity.id}`}
                    className="minimap__entity"
                    style={markerStyle}
                  >
                    {highlight}
                    <circle
                      className="minimap__marker minimap__marker--sun"
                      cx={point.x}
                      cy={point.y}
                      r={markerRadius}
                    />
                  </g>
                );
              case "planet":
                return (
                  <g
                    key={`${entity.kind}-${entity.id}`}
                    className="minimap__entity"
                    style={markerStyle}
                  >
                    {highlight}
                    <circle
                      className={`minimap__marker minimap__marker--planet minimap__marker--planet-${
                        entity.highlighted ? "self" : "enemy"
                      }`}
                      cx={point.x}
                      cy={point.y}
                      r={markerRadius}
                    />
                  </g>
                );
              default:
                return null;
            }
          })}
        </svg>
        <div
          className="minimap-panel__phosphor"
          style={phosphorStyle}
          aria-hidden="true"
        />
        <div className="minimap-panel__scan-lines" aria-hidden="true" />
        <div
          className="minimap-panel__scan-sweep"
          style={scanSweepStyle}
          aria-hidden="true"
        />
      </div>
    </section>
  );
}

function CockpitSummaryCard({
  label,
  pulse = 0,
  trackFill,
  value,
}: {
  label: string;
  pulse?: number;
  trackFill?: number;
  value: string;
}) {
  return (
    <article
      className="cockpit-summary"
      style={
        {
          "--cockpit-hit": `${pulse}`,
        } as CSSProperties
      }
    >
      <div className="cockpit-summary__row">
        <span className="cockpit-summary__label">{label}</span>
        <strong className="cockpit-summary__value">{value}</strong>
      </div>
      {trackFill !== undefined ? (
        <div className="cockpit-summary__track">
          <div
            className="cockpit-summary__fill"
            style={{
              width: `${trackFill * 100}%`,
            }}
          />
        </div>
      ) : null}
    </article>
  );
}

function CockpitMovementHud({
  headingDeg,
  speed,
}: {
  headingDeg: number | null;
  speed: number;
}) {
  const headingLabel = formatCompass(headingDeg);
  const compassStyle = {
    "--compass-heading": `${headingDeg ?? 0}deg`,
  } as CSSProperties;

  return (
    <section
      className="movement-hud"
      data-heading-state={headingDeg === null ? "idle" : "active"}
    >
      <div
        className={`hud-compass${headingDeg === null ? " hud-compass--idle" : ""}`}
        role="img"
        style={compassStyle}
        aria-label={
          headingDeg === null
            ? "Compass unavailable"
            : `Compass heading ${headingLabel}`
        }
      >
        <span className="hud-compass__marker hud-compass__marker--north">
          N
        </span>
        <span className="hud-compass__marker hud-compass__marker--east">E</span>
        <span className="hud-compass__marker hud-compass__marker--south">
          S
        </span>
        <span className="hud-compass__marker hud-compass__marker--west">W</span>
        <div className="hud-compass__ring" aria-hidden="true" />
        <div className="hud-compass__needle" aria-hidden="true" />
        <div className="hud-compass__hub" aria-hidden="true" />
      </div>
      <strong className="movement-hud__speed">{formatSpeed(speed)}</strong>
    </section>
  );
}

export function CombatHud({
  controller,
  displayMode = DEFAULT_VIEWPORT_DISPLAY_MODE,
  hud,
  hudTuning,
  showPerformanceTools = true,
}: {
  controller: GameViewportController | null;
  displayMode?: ViewportDisplayMode;
  hud: GameViewportHudState;
  hudTuning: HudVisualTuning;
  showPerformanceTools?: boolean;
}) {
  const playerHpRatio = clamp(hud.playerHp / PLANET_HP, 0, 1);
  const screenFlickerOpacity = Math.max(hud.damageFlash, hud.hudFlicker * 0.82);
  const hudStyle = {
    "--damage-flash-opacity": `${hud.damageFlash}`,
    "--hud-hit-flicker": `${hud.hudFlicker}`,
    "--hud-opacity": `${hud.hudOpacity}`,
    "--screen-flicker-opacity": `${screenFlickerOpacity}`,
    "--hud-bottom-inset": `${hudTuning.bottomInset}px`,
    "--hud-card-radius": `${hudTuning.cardRadius}px`,
    "--hud-compact-card-radius": `${hudTuning.compactCardRadius}px`,
    "--hud-connection-width": `${hudTuning.connectionWidth}px`,
    "--hud-dock-gap": `${hudTuning.dockGap}px`,
    "--hud-kill-feed-entry-radius": `${hudTuning.killFeedEntryRadius}px`,
    "--hud-left-column-width": `${hudTuning.leftColumnWidth}px`,
    "--hud-panel-blur": `${hudTuning.panelBlurPx}px`,
    "--hud-panel-gap": `${hudTuning.panelGap}px`,
    "--hud-panel-radius": `${hudTuning.panelRadius}px`,
    "--hud-pill-radius": `${hudTuning.pillRadius}px`,
    "--hud-shortcuts-section-gap": `${hudTuning.shortcutsSectionGap}px`,
    "--hud-side-inset": `${hudTuning.sideInset}px`,
    "--hud-top-inset": `${hudTuning.topInset}px`,
  } as CSSProperties;
  const hasSideDock = showPerformanceTools;
  const hasBottomShortcuts = hud.sandboxControlsEnabled;
  const showSandboxPlaybackControls = hud.connection.state === "local";
  const hasCopyableStats = hud.profilingEnabled && hud.debugItems.length > 0;
  const showWorldMinimap =
    hud.minimap.arenaRadius > 0 || hud.minimap.entities.length > 0;

  return (
    <div
      className={`combat-hud combat-hud--mode-${displayMode}${
        hasSideDock ? " combat-hud--has-side-dock" : ""
      }${hasBottomShortcuts ? " combat-hud--has-bottom-shortcuts" : ""}`}
      data-display-mode={displayMode}
      data-hit-flicker={hud.hudFlicker > 0.01 ? "active" : "idle"}
      style={hudStyle}
    >
      <div className="combat-hud__screen-flicker" aria-hidden="true" />
      <div className="combat-hud__damage-flash" aria-hidden="true" />
      {hud.sandboxControlsEnabled ? (
        <div className="combat-hud__movement-hud">
          <CockpitMovementHud
            headingDeg={hud.playerHeadingDeg}
            speed={hud.playerSpeed}
          />
        </div>
      ) : null}

      {hud.killFeed.length > 0 ? (
        <div className="combat-hud__kill-feed">
          <div className="kill-feed">
            {hud.killFeed.map((entry) => {
              const opacity = Math.max(
                0,
                1 - entry.ageSec / KILL_FEED_DURATION_SEC,
              );
              return (
                <div
                  key={entry.id}
                  className={`kill-feed__entry${
                    entry.ageSec < 0.45 ? " kill-feed__entry--fresh" : ""
                  }`}
                  style={
                    {
                      "--kill-feed-accent": entry.accent,
                      "--kill-feed-opacity": `${opacity}`,
                    } as CSSProperties
                  }
                >
                  <span className="kill-feed__entry-text">{entry.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {showPerformanceTools ? (
        <div className="sandbox-dock-stack">
          <section className="sandbox-panel sandbox-panel--dock hud-panel hud-panel--interactive hud-panel--subtle">
            <div className="sandbox-panel__section">
              <div className="sandbox-panel__section-header">
                <div className="sandbox-panel__section-copy">
                  <div className="hud-panel__eyebrow">Performance</div>
                  <div className="sandbox-panel__section-note">
                    CPU-side sim and render timings for this viewport
                  </div>
                </div>
                <div className="sandbox-panel__header-actions">
                  <button
                    type="button"
                    className="hud-button hud-button--compact"
                    disabled={controller === null}
                    onClick={() =>
                      controller?.setProfilingEnabled(!hud.profilingEnabled)
                    }
                  >
                    {hud.profilingEnabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    className="hud-button hud-button--compact"
                    disabled={controller === null || !hud.profilingEnabled}
                    onClick={() => controller?.resetProfiling()}
                  >
                    Reset Stats
                  </button>
                  <button
                    type="button"
                    className="hud-button hud-button--compact"
                    disabled={!hasCopyableStats}
                    onClick={() =>
                      copyTextToClipboard(formatHudDiagnosticsReport(hud))
                    }
                  >
                    Copy Stats
                  </button>
                </div>
              </div>
              {hud.profilingEnabled && hud.debugItems.length > 0 ? (
                <div className="sandbox-panel__stats">
                  <div className="sandbox-panel__stats-grid">
                    {hud.debugItems.map((item) => (
                      <div key={item.label} className="sandbox-stat">
                        <span className="sandbox-stat__label">
                          {item.label}
                        </span>
                        <strong className="sandbox-stat__value">
                          {item.value}
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="sandbox-panel__hint">
                  {hud.profilingEnabled
                    ? "Collecting samples..."
                    : "Enable the profiler to inspect CPU-side frame costs and entity counts."}
                </div>
              )}
            </div>
            {showSandboxPlaybackControls ? (
              <div className="sandbox-panel__section">
                <div className="sandbox-panel__section-header">
                  <div className="sandbox-panel__section-copy">
                    <div className="hud-panel__eyebrow">Sandbox Tools</div>
                    <div className="sandbox-panel__section-note">
                      Playback and reset controls for the local sandbox
                    </div>
                  </div>
                </div>
                <div className="sandbox-panel__actions">
                  <button
                    type="button"
                    className="hud-button"
                    disabled={controller === null}
                    onClick={() =>
                      hud.sandboxPaused
                        ? controller?.playSandbox()
                        : controller?.pauseSandbox()
                    }
                  >
                    {hud.sandboxPaused ? "Play" : "Pause"}
                  </button>
                  <button
                    type="button"
                    className="hud-button"
                    disabled={controller === null}
                    onClick={() => controller?.resetSandbox()}
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    className="hud-button"
                    disabled={controller === null}
                    onClick={() => controller?.setBotsEnabled(!hud.botsEnabled)}
                  >
                    {hud.botsEnabled ? "Disable AI" : "Enable AI"}
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
      {showWorldMinimap ? (
        <div className="combat-hud__minimap">
          <WorldMinimap minimap={hud.minimap} />
        </div>
      ) : null}

      <section className="connection-indicator hud-pill">
        <div className="connection-indicator__row">
          <div className="connection-indicator__metrics">
            <span className="connection-indicator__metric">
              {formatRtt(hud.connection.rttMs)}
            </span>
            <span className="connection-indicator__metric">
              {formatFps(hud.connection.fps)}
            </span>
          </div>
        </div>
      </section>

      {hud.sandboxControlsEnabled ? (
        <section className="shortcuts-dock">
          <div className="shortcuts-dock__section">
            <div className="cockpit-summary-grid">
              <CockpitSummaryCard
                label="Health"
                pulse={hud.playerHpPulse}
                trackFill={playerHpRatio}
                value={`${Math.max(0, Math.round(hud.playerHp))}/${PLANET_HP}`}
              />
            </div>
          </div>
          {hud.weapons.length > 0 ? (
            <div className="shortcuts-dock__section">
              <div className="cockpit-weapons">
                {hud.weapons.map((weapon) => {
                  const meterFill = getWeaponMeterFill(weapon);
                  const cardState = getWeaponCardState(weapon);

                  return (
                    <article
                      key={weapon.kind}
                      data-ability-key={weapon.kind}
                      className={`ability-card ability-card--compact weapon-card ability-card--${cardState}${
                        weapon.selected ? " weapon-card--selected" : ""
                      }`}
                      style={
                        {
                          "--ability-accent": weapon.accent,
                          "--ability-meter-fill": `${meterFill}`,
                        } as CSSProperties
                      }
                    >
                      <div className="ability-card__header">
                        <span className="ability-card__key">
                          {WEAPON_KEY_LABELS[weapon.kind]}
                        </span>
                        <span className="ability-card__title">
                          {weapon.label}
                        </span>
                        <span className="ability-card__value">
                          {getWeaponAmmoLabel(weapon)}
                        </span>
                      </div>
                      <div className="ability-card__meter" aria-hidden="true">
                        <div className="ability-card__meter-fill" />
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}
          {hud.abilities.length > 0 ? (
            <div className="shortcuts-dock__section">
              <div className="cockpit-abilities">
                {hud.abilities.map((ability) => {
                  const meterFill = getAbilityMeterFill(ability);

                  return (
                    <article
                      key={ability.id}
                      data-ability-key={ability.id}
                      className={`ability-card ability-card--compact ability-card--${ability.mode}`}
                      style={
                        {
                          "--ability-accent": ability.accent,
                          "--ability-meter-fill": `${meterFill}`,
                        } as CSSProperties
                      }
                    >
                      <div className="ability-card__header">
                        <span className="ability-card__key">
                          {ability.keyLabel}
                        </span>
                        <span className="ability-card__title">
                          {ability.label}
                        </span>
                      </div>
                      <div className="ability-card__meter" aria-hidden="true">
                        <div className="ability-card__meter-fill" />
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
