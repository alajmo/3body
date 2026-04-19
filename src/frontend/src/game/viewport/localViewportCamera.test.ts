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
      state,
    });

    expect(frame.centerX).toBe(-320);
    expect(frame.centerY).toBe(540);
    expect(frame.centerX).not.toBe(otherPlanet.pos.x);
    expect(frame.centerY).not.toBe(otherPlanet.pos.y);
  });

  it("can follow the next surviving planet after the focused bot dies", () => {
    const state = createSandboxState(DEFAULT_ORBIT_PRESET, {
      playerBehavior: "bot",
    });
    const playerPlanetIndex = state.planets.findIndex(
      (planet) => planet.id === state.player.planetId,
    );
    const otherPlanet = state.planets.find(
      (planet) => planet.id !== state.player.planetId && planet.alive,
    )!;

    state.planets[playerPlanetIndex] = {
      ...state.planets[playerPlanetIndex]!,
      alive: false,
      pos: { x: -320, y: 540 },
    };

    const frame = getLocalViewportCameraFrame({
      followAlivePlanetWhenPlayerDown: true,
      state,
    });

    expect(frame.centerX).toBe(otherPlanet.pos.x);
    expect(frame.centerY).toBe(otherPlanet.pos.y);
  });

  it("uses the configured gameplay camera height as the sandbox baseline", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.camera.gameplayCameraWorldHeight = 5100;
    applyRuntimeTuningDocument(tunedDocument);

    const state = createSandboxState(DEFAULT_ORBIT_PRESET, {
      botsEnabled: false,
    });

    const frame = getLocalViewportCameraFrame({ state });

    expect(frame.visibleWorldHeight).toBe(5100);
  });

  it("expands observer stage framing to fit the arena bounds", () => {
    const frame = getLocalViewportCameraFrame({
      aspect: 16 / 9,
      state: {
        blackHole: null,
        drones: [],
        planets: [],
        player: {
          activeDroneId: null,
          controlMode: "planet",
          planetId: 1,
        },
        suns: [],
      },
      useArenaStageCamera: true,
    });

    expect(frame.centerX).toBe(0);
    expect(frame.centerY).toBe(0);
    expect(frame.visibleWorldHeight).toBe(5040);
  });

  it("supports overriding the sandbox camera height for preview-only uses", () => {
    const frame = getLocalViewportCameraFrame({
      cameraWorldHeightOverride: 7600,
      state: createSandboxState(DEFAULT_ORBIT_PRESET, {
        botsEnabled: false,
      }),
    });

    expect(frame.visibleWorldHeight).toBe(7600);
  });
});
