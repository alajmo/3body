import { describe, expect, it } from "vitest";
import {
  DEFAULT_ORBIT_PRESET,
  ORBIT_PRESETS,
  ORBIT_PRESET_BY_ID,
  SPECIAL_PERIODIC_ORBIT_PRESETS,
} from "./orbitPresets";

describe("orbitPresets", () => {
  it("indexes every preset by id and keeps the default preset first", () => {
    expect(DEFAULT_ORBIT_PRESET).toBe(ORBIT_PRESETS[0]);
    expect(new Set(ORBIT_PRESETS.map((preset) => preset.id)).size).toBe(
      ORBIT_PRESETS.length,
    );

    for (const preset of ORBIT_PRESETS) {
      expect(ORBIT_PRESET_BY_ID.get(preset.id)).toBe(preset);
    }
  });

  it("builds the published periodic presets as endless three-sun scenarios", () => {
    for (const preset of SPECIAL_PERIODIC_ORBIT_PRESETS) {
      expect(preset.suns).toHaveLength(3);
      expect(preset.planets).toHaveLength(DEFAULT_ORBIT_PRESET.planets.length);
      expect(preset.resetPolicy.earlyWindowSec).toBe(0);
      expect(preset.resetPolicy.minAliveDuringEarlyWindow).toBe(0);
      expect(preset.resetPolicy.resetOnAllPlanetsLost).toBe(false);
      expect(preset.resetPolicy.resetOnSunCollision).toBe(false);
    }
  });
});
