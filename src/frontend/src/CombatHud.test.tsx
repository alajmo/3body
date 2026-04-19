import { CURRENT_GAME_TUNING } from "@3body/shared";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  createInitialHudState,
  type GameViewportController,
  type GameViewportHudState,
} from "./game/viewportHud";
import { CombatHud } from "./CombatHud";

const createControllerMock = (): GameViewportController =>
  ({
    resetProfiling: vi.fn(),
    resetAbilitySettings: vi.fn(),
    resetBlackHoleSettings: vi.fn(),
    resetPlanetVisualSettings: vi.fn(),
    setBotsEnabled: vi.fn(),
    setBoostSetting: vi.fn(),
    setBlackHoleSetting: vi.fn(),
    setCacheBadgeScale: vi.fn(),
    setForesightSetting: vi.fn(),
    setPlanetBodyScale: vi.fn(),
    setPlanetAuraGap: vi.fn(),
    setPlanetAuraScale: vi.fn(),
    setProfilingEnabled: vi.fn(),
    pauseSandbox: vi.fn(),
    playSandbox: vi.fn(),
    resetSandbox: vi.fn(),
    setShieldSetting: vi.fn(),
    setOrbitPreset: vi.fn(),
  }) as GameViewportController;

const HUD_TUNING = CURRENT_GAME_TUNING.visuals.hud;

describe("CombatHud", () => {
  it("renders the current combat summary, warnings, and shortcut cards", () => {
    const hud: GameViewportHudState = {
      ...createInitialHudState(),
      playerHeadingDeg: 45,
      playerHp: 52,
      playerSpeed: 318,
      timerElapsedSec: 125,
      blackHoleWarning: true,
      blackHoleRemainingSec: 30,
      connection: {
        extrapolating: true,
        fps: 58.6,
        frameTimeMs: 16.9,
        label: "Remote sim",
        rttMs: 13.4,
        state: "connected" as const,
      },
      killFeed: [
        {
          id: 1,
          accent: "#ff8d4a",
          ageSec: 0.5,
          text: "Player tagged Bot II",
        },
      ],
      minimap: {
        arenaRadius: 2500,
        entities: [
          {
            highlighted: false,
            id: 11,
            kind: "sun",
            pos: { x: 0, y: 0 },
            radius: 180,
          },
          {
            highlighted: true,
            id: 12,
            kind: "planet",
            pos: { x: 460, y: 220 },
            radius: 72,
          },
          {
            highlighted: false,
            id: 13,
            kind: "cache",
            pos: { x: -620, y: 180 },
            radius: 36,
          },
        ],
        extentRadius: 2500,
      },
      abilities: [
        {
          id: "shield" as const,
          accent: "#86ecff",
          keyLabel: "Q",
          label: "Phase Shield",
          mode: "cooldown" as const,
          progress: 0.25,
          statusText: "Cooling",
        },
      ],
      weapons: [
        {
          accent: "#f5fbff",
          ammo: 4,
          kind: "light",
          label: "Light",
          maxAmmo: 5,
          reloadRemainingSec: 0.75,
          selected: false,
        },
        {
          accent: "#ff9158",
          ammo: 4,
          kind: "heavy",
          label: "Heavy",
          maxAmmo: 6,
          reloadRemainingSec: 0,
          selected: false,
        },
        {
          accent: "#ff61eb",
          ammo: 7,
          kind: "seeker",
          label: "Seeker",
          maxAmmo: 8,
          reloadRemainingSec: 0,
          selected: true,
        },
      ],
      profilingEnabled: true,
      debugItems: [
        {
          label: "Frame CPU",
          value: "now 8.10 · avg 7.92 · max 11.44",
        },
      ],
    };

    const { container } = render(
      <CombatHud
        controller={createControllerMock()}
        hud={hud}
        hudTuning={HUD_TUNING}
      />,
    );

    expect(screen.getByText("2:05")).toBeInTheDocument();
    expect(screen.getByText("Black Hole in 0:30")).toBeInTheDocument();
    expect(screen.getByText("connected")).toBeInTheDocument();
    expect(screen.getByText("13 ms")).toBeInTheDocument();
    expect(screen.getByText("59 FPS")).toBeInTheDocument();
    expect(screen.getByText("16.9 ms")).toBeInTheDocument();
    expect(screen.getByText("Remote sim · Extrapolating")).toBeInTheDocument();
    expect(screen.getByText("Health")).toBeInTheDocument();
    expect(screen.queryByText("Kill Feed")).not.toBeInTheDocument();
    expect(screen.queryByText("Compass")).not.toBeInTheDocument();
    expect(screen.queryByText("Speed")).not.toBeInTheDocument();
    expect(screen.queryByText("Heading")).not.toBeInTheDocument();
    expect(screen.queryByText("NE · 45°")).not.toBeInTheDocument();
    expect(screen.getByText("318 M/S")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Compass heading NE · 45°" }),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".combat-hud__movement-hud .movement-hud"),
    ).not.toBeNull();
    const summaryCards = Array.from(
      document.querySelectorAll(".cockpit-summary-grid .cockpit-summary"),
    ) as HTMLElement[];
    expect(summaryCards).toHaveLength(1);
    expect(within(summaryCards[0]!).getByText("Health")).toBeInTheDocument();
    expect(screen.getByText("Player tagged Bot II")).toBeInTheDocument();
    expect(
      container.querySelector(".combat-hud__kill-feed .kill-feed"),
    ).not.toBeNull();
    expect(screen.getByText("Phase Shield")).toBeInTheDocument();
    expect(screen.getByText("Seeker")).toBeInTheDocument();
    const shortcutsDock = document.querySelector(
      ".shortcuts-dock",
    ) as HTMLElement;
    const shortcutSections = Array.from(
      shortcutsDock.querySelectorAll(".shortcuts-dock__section"),
    ) as HTMLElement[];
    const lightCard = screen
      .getByText("Light")
      .closest(".weapon-card") as HTMLElement;
    const heavyCard = screen
      .getByText("Heavy")
      .closest(".weapon-card") as HTMLElement;
    const seekerCard = screen
      .getByText("Seeker")
      .closest(".weapon-card") as HTMLElement;
    expect(within(lightCard).getByText("∞")).toBeInTheDocument();
    expect(within(heavyCard).getByText("4")).toBeInTheDocument();
    expect(within(seekerCard).getByText("7")).toBeInTheDocument();
    expect(shortcutSections).toHaveLength(3);
    expect(within(shortcutSections[0]!).getByText("Health")).toBeInTheDocument();
    expect(within(shortcutSections[1]!).getByText("Seeker")).toBeInTheDocument();
    expect(
      within(shortcutSections[2]!).getByText("Phase Shield"),
    ).toBeInTheDocument();
    expect(
      within(shortcutsDock).queryByText("Abilities"),
    ).not.toBeInTheDocument();
    expect(
      within(shortcutsDock).queryByText("Weapons"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(
      screen.getByText("now 8.10 · avg 7.92 · max 11.44"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Delayed world minimap/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Pause" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the minimap empty until the first scan pass reaches entities", () => {
    const { container } = render(
      <CombatHud
        controller={createControllerMock()}
        hud={{
          ...createInitialHudState(),
          minimap: {
            arenaRadius: 2500,
            entities: [
              {
                highlighted: false,
                id: 11,
                kind: "sun",
                pos: { x: 0, y: 0 },
                radius: 180,
              },
              {
                highlighted: true,
                id: 12,
                kind: "planet",
                pos: { x: 460, y: 220 },
                radius: 72,
              },
            ],
            extentRadius: 2500,
          },
        }}
        hudTuning={HUD_TUNING}
        showPerformanceTools
      />,
    );

    expect(
      screen.getByRole("img", { name: /Delayed world minimap/i }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll(".minimap__entity")).toHaveLength(0);
  });

  it("wires local playback and profiler controls to the viewport controller", () => {
    const controller = createControllerMock();
    const { rerender } = render(
      <CombatHud
        controller={controller}
        hud={createInitialHudState()}
        hudTuning={HUD_TUNING}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(controller.pauseSandbox).toHaveBeenCalledTimes(1);

    rerender(
      <CombatHud
        controller={controller}
        hud={{
          ...createInitialHudState(),
          sandboxPaused: true,
        }}
        hudTuning={HUD_TUNING}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(controller.playSandbox).toHaveBeenCalledTimes(1);

    const sandboxToolsSection = screen
      .getByText("Playback and reset controls for the local sandbox")
      .closest(".sandbox-panel__section") as HTMLElement;
    fireEvent.click(
      within(sandboxToolsSection).getByRole("button", { name: "Reset" }),
    );
    expect(controller.resetSandbox).toHaveBeenCalledTimes(1);

    const performanceSection = screen
      .getByText("CPU-side sim and render timings for this viewport")
      .closest(".sandbox-panel__section") as HTMLElement;
    fireEvent.click(
      within(performanceSection).getByRole("button", { name: "Enable" }),
    );
    expect(controller.setProfilingEnabled).toHaveBeenCalledWith(true);
  });

  it("hides a duplicate local connection detail label", () => {
    render(
      <CombatHud
        controller={createControllerMock()}
        hud={createInitialHudState()}
        hudTuning={HUD_TUNING}
      />,
    );

    expect(screen.getByText("local")).toBeInTheDocument();
    expect(document.querySelector(".connection-indicator__label")).toBeNull();
  });

  it("does not show black hole spawn copy before the warning state", () => {
    render(
      <CombatHud
        controller={createControllerMock()}
        hud={createInitialHudState()}
        hudTuning={HUD_TUNING}
      />,
    );

    expect(screen.queryByText(/Black Hole at/i)).not.toBeInTheDocument();
    expect(document.querySelector(".match-timer__status")).toBeNull();
  });

  it("resets profiling samples when requested", () => {
    const controller = createControllerMock();

    render(
      <CombatHud
        controller={controller}
        hud={{
          ...createInitialHudState(),
          profilingEnabled: true,
          debugItems: [
            {
              label: "Sim CPU",
              value: "now 1.20 · avg 1.10 · max 2.40",
            },
          ],
        }}
        hudTuning={HUD_TUNING}
      />,
    );

    const performanceSection = screen
      .getByText("CPU-side sim and render timings for this viewport")
      .closest(".sandbox-panel__section") as HTMLElement;
    fireEvent.click(
      within(performanceSection).getByRole("button", { name: "Disable" }),
    );
    expect(controller.setProfilingEnabled).toHaveBeenCalledWith(false);
    fireEvent.click(
      within(performanceSection).getByRole("button", { name: "Reset Stats" }),
    );
    expect(controller.resetProfiling).toHaveBeenCalledTimes(1);
  });

  it("disables local playback controls when the viewport controller is unavailable", () => {
    render(
      <CombatHud
        controller={null}
        hud={createInitialHudState()}
        hudTuning={HUD_TUNING}
      />,
    );

    const sandboxToolsSection = screen
      .getByText("Playback and reset controls for the local sandbox")
      .closest(".sandbox-panel__section") as HTMLElement;
    const performanceSection = screen
      .getByText("CPU-side sim and render timings for this viewport")
      .closest(".sandbox-panel__section") as HTMLElement;

    expect(
      within(sandboxToolsSection).getByRole("button", { name: "Pause" }),
    ).toBeDisabled();
    expect(
      within(sandboxToolsSection).getByRole("button", { name: "Reset" }),
    ).toBeDisabled();
    expect(
      within(performanceSection).getByRole("button", { name: "Enable" }),
    ).toBeDisabled();
    expect(
      within(performanceSection).getByRole("button", { name: "Reset Stats" }),
    ).toBeDisabled();
  });

  it("can show the performance panel on its own", () => {
    const { container } = render(
      <CombatHud
        controller={createControllerMock()}
        hud={{
          ...createInitialHudState(),
          profilingEnabled: true,
          debugItems: [
            {
              label: "Frame CPU",
              value: "5.10 ms · avg 4.80 · max 7.30",
            },
          ],
        }}
        hudTuning={HUD_TUNING}
        showPerformanceTools
      />,
    );

    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(
      screen.getByText("5.10 ms · avg 4.80 · max 7.30"),
    ).toBeInTheDocument();
    expect(container.querySelector(".combat-hud")).toHaveClass(
      "combat-hud--has-side-dock",
    );
    expect(container.querySelector(".combat-hud")).toHaveClass(
      "combat-hud--has-bottom-shortcuts",
    );
  });

  it("does not reserve side-dock space when the tool panels are hidden", () => {
    const { container } = render(
      <CombatHud
        controller={createControllerMock()}
        hud={createInitialHudState()}
        hudTuning={HUD_TUNING}
        showPerformanceTools={false}
      />,
    );

    expect(container.querySelector(".combat-hud")).not.toHaveClass(
      "combat-hud--has-side-dock",
    );
    expect(container.querySelector(".combat-hud")).toHaveClass(
      "combat-hud--has-bottom-shortcuts",
    );
  });
});
