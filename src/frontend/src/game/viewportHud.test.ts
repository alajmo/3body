import { BLACK_HOLE_SPEC } from "@3body/shared";
import { describe, expect, it } from "vitest";
import { DEFAULT_ORBIT_PRESET } from "./orbitPresets";
import {
  DEFAULT_BOOST_SETTINGS,
  DEFAULT_CACHE_BADGE_SCALE,
  DEFAULT_FORESIGHT_SETTINGS,
  DEFAULT_PLANET_AURA_GAP,
  DEFAULT_PLANET_AURA_SCALE,
  DEFAULT_PLANET_BODY_SCALE,
  DEFAULT_SHIELD_SETTINGS,
  createInitialHudState,
} from "./viewportHud";

describe("createInitialHudState", () => {
  it("returns the frontend HUD defaults with fresh nested objects", () => {
    const first = createInitialHudState();
    const second = createInitialHudState();

    expect(first.currentPresetId).toBe(DEFAULT_ORBIT_PRESET.id);
    expect(first.blackHoleSettings).toEqual(BLACK_HOLE_SPEC);
    expect(first.foresightSettings).toEqual(DEFAULT_FORESIGHT_SETTINGS);
    expect(first.shieldSettings).toEqual(DEFAULT_SHIELD_SETTINGS);
    expect(first.boostSettings).toEqual(DEFAULT_BOOST_SETTINGS);
    expect(first.planetBodyScale).toBe(DEFAULT_PLANET_BODY_SCALE);
    expect(first.planetAuraGap).toBe(DEFAULT_PLANET_AURA_GAP);
    expect(first.planetAuraScale).toBe(DEFAULT_PLANET_AURA_SCALE);
    expect(first.cacheBadgeScale).toBe(DEFAULT_CACHE_BADGE_SCALE);
    expect(first.connection).toEqual({
      extrapolating: false,
      label: "Local sandbox",
      rttMs: 0,
      state: "local",
    });

    expect(first.blackHoleSettings).not.toBe(second.blackHoleSettings);
    expect(first.foresightSettings).not.toBe(second.foresightSettings);
    expect(first.shieldSettings).not.toBe(second.shieldSettings);
    expect(first.boostSettings).not.toBe(second.boostSettings);
    expect(first.connection).not.toBe(second.connection);

    first.blackHoleSettings.spawnSec = 1;
    first.foresightSettings.durationSec = 99;
    first.shieldSettings.cooldownSec = 99;
    first.boostSettings.magnitude = 99;
    first.connection.label = "Mutated";

    expect(second.blackHoleSettings.spawnSec).toBe(BLACK_HOLE_SPEC.spawnSec);
    expect(second.foresightSettings.durationSec).toBe(
      DEFAULT_FORESIGHT_SETTINGS.durationSec,
    );
    expect(second.shieldSettings.cooldownSec).toBe(
      DEFAULT_SHIELD_SETTINGS.cooldownSec,
    );
    expect(second.boostSettings.magnitude).toBe(
      DEFAULT_BOOST_SETTINGS.magnitude,
    );
    expect(second.connection.label).toBe("Local sandbox");
  });
});
