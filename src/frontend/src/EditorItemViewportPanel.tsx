import { useEffect, useRef } from "react";
import {
  createEditorItemPreviewViewport,
  type EditorPreviewViewportItemId,
} from "./game/createEditorItemPreviewViewport";
import { createSunInteractionViewport } from "./game/createSunInteractionViewport";

type EditorItemViewportPanelId = EditorPreviewViewportItemId | "orbits";

export function EditorItemViewportPanel({
  className = "app-shell",
  itemId,
  presentation = "card",
  revision = 0,
}: {
  className?: string;
  itemId: EditorItemViewportPanelId;
  presentation?: "card" | "stage";
  revision?: number;
}) {
  const viewportElementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const viewportElement = viewportElementRef.current;
    if (viewportElement === null) {
      return;
    }
    void revision;

    if (itemId === "orbits" || itemId === "background" || itemId === "hud") {
      return createSunInteractionViewport(viewportElement, {
        mode: itemId,
      });
    }

    return createEditorItemPreviewViewport(viewportElement, {
      itemId,
      presentation,
    });
  }, [itemId, presentation, revision]);

  return (
    <div className={className}>
      <div ref={viewportElementRef} className="canvas-root" />
    </div>
  );
}
