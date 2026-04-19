import type { RocketKind } from "@3body/shared";
import { useEffect, useRef } from "react";
import {
  createModelShowcaseViewport,
  type ModelShowcaseViewportOptions,
} from "./game/createModelShowcaseViewport";

type ShowcaseViewportPanelProps = {
  className?: string;
  focus?: ModelShowcaseViewportOptions["focus"];
  minimumWorldHeight?: number;
  rocketKind?: RocketKind;
  revision?: number;
};

export function ShowcaseViewportPanel({
  className = "app-shell",
  focus = "all",
  minimumWorldHeight,
  rocketKind,
  revision = 0,
}: ShowcaseViewportPanelProps) {
  const viewportElementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const viewportElement = viewportElementRef.current;
    if (viewportElement === null) {
      return;
    }

    return createModelShowcaseViewport(viewportElement, {
      focus,
      minimumWorldHeight,
      rocketKind,
    });
  }, [focus, minimumWorldHeight, revision, rocketKind]);

  return (
    <div className={className}>
      <div ref={viewportElementRef} className="canvas-root" />
    </div>
  );
}
