import { CURRENT_GAME_TUNING } from "@3body/shared";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorPreviewStage } from "./EditorPreviewStage";

const { combatHudSpy } = vi.hoisted(() => ({
  combatHudSpy: vi.fn(),
}));

vi.mock("./CombatHud", () => ({
  CombatHud: (props: { displayMode?: string }) => {
    combatHudSpy(props);
    return (
      <div
        data-testid="combat-hud"
        data-display-mode={props.displayMode ?? ""}
      />
    );
  },
}));

vi.mock("./EditorItemViewportPanel", () => ({
  EditorItemViewportPanel: (props: {
    itemId: string;
    presentation: "card" | "stage";
    revision?: number;
  }) => (
    <div
      data-testid="editor-item-viewport"
      data-item-id={props.itemId}
      data-presentation={props.presentation}
      data-revision={String(props.revision ?? 0)}
    />
  ),
}));

vi.mock("./ShowcaseViewportPanel", () => ({
  ShowcaseViewportPanel: (props: {
    displayMode?: string;
    focus: string;
    minimumWorldHeight?: number;
    revision?: number;
  }) => (
    <div
      data-display-mode={props.displayMode ?? ""}
      data-testid="showcase-viewport"
      data-focus={props.focus}
      data-minimum-world-height={String(props.minimumWorldHeight ?? "")}
      data-revision={String(props.revision ?? 0)}
    />
  ),
}));

describe("EditorPreviewStage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    combatHudSpy.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("routes the editor preview through the dedicated editor item viewport", () => {
    render(
      <EditorPreviewStage
        documentValue={CURRENT_GAME_TUNING}
        hudTuning={CURRENT_GAME_TUNING.visuals.hud}
        itemId="shield"
        showHud={false}
      />,
    );

    expect(screen.getByTestId("editor-item-viewport")).toHaveAttribute(
      "data-item-id",
      "shield",
    );
    expect(screen.getByTestId("editor-item-viewport")).toHaveAttribute(
      "data-presentation",
      "stage",
    );
    expect(screen.queryByTestId("combat-hud")).not.toBeInTheDocument();
  });

  it("routes overview through the showcase viewport and overlays the HUD", () => {
    render(
      <EditorPreviewStage
        documentValue={CURRENT_GAME_TUNING}
        hudTuning={CURRENT_GAME_TUNING.visuals.hud}
        itemId="overview"
        overviewDisplayMode="vhs"
        showHud={true}
      />,
    );

    expect(screen.getByTestId("showcase-viewport")).toHaveAttribute(
      "data-focus",
      "all",
    );
    expect(screen.getByTestId("showcase-viewport")).toHaveAttribute(
      "data-minimum-world-height",
      String(CURRENT_GAME_TUNING.gameplay.camera.previewCameraWorldHeight),
    );
    expect(screen.getByTestId("showcase-viewport")).toHaveAttribute(
      "data-display-mode",
      "vhs",
    );
    expect(screen.getByTestId("combat-hud")).toHaveAttribute(
      "data-display-mode",
      "vhs",
    );
  });

  it("renders the HUD page on top of the HUD interaction preview", () => {
    render(
      <EditorPreviewStage
        documentValue={CURRENT_GAME_TUNING}
        hudTuning={CURRENT_GAME_TUNING.visuals.hud}
        itemId="hud"
        showHud={true}
      />,
    );

    expect(screen.getByTestId("editor-item-viewport")).toHaveAttribute(
      "data-item-id",
      "hud",
    );
    expect(screen.getByTestId("editor-item-viewport")).toHaveAttribute(
      "data-presentation",
      "stage",
    );
    expect(screen.getByTestId("combat-hud")).toBeInTheDocument();
    expect(screen.queryByTestId("showcase-viewport")).not.toBeInTheDocument();
  });

  it("can trigger the HUD missile-hit preview from the HUD editor page", () => {
    render(
      <EditorPreviewStage
        documentValue={CURRENT_GAME_TUNING}
        hudTuning={CURRENT_GAME_TUNING.visuals.hud}
        itemId="hud"
        showHud={true}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Preview missile hit" }),
    );

    expect(combatHudSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        hud: expect.objectContaining({
          damageFlash: expect.any(Number),
          hudFlicker: expect.any(Number),
        }),
      }),
    );
    const latestHud = combatHudSpy.mock.lastCall?.[0].hud;
    expect(latestHud.damageFlash).toBeGreaterThan(0);
    expect(latestHud.hudFlicker).toBeGreaterThan(0);
  });

  it("bumps the viewport revision after non-HUD tuning changes", () => {
    const nextDocument = structuredClone(CURRENT_GAME_TUNING);
    nextDocument.visuals.background.baseColor = "#112233";

    const { rerender } = render(
      <EditorPreviewStage
        documentValue={CURRENT_GAME_TUNING}
        hudTuning={CURRENT_GAME_TUNING.visuals.hud}
        itemId="background"
        showHud={false}
      />,
    );

    expect(screen.getByTestId("editor-item-viewport")).toHaveAttribute(
      "data-revision",
      "0",
    );

    rerender(
      <EditorPreviewStage
        documentValue={nextDocument}
        hudTuning={nextDocument.visuals.hud}
        itemId="background"
        showHud={false}
      />,
    );

    expect(screen.getByTestId("editor-item-viewport")).toHaveAttribute(
      "data-revision",
      "0",
    );

    act(() => {
      vi.advanceTimersByTime(140);
    });

    expect(screen.getByTestId("editor-item-viewport")).toHaveAttribute(
      "data-revision",
      "1",
    );
  });

  it("preserves a pending viewport restart across same-signature rerenders", () => {
    const nextDocument = structuredClone(CURRENT_GAME_TUNING);
    nextDocument.visuals.background.starsEnabled = false;

    const { rerender } = render(
      <EditorPreviewStage
        documentValue={CURRENT_GAME_TUNING}
        hudTuning={CURRENT_GAME_TUNING.visuals.hud}
        itemId="background"
        showHud={false}
      />,
    );

    rerender(
      <EditorPreviewStage
        documentValue={nextDocument}
        hudTuning={nextDocument.visuals.hud}
        itemId="background"
        showHud={false}
      />,
    );

    rerender(
      <EditorPreviewStage
        documentValue={structuredClone(nextDocument)}
        hudTuning={nextDocument.visuals.hud}
        itemId="background"
        showHud={false}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(140);
    });

    expect(screen.getByTestId("editor-item-viewport")).toHaveAttribute(
      "data-revision",
      "1",
    );
  });

  it("does not restart the viewport for HUD-only tuning changes", () => {
    const nextDocument = structuredClone(CURRENT_GAME_TUNING);
    nextDocument.visuals.hud.panelBlurPx += 4;

    const { rerender } = render(
      <EditorPreviewStage
        documentValue={CURRENT_GAME_TUNING}
        hudTuning={CURRENT_GAME_TUNING.visuals.hud}
        itemId="overview"
        showHud={true}
      />,
    );

    rerender(
      <EditorPreviewStage
        documentValue={nextDocument}
        hudTuning={nextDocument.visuals.hud}
        itemId="overview"
        showHud={true}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(140);
    });

    expect(screen.getByTestId("showcase-viewport")).toHaveAttribute(
      "data-revision",
      "0",
    );
  });
});
