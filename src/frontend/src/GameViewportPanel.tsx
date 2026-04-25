import type { HudVisualTuning } from "@3body/shared";
import { startTransition, useEffect, useRef, useState } from "react";
import { CombatHud } from "./CombatHud";
import { createGameViewport } from "./game/createGameViewport";
import { getRuntimeTuningDocument } from "./game/runtimeTuning";
import type { ShowcaseDisplayMode } from "./game/showcaseDisplayMode";
import {
  createInitialHudState,
  type GameViewportController,
} from "./game/viewportHud";

export function GameViewportPanel({
  className = "app-shell",
  defaultBotsEnabled = true,
  displayMode,
  enableSandboxStorage = false,
  hudTuning = getRuntimeTuningDocument().visuals.hud,
  restartOnDeath = false,
  showPerformanceTools = true,
}: {
  className?: string;
  defaultBotsEnabled?: boolean;
  displayMode?: ShowcaseDisplayMode;
  enableSandboxStorage?: boolean;
  hudTuning?: HudVisualTuning;
  restartOnDeath?: boolean;
  showPerformanceTools?: boolean;
}) {
  const viewportElementRef = useRef<HTMLDivElement | null>(null);
  const [hudState, setHudState] = useState(() => ({
    ...createInitialHudState(),
    botsEnabled: defaultBotsEnabled,
  }));
  const [viewportController, setViewportController] =
    useState<GameViewportController | null>(null);

  useEffect(() => {
    const viewportElement = viewportElementRef.current;
    if (viewportElement === null) {
      return;
    }

    return createGameViewport(viewportElement, {
      defaultBotsEnabled,
      displayMode,
      enableSandboxStorage,
      onControllerReady: setViewportController,
      onHudStateChange: (nextState) => {
        startTransition(() => {
          setHudState(nextState);
        });
      },
      restartOnDeath,
    });
  }, [defaultBotsEnabled, displayMode, enableSandboxStorage, restartOnDeath]);

  return (
    <div className={className}>
      <div ref={viewportElementRef} className="canvas-root" />
      <div
        className={`hud-root${displayMode === "vhs" ? " hud-root--inside-crt" : ""}`}
      >
        <CombatHud
          controller={viewportController}
          displayMode={displayMode}
          hud={hudState}
          hudTuning={hudTuning}
          showPerformanceTools={showPerformanceTools}
        />
      </div>
    </div>
  );
}
