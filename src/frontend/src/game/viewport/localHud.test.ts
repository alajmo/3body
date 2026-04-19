import {
  BLACK_HOLE_SPEC,
  BOOST_SPEC,
  FIXED_STEP_SEC,
  FORESIGHT_SPEC,
  getShieldLoadCapacity,
  len,
  type AbilitySpec,
} from "@3body/shared";
import { describe, expect, it } from "vitest";
import { createSandboxState, getSandboxDebugSnapshot } from "../combatSandbox";
import { DEFAULT_ORBIT_PRESET } from "../orbitPresets";
import { buildLocalSandboxHudState } from "./localHud";
import type { ViewportPerformanceSnapshot } from "./performanceProfiler";

const SHIELD_SETTINGS: AbilitySpec = {
  cooldownSec: 12,
  durationSec: 4,
};

const PROFILER_SNAPSHOT: ViewportPerformanceSnapshot = {
  frameCpu: {
    averageMs: 14.2,
    latestMs: 15.3,
    maxMs: 20.1,
  },
  frames: 72,
  interpolation: {
    averageMs: 1.7,
    latestMs: 1.8,
    maxMs: 2.4,
  },
  renderCpu: {
    averageMs: 8.6,
    latestMs: 9.1,
    maxMs: 12.8,
  },
  sampledDurationSec: 1.2,
  simulation: {
    averageMs: 3.1,
    latestMs: 3.5,
    maxMs: 4.7,
  },
  steps: {
    average: 1.2,
    latest: 1,
    max: 2,
  },
  submit: {
    averageMs: 0.8,
    latestMs: 0.9,
    maxMs: 1.3,
  },
};

const createHudParams = (controlsEnabled: boolean) => {
  const currentState = createSandboxState(DEFAULT_ORBIT_PRESET);
  const debug = getSandboxDebugSnapshot(currentState);

  return {
    activeDrone: null,
    blackHoleRemainingSec: 24,
    blackHoleSettings: BLACK_HOLE_SPEC,
    botsEnabled: true,
    boostMode: "ready",
    boostRecoveryDurationSec: BOOST_SPEC.cooldownSec,
    boostRecoveryRemainingSec: 0,
    boostSettings: BOOST_SPEC,
    cacheBadgeScale: 1,
    colors: {
      boost: "#ff8d4a",
      drone: "#77d6ff",
      droneReturn: "#ffd166",
      foresight: "#7cf2ff",
      shield: "#7ab8ff",
      weapon: {
        heavy: { accent: "#ff7043" },
        light: { accent: "#dff3ff" },
        seeker: { accent: "#f564ff" },
      },
      wildcard: "#f5d76e",
    },
    controlsEnabled,
    currentEffectsQuality: "medium",
    currentMaxPixelRatio: 1.5,
    currentPresetId: DEFAULT_ORBIT_PRESET.id,
    currentSsaaLevel: 1,
    currentState,
    debug,
    droneTtlRemainingSec: 0,
    foresightActiveRemainingSec: 0,
    foresightCooldownRemainingSec: 0,
    foresightMode: "ready",
    foresightSettings: FORESIGHT_SPEC,
    fullViewEnabled: false,
    killFeed: [],
    planetAuraGap: 0.3,
    planetAuraScale: 1.8,
    planetBodyScale: 2,
    playerDamageFlash: 0.2,
    playerHpPulse: 0.1,
    playerLabel: "Player",
    profilingEnabled: true,
    profilerSnapshot: PROFILER_SNAPSHOT,
    runtimeStats: {
      fps: 60,
      frameTimeMs: 16.7,
    },
    sandboxPaused: false,
    selectedWeapon: currentState.player.selectedRocketKind,
    shieldLoad: currentState.player.shieldLoad,
    shieldMaxLoad: currentState.player.shieldMaxLoad,
    shieldMode: "ready",
    shieldSettings: SHIELD_SETTINGS,
  } satisfies Parameters<typeof buildLocalSandboxHudState>[0];
};

const createHudState = (controlsEnabled: boolean) =>
  buildLocalSandboxHudState(createHudParams(controlsEnabled));

describe("buildLocalSandboxHudState", () => {
  it("builds the local sandbox HUD when controls are enabled", () => {
    const params = createHudParams(true);
    const hud = buildLocalSandboxHudState(params);
    const playerPlanet = params.currentState.planets.find(
      (planet) => planet.id === params.currentState.player.planetId,
    )!;
    const expectedHeadingDeg =
      (90 -
        (Math.atan2(playerPlanet.vel.y, playerPlanet.vel.x) * 180) / Math.PI +
        360) %
      360;

    expect(hud.connection.label).toBe("Local");
    expect(hud.abilities.map((ability) => ability.id)).toEqual([
      "foresight",
      "shield",
      "boost",
    ]);
    expect(
      Object.fromEntries(
        hud.abilities.map((ability) => [ability.id, ability.keyLabel]),
      ),
    ).toEqual({
      boost: "W",
      foresight: "E",
      shield: "Q",
    });
    expect(hud.weapons.map((weapon) => weapon.kind)).toEqual([
      "light",
      "heavy",
      "seeker",
    ]);
    expect(hud.sandboxControlsEnabled).toBe(true);
    expect(hud.botsEnabled).toBe(true);
    expect(
      hud.primaryShortcuts.some((shortcut) => shortcut.id === "full-view"),
    ).toBe(false);
    expect(hud.playerSpeed).toBeCloseTo(len(playerPlanet.vel));
    expect(hud.playerHeadingDeg).toBeCloseTo(expectedHeadingDeg);
    expect(hud.minimap.arenaRadius).toBeGreaterThan(0);
    expect(hud.minimap.entities.some((entity) => entity.kind === "sun")).toBe(
      true,
    );
    expect(
      hud.minimap.entities.some(
        (entity) => entity.kind === "planet" && entity.highlighted,
      ),
    ).toBe(true);
  });

  it("omits control affordances in viewer mode", () => {
    const hud = createHudState(false);

    expect(hud.connection.label).toBe("Periodic solution viewer");
    expect(hud.abilities).toEqual([]);
    expect(hud.weapons).toEqual([]);
    expect(hud.primaryShortcuts).toEqual([]);
    expect(hud.contextualShortcuts).toEqual([]);
    expect(hud.sandboxControlsEnabled).toBe(false);
    expect(hud.minimap.entities.length).toBeGreaterThan(0);
  });

  it("shows depleted shield capacity when max load has been damaged", () => {
    const params = createHudParams(true);
    const { currentState } = params;
    const playerPlanet = currentState.planets.find(
      (planet) => planet.id === currentState.player.planetId,
    )!;
    const baseShieldCapacity = getShieldLoadCapacity(playerPlanet.archetype);
    const depletedShieldCapacity = baseShieldCapacity - 15;
    currentState.player.shieldLoad = depletedShieldCapacity;
    currentState.player.shieldMaxLoad = depletedShieldCapacity;
    const playerPlanetIndex = currentState.planets.findIndex(
      (planet) => planet.id === currentState.player.planetId,
    );
    currentState.planets[playerPlanetIndex] = {
      ...playerPlanet,
      shieldLoad: depletedShieldCapacity,
      shieldMaxLoad: depletedShieldCapacity,
    };

    const hud = buildLocalSandboxHudState({
      ...params,
      currentState,
      debug: getSandboxDebugSnapshot(currentState),
      shieldLoad: depletedShieldCapacity,
      shieldMaxLoad: depletedShieldCapacity,
      shieldMode: "cooldown",
    });

    expect(hud.abilities.find((ability) => ability.id === "shield")).toEqual(
      expect.objectContaining({
        statusText: "charging 85%",
        valueText: "85%",
      }),
    );
  });

  it("keeps the remaining foresight charge when toggled off", () => {
    const params = createHudParams(true);
    const extendedDurationTicks = Math.round(
      (FORESIGHT_SPEC.durationSec * 2) / FIXED_STEP_SEC,
    );
    const fullRechargeTicks = Math.max(
      0,
      Math.round(FORESIGHT_SPEC.cooldownSec / FIXED_STEP_SEC) -
        extendedDurationTicks,
    );
    const cooldownStartTick = 840;
    const cooldownUntilTick =
      cooldownStartTick + Math.round(fullRechargeTicks / 4);

    params.currentState.tick = cooldownStartTick;
    params.currentState.elapsedSec = cooldownStartTick * FIXED_STEP_SEC;
    params.currentState.player.foresightActiveUntilTick = cooldownStartTick;
    params.currentState.player.foresightCooldownUntilTick = cooldownUntilTick;
    params.currentState.player.foresightDurationTicks = extendedDurationTicks;
    const cooldownHud = buildLocalSandboxHudState({
      ...params,
      currentState: params.currentState,
      debug: getSandboxDebugSnapshot(params.currentState),
      foresightCooldownRemainingSec:
        (cooldownUntilTick - params.currentState.tick) * FIXED_STEP_SEC,
      foresightActiveRemainingSec: 0,
      foresightMode: "cooldown",
    });

    expect(
      cooldownHud.abilities.find((ability) => ability.id === "foresight"),
    ).toEqual(
      expect.objectContaining({
        progress: 0.75,
      }),
    );

    params.currentState.tick =
      cooldownStartTick + Math.round(fullRechargeTicks / 8);
    params.currentState.elapsedSec = params.currentState.tick * FIXED_STEP_SEC;
    const rechargingHud = buildLocalSandboxHudState({
      ...params,
      currentState: params.currentState,
      debug: getSandboxDebugSnapshot(params.currentState),
      foresightActiveRemainingSec: 0,
      foresightCooldownRemainingSec:
        (cooldownUntilTick - params.currentState.tick) * FIXED_STEP_SEC,
      foresightMode: "cooldown",
    });

    expect(
      rechargingHud.abilities.find((ability) => ability.id === "foresight"),
    ).toEqual(
      expect.objectContaining({
        progress: 0.875,
      }),
    );
  });

  it("shows gravity pulse and cloak as separate held sandbox abilities", () => {
    const params = createHudParams(true);
    params.debug = {
      ...params.debug,
      gravityPulseHeld: true,
      cloakHeld: true,
    };

    const hud = buildLocalSandboxHudState(params);

    expect(
      hud.abilities.find((ability) => ability.id === "gravityPulse"),
    ).toEqual(
      expect.objectContaining({
        keyLabel: "G",
        label: "Gravity Pulse",
        statusText: "Gravity Pulse",
      }),
    );
    expect(hud.abilities.find((ability) => ability.id === "cloak")).toEqual(
      expect.objectContaining({
        keyLabel: "C",
        label: "Cloak",
        statusText: "Cloak",
      }),
    );
  });
});
