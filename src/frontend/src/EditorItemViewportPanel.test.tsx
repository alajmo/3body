import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditorItemViewportPanel } from "./EditorItemViewportPanel";

const {
  createEditorItemPreviewViewportMock,
  createSunInteractionViewportMock,
} = vi.hoisted(() => ({
  createEditorItemPreviewViewportMock: vi.fn(() => vi.fn()),
  createSunInteractionViewportMock: vi.fn(() => vi.fn()),
}));

vi.mock("./game/createEditorItemPreviewViewport", () => ({
  createEditorItemPreviewViewport: createEditorItemPreviewViewportMock,
}));

vi.mock("./game/createSunInteractionViewport", () => ({
  createSunInteractionViewport: createSunInteractionViewportMock,
}));

describe("EditorItemViewportPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the sun interaction viewport for background, hud, and orbits", async () => {
    const { rerender } = render(
      <EditorItemViewportPanel itemId="background" presentation="stage" />,
    );

    await waitFor(() => {
      expect(createSunInteractionViewportMock).toHaveBeenCalledWith(
        expect.any(HTMLDivElement),
        { mode: "background" },
      );
    });
    expect(createEditorItemPreviewViewportMock).not.toHaveBeenCalled();

    rerender(<EditorItemViewportPanel itemId="hud" presentation="stage" />);

    await waitFor(() => {
      expect(createSunInteractionViewportMock).toHaveBeenCalledWith(
        expect.any(HTMLDivElement),
        { mode: "hud" },
      );
    });
    expect(createEditorItemPreviewViewportMock).not.toHaveBeenCalled();

    rerender(<EditorItemViewportPanel itemId="orbits" presentation="stage" />);

    await waitFor(() => {
      expect(createSunInteractionViewportMock).toHaveBeenCalledWith(
        expect.any(HTMLDivElement),
        { mode: "orbits" },
      );
    });
    expect(createEditorItemPreviewViewportMock).not.toHaveBeenCalled();
  });

  it("uses the editor item preview viewport for black holes, neutron stars, turret, and rockets", async () => {
    const { rerender } = render(
      <EditorItemViewportPanel itemId="blackHole" presentation="stage" />,
    );

    await waitFor(() => {
      expect(createEditorItemPreviewViewportMock).toHaveBeenCalledWith(
        expect.any(HTMLDivElement),
        {
          itemId: "blackHole",
          presentation: "stage",
        },
      );
    });
    expect(createSunInteractionViewportMock).not.toHaveBeenCalled();

    rerender(
      <EditorItemViewportPanel itemId="neutronStars" presentation="stage" />,
    );
    await waitFor(() => {
      expect(createEditorItemPreviewViewportMock).toHaveBeenCalledWith(
        expect.any(HTMLDivElement),
        {
          itemId: "neutronStars",
          presentation: "stage",
        },
      );
    });
    expect(createSunInteractionViewportMock).not.toHaveBeenCalled();

    rerender(<EditorItemViewportPanel itemId="cannon" presentation="stage" />);
    await waitFor(() => {
      expect(createEditorItemPreviewViewportMock).toHaveBeenCalledWith(
        expect.any(HTMLDivElement),
        {
          itemId: "cannon",
          presentation: "stage",
        },
      );
    });
    expect(createSunInteractionViewportMock).not.toHaveBeenCalled();

    rerender(
      <EditorItemViewportPanel itemId="rocketLight" presentation="stage" />,
    );
    await waitFor(() => {
      expect(createEditorItemPreviewViewportMock).toHaveBeenCalledWith(
        expect.any(HTMLDivElement),
        {
          itemId: "rocketLight",
          presentation: "stage",
        },
      );
    });
    expect(createSunInteractionViewportMock).not.toHaveBeenCalled();

    rerender(
      <EditorItemViewportPanel itemId="rocketHeavy" presentation="stage" />,
    );
    await waitFor(() => {
      expect(createEditorItemPreviewViewportMock).toHaveBeenCalledWith(
        expect.any(HTMLDivElement),
        {
          itemId: "rocketHeavy",
          presentation: "stage",
        },
      );
    });
    expect(createSunInteractionViewportMock).not.toHaveBeenCalled();

    rerender(
      <EditorItemViewportPanel itemId="rocketSeeker" presentation="stage" />,
    );
    await waitFor(() => {
      expect(createEditorItemPreviewViewportMock).toHaveBeenCalledWith(
        expect.any(HTMLDivElement),
        {
          itemId: "rocketSeeker",
          presentation: "stage",
        },
      );
    });
    expect(createSunInteractionViewportMock).not.toHaveBeenCalled();
  });
});
