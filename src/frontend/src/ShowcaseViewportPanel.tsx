import type { RocketKind } from "@3body/shared";
import { useEffect, useRef } from "react";
import {
  createModelShowcaseViewport,
  type ModelShowcaseViewportOptions,
} from "./game/createModelShowcaseViewport";
import type { ShowcaseDisplayMode } from "./game/showcaseDisplayMode";

type ShowcaseViewportPanelProps = {
  className?: string;
  displayMode?: ShowcaseDisplayMode;
  focus?: ModelShowcaseViewportOptions["focus"];
  minimumWorldHeight?: number;
  rocketKind?: RocketKind;
  revision?: number;
};

export function ShowcaseViewportPanel({
  className = "app-shell",
  displayMode,
  focus = "all",
  minimumWorldHeight,
  rocketKind,
  revision: _revision = 0,
}: ShowcaseViewportPanelProps) {
  const viewportElementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const viewportElement = viewportElementRef.current;
    if (viewportElement === null) {
      return;
    }

    return createModelShowcaseViewport(viewportElement, {
      displayMode,
      focus,
      minimumWorldHeight,
      rocketKind,
    });
  }, [displayMode, focus, minimumWorldHeight, rocketKind]);

  return (
    <div className={className}>
      <div ref={viewportElementRef} className="canvas-root" />
    </div>
  );
}
