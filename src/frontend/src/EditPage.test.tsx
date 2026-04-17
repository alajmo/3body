import { CURRENT_GAME_TUNING } from "@3body/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditPage } from "./EditPage";

const { editorPreviewStageMock } = vi.hoisted(() => ({
  editorPreviewStageMock: vi.fn(),
}));

vi.mock("./EditorPreviewStage", () => ({
  EditorPreviewStage: (props: { itemId: string; showHud: boolean }) => {
    editorPreviewStageMock(props);
    return (
      <div
        data-testid="editor-preview-stage"
        data-item-id={props.itemId}
        data-show-hud={String(props.showHud)}
      />
    );
  },
}));

describe("EditPage", () => {
  const fetchMock = vi.fn();

  const mockTuningFetch = (
    initialDocument: typeof CURRENT_GAME_TUNING = CURRENT_GAME_TUNING,
  ) => {
    fetchMock.mockImplementation(
      async (_input: unknown, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        const document =
          method === "PUT"
            ? (JSON.parse(String(init?.body)) as typeof CURRENT_GAME_TUNING)
            : initialDocument;

        return new Response(JSON.stringify(document), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
    );
  };

  beforeEach(() => {
    fetchMock.mockReset();
    editorPreviewStageMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
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

  it("resets the selected background scope back to defaults", async () => {
    const customDocument = structuredClone(CURRENT_GAME_TUNING);
    customDocument.visuals.background.baseColor = "#112233";
    customDocument.visuals.background.starsEnabled = false;
    customDocument.visuals.background.nebulaStrength = 0.9;
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
      visuals: {
        background: {
          baseColor: CURRENT_GAME_TUNING.visuals.background.baseColor,
          nebulaStrength: CURRENT_GAME_TUNING.visuals.background.nebulaStrength,
          starsEnabled: CURRENT_GAME_TUNING.visuals.background.starsEnabled,
        },
      },
    });
  });

  it("renders sun brightness controls and saves sun tuning changes", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(screen.getByRole("button", { name: /SunsGlow and warp/i }));

    const coreBrightnessInput = await screen.findByLabelText("Core brightness");
    expect(coreBrightnessInput).toHaveValue(
      CURRENT_GAME_TUNING.visuals.suns.coreBrightness,
    );
    expect(screen.getByLabelText("Glow brightness")).toHaveValue(
      CURRENT_GAME_TUNING.visuals.suns.glowBrightness,
    );

    fireEvent.change(coreBrightnessInput, { target: { value: "1.75" } });
    fireEvent.blur(coreBrightnessInput);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const saveCall = fetchMock.mock.calls[1];
    expect(
      JSON.parse(String((saveCall?.[1] as RequestInit | undefined)?.body)),
    ).toMatchObject({
      visuals: {
        suns: {
          coreBrightness: 1.75,
        },
      },
    });
  });

  it("renders foresight path controls and saves foresight visual changes", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(screen.getByRole("button", { name: /Foresight/i }));

    const showLineInput = await screen.findByLabelText("Show line");
    expect(showLineInput).not.toBeChecked();
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
            showLine: true,
          },
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
  });
});
