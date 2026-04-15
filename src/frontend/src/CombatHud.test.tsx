import { CURRENT_GAME_TUNING } from "@3body/shared";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  createInitialHudState,
  type GameViewportController,
  type GameViewportHudState,
} from "./game/viewportHud";
import { CombatHud } from "./CombatHud";
import { SPECIAL_PERIODIC_ORBIT_PRESETS } from "./game/orbitPresets";

const createControllerMock = (): GameViewportController =>
  ({
    resetProfiling: vi.fn(),
    resetAbilitySettings: vi.fn(),
    resetBlackHoleSettings: vi.fn(),
    resetPlanetVisualSettings: vi.fn(),
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
      controlMode: "drone" as const,
      playerHp: 52,
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
          accent: "#ff61eb",
          ammo: 3,
          kind: "seeker",
          label: "Seeker",
          maxAmmo: 3,
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

    render(
      <CombatHud controller={createControllerMock()} hud={hud} hudTuning={HUD_TUNING} />,
    );

    expect(screen.getByText("2:05")).toBeInTheDocument();
    expect(screen.getByText("Black Hole in 0:30")).toBeInTheDocument();
    expect(screen.getByText("connected")).toBeInTheDocument();
    expect(screen.getByText("13 ms")).toBeInTheDocument();
    expect(screen.getByText("59 FPS")).toBeInTheDocument();
    expect(screen.getByText("16.9 ms")).toBeInTheDocument();
    expect(screen.getByText("Remote sim · Extrapolating")).toBeInTheDocument();
    expect(screen.getByText("Planet HP")).toBeInTheDocument();
    expect(screen.getByText("Player tagged Bot II")).toBeInTheDocument();
    expect(screen.getByText("Phase Shield")).toBeInTheDocument();
    expect(screen.getByText("Seeker")).toBeInTheDocument();
    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(
      screen.getByText("now 8.10 · avg 7.92 · max 11.44"),
    ).toBeInTheDocument();
  });

  it("wires sandbox controls and setting inputs to the viewport controller", () => {
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

    const sandboxHeader = screen
      .getByText("Sandbox Tools")
      .closest(".sandbox-panel__header") as HTMLElement;
    fireEvent.click(
      within(sandboxHeader).getByRole("button", { name: "Reset" }),
    );
    expect(controller.resetSandbox).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Periodic solution"), {
      target: { value: SPECIAL_PERIODIC_ORBIT_PRESETS[0]!.id },
    });
    expect(controller.setOrbitPreset).toHaveBeenCalledWith(
      SPECIAL_PERIODIC_ORBIT_PRESETS[0]!.id,
    );

    const visualsSection = screen
      .getByText("Planet and cache presentation")
      .closest(".sandbox-panel__section") as HTMLElement;
    fireEvent.click(
      within(visualsSection).getByRole("button", { name: "Reset" }),
    );
    fireEvent.change(screen.getByLabelText("Planet size"), {
      target: { value: "2.75" },
    });
    fireEvent.change(screen.getByLabelText("Aura size"), {
      target: { value: "2.5" },
    });
    fireEvent.change(screen.getByLabelText("Aura gap"), {
      target: { value: "0.25" },
    });
    fireEvent.change(screen.getByLabelText("Cache size"), {
      target: { value: "1.4" },
    });
    expect(controller.resetPlanetVisualSettings).toHaveBeenCalledTimes(1);
    expect(controller.setPlanetBodyScale).toHaveBeenCalledWith(2.75);
    expect(controller.setPlanetAuraScale).toHaveBeenCalledWith(2.5);
    expect(controller.setPlanetAuraGap).toHaveBeenCalledWith(0.25);
    expect(controller.setCacheBadgeScale).toHaveBeenCalledWith(1.4);

    const blackHoleSection = screen
      .getByText("Spawn timing and collapse strength")
      .closest(".sandbox-panel__section") as HTMLElement;
    fireEvent.click(
      within(blackHoleSection).getByRole("button", { name: "Reset" }),
    );
    fireEvent.change(screen.getByLabelText("Spawn time"), {
      target: { value: "42" },
    });
    expect(controller.resetBlackHoleSettings).toHaveBeenCalledTimes(1);
    expect(controller.setBlackHoleSetting).toHaveBeenCalledWith("spawnSec", 42);

    const abilitiesSection = screen
      .getByText("Foresight, shield, and boost tuning")
      .closest(".sandbox-panel__section") as HTMLElement;
    fireEvent.click(
      within(abilitiesSection).getByRole("button", { name: "Reset" }),
    );
    fireEvent.change(screen.getByLabelText("Foresight duration"), {
      target: { value: "6.5" },
    });
    fireEvent.change(screen.getByLabelText("Shield duration"), {
      target: { value: "5.5" },
    });
    fireEvent.change(screen.getByLabelText("Boost impulse"), {
      target: { value: "410" },
    });
    expect(controller.resetAbilitySettings).toHaveBeenCalledTimes(1);
    expect(controller.setForesightSetting).toHaveBeenCalledWith(
      "durationSec",
      6.5,
    );
    expect(controller.setShieldSetting).toHaveBeenCalledWith(
      "durationSec",
      5.5,
    );
    expect(controller.setBoostSetting).toHaveBeenCalledWith("magnitude", 410);

    const performanceSection = screen
      .getByText("CPU-side sim and render timings for this viewport")
      .closest(".sandbox-panel__section") as HTMLElement;
    fireEvent.click(
      within(performanceSection).getByRole("button", { name: "Enable" }),
    );
    expect(controller.setProfilingEnabled).toHaveBeenCalledWith(true);
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
      within(performanceSection).getByRole("button", { name: "Reset" }),
    );
    expect(controller.resetProfiling).toHaveBeenCalledTimes(1);
  });

  it("disables sandbox controls when the viewport controller is unavailable", () => {
    render(
      <CombatHud
        controller={null}
        hud={createInitialHudState()}
        hudTuning={HUD_TUNING}
      />,
    );
    const sandboxHeader = screen
      .getByText("Sandbox Tools")
      .closest(".sandbox-panel__header") as HTMLElement;

    expect(screen.getByRole("button", { name: "Pause" })).toBeDisabled();
    expect(
      within(sandboxHeader).getByRole("button", { name: "Reset" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Periodic solution")).toBeDisabled();
    expect(screen.getByLabelText("Planet size")).toBeDisabled();
  });

  it("blurs active numeric fields on Enter to commit values cleanly", () => {
    const blurSpy = vi.spyOn(HTMLInputElement.prototype, "blur");
    render(
      <CombatHud
        controller={createControllerMock()}
        hud={createInitialHudState()}
        hudTuning={HUD_TUNING}
      />,
    );

    fireEvent.keyDown(screen.getByLabelText("Planet size"), {
      key: "Enter",
    });

    expect(blurSpy).toHaveBeenCalledTimes(1);
  });
});
