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
  enableSandboxStorage = false,
  hudTuning = getRuntimeTuningDocument().visuals.hud,
  showSandboxTools = false,
}: {
  className?: string;
  enableSandboxStorage?: boolean;
  hudTuning?: HudVisualTuning;
  showSandboxTools?: boolean;
}) {
  const viewportElementRef = useRef<HTMLDivElement | null>(null);
  const [hudState, setHudState] = useState(createInitialHudState);
  const [viewportController, setViewportController] =
    useState<GameViewportController | null>(null);

  useEffect(() => {
    const viewportElement = viewportElementRef.current;
    if (viewportElement === null) {
      return;
    }

    return createGameViewport(viewportElement, {
      enableSandboxStorage,
      onControllerReady: setViewportController,
      onHudStateChange: (nextState) => {
        startTransition(() => {
          setHudState(nextState);
        });
      },
    });
  }, [enableSandboxStorage]);

  return (
    <div className={className}>
      <div ref={viewportElementRef} className="canvas-root" />
      <div className="hud-root">
        <CombatHud
          controller={viewportController}
          hud={hudState}
          hudTuning={hudTuning}
          showSandboxTools={showSandboxTools}
        />
      </div>
    </div>
  );
}
