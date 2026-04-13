import { useEffect, useRef } from "react";
import { createGameViewport } from "./game/createGameViewport";

export function App() {
  const viewportElementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const viewportElement = viewportElementRef.current;
    if (viewportElement === null) {
      return;
    }

    return createGameViewport(viewportElement);
  }, []);

  return (
    <div className="app-shell">
      <div ref={viewportElementRef} className="canvas-root" />
      <div id="hud-root" className="hud-root" />
    </div>
  );
}
