import { CURRENT_GAME_TUNING } from "@3body/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { createSandboxState } from "../combatSandbox";
import { DEFAULT_ORBIT_PRESET } from "../orbitPresets";
import { applyRuntimeTuningDocument } from "../runtimeTuning";
import { getLocalViewportCameraFrame } from "./localViewportCamera";

describe("getLocalViewportCameraFrame", () => {
  beforeEach(() => {
    applyRuntimeTuningDocument(CURRENT_GAME_TUNING);
  });

  it("keeps focus on the player planet after the player dies", () => {
    const state = createSandboxState(DEFAULT_ORBIT_PRESET, {
      botsEnabled: false,
    });
    const playerPlanetIndex = state.planets.findIndex(
      (planet) => planet.id === state.player.planetId,
    );
    const otherPlanet = state.planets.find(
      (planet) => planet.id !== state.player.planetId,
    )!;

    state.planets[playerPlanetIndex] = {
      ...state.planets[playerPlanetIndex]!,
      alive: false,
      pos: { x: -320, y: 540 },
    };

    const frame = getLocalViewportCameraFrame({
      readModeHeld: false,
      state,
    });

    expect(frame.centerX).toBe(-320);
    expect(frame.centerY).toBe(540);
    expect(frame.centerX).not.toBe(otherPlanet.pos.x);
    expect(frame.centerY).not.toBe(otherPlanet.pos.y);
  });

  it("uses the configured read mode world height", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.camera.viewportWorldHeight = 5100;
    tunedDocument.gameplay.camera.readModeWorldHeight = 7800;
    applyRuntimeTuningDocument(tunedDocument);

    const state = createSandboxState(DEFAULT_ORBIT_PRESET, {
      botsEnabled: false,
    });

    const followFrame = getLocalViewportCameraFrame({
      readModeHeld: false,
      state,
    });
    const readModeFrame = getLocalViewportCameraFrame({
      readModeHeld: true,
      state,
    });

    expect(followFrame.visibleWorldHeight).toBe(5100);
    expect(readModeFrame.visibleWorldHeight).toBe(7800);
  });
});
