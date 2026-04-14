import type { CSSProperties, KeyboardEvent } from "react";
import {
  clamp,
  PLANET_HP,
  ROCKET_SPECS,
  type AbilitySpec,
  type BlackHoleSpec,
  type BoostSpec,
  type RocketKind,
} from "@3body/shared";
import {
  DEFAULT_ORBIT_PRESET,
  SPECIAL_PERIODIC_ORBIT_PRESETS,
} from "./game/orbitPresets";
import type {
  GameViewportController,
  GameViewportHudState,
} from "./game/viewportHud";

const KILL_FEED_DURATION_SEC = 4;
const BLACK_HOLE_FIELDS = [
  {
    key: "spawnSec",
    label: "Spawn time",
    min: 0,
    step: 1,
  },
  {
    key: "mass",
    label: "Mass",
    min: 0,
    step: 100_000,
  },
  {
    key: "killRadius",
    label: "Kill radius",
    min: 1,
    step: 5,
  },
  {
    key: "rampSec",
    label: "Ramp",
    min: 1,
    step: 1,
  },
] as const satisfies readonly {
  key: keyof BlackHoleSpec;
  label: string;
  min: number;
  step: number;
}[];
const FORESIGHT_FIELDS = [
  {
    key: "durationSec",
    label: "Foresight duration",
    max: 20,
    min: 0.5,
    step: 0.5,
  },
  {
    key: "cooldownSec",
    label: "Foresight cooldown",
    max: 60,
    min: 0,
    step: 0.5,
  },
] as const satisfies readonly {
  key: keyof AbilitySpec;
  label: string;
  max: number;
  min: number;
  step: number;
}[];
const SHIELD_FIELDS = [
  {
    key: "durationSec",
    label: "Shield duration",
    max: 20,
    min: 0.5,
    step: 0.5,
  },
  {
    key: "cooldownSec",
    label: "Shield cooldown",
    max: 60,
    min: 0,
    step: 0.5,
  },
] as const satisfies readonly {
  key: keyof AbilitySpec;
  label: string;
  max: number;
  min: number;
  step: number;
}[];
const BOOST_FIELDS = [
  {
    key: "cooldownSec",
    label: "Boost regen",
    max: 60,
    min: 0.5,
    step: 0.5,
  },
  {
    key: "magnitude",
    label: "Boost impulse",
    max: 1200,
    min: 0,
    step: 10,
  },
] as const satisfies readonly {
  key: keyof BoostSpec;
  label: string;
  max: number;
  min: number;
  step: number;
}[];
const PLANET_BODY_SCALE_FIELD = {
  label: "Planet size",
  max: 10,
  min: 0.75,
  step: 0.05,
} as const;
const PLANET_AURA_GAP_FIELD = {
  label: "Aura gap",
  max: 10,
  min: 0,
  step: 0.05,
} as const;
const PLANET_AURA_SCALE_FIELD = {
  label: "Aura size",
  max: 10,
  min: 1,
  step: 0.05,
} as const;
const CACHE_BADGE_SCALE_FIELD = {
  label: "Cache size",
  max: 2.25,
  min: 0.5,
  step: 0.05,
} as const;

const PRESET_GROUPS = [
  {
    label: "Sandbox",
    options: [DEFAULT_ORBIT_PRESET],
  },
  {
    label: "Wikipedia special periodic solutions",
    options: SPECIAL_PERIODIC_ORBIT_PRESETS,
  },
] as const;

const formatClock = (valueSec: number): string => {
  const totalSeconds = Math.max(0, Math.floor(valueSec));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const formatRtt = (rttMs: number | null): string =>
  rttMs === null ? "--" : `${Math.max(0, Math.round(rttMs))} ms`;

const getAbilityMeterFill = ({
  mode,
  progress,
}: GameViewportHudState["abilities"][number]): number => {
  const safeProgress = clamp(progress, 0, 1);

  switch (mode) {
    case "ready":
      return 1;
    case "cooldown":
      return 1 - safeProgress;
    default:
      return safeProgress;
  }
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

const WEAPON_KEY_LABELS: Record<RocketKind, string> = {
  light: "1",
  heavy: "2",
  seeker: "3",
};

export function CombatHud({
  controller,
  hud,
}: {
  controller: GameViewportController | null;
  hud: GameViewportHudState;
}) {
  const handleSandboxFieldKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    target.blur();
  };
  const playerHpRatio = clamp(hud.playerHp / PLANET_HP, 0, 1);
  const hudStyle = {
    "--damage-flash-opacity": `${hud.damageFlash}`,
    "--hud-opacity": `${hud.hudOpacity}`,
  } as CSSProperties;
  const timerStatus = hud.blackHoleActive
    ? "Overtime active"
    : hud.blackHoleWarning
      ? `Black Hole in ${formatClock(hud.blackHoleRemainingSec)}`
      : `Black Hole at ${formatClock(hud.blackHoleSettings.spawnSec)}`;

  return (
    <div className="combat-hud" style={hudStyle}>
      <div className="combat-hud__damage-flash" aria-hidden="true" />
      <div className="combat-hud__left-column">
        <section className="kill-feed-panel hud-panel">
          <div className="kill-feed-panel__header">
            <div className="hud-panel__eyebrow">Kill Feed</div>
            <div className="kill-feed-panel__count">
              {hud.alivePlayerCount}/{hud.totalPlayerCount}
            </div>
          </div>
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
        </section>
      </div>

      <form
        className="sandbox-panel sandbox-panel--dock hud-panel hud-panel--interactive hud-panel--subtle"
        onKeyDown={handleSandboxFieldKeyDown}
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="sandbox-panel__header">
          <div className="hud-panel__eyebrow">Sandbox Tools</div>
          <div className="sandbox-panel__header-actions">
            <button
              type="button"
              className="hud-button hud-button--compact"
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
              className="hud-button hud-button--compact"
              disabled={controller === null}
              onClick={() => controller?.resetSandbox()}
            >
              Reset
            </button>
          </div>
        </div>

        <div className="sandbox-panel__section">
          <div className="sandbox-panel__section-header">
            <div className="sandbox-panel__section-copy">
              <div className="hud-panel__eyebrow">Scenario</div>
              <div className="sandbox-panel__section-note">
                Preset orbit configuration
              </div>
            </div>
          </div>
          <label className="hud-field">
            <span className="hud-field__label">Periodic solution</span>
            <select
              className="hud-field__select"
              value={hud.currentPresetId}
              disabled={controller === null}
              onChange={(event) =>
                controller?.setOrbitPreset(event.currentTarget.value)
              }
            >
              {PRESET_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>

        <div className="sandbox-panel__section">
          <div className="sandbox-panel__section-header">
            <div className="sandbox-panel__section-copy">
              <div className="hud-panel__eyebrow">Visuals</div>
              <div className="sandbox-panel__section-note">
                Planet and cache presentation
              </div>
            </div>
            <button
              type="button"
              className="hud-button hud-button--compact"
              disabled={controller === null}
              onClick={() => controller?.resetPlanetVisualSettings()}
            >
              Reset
            </button>
          </div>
          <div className="sandbox-panel__settings">
            <label className="hud-field">
              <span className="hud-field__label">
                {PLANET_BODY_SCALE_FIELD.label}
              </span>
              <input
                type="number"
                className="hud-field__input"
                min={PLANET_BODY_SCALE_FIELD.min}
                max={PLANET_BODY_SCALE_FIELD.max}
                step={PLANET_BODY_SCALE_FIELD.step}
                value={hud.planetBodyScale}
                disabled={controller === null}
                onChange={(event) => {
                  const nextValue = event.currentTarget.valueAsNumber;
                  if (!Number.isFinite(nextValue)) {
                    return;
                  }

                  controller?.setPlanetBodyScale(nextValue);
                }}
              />
            </label>
            <label className="hud-field">
              <span className="hud-field__label">
                {PLANET_AURA_SCALE_FIELD.label}
              </span>
              <input
                type="number"
                className="hud-field__input"
                min={PLANET_AURA_SCALE_FIELD.min}
                max={PLANET_AURA_SCALE_FIELD.max}
                step={PLANET_AURA_SCALE_FIELD.step}
                value={hud.planetAuraScale}
                disabled={controller === null}
                onChange={(event) => {
                  const nextValue = event.currentTarget.valueAsNumber;
                  if (!Number.isFinite(nextValue)) {
                    return;
                  }

                  controller?.setPlanetAuraScale(nextValue);
                }}
              />
            </label>
            <label className="hud-field">
              <span className="hud-field__label">
                {PLANET_AURA_GAP_FIELD.label}
              </span>
              <input
                type="number"
                className="hud-field__input"
                min={PLANET_AURA_GAP_FIELD.min}
                max={PLANET_AURA_GAP_FIELD.max}
                step={PLANET_AURA_GAP_FIELD.step}
                value={hud.planetAuraGap}
                disabled={controller === null}
                onChange={(event) => {
                  const nextValue = event.currentTarget.valueAsNumber;
                  if (!Number.isFinite(nextValue)) {
                    return;
                  }

                  controller?.setPlanetAuraGap(nextValue);
                }}
              />
            </label>
            <label className="hud-field">
              <span className="hud-field__label">
                {CACHE_BADGE_SCALE_FIELD.label}
              </span>
              <input
                type="number"
                className="hud-field__input"
                min={CACHE_BADGE_SCALE_FIELD.min}
                max={CACHE_BADGE_SCALE_FIELD.max}
                step={CACHE_BADGE_SCALE_FIELD.step}
                value={hud.cacheBadgeScale}
                disabled={controller === null}
                onChange={(event) => {
                  const nextValue = event.currentTarget.valueAsNumber;
                  if (!Number.isFinite(nextValue)) {
                    return;
                  }

                  controller?.setCacheBadgeScale(nextValue);
                }}
              />
            </label>
          </div>
        </div>

        <div className="sandbox-panel__section">
          <div className="sandbox-panel__section-header">
            <div className="sandbox-panel__section-copy">
              <div className="hud-panel__eyebrow">Black Hole</div>
              <div className="sandbox-panel__section-note">
                Spawn timing and collapse strength
              </div>
            </div>
            <button
              type="button"
              className="hud-button hud-button--compact"
              disabled={controller === null}
              onClick={() => controller?.resetBlackHoleSettings()}
            >
              Reset
            </button>
          </div>
          <div className="sandbox-panel__settings">
            {BLACK_HOLE_FIELDS.map((field) => (
              <label key={field.key} className="hud-field">
                <span className="hud-field__label">{field.label}</span>
                <input
                  type="number"
                  className="hud-field__input"
                  min={field.min}
                  step={field.step}
                  value={hud.blackHoleSettings[field.key]}
                  disabled={controller === null}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.valueAsNumber;
                    if (!Number.isFinite(nextValue)) {
                      return;
                    }

                    controller?.setBlackHoleSetting(field.key, nextValue);
                  }}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="sandbox-panel__section">
          <div className="sandbox-panel__section-header">
            <div className="sandbox-panel__section-copy">
              <div className="hud-panel__eyebrow">Abilities</div>
              <div className="sandbox-panel__section-note">
                Foresight, shield, and boost tuning
              </div>
            </div>
            <button
              type="button"
              className="hud-button hud-button--compact"
              disabled={controller === null}
              onClick={() => controller?.resetAbilitySettings()}
            >
              Reset
            </button>
          </div>
          <div className="sandbox-panel__settings">
            {FORESIGHT_FIELDS.map((field) => (
              <label key={field.key} className="hud-field">
                <span className="hud-field__label">{field.label}</span>
                <input
                  type="number"
                  className="hud-field__input"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={hud.foresightSettings[field.key]}
                  disabled={controller === null}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.valueAsNumber;
                    if (!Number.isFinite(nextValue)) {
                      return;
                    }

                    controller?.setForesightSetting(field.key, nextValue);
                  }}
                />
              </label>
            ))}
            {SHIELD_FIELDS.map((field) => (
              <label key={`shield-${field.key}`} className="hud-field">
                <span className="hud-field__label">{field.label}</span>
                <input
                  type="number"
                  className="hud-field__input"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={hud.shieldSettings[field.key]}
                  disabled={controller === null}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.valueAsNumber;
                    if (!Number.isFinite(nextValue)) {
                      return;
                    }

                    controller?.setShieldSetting(field.key, nextValue);
                  }}
                />
              </label>
            ))}
            {BOOST_FIELDS.map((field) => (
              <label key={field.key} className="hud-field">
                <span className="hud-field__label">{field.label}</span>
                <input
                  type="number"
                  className="hud-field__input"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={hud.boostSettings[field.key]}
                  disabled={controller === null}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.valueAsNumber;
                    if (!Number.isFinite(nextValue)) {
                      return;
                    }

                    controller?.setBoostSetting(field.key, nextValue);
                  }}
                />
              </label>
            ))}
          </div>
        </div>
      </form>

      <section className="match-timer hud-pill">
        <div className="hud-pill__label">Match</div>
        <div className="match-timer__value">
          {formatClock(hud.timerElapsedSec)}
        </div>
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
      </section>

      <section className="connection-indicator hud-pill">
        <div className="hud-pill__label">Ping</div>
        <div className="connection-indicator__row">
          <span
            className={`connection-indicator__state connection-indicator__state--${hud.connection.state}`}
          >
            {hud.connection.state}
          </span>
          <span className="connection-indicator__rtt">
            {formatRtt(hud.connection.rttMs)}
          </span>
        </div>
        <div className="connection-indicator__label">
          {hud.connection.label}
          {hud.connection.extrapolating ? " · Extrapolating" : ""}
        </div>
      </section>

      {hud.sandboxControlsEnabled ? (
        <section className="shortcuts-dock">
          <div className="shortcuts-dock__section">
            <div className="hud-panel__eyebrow">Health</div>
            <div
              className="cockpit-summary"
              style={
                {
                  "--cockpit-hit": `${hud.playerHpPulse}`,
                } as CSSProperties
              }
            >
              <div className="cockpit-summary__row">
                <span className="cockpit-summary__label">
                  {hud.controlMode === "drone" ? "Planet HP" : "Health"}
                </span>
                <strong className="cockpit-summary__value">
                  {Math.max(0, Math.round(hud.playerHp))}/{PLANET_HP}
                </strong>
              </div>
              <div className="cockpit-summary__track">
                <div
                  className="cockpit-summary__fill"
                  style={{
                    width: `${playerHpRatio * 100}%`,
                  }}
                />
              </div>
            </div>
          </div>
          {hud.abilities.length > 0 ? (
            <div className="shortcuts-dock__section">
              <div className="hud-panel__eyebrow">Abilities</div>
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
              <div className="hud-panel__eyebrow">Weapons</div>
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
