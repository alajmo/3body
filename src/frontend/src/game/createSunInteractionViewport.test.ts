import { CURRENT_GAME_TUNING } from "@3body/shared";
import { describe, expect, it } from "vitest";
import { getSunInteractionViewportCameraTarget } from "./createSunInteractionViewport";

describe("getSunInteractionViewportCameraTarget", () => {
  it("uses the exact gameplay camera height for HUD mode", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.camera.gameplayCameraWorldHeight = 4600;
    tunedDocument.gameplay.camera.previewCameraWorldHeight = 10000;

    expect(
      getSunInteractionViewportCameraTarget({
        aspect: 16 / 9,
        bounds: {
          maxX: 9000,
          maxY: 9000,
          minX: -9000,
          minY: -9000,
        },
        mode: "hud",
        tuning: tunedDocument,
      }),
    ).toEqual({
      centerX: 0,
      centerY: 0,
      worldHalfHeight: 2300,
    });
  });

  it("keeps auto-fit behavior for background mode with the preview camera as a floor", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.camera.gameplayCameraWorldHeight = 4600;
    tunedDocument.gameplay.camera.previewCameraWorldHeight = 10000;

    expect(
      getSunInteractionViewportCameraTarget({
        aspect: 16 / 9,
        bounds: {
          maxX: 500,
          maxY: 500,
          minX: -500,
          minY: -500,
        },
        mode: "background",
        tuning: tunedDocument,
      }),
    ).toEqual({
      centerX: 0,
      centerY: 0,
      worldHalfHeight: 5000,
    });
  });
});
