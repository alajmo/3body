import type { CSSProperties } from "react";
import {
  clamp,
  type HudVisualTuning,
  PLANET_HP,
  ROCKET_SPECS,
  type RocketKind,
} from "@3body/shared";
import type {
  GameViewportController,
  GameViewportHudState,
} from "./game/viewportHud";

const KILL_FEED_DURATION_SEC = 4;

const formatClock = (valueSec: number): string => {
  const totalSeconds = Math.max(0, Math.floor(valueSec));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const formatRtt = (rttMs: number | null): string =>
  rttMs === null ? "--" : `${Math.max(0, Math.round(rttMs))} ms`;

const formatFps = (fps: number): string =>
  fps > 0 ? `${Math.max(0, Math.round(fps))} FPS` : "-- FPS";

const formatFrameTime = (frameTimeMs: number): string =>
  frameTimeMs > 0 ? `${frameTimeMs.toFixed(1)} ms` : "-- ms";

const COMPASS_POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

const formatSpeed = (speed: number): string =>
  `${Math.max(0, Math.round(speed))} M/S`;

const formatCompass = (headingDeg: number | null): string => {
  if (headingDeg === null) {
    return "--";
  }

  const roundedHeadingDeg = Math.round(headingDeg) % 360;
  const point =
    COMPASS_POINTS[
      Math.round(headingDeg / 45) % COMPASS_POINTS.length
    ] ?? COMPASS_POINTS[0];

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
        <span className="hud-compass__marker hud-compass__marker--north">N</span>
        <span className="hud-compass__marker hud-compass__marker--east">E</span>
        <span className="hud-compass__marker hud-compass__marker--south">S</span>
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
  hud,
  hudTuning,
  showPerformanceTools = true,
}: {
  controller: GameViewportController | null;
  hud: GameViewportHudState;
  hudTuning: HudVisualTuning;
  showPerformanceTools?: boolean;
}) {
  const playerHpRatio = clamp(hud.playerHp / PLANET_HP, 0, 1);
  const hudStyle = {
    "--damage-flash-opacity": `${hud.damageFlash}`,
    "--hud-opacity": `${hud.hudOpacity}`,
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
    "--hud-timer-width": `${hudTuning.timerWidth}px`,
    "--hud-top-inset": `${hudTuning.topInset}px`,
  } as CSSProperties;
  const hasSideDock = showPerformanceTools;
  const hasBottomShortcuts = hud.sandboxControlsEnabled;
  const showSandboxPlaybackControls = hud.connection.state === "local";
  const connectionDetail = [
    hud.connection.label.trim(),
    hud.connection.extrapolating ? "Extrapolating" : null,
  ]
    .filter((value): value is string => value !== null && value.length > 0)
    .join(" · ");
  const showConnectionDetail =
    connectionDetail.length > 0 &&
    connectionDetail.toLowerCase() !== hud.connection.state.toLowerCase();
  const timerStatus = hud.blackHoleActive
    ? "Overtime active"
    : hud.blackHoleWarning
      ? `Black Hole in ${formatClock(hud.blackHoleRemainingSec)}`
      : null;

  return (
    <div
      className={`combat-hud${hasSideDock ? " combat-hud--has-side-dock" : ""}${
        hasBottomShortcuts ? " combat-hud--has-bottom-shortcuts" : ""
      }`}
      style={hudStyle}
    >
      <div className="combat-hud__damage-flash" aria-hidden="true" />
      {hud.sandboxControlsEnabled ? (
        <div className="combat-hud__top-left">
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
                </div>
              </div>
              {hud.profilingEnabled && hud.debugItems.length > 0 ? (
                <div className="sandbox-panel__stats">
                  <div className="sandbox-panel__stats-grid">
                    {hud.debugItems.map((item) => (
                      <div key={item.label} className="sandbox-stat">
                        <span className="sandbox-stat__label">{item.label}</span>
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
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      <section className="match-timer hud-pill">
        <div className="hud-pill__label">Match</div>
        <div className="match-timer__value">
          {formatClock(hud.timerElapsedSec)}
        </div>
        {timerStatus !== null ? (
          <div
            className={`match-timer__status${
              hud.blackHoleActive
                ? " match-timer__status--active"
                : hud.blackHoleWarning
                  ? " match-timer__status--warning"
                  : ""
            }`}
          >
            {timerStatus}
          </div>
        ) : null}
      </section>

      <section className="connection-indicator hud-pill">
        <div className="connection-indicator__row">
          <span
            className={`connection-indicator__state connection-indicator__state--${hud.connection.state}`}
          >
            {hud.connection.state}
          </span>
          <div className="connection-indicator__metrics">
            <span className="connection-indicator__metric">
              {formatRtt(hud.connection.rttMs)}
            </span>
            <span className="connection-indicator__metric">
              {formatFps(hud.connection.fps)}
            </span>
            <span className="connection-indicator__metric">
              {formatFrameTime(hud.connection.frameTimeMs)}
            </span>
          </div>
        </div>
        {showConnectionDetail ? (
          <div className="connection-indicator__label">{connectionDetail}</div>
        ) : null}
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
          {hud.abilities.length > 0 ? (
            <div className="shortcuts-dock__section">
              <div className="cockpit-abilities">
                {hud.abilities.map((ability) => {
                  const meterFill = getAbilityMeterFill(ability);

                  return (
                    <article
                      key={ability.id}
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
          {hud.weapons.length > 0 ? (
            <div className="shortcuts-dock__section">
              <div className="cockpit-weapons">
                {hud.weapons.map((weapon) => {
                  const meterFill = getWeaponMeterFill(weapon);
                  const cardState = getWeaponCardState(weapon);

                  return (
                    <article
                      key={weapon.kind}
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
        </section>
      ) : null}
    </div>
  );
}
