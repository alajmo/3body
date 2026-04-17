import type { HudVisualTuning } from "@3body/shared";
import { startTransition, useEffect, useRef, useState } from "react";
import { CombatHud } from "./CombatHud";
import { createGameViewport } from "./game/createGameViewport";
import { getRuntimeTuningDocument } from "./game/runtimeTuning";
import {
  createInitialHudState,
  type GameViewportController,
} from "./game/viewportHud";

export function GameViewportPanel({
  className = "app-shell",
  defaultBotsEnabled = true,
  enableSandboxStorage = false,
  hudTuning = getRuntimeTuningDocument().visuals.hud,
  showPerformanceTools = true,
}: {
  className?: string;
  defaultBotsEnabled?: boolean;
  enableSandboxStorage?: boolean;
  hudTuning?: HudVisualTuning;
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
      enableSandboxStorage,
      onControllerReady: setViewportController,
      onHudStateChange: (nextState) => {
        startTransition(() => {
          setHudState(nextState);
        });
      },
    });
  }, [defaultBotsEnabled, enableSandboxStorage]);

  return (
    <div className={className}>
      <div ref={viewportElementRef} className="canvas-root" />
      <div className="hud-root">
        <CombatHud
          controller={viewportController}
          hud={hudState}
          hudTuning={hudTuning}
          showPerformanceTools={showPerformanceTools}
        />
      </div>
    </div>
  );
}
