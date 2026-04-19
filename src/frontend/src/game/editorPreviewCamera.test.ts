import { CURRENT_GAME_TUNING } from "@3body/shared";
import { describe, expect, it } from "vitest";
import {
  getEditorPreviewCameraHalfHeight,
  getEditorPreviewCameraWorldHeight,
  usesPreviewCameraForEditorItem,
} from "./editorPreviewCamera";

describe("editorPreviewCamera", () => {
  it("routes overview pages that need a wider preview through the preview camera height", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.camera.gameplayCameraWorldHeight = 4600;
    tunedDocument.gameplay.camera.previewCameraWorldHeight = 10000;

    expect(usesPreviewCameraForEditorItem("overview")).toBe(true);
    expect(usesPreviewCameraForEditorItem("orbits")).toBe(true);
    expect(usesPreviewCameraForEditorItem("aiGameplay")).toBe(true);
    expect(usesPreviewCameraForEditorItem("background")).toBe(true);
    expect(
      getEditorPreviewCameraWorldHeight({
        itemId: "overview",
        tuning: tunedDocument,
      }),
    ).toBe(10000);
    expect(
      getEditorPreviewCameraHalfHeight({
        itemId: "background",
        tuning: tunedDocument,
      }),
    ).toBe(5000);
  });

  it("routes all other editor pages through the gameplay camera height", () => {
    const tunedDocument = structuredClone(CURRENT_GAME_TUNING);
    tunedDocument.gameplay.camera.gameplayCameraWorldHeight = 4600;
    tunedDocument.gameplay.camera.previewCameraWorldHeight = 10000;

    expect(usesPreviewCameraForEditorItem("blackHole")).toBe(false);
    expect(usesPreviewCameraForEditorItem("hud")).toBe(false);
    expect(usesPreviewCameraForEditorItem("cannon")).toBe(false);
    expect(usesPreviewCameraForEditorItem("rocketLight")).toBe(false);
    expect(usesPreviewCameraForEditorItem("cache")).toBe(false);
    expect(
      getEditorPreviewCameraWorldHeight({
        itemId: "hud",
        tuning: tunedDocument,
      }),
    ).toBe(4600);
    expect(
      getEditorPreviewCameraWorldHeight({
        itemId: "cannon",
        tuning: tunedDocument,
      }),
    ).toBe(4600);
    expect(
      getEditorPreviewCameraHalfHeight({
        itemId: "rocketSeeker",
        tuning: tunedDocument,
      }),
    ).toBe(2300);
  });
});
