import type { CombatSandboxState } from "../combatSandbox";
import { describe, expect, it } from "vitest";
import { createLocalViewportTransientEvents } from "./localViewportTransientEvents";

describe("createLocalViewportTransientEvents", () => {
  it("owns local transient queues and initializes swallow tracking", () => {
    const initialState = {
      neutronStars: [],
      planets: [
        {
          alive: true,
          id: 7,
        },
      ],
      suns: [],
    } as unknown as CombatSandboxState;

    const events = createLocalViewportTransientEvents(initialState);

    expect(events.activeBlackHoleSwallowEffects).toEqual([]);
    expect(events.activePlanetExplosions).toEqual([]);
    expect(events.blackHoleSwallowTracker.previousPlanetAliveById.get(7)).toBe(
      true,
    );
  });
});
