import {
  BLACK_HOLE_SPEC,
  BOOST_SPEC,
  FORESIGHT_SPEC,
  type AbilitySpec,
} from "@3body/shared";
import { describe, expect, it } from "vitest";
import {
  createSandboxState,
  getSandboxDebugSnapshot,
} from "../combatSandbox";
import { DEFAULT_ORBIT_PRESET } from "../orbitPresets";
import { buildLocalSandboxHudState } from "./localHud";

const SHIELD_SETTINGS: AbilitySpec = {
  cooldownSec: 12,
  durationSec: 4,
};

const createHudState = (controlsEnabled: boolean) => {
  const currentState = createSandboxState(DEFAULT_ORBIT_PRESET);
  const debug = getSandboxDebugSnapshot(currentState);

  return buildLocalSandboxHudState({
    activeDrone: null,
    blackHoleRemainingSec: 24,
    blackHoleSettings: BLACK_HOLE_SPEC,
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
    profilerSnapshot: null,
    readModeHeld: false,
    readModeHudOpacity: 0.2,
    runtimeStats: {
      fps: 60,
      frameTimeMs: 16.7,
    },
    sandboxPaused: false,
    selectedWeapon: currentState.player.selectedRocketKind,
    shieldActiveRemainingSec: 0,
    shieldCooldownRemainingSec: 0,
    shieldMode: "ready",
    shieldSettings: SHIELD_SETTINGS,
  });
};

describe("buildLocalSandboxHudState", () => {
  it("builds the local sandbox HUD when controls are enabled", () => {
    const hud = createHudState(true);

    expect(hud.connection.label).toBe("Local sandbox");
    expect(hud.abilities.map((ability) => ability.id)).toEqual([
      "foresight",
      "shield",
      "boost",
      "drone",
    ]);
    expect(hud.weapons.map((weapon) => weapon.kind)).toEqual([
      "light",
      "heavy",
      "seeker",
    ]);
    expect(hud.sandboxControlsEnabled).toBe(true);
    expect(hud.primaryShortcuts.some((shortcut) => shortcut.id === "read-mode")).toBe(
      true,
    );
  });

  it("omits control affordances in viewer mode", () => {
    const hud = createHudState(false);

    expect(hud.connection.label).toBe("Periodic solution viewer");
    expect(hud.abilities).toEqual([]);
    expect(hud.weapons).toEqual([]);
    expect(hud.primaryShortcuts).toEqual([]);
    expect(hud.contextualShortcuts).toEqual([]);
    expect(hud.sandboxControlsEnabled).toBe(false);
  });
});
