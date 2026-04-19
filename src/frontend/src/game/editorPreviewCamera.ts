import type { GameTuningDocument } from "@3body/shared";

export type EditorPreviewCameraItemId =
  | "overview"
  | "hud"
  | "orbits"
  | "aiGameplay"
  | "background"
  | "planets"
  | "suns"
  | "neutronStars"
  | "blackHole"
  | "cannon"
  | "rocketLight"
  | "rocketHeavy"
  | "rocketSeeker"
  | "foresight"
  | "shield"
  | "boost"
  | "gravityPulse"
  | "cloak"
  | "cache";

export const usesPreviewCameraForEditorItem = (
  itemId: EditorPreviewCameraItemId,
): boolean =>
  itemId === "overview" ||
  itemId === "orbits" ||
  itemId === "aiGameplay" ||
  itemId === "background";

export const getEditorPreviewCameraWorldHeight = ({
  itemId,
  tuning,
}: {
  itemId: EditorPreviewCameraItemId;
  tuning: GameTuningDocument;
}): number =>
  usesPreviewCameraForEditorItem(itemId)
    ? tuning.gameplay.camera.previewCameraWorldHeight
    : tuning.gameplay.camera.gameplayCameraWorldHeight;

export const getEditorPreviewCameraHalfHeight = ({
  itemId,
  tuning,
}: {
  itemId: EditorPreviewCameraItemId;
  tuning: GameTuningDocument;
}): number => getEditorPreviewCameraWorldHeight({ itemId, tuning }) / 2;
