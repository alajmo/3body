import type { NeutronStar, Sun } from "@3body/shared";
import { describe, expect, it } from "vitest";
import { findAbsorbingNeutronStar } from "./neutronStarAbsorption";

const buildSun = (overrides: Partial<Sun> = {}): Sun => ({
  id: 1,
  kind: "sun",
  mass: 220_000,
  pos: { x: 100, y: 0 },
  radius: 64,
  vel: { x: 0, y: 0 },
  ...overrides,
});

const buildNeutronStar = (
  overrides: Partial<NeutronStar> = {},
): NeutronStar => ({
  id: 2,
  kind: "neutronStar",
  mass: 1_000_000,
  pos: { x: 120, y: 0 },
  radius: 80,
  vel: { x: 0, y: 0 },
  ...overrides,
});

describe("neutronStarAbsorption", () => {
  it("matches a removed sun to a nearby neutron star that grew", () => {
    const currentNeutronStar = buildNeutronStar({
      mass: 1_220_000,
      radius: 88,
    });

    const absorption = findAbsorbingNeutronStar({
      currentNeutronStars: [currentNeutronStar],
      previousNeutronStarsById: new Map([
        [
          currentNeutronStar.id,
          {
            mass: 1_000_000,
            pos: { x: 120, y: 0 },
            radius: 80,
          },
        ],
      ]),
      sun: buildSun(),
    });

    expect(absorption?.id).toBe(currentNeutronStar.id);
  });

  it("ignores nearby neutron stars that did not grow", () => {
    const currentNeutronStar = buildNeutronStar();

    const absorption = findAbsorbingNeutronStar({
      currentNeutronStars: [currentNeutronStar],
      previousNeutronStarsById: new Map([
        [
          currentNeutronStar.id,
          {
            mass: currentNeutronStar.mass,
            pos: { ...currentNeutronStar.pos },
            radius: currentNeutronStar.radius,
          },
        ],
      ]),
      sun: buildSun(),
    });

    expect(absorption).toBeNull();
  });
});
