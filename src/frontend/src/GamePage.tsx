import { startTransition, useEffect, useState } from "react";
import { GameViewportPanel } from "./GameViewportPanel";
import {
  getRuntimeTuningDocument,
  loadRuntimeTuningDocument,
} from "./game/runtimeTuning";

export function GamePage() {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void loadRuntimeTuningDocument("offline").then(() => {
      if (active) {
        startTransition(() => {
          setRevision((current) => current + 1);
        });
      }
    });
    return () => {
      active = false;
    };
  }, []);
  const displayMode = getRuntimeTuningDocument().visuals.displayMode;
  const showPerformanceTools = import.meta.env.DEV;

  return (
    <GameViewportPanel
      key={revision}
      className="app-shell"
      defaultBotsEnabled={true}
      displayMode={displayMode}
      restartOnDeath
      showPerformanceTools={showPerformanceTools}
    />
  );
}
