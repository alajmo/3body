import type { RocketKind } from "@3body/shared";
import { useEffect, useRef } from "react";
import {
  createModelShowcaseViewport,
  type ModelShowcaseViewportOptions,
} from "./game/createModelShowcaseViewport";

type ShowcaseViewportPanelProps = {
  className?: string;
  focus?: ModelShowcaseViewportOptions["focus"];
  rocketKind?: RocketKind;
};

export function ShowcaseViewportPanel({
  className = "app-shell",
  focus = "all",
  rocketKind,
}: ShowcaseViewportPanelProps) {
  const viewportElementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const viewportElement = viewportElementRef.current;
    if (viewportElement === null) {
      return;
    }

    return createModelShowcaseViewport(viewportElement, { focus, rocketKind });
  }, [focus, rocketKind]);

  return (
    <div className={className}>
      <div ref={viewportElementRef} className="canvas-root" />
    </div>
  );
}
