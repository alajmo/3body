import { CURRENT_GAME_TUNING } from "@3body/shared";
import { describe, expect, it } from "vitest";
import {
  getEditorPreviewGameplayPlanetRadius,
  getEditorPreviewPlayerCameraHalfHeight,
  getEditorPreviewStageWorldUnitsPerPixel,
} from "./createEditorItemPreviewViewport";

describe("getEditorPreviewPlayerCameraHalfHeight", () => {
  it("uses the gameplay camera height for turret and missile previews", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.camera.gameplayCameraWorldHeight = 4600;
    tunedDocument.gameplay.camera.previewCameraWorldHeight = 10000;

    expect(
      getEditorPreviewPlayerCameraHalfHeight({
        itemId: "cannon",
        tuning: tunedDocument,
      }),
    ).toBe(2300);
    expect(
      getEditorPreviewPlayerCameraHalfHeight({
        itemId: "rocketLight",
        tuning: tunedDocument,
      }),
    ).toBe(2300);
    expect(
      getEditorPreviewPlayerCameraHalfHeight({
        itemId: "rocketHeavy",
        tuning: tunedDocument,
      }),
    ).toBe(2300);
    expect(
      getEditorPreviewPlayerCameraHalfHeight({
        itemId: "rocketSeeker",
        tuning: tunedDocument,
      }),
    ).toBe(2300);
  });

  it("keeps the standard gameplay camera height for other player camera previews", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.camera.gameplayCameraWorldHeight = 4600;
    tunedDocument.gameplay.camera.previewCameraWorldHeight = 10000;

    expect(
      getEditorPreviewPlayerCameraHalfHeight({
        itemId: "blackHole",
        tuning: tunedDocument,
      }),
    ).toBe(2300);
    expect(
      getEditorPreviewPlayerCameraHalfHeight({
        itemId: "cache",
        tuning: tunedDocument,
      }),
    ).toBe(2300);
    expect(
      getEditorPreviewPlayerCameraHalfHeight({
        itemId: "background",
        tuning: tunedDocument,
      }),
    ).toBeNull();
  });

  it("uses the gameplay planet body radius for sandbox-styled player planet previews", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.orbits.planets[0]!.radius = 31;
    tunedDocument.visuals.planets.archetypes.terra.bodyScale = 1.5;

    expect(getEditorPreviewGameplayPlanetRadius(tunedDocument)).toBe(46.5);
  });

  it("matches gameplay world units per pixel for turret and missile previews", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.camera.gameplayCameraWorldHeight = 4600;
    tunedDocument.gameplay.camera.previewCameraWorldHeight = 10000;

    expect(
      getEditorPreviewStageWorldUnitsPerPixel({
        itemId: "cannon",
        tuning: tunedDocument,
        viewportHeight: 800,
      }),
    ).toBe(5.75);
    expect(
      getEditorPreviewStageWorldUnitsPerPixel({
        itemId: "rocketLight",
        tuning: tunedDocument,
        viewportHeight: 800,
      }),
    ).toBe(5.75);
  });
});
