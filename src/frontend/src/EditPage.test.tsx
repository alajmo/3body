import {
  ARENA_RADIUS_MIN,
  CURRENT_GAME_TUNING,
  DEFAULT_GAME_TUNING,
} from "@3body/shared";
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

const { editorPreviewStageMock } = vi.hoisted(() => ({
  editorPreviewStageMock: vi.fn(),
}));

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
        /Press G to emit a pulse that blasts planets, rockets, drones, and caches within its blast radius away from your planet\./i,
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

  it("syncs background inspector edits into the preview stage document", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(screen.getByRole("button", { name: /Background/i }));

    const baseColorInput = await screen.findByLabelText("Base color");
    fireEvent.change(baseColorInput, { target: { value: "#112233" } });

    await waitFor(() => {
      expect(getLastEditorPreviewStageProps()?.itemId).toBe("background");
      expect(
        getLastEditorPreviewStageProps()?.documentValue.visuals.background
          .baseColor,
      ).toBe("#112233");
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

  it("saves the orbit planet circle radius", async () => {
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
    expect(circleRadiusInput).toHaveAttribute(
      "max",
      String(
        Math.max(
          CURRENT_GAME_TUNING.gameplay.arena.radius,
          CURRENT_GAME_TUNING.gameplay.orbits.planetCircleRadius,
        ),
      ),
    );
    fireEvent.change(circleRadiusInput, { target: { value: "2600" } });
    fireEvent.blur(circleRadiusInput);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const saveCall = fetchMock.mock.calls[1];
    const savedDocument = JSON.parse(
      String((saveCall?.[1] as RequestInit | undefined)?.body),
    ) as typeof CURRENT_GAME_TUNING;

    expect(savedDocument.gameplay.orbits.planetCircleRadius).toBe(2600);
  });

  it("saves the orbit sun start distance scale", async () => {
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
    expect(
      screen.queryByLabelText("Start velocity scale"),
    ).not.toBeInTheDocument();

    fireEvent.change(distanceScaleInput, { target: { value: "1.5" } });
    fireEvent.blur(distanceScaleInput);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const saveCall = fetchMock.mock.calls[1];
    const savedDocument = JSON.parse(
      String((saveCall?.[1] as RequestInit | undefined)?.body),
    ) as typeof CURRENT_GAME_TUNING;

    expect(savedDocument.gameplay.orbits.sunStartDistanceScale).toBe(1.5);
  });

  it("saves the orbit system drift direction and speed", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    fireEvent.click(
      screen.getByRole("button", { name: /OrbitsOrbit seed tuning/i }),
    );

    const directionInput = await screen.findByLabelText("Direction (deg)");
    const speedInput = screen.getByLabelText("Drift speed");

    expect(directionInput).toHaveValue(
      CURRENT_GAME_TUNING.gameplay.orbits.systemDrift.directionDeg,
    );
    expect(speedInput).toHaveValue(
      CURRENT_GAME_TUNING.gameplay.orbits.systemDrift.speed,
    );

    fireEvent.change(directionInput, { target: { value: "135" } });
    fireEvent.blur(directionInput);
    fireEvent.change(speedInput, { target: { value: "180" } });
    fireEvent.blur(speedInput);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    const saveCall = fetchMock.mock.calls.at(-1);
    const savedDocument = JSON.parse(
      String((saveCall?.[1] as RequestInit | undefined)?.body),
    ) as typeof CURRENT_GAME_TUNING;

    expect(savedDocument.gameplay.orbits.systemDrift).toEqual({
      directionDeg: 135,
      speed: 180,
    });
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
    expect(arenaRadiusInput).toHaveAttribute("min", String(ARENA_RADIUS_MIN));
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

  it("saves the overview gameplay camera size", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    const cameraHeightInput = await screen.findByLabelText(
      "Viewport world height",
    );
    expect(cameraHeightInput).toHaveValue(
      CURRENT_GAME_TUNING.gameplay.camera.viewportWorldHeight,
    );

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
          viewportWorldHeight: 2400,
        },
      },
    });
  });

  it("saves the overview read mode camera size", async () => {
    mockTuningFetch();

    render(<EditPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/editor/tuning");
    });

    const readModeCameraHeightInput = await screen.findByLabelText(
      "Read mode world height",
    );
    expect(readModeCameraHeightInput).toHaveValue(
      CURRENT_GAME_TUNING.gameplay.camera.readModeWorldHeight,
    );

    fireEvent.change(readModeCameraHeightInput, { target: { value: "8400" } });
    fireEvent.blur(readModeCameraHeightInput);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const saveCall = fetchMock.mock.calls[1];
    expect(
      JSON.parse(String((saveCall?.[1] as RequestInit | undefined)?.body)),
    ).toMatchObject({
      gameplay: {
        camera: {
          readModeWorldHeight: 8400,
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
