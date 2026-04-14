import { startTransition, useEffect, useRef, useState } from "react";
import { CombatHud } from "./CombatHud";
import { createGameViewport } from "./game/createGameViewport";
import {
  createInitialHudState,
  type GameViewportController,
} from "./game/viewportHud";

export function App() {
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
      onControllerReady: setViewportController,
      onHudStateChange: (nextState) => {
        startTransition(() => {
          setHudState(nextState);
        });
      },
    });
  }, []);

  return (
    <div className="app-shell">
      <div ref={viewportElementRef} className="canvas-root" />
      <div className="hud-root">
        <CombatHud controller={viewportController} hud={hudState} />
      </div>
    </div>
  );
}
