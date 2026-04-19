import { CURRENT_GAME_TUNING, DEFAULT_GAME_TUNING } from "@3body/shared";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditPage } from "./EditPage";
import { applyRuntimeTuningDocument } from "./game/runtimeTuning";

const { editGameViewportPanelMock, editorPreviewStageMock } = vi.hoisted(
  () => ({
    editGameViewportPanelMock: vi.fn(),
    editorPreviewStageMock: vi.fn(),
  }),
);

type EditorPreviewStageProps = {
  documentValue: typeof CURRENT_GAME_TUNING;
  externalRevision?: number;
  itemId: string;
  showHud: boolean;
};

vi.mock("./EditorPreviewStage", () => ({
  EditorPreviewStage: (props: EditorPreviewStageProps) => {
    editorPreviewStageMock(props);
    return (
      <div
        data-testid="editor-preview-stage"
        data-item-id={props.itemId}
        data-preview-revision={String(props.externalRevision ?? 0)}
        data-show-hud={String(props.showHud)}
      />
    );
  },
}));

vi.mock("./EditGameViewportPanel", () => ({
  EditGameViewportPanel: (props: {
    sandboxSessionConfig?: {
      botDifficulty?: string;
      participantCount?: number;
    };
  }) => {
    editGameViewportPanelMock(props);
    return (
      <div
        data-testid="edit-game-viewport-panel"
        data-bot-difficulty={props.sandboxSessionConfig?.botDifficulty ?? ""}
        data-participant-count={String(
          props.sandboxSessionConfig?.participantCount ?? "",
        )}
      />
    );
  },
}));

describe("EditPage", () => {
  const FIRST_SUN_LABEL = "Auric";
  const fetchMock = vi.fn();
  const getLastEditorPreviewStageProps = () =>
    editorPreviewStageMock.mock.lastCall?.[0] as
      | EditorPreviewStageProps
      | undefined;

  const mockTuningFetch = (
    initialDocument: typeof CURRENT_GAME_TUNING = CURRENT_GAME_TUNING,
  ) => {
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const path = String(input);
      const document =
        method === "PUT" && path === "/api/editor/tuning"
          ? (JSON.parse(String(init?.body)) as typeof CURRENT_GAME_TUNING)
          : initialDocument;

      return new Response(JSON.stringify(document), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    });
  };

  beforeEach(() => {
    fetchMock.mockReset();
    editGameViewportPanelMock.mockReset();
    editorPreviewStageMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    applyRuntimeTuningDocument(CURRENT_GAME_TUNING);
    window.history.pushState({}, "", "/edit");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders turret controls and saves cannon tuning changes", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    expect(
      screen.queryByRole("button", { name: /^Drone$/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Turret/i }));

    const stemLengthInput = await screen.findByLabelText("Stem length");
    expect(stemLengthInput).toHaveValue(
      CURRENT_GAME_TUNING.visuals.cannon.stemLength,
    );
    expect(screen.getByLabelText("Flash duration")).toHaveValue(
      CURRENT_GAME_TUNING.visuals.cannon.flashDurationSec,
    );

    fireEvent.change(stemLengthInput, { target: { value: "7" } });
    fireEvent.blur(stemLengthInput);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const saveCall = fetchMock.mock.calls[1];
    expect(saveCall?.[0]).toBe("/api/editor/tuning");
    expect(saveCall?.[1]).toMatchObject({
      method: "PUT",
    });
    expect(
      JSON.parse(String((saveCall?.[1] as RequestInit | undefined)?.body)),
    ).toMatchObject({
      visuals: {
        cannon: {
          stemLength: 7,
        },
      },
    });
    expect(
      JSON.parse(String((saveCall?.[1] as RequestInit | undefined)?.body)),
    ).not.toHaveProperty("visuals.drone");
    expect(
      JSON.parse(String((saveCall?.[1] as RequestInit | undefined)?.body)),
    ).not.toHaveProperty("gameplay.drone");
  });

  it("does not render a turret-only planet size control", async () => {
    mockTuningFetch();
    window.history.pushState({}, "", "/edit?item=turret");

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    expect(screen.getByTestId("editor-preview-stage")).toHaveAttribute(
      "data-item-id",
      "cannon",
    );
    expect(screen.queryByLabelText("Planet size")).not.toBeInTheDocument();
  });

  it("renders missile scale controls and saves rocket visual scale changes", async () => {
    mockTuningFetch();
    window.history.pushState({}, "", "/edit?item=rocketlight");

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    expect(screen.getByTestId("editor-preview-stage")).toHaveAttribute(
      "data-item-id",
      "rocketLight",
    );

    const scaleInput = await screen.findByLabelText("Scale");
    expect(scaleInput).toHaveValue(
      CURRENT_GAME_TUNING.visuals.rockets.light.scale,
    );

    fireEvent.change(scaleInput, { target: { value: "1.8" } });
    fireEvent.blur(scaleInput);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const saveCall = fetchMock.mock.calls[1];
    expect(saveCall?.[0]).toBe("/api/editor/tuning");
    expect(saveCall?.[1]).toMatchObject({
      method: "PUT",
    });
    expect(
      JSON.parse(String((saveCall?.[1] as RequestInit | undefined)?.body)),
    ).toMatchObject({
      visuals: {
        rockets: {
          light: {
            scale: 1.8,
          },
        },
      },
    });
  });

  it("reads the selected edit item from the query param", async () => {
    mockTuningFetch();
    window.history.pushState({}, "", "/edit?item=turret");

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    expect(screen.getByTestId("editor-preview-stage")).toHaveAttribute(
      "data-item-id",
      "cannon",
    );
    expect(await screen.findByLabelText("Stem length")).toHaveValue(
      CURRENT_GAME_TUNING.visuals.cannon.stemLength,
    );
  });

  it("supports the neutron query alias", async () => {
    mockTuningFetch();
    window.history.pushState({}, "", "/edit?item=neutron");

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    expect(screen.getByTestId("editor-preview-stage")).toHaveAttribute(
      "data-item-id",
      "neutronStars",
    );
    expect(await screen.findByLabelText("Neutron star count")).toHaveValue(
      CURRENT_GAME_TUNING.gameplay.neutronStars.count,
    );
  });

  it("syncs the selected edit item into the query param", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(screen.getByRole("button", { name: /Turret/i }));
    expect(window.location.pathname).toBe("/edit");
    expect(window.location.search).toBe("?item=turret");

    fireEvent.click(screen.getByRole("button", { name: /Shield/i }));
    expect(window.location.search).toBe("?item=shield");
    expect(screen.getByTestId("editor-preview-stage")).toHaveAttribute(
      "data-item-id",
      "shield",
    );
  });

  it("syncs the neutron stars item into the canonical query param", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(screen.getByRole("button", { name: /Neutron Stars/i }));

    expect(window.location.pathname).toBe("/edit");
    expect(window.location.search).toBe("?item=neutron");
    expect(screen.getByTestId("editor-preview-stage")).toHaveAttribute(
      "data-item-id",
      "neutronStars",
    );
  });

  it("renders the AI gameplay view and syncs its sandbox controls", async () => {
    mockTuningFetch();
    window.history.pushState({}, "", "/edit?item=ai-gameplay");

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    expect(screen.getByTestId("edit-game-viewport-panel")).toHaveAttribute(
      "data-bot-difficulty",
      "normal",
    );
    expect(screen.getByTestId("edit-game-viewport-panel")).toHaveAttribute(
      "data-participant-count",
      "7",
    );
    expect(screen.getByRole("button", { name: /^Pause$/i })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /^Play$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Fullscreen$/i }),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText("AI pilots")).toHaveValue(7);

    fireEvent.change(screen.getByLabelText("AI pilots"), {
      target: { value: "5" },
    });
    fireEvent.blur(screen.getByLabelText("AI pilots"));
    fireEvent.change(screen.getByLabelText("Difficulty"), {
      target: { value: "hard" },
    });

    expect(screen.getByTestId("edit-game-viewport-panel")).toHaveAttribute(
      "data-bot-difficulty",
      "hard",
    );
    expect(screen.getByTestId("edit-game-viewport-panel")).toHaveAttribute(
      "data-participant-count",
      "5",
    );
    expect(window.location.search).toBe("?item=ai-gameplay");
  });

  it("toggles AI gameplay fullscreen mode from the inspector action", async () => {
    mockTuningFetch();
    window.history.pushState({}, "", "/edit?item=ai-gameplay");

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    const previewStage = screen.getByTestId("ai-gameplay-preview-stage");
    let fullscreenElement: Element | null = null;
    const requestFullscreenMock = vi.fn(async () => {
      fullscreenElement = previewStage;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    const exitFullscreenMock = vi.fn(async () => {
      fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: exitFullscreenMock,
    });
    Object.defineProperty(previewStage, "requestFullscreen", {
      configurable: true,
      value: requestFullscreenMock,
    });

    fireEvent.click(screen.getByRole("button", { name: /^Fullscreen$/i }));

    await waitFor(() => {
      expect(requestFullscreenMock).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.getAllByRole("button", { name: /^Exit fullscreen$/i }).length,
    ).toBeGreaterThan(0);

    fireEvent.click(
      screen.getAllByRole("button", { name: /^Exit fullscreen$/i })[0]!,
    );

    await waitFor(() => {
      expect(exitFullscreenMock).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.getByRole("button", { name: /^Fullscreen$/i }),
    ).toBeInTheDocument();
  });

  it("does not exit fullscreen when AI gameplay preview is not mounted", async () => {
    mockTuningFetch();
    window.history.pushState({}, "", "/edit?item=background");

    const exitFullscreenMock = vi.fn(async () => {});
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => null,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: exitFullscreenMock,
    });

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    expect(exitFullscreenMock).not.toHaveBeenCalled();
  });

  it("keeps the AI sandbox config stable across fullscreen state rerenders", async () => {
    mockTuningFetch();
    window.history.pushState({}, "", "/edit?item=ai-gameplay");

    let fullscreenElement: Element | null = null;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    const initialSandboxConfig =
      editGameViewportPanelMock.mock.lastCall?.[0]?.sandboxSessionConfig;
    const previewStage = screen.getByTestId("ai-gameplay-preview-stage");
    fullscreenElement = previewStage;
    document.dispatchEvent(new Event("fullscreenchange"));

    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: /^Exit fullscreen$/i }).length,
      ).toBeGreaterThan(0);
    });

    expect(
      editGameViewportPanelMock.mock.lastCall?.[0]?.sandboxSessionConfig,
    ).toBe(initialSandboxConfig);
  });

  it("updates the selected item from history navigation on /edit", async () => {
    mockTuningFetch();
    window.history.pushState({}, "", "/edit?item=background");

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    expect(screen.getByTestId("editor-preview-stage")).toHaveAttribute(
      "data-item-id",
      "background",
    );

    window.history.pushState({}, "", "/edit?item=shield");
    window.dispatchEvent(new PopStateEvent("popstate"));

    await waitFor(() => {
      expect(screen.getByTestId("editor-preview-stage")).toHaveAttribute(
        "data-item-id",
        "shield",
      );
    });
  });

  it("renders all cache variants in the caches selector preview", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    const cacheButton = screen.getByRole("button", { name: /Caches/i });
    expect(
      cacheButton.querySelectorAll(".edit-object-preview__cache-chip"),
    ).toHaveLength(7);
  });

  it("explains cache effects in the cache inspector", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(screen.getByRole("button", { name: /Caches/i }));

    expect(
      await screen.findByText(
        /Press G to emit a pulse that blasts planets, rockets, and caches within its blast radius away from your planet\./i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Press C to hide your trail for 5 seconds\./i),
    ).toBeInTheDocument();
  });

  it("renders a stable editable badge size in the cache inspector", async () => {
    const customDocument = {
      ...CURRENT_GAME_TUNING,
      visuals: {
        ...CURRENT_GAME_TUNING.visuals,
        caches: {
          ...CURRENT_GAME_TUNING.visuals.caches,
          badgeBaseSize: 79,
          badgeScale: 50 / (79 * 0.95),
        },
      },
    };
    mockTuningFetch(customDocument);

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(screen.getByRole("button", { name: /Caches/i }));

    const badgeSizeInput = await screen.findByLabelText("Badge size");
    expect(badgeSizeInput).toHaveValue(50);

    fireEvent.change(badgeSizeInput, { target: { value: "20" } });
    expect(badgeSizeInput).toHaveValue(20);

    fireEvent.blur(badgeSizeInput);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const saveCall = fetchMock.mock.calls[1];
    const body = JSON.parse(
      String((saveCall?.[1] as RequestInit | undefined)?.body),
    ) as typeof CURRENT_GAME_TUNING;
    expect(body.visuals.caches.badgeBaseSize).toBe(Math.round(20 / 0.95));
    expect(body.visuals.caches.badgeScale).toBe(1);
  });

  it("saves large badge sizes directly for sandbox rendering", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(screen.getByRole("button", { name: /Caches/i }));

    const badgeSizeInput = await screen.findByLabelText("Badge size");
    fireEvent.change(badgeSizeInput, { target: { value: "300" } });
    fireEvent.blur(badgeSizeInput);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const saveCall = fetchMock.mock.calls[1];
    const body = JSON.parse(
      String((saveCall?.[1] as RequestInit | undefined)?.body),
    ) as typeof CURRENT_GAME_TUNING;
    expect(body.visuals.caches.badgeBaseSize).toBe(Math.round(300 / 0.95));
    expect(body.visuals.caches.badgeScale).toBe(1);
  });

  it("renders gravity pulse and cloak in the abilities editor group", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(screen.getByRole("button", { name: /Gravity Pulse/i }));

    expect(screen.getByTestId("editor-preview-stage")).toHaveAttribute(
      "data-item-id",
      "gravityPulse",
    );
    expect(await screen.findByLabelText("Blast radius")).toHaveValue(
      CURRENT_GAME_TUNING.gameplay.abilities.gravityPulse.radius,
    );
    expect(screen.getByLabelText("Blast force")).toHaveValue(
      CURRENT_GAME_TUNING.gameplay.abilities.gravityPulse.force,
    );
    expect(
      screen.getByText(/within its blast radius away from you/i),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /CloakWildcard concealment/i }),
    );

    expect(screen.getByTestId("editor-preview-stage")).toHaveAttribute(
      "data-item-id",
      "cloak",
    );
    expect(await screen.findByText(/hiding its trail/i)).toBeInTheDocument();
  });

  it("renders background controls and saves backdrop tuning changes", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(screen.getByRole("button", { name: /Background/i }));

    const baseColorInput = await screen.findByLabelText("Base color");
    expect(baseColorInput).toHaveValue(
      CURRENT_GAME_TUNING.visuals.background.baseColor,
    );
    expect(screen.getByLabelText("Star density")).toHaveValue(
      CURRENT_GAME_TUNING.visuals.background.starDensity,
    );
    expect(
      screen.queryByLabelText("Neutron star count"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Moving Objects")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Enable movers")).not.toBeInTheDocument();

    fireEvent.change(baseColorInput, { target: { value: "#112233" } });
    fireEvent.blur(baseColorInput);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const saveCall = fetchMock.mock.calls[1];
    expect(saveCall?.[0]).toBe("/api/editor/tuning");
    expect(saveCall?.[1]).toMatchObject({
      method: "PUT",
    });
    expect(
      JSON.parse(String((saveCall?.[1] as RequestInit | undefined)?.body)),
    ).toMatchObject({
      visuals: {
        background: {
          baseColor: "#112233",
        },
      },
    });
  });

  it("renders numeric editor inputs without min or max attributes", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(screen.getByRole("button", { name: /Background/i }));

    const spinbuttons = await screen.findAllByRole("spinbutton");
    expect(spinbuttons.length).toBeGreaterThan(0);
    for (const input of spinbuttons) {
      expect(input).not.toHaveAttribute("min");
      expect(input).not.toHaveAttribute("max");
    }
  });

  it("defers color preview updates until blur", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(screen.getByRole("button", { name: /Background/i }));

    const baseColorInput = await screen.findByLabelText("Base color");
    fireEvent.change(baseColorInput, { target: { value: "#112233" } });

    expect(
      getLastEditorPreviewStageProps()?.documentValue.visuals.background
        .baseColor,
    ).toBe(CURRENT_GAME_TUNING.visuals.background.baseColor);

    fireEvent.blur(baseColorInput);

    await waitFor(() => {
      expect(getLastEditorPreviewStageProps()?.itemId).toBe("background");
      expect(
        getLastEditorPreviewStageProps()?.documentValue.visuals.background
          .baseColor,
      ).toBe("#112233");
    });
  });

  it("defers numeric preview updates until blur or Enter", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(screen.getByRole("button", { name: /Background/i }));

    const starBrightnessInput = await screen.findByLabelText("Star brightness");

    fireEvent.change(starBrightnessInput, { target: { value: "0.77" } });

    expect(
      getLastEditorPreviewStageProps()?.documentValue.visuals.background
        .starBrightness,
    ).toBe(CURRENT_GAME_TUNING.visuals.background.starBrightness);

    fireEvent.blur(starBrightnessInput);

    await waitFor(() => {
      expect(
        getLastEditorPreviewStageProps()?.documentValue.visuals.background
          .starBrightness,
      ).toBe(0.77);
    });

    fireEvent.change(starBrightnessInput, { target: { value: "0.91" } });

    expect(
      getLastEditorPreviewStageProps()?.documentValue.visuals.background
        .starBrightness,
    ).toBe(0.77);

    fireEvent.keyDown(starBrightnessInput, {
      key: "Enter",
    });

    await waitFor(() => {
      expect(
        getLastEditorPreviewStageProps()?.documentValue.visuals.background
          .starBrightness,
      ).toBe(0.91);
    });
  });

  it("syncs background section resets into the preview stage document", async () => {
    const customDocument = structuredClone(CURRENT_GAME_TUNING);
    customDocument.visuals.background.starDensity = 2.35;
    customDocument.visuals.background.starBrightness = 0.42;
    customDocument.visuals.background.starSize = 2.1;
    customDocument.visuals.background.starTwinkleEnabled = false;
    mockTuningFetch(customDocument);

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(screen.getByRole("button", { name: /Background/i }));

    expect(await screen.findByLabelText("Star density")).toHaveValue(2.35);
    expect(screen.getByLabelText("Enable twinkle")).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Reset Stars" }));

    await waitFor(() => {
      expect(getLastEditorPreviewStageProps()?.itemId).toBe("background");
      expect(
        getLastEditorPreviewStageProps()?.documentValue.visuals.background
          .starDensity,
      ).toBe(CURRENT_GAME_TUNING.visuals.background.starDensity);
      expect(
        getLastEditorPreviewStageProps()?.documentValue.visuals.background
          .starBrightness,
      ).toBe(CURRENT_GAME_TUNING.visuals.background.starBrightness);
      expect(
        getLastEditorPreviewStageProps()?.documentValue.visuals.background
          .starSize,
      ).toBe(CURRENT_GAME_TUNING.visuals.background.starSize);
      expect(
        getLastEditorPreviewStageProps()?.documentValue.visuals.background
          .starTwinkleEnabled,
      ).toBe(CURRENT_GAME_TUNING.visuals.background.starTwinkleEnabled);
    });
  });

  it("renders neutron star controls and saves neutron-star gameplay changes", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(screen.getByRole("button", { name: /Neutron Stars/i }));

    const countInput = await screen.findByLabelText("Neutron star count");
    expect(countInput).toHaveValue(
      CURRENT_GAME_TUNING.gameplay.neutronStars.count,
    );
    expect(screen.getByLabelText("Min mass (kg)")).toHaveValue(
      CURRENT_GAME_TUNING.gameplay.neutronStars.minMassKg,
    );
    expect(
      screen.getByLabelText("Randomize position inside playable circle"),
    ).toBeChecked();
    expect(screen.getByLabelText("Halo scale")).toHaveValue(
      CURRENT_GAME_TUNING.visuals.neutronStars.haloScale,
    );

    fireEvent.change(countInput, { target: { value: "3" } });
    fireEvent.blur(countInput);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(screen.getByTestId("editor-preview-stage")).toHaveAttribute(
      "data-item-id",
      "neutronStars",
    );

    const saveCall = fetchMock.mock.calls[1];
    expect(
      JSON.parse(String((saveCall?.[1] as RequestInit | undefined)?.body)),
    ).toMatchObject({
      gameplay: {
        neutronStars: {
          count: 3,
        },
      },
    });
  });

  it("saves neutron-star visual changes", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(screen.getByRole("button", { name: /Neutron Stars/i }));

    const haloScaleInput = await screen.findByLabelText("Halo scale");
    const jetOpacityInput = screen.getByLabelText("Jet opacity");

    fireEvent.change(haloScaleInput, { target: { value: "3.75" } });
    fireEvent.blur(haloScaleInput);
    fireEvent.change(jetOpacityInput, { target: { value: "0.42" } });
    fireEvent.blur(jetOpacityInput);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    const saveCall = fetchMock.mock.calls.at(-1);
    expect(
      JSON.parse(String((saveCall?.[1] as RequestInit | undefined)?.body)),
    ).toMatchObject({
      visuals: {
        neutronStars: {
          haloScale: 3.75,
          jetOpacity: 0.42,
        },
      },
    });
  });

  it("saves uncapped neutron star sizes", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(screen.getByRole("button", { name: /Neutron Stars/i }));

    const minSizeInput = await screen.findByLabelText("Min size");
    const maxSizeInput = screen.getByLabelText("Max size");

    expect(minSizeInput).toHaveValue(
      CURRENT_GAME_TUNING.gameplay.neutronStars.minSize,
    );
    expect(maxSizeInput).toHaveValue(
      CURRENT_GAME_TUNING.gameplay.neutronStars.maxSize,
    );
    expect(minSizeInput).not.toHaveAttribute("max");
    expect(maxSizeInput).not.toHaveAttribute("max");

    fireEvent.change(minSizeInput, { target: { value: "320" } });
    fireEvent.blur(minSizeInput);
    fireEvent.change(maxSizeInput, { target: { value: "420" } });
    fireEvent.blur(maxSizeInput);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    const saveCall = fetchMock.mock.calls.at(-1);
    const savedDocument = JSON.parse(
      String((saveCall?.[1] as RequestInit | undefined)?.body),
    ) as typeof CURRENT_GAME_TUNING;

    expect(savedDocument.gameplay.neutronStars.minSize).toBe(320);
    expect(savedDocument.gameplay.neutronStars.maxSize).toBe(420);
  });

  it("saves uncapped neutron star masses", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(screen.getByRole("button", { name: /Neutron Stars/i }));

    const minMassInput = await screen.findByLabelText("Min mass (kg)");
    const maxMassInput = screen.getByLabelText("Max mass (kg)");

    fireEvent.change(minMassInput, { target: { value: "2500" } });
    fireEvent.blur(minMassInput);
    fireEvent.change(maxMassInput, { target: { value: "2400000" } });
    fireEvent.blur(maxMassInput);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    const saveCall = fetchMock.mock.calls.at(-1);
    const savedDocument = JSON.parse(
      String((saveCall?.[1] as RequestInit | undefined)?.body),
    ) as typeof CURRENT_GAME_TUNING;

    expect(savedDocument.gameplay.neutronStars.minMassKg).toBe(2500);
    expect(savedDocument.gameplay.neutronStars.maxMassKg).toBe(2400000);
  });

  it("resets the selected background scope back to defaults", async () => {
    const customDocument = structuredClone(CURRENT_GAME_TUNING);
    customDocument.visuals.background.baseColor = "#112233";
    customDocument.visuals.background.starsEnabled = false;
    customDocument.visuals.background.nebulaStrength = 0.9;
    customDocument.gameplay.neutronStars.count = 2;
    mockTuningFetch(customDocument);

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(screen.getByRole("button", { name: /Background/i }));

    expect(await screen.findByLabelText("Base color")).toHaveValue("#112233");
    expect(screen.getByLabelText("Enable stars")).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: /Reset item/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const saveCall = fetchMock.mock.calls[1];
    expect(
      JSON.parse(String((saveCall?.[1] as RequestInit | undefined)?.body)),
    ).toMatchObject({
      gameplay: {
        neutronStars: {
          count: 2,
        },
      },
      visuals: {
        background: {
          baseColor: CURRENT_GAME_TUNING.visuals.background.baseColor,
          nebulaStrength: CURRENT_GAME_TUNING.visuals.background.nebulaStrength,
          starsEnabled: CURRENT_GAME_TUNING.visuals.background.starsEnabled,
        },
      },
    });
  });

  it("resets the selected neutron star scope back to defaults", async () => {
    const customDocument = structuredClone(CURRENT_GAME_TUNING);
    customDocument.gameplay.neutronStars.count = 3;
    customDocument.gameplay.neutronStars.minMassKg = 240000;
    customDocument.gameplay.neutronStars.maxSize = 144;
    customDocument.gameplay.neutronStars.randomizePositionInsidePlayableCircle = false;
    customDocument.visuals.neutronStars.haloScale = 4.8;
    customDocument.visuals.neutronStars.jetOpacity = 0.33;
    mockTuningFetch(customDocument);

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(screen.getByRole("button", { name: /Neutron Stars/i }));

    expect(await screen.findByLabelText("Neutron star count")).toHaveValue(3);
    expect(
      screen.getByLabelText("Randomize position inside playable circle"),
    ).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: /Reset item/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const saveCall = fetchMock.mock.calls[1];
    expect(
      JSON.parse(String((saveCall?.[1] as RequestInit | undefined)?.body)),
    ).toMatchObject({
      gameplay: {
        neutronStars: {
          count: CURRENT_GAME_TUNING.gameplay.neutronStars.count,
          maxSize: CURRENT_GAME_TUNING.gameplay.neutronStars.maxSize,
          minMassKg: CURRENT_GAME_TUNING.gameplay.neutronStars.minMassKg,
          randomizePositionInsidePlayableCircle:
            CURRENT_GAME_TUNING.gameplay.neutronStars
              .randomizePositionInsidePlayableCircle,
        },
      },
      visuals: {
        neutronStars: {
          haloScale: CURRENT_GAME_TUNING.visuals.neutronStars.haloScale,
          jetOpacity: CURRENT_GAME_TUNING.visuals.neutronStars.jetOpacity,
        },
      },
    });
  });

  it("renders orbit controls and saves orbit tuning changes", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(
      screen.getByRole("button", { name: /OrbitsOrbit seed tuning/i }),
    );

    const sunSection = await screen.findByText(FIRST_SUN_LABEL);
    const sunFields = within(sunSection.closest("details")!);
    const massInput = sunFields.getByLabelText("Mass");
    expect(massInput).toHaveValue(
      CURRENT_GAME_TUNING.gameplay.orbits.suns[0]!.mass,
    );
    expect(sunFields.getByLabelText("Start X")).toHaveValue(
      CURRENT_GAME_TUNING.gameplay.orbits.suns[0]!.pos.x,
    );

    fireEvent.change(massInput, { target: { value: "160000" } });
    fireEvent.blur(massInput);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const saveCall = fetchMock.mock.calls[1];
    const savedDocument = JSON.parse(
      String((saveCall?.[1] as RequestInit | undefined)?.body),
    ) as typeof CURRENT_GAME_TUNING;
    expect(savedDocument.gameplay.orbits.suns[0]!.mass).toBe(160000);
  });

  it("saves uncapped orbit planet circle radius", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(
      screen.getByRole("button", { name: /OrbitsOrbit seed tuning/i }),
    );

    const circleRadiusInput = await screen.findByLabelText(
      "Planet Orbit Radius",
    );
    expect(circleRadiusInput).not.toHaveAttribute("max");
    fireEvent.change(circleRadiusInput, { target: { value: "7200" } });
    fireEvent.blur(circleRadiusInput);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const saveCall = fetchMock.mock.calls[1];
    const savedDocument = JSON.parse(
      String((saveCall?.[1] as RequestInit | undefined)?.body),
    ) as typeof CURRENT_GAME_TUNING;

    expect(savedDocument.gameplay.orbits.planetCircleRadius).toBe(7200);
  });

  it("saves uncapped orbit sun start distance scale", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(
      screen.getByRole("button", { name: /OrbitsOrbit seed tuning/i }),
    );

    const distanceScaleInput = await screen.findByLabelText(
      "Start distance scale",
    );
    expect(distanceScaleInput).toHaveValue(
      CURRENT_GAME_TUNING.gameplay.orbits.sunStartDistanceScale,
    );
    expect(distanceScaleInput).not.toHaveAttribute("max");
    expect(
      screen.queryByLabelText("Start velocity scale"),
    ).not.toBeInTheDocument();

    fireEvent.change(distanceScaleInput, { target: { value: "4.2" } });
    fireEvent.blur(distanceScaleInput);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const saveCall = fetchMock.mock.calls[1];
    const savedDocument = JSON.parse(
      String((saveCall?.[1] as RequestInit | undefined)?.body),
    ) as typeof CURRENT_GAME_TUNING;

    expect(savedDocument.gameplay.orbits.sunStartDistanceScale).toBe(4.2);
  });

  it("saves uncapped orbit sun radius", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(
      screen.getByRole("button", { name: /OrbitsOrbit seed tuning/i }),
    );

    const sunSection = await screen.findByText(FIRST_SUN_LABEL);
    const sunFields = within(sunSection.closest("details")!);
    const radiusInput = sunFields.getByLabelText("Radius");

    expect(radiusInput).toHaveValue(
      CURRENT_GAME_TUNING.gameplay.orbits.suns[0]!.radius,
    );
    expect(radiusInput).not.toHaveAttribute("max");

    fireEvent.change(radiusInput, { target: { value: "1200" } });
    fireEvent.blur(radiusInput);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const saveCall = fetchMock.mock.calls.at(-1);
    const savedDocument = JSON.parse(
      String((saveCall?.[1] as RequestInit | undefined)?.body),
    ) as typeof CURRENT_GAME_TUNING;

    expect(savedDocument.gameplay.orbits.suns[0]!.radius).toBe(1200);
  });

  it("saves uncapped orbit boundary debris controls", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(
      screen.getByRole("button", { name: /OrbitsOrbit seed tuning/i }),
    );

    const densityInput = await screen.findByLabelText("Debris density");
    const speedInput = screen.getByLabelText("Debris speed");
    const largeRockScaleInput = screen.getByLabelText("Large rock scale");
    const smallRockScaleInput = screen.getByLabelText("Small rock scale");
    const dustSizeInput = screen.getByLabelText("Dust size");
    const thicknessInput = screen.getByLabelText("Thickness");

    expect(densityInput).toHaveValue(
      CURRENT_GAME_TUNING.visuals.orbits.boundaryDebris.density,
    );
    expect(speedInput).toHaveValue(
      CURRENT_GAME_TUNING.visuals.orbits.boundaryDebris.speed,
    );
    expect(largeRockScaleInput).toHaveValue(
      CURRENT_GAME_TUNING.visuals.orbits.boundaryDebris.largeRockScale,
    );
    expect(smallRockScaleInput).toHaveValue(
      CURRENT_GAME_TUNING.visuals.orbits.boundaryDebris.smallRockScale,
    );
    expect(dustSizeInput).toHaveValue(
      CURRENT_GAME_TUNING.visuals.orbits.boundaryDebris.dustSize,
    );
    expect(thicknessInput).toHaveValue(
      CURRENT_GAME_TUNING.visuals.orbits.boundaryDebris.thickness,
    );
    expect(densityInput).not.toHaveAttribute("max");
    expect(speedInput).not.toHaveAttribute("max");
    expect(largeRockScaleInput).not.toHaveAttribute("max");
    expect(smallRockScaleInput).not.toHaveAttribute("max");
    expect(dustSizeInput).not.toHaveAttribute("max");
    expect(thicknessInput).not.toHaveAttribute("max");

    fireEvent.change(densityInput, { target: { value: "7.5" } });
    fireEvent.blur(densityInput);
    fireEvent.change(speedInput, { target: { value: "8.25" } });
    fireEvent.blur(speedInput);
    fireEvent.change(largeRockScaleInput, { target: { value: "6.5" } });
    fireEvent.blur(largeRockScaleInput);
    fireEvent.change(smallRockScaleInput, { target: { value: "5.75" } });
    fireEvent.blur(smallRockScaleInput);
    fireEvent.change(dustSizeInput, { target: { value: "18" } });
    fireEvent.blur(dustSizeInput);
    fireEvent.change(thicknessInput, { target: { value: "10000" } });
    fireEvent.blur(thicknessInput);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(7);
    });

    const saveCall = fetchMock.mock.calls.at(-1);
    const savedDocument = JSON.parse(
      String((saveCall?.[1] as RequestInit | undefined)?.body),
    ) as typeof CURRENT_GAME_TUNING;

    expect(savedDocument.visuals.orbits.boundaryDebris.density).toBe(7.5);
    expect(savedDocument.visuals.orbits.boundaryDebris.speed).toBe(8.25);
    expect(savedDocument.visuals.orbits.boundaryDebris.largeRockScale).toBe(
      6.5,
    );
    expect(savedDocument.visuals.orbits.boundaryDebris.smallRockScale).toBe(
      5.75,
    );
    expect(savedDocument.visuals.orbits.boundaryDebris.dustSize).toBe(18);
    expect(savedDocument.visuals.orbits.boundaryDebris.thickness).toBe(10000);
  });

  it("resets only the selected planet panel", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(screen.getByRole("button", { name: /Planets/i }));

    const terraDetails = screen.getByText("Terra").closest("details");
    expect(terraDetails).not.toBeNull();
    const terraScope = within(terraDetails as HTMLElement);
    const terraForestCoverageInput =
      terraScope.getByLabelText("Forest coverage");

    fireEvent.change(terraForestCoverageInput, { target: { value: "1.23" } });
    fireEvent.blur(terraForestCoverageInput);

    const ignisSummary = screen.getByText("Ignis").closest("summary");
    expect(ignisSummary).not.toBeNull();
    fireEvent.click(ignisSummary as HTMLElement);

    const ignisDetails = screen.getByText("Ignis").closest("details");
    expect(ignisDetails).not.toBeNull();
    const ignisScope = within(ignisDetails as HTMLElement);
    const ignisMountainHeightInput =
      ignisScope.getByLabelText("Mountain height");

    fireEvent.change(ignisMountainHeightInput, { target: { value: "2.22" } });
    fireEvent.blur(ignisMountainHeightInput);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    const resetTerraButton = terraScope.getByRole("button", {
      name: /Reset Terra/i,
    });
    await waitFor(() => {
      expect(resetTerraButton).toBeEnabled();
    });

    fireEvent.click(resetTerraButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    const saveCall = fetchMock.mock.calls.at(-1);
    const savedDocument = JSON.parse(
      String((saveCall?.[1] as RequestInit | undefined)?.body),
    ) as typeof CURRENT_GAME_TUNING;

    expect(savedDocument.visuals.planets.archetypes.terra).toEqual(
      DEFAULT_GAME_TUNING.visuals.planets.archetypes.terra,
    );
    expect(savedDocument.visuals.planets.archetypes.ignis.mountainHeight).toBe(
      2.22,
    );
  });

  it("saves uncapped planet body scale", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(screen.getByRole("button", { name: /Planets/i }));

    const terraDetails = screen.getByText("Terra").closest("details");
    expect(terraDetails).not.toBeNull();
    const terraScope = within(terraDetails as HTMLElement);
    const bodyScaleInput = terraScope.getByLabelText("Body scale");

    fireEvent.change(bodyScaleInput, { target: { value: "12.5" } });
    fireEvent.blur(bodyScaleInput);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const saveCall = fetchMock.mock.calls.at(-1);
    const savedDocument = JSON.parse(
      String((saveCall?.[1] as RequestInit | undefined)?.body),
    ) as typeof CURRENT_GAME_TUNING;

    expect(savedDocument.visuals.planets.archetypes.terra.bodyScale).toBe(12.5);
  });

  it("renders arena controls and saves arena tuning changes", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(
      screen.getByRole("button", { name: /OrbitsOrbit seed tuning/i }),
    );

    const arenaRadiusInput = await screen.findByLabelText("Arena radius");
    const instantDeathInput = screen.getByLabelText(
      "Instant death outside arena",
    );

    expect(arenaRadiusInput).toHaveValue(
      CURRENT_GAME_TUNING.gameplay.arena.radius,
    );
    expect(arenaRadiusInput).not.toHaveAttribute("min");
    expect(arenaRadiusInput).not.toHaveAttribute("max");
    expect(instantDeathInput).toBeChecked();

    fireEvent.change(arenaRadiusInput, { target: { value: "12000" } });
    fireEvent.blur(arenaRadiusInput);
    fireEvent.click(instantDeathInput);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    const saveCall = fetchMock.mock.calls.at(-1);
    expect(
      JSON.parse(String((saveCall?.[1] as RequestInit | undefined)?.body)),
    ).toMatchObject({
      gameplay: {
        arena: {
          instantDeath: false,
          radius: 12000,
        },
      },
    });
  });

  it("renders per-sun controls and saves sun tuning changes", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(
      screen.getByRole("button", { name: /SunsPer-sun size and glow/i }),
    );

    const sunSection = await screen.findByText(FIRST_SUN_LABEL);
    const sunFields = within(sunSection.closest("details")!);
    const coreBrightnessInput = sunFields.getByLabelText("Core brightness");
    expect(coreBrightnessInput).toHaveValue(
      CURRENT_GAME_TUNING.visuals.suns.profiles[0]!.coreBrightness,
    );
    expect(sunFields.getByLabelText("Glow brightness")).toHaveValue(
      CURRENT_GAME_TUNING.visuals.suns.profiles[0]!.glowBrightness,
    );

    fireEvent.change(coreBrightnessInput, { target: { value: "1.75" } });
    fireEvent.blur(coreBrightnessInput);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const saveCall = fetchMock.mock.calls[1];
    const savedDocument = JSON.parse(
      String((saveCall?.[1] as RequestInit | undefined)?.body),
    ) as typeof CURRENT_GAME_TUNING;
    expect(savedDocument.visuals.suns.profiles[0]!.coreBrightness).toBe(1.75);
  });

  it("renders foresight path controls and saves foresight visual changes", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(screen.getByRole("button", { name: /Foresight/i }));

    const showLineInput = await screen.findByLabelText("Show line");
    expect(showLineInput).toBeChecked();
    expect(screen.getByLabelText("Show dots")).not.toBeChecked();
    expect(screen.getByLabelText("Dot size")).toHaveValue(
      CURRENT_GAME_TUNING.visuals.abilities.foresight.pointSize,
    );

    fireEvent.click(showLineInput);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const saveCall = fetchMock.mock.calls[1];
    expect(
      JSON.parse(String((saveCall?.[1] as RequestInit | undefined)?.body)),
    ).toMatchObject({
      visuals: {
        abilities: {
          foresight: {
            showLine: false,
          },
        },
      },
    });
  });

  it("renders seeker lock controls and saves seeker lock seconds", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(
      screen.getByRole("button", { name: /SeekerLock-on profile/i }),
    );

    const lockSecondsInput = await screen.findByLabelText("Lock seconds");
    expect(lockSecondsInput).toHaveValue(
      CURRENT_GAME_TUNING.gameplay.rockets.seeker.lockSec,
    );

    fireEvent.change(lockSecondsInput, { target: { value: "1.25" } });
    fireEvent.blur(lockSecondsInput);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const saveCall = fetchMock.mock.calls[1];
    expect(
      JSON.parse(String((saveCall?.[1] as RequestInit | undefined)?.body)),
    ).toMatchObject({
      gameplay: {
        rockets: {
          seeker: {
            lockSec: 1.25,
          },
        },
      },
    });
  });

  it("saves the gameplay camera height", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    const cameraHeightInput = await screen.findByLabelText(
      "Gameplay camera height",
    );
    expect(cameraHeightInput).toHaveValue(
      CURRENT_GAME_TUNING.gameplay.camera.gameplayCameraWorldHeight,
    );
    expect(cameraHeightInput).not.toHaveAttribute("min");
    expect(cameraHeightInput).not.toHaveAttribute("max");

    fireEvent.change(cameraHeightInput, { target: { value: "2400" } });
    fireEvent.blur(cameraHeightInput);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const saveCall = fetchMock.mock.calls[1];
    expect(
      JSON.parse(String((saveCall?.[1] as RequestInit | undefined)?.body)),
    ).toMatchObject({
      gameplay: {
        camera: {
          gameplayCameraWorldHeight: 2400,
        },
      },
    });
  });

  it("shows a Sync action on overview and posts the current sync request", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    const syncButton = await screen.findByRole("button", { name: /^Sync$/i });
    fireEvent.click(syncButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const syncCall = fetchMock.mock.calls[1];
    expect(syncCall?.[0]).toBe("/api/editor/tuning/sync-current");
    expect(syncCall?.[1]).toMatchObject({
      method: "POST",
    });
  });

  it("saves the preview camera height", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    const inspectionCameraHeightInput = await screen.findByLabelText(
      "Preview camera height",
    );
    expect(inspectionCameraHeightInput).toHaveValue(
      CURRENT_GAME_TUNING.gameplay.camera.previewCameraWorldHeight,
    );
    expect(inspectionCameraHeightInput).not.toHaveAttribute("min");
    expect(inspectionCameraHeightInput).not.toHaveAttribute("max");

    fireEvent.change(inspectionCameraHeightInput, {
      target: { value: "12000" },
    });
    fireEvent.blur(inspectionCameraHeightInput);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const saveCall = fetchMock.mock.calls[1];
    expect(
      JSON.parse(String((saveCall?.[1] as RequestInit | undefined)?.body)),
    ).toMatchObject({
      gameplay: {
        camera: {
          previewCameraWorldHeight: 12000,
        },
      },
    });
  });

  it("shows the HUD only on overview and hud pages", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    expect(screen.getByTestId("editor-preview-stage")).toHaveAttribute(
      "data-show-hud",
      "true",
    );
    expect(screen.getByTestId("editor-preview-stage")).toHaveAttribute(
      "data-item-id",
      "overview",
    );
    expect(
      screen.queryByText(/live sandbox \+ hud|hud over live sandbox/i),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Orbits/i }));
    expect(screen.getByTestId("editor-preview-stage")).toHaveAttribute(
      "data-show-hud",
      "false",
    );
    expect(screen.getByTestId("editor-preview-stage")).toHaveAttribute(
      "data-item-id",
      "orbits",
    );

    fireEvent.click(screen.getByRole("button", { name: /Foresight/i }));
    expect(screen.getByTestId("editor-preview-stage")).toHaveAttribute(
      "data-show-hud",
      "false",
    );
    expect(screen.getByTestId("editor-preview-stage")).toHaveAttribute(
      "data-item-id",
      "foresight",
    );

    fireEvent.click(screen.getByRole("button", { name: /HUDHUD only/i }));
    expect(screen.getByTestId("editor-preview-stage")).toHaveAttribute(
      "data-show-hud",
      "true",
    );
    expect(screen.getByTestId("editor-preview-stage")).toHaveAttribute(
      "data-item-id",
      "hud",
    );
    expect(
      screen.queryByText(/live sandbox \+ hud|hud over live sandbox/i),
    ).not.toBeInTheDocument();
  });

  it("restarts the orbit preview without changing tuning values", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(screen.getByRole("button", { name: /Orbits/i }));

    expect(
      screen.getByRole("button", { name: "Restart sim" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("editor-preview-stage")).toHaveAttribute(
      "data-preview-revision",
      "0",
    );

    fireEvent.click(screen.getByRole("button", { name: "Restart sim" }));

    expect(screen.getByTestId("editor-preview-stage")).toHaveAttribute(
      "data-preview-revision",
      "1",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
