import { useEffect, useRef } from "react";
import { createSunInteractionViewport } from "./game/createSunInteractionViewport";

export function SunInteractionViewportPanel({
  className = "app-shell",
}: {
  className?: string;
}) {
  const viewportElementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const viewportElement = viewportElementRef.current;
    if (viewportElement === null) {
      return;
    }

    return createSunInteractionViewport(viewportElement);
  }, []);

  return (
    <div className={className}>
      <div ref={viewportElementRef} className="canvas-root" />
    </div>
  );
}
