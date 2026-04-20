import { GameViewportPanel } from "./GameViewportPanel";
import { getRuntimeTuningDocument } from "./game/runtimeTuning";

export function GamePage() {
  const displayMode = getRuntimeTuningDocument().visuals.displayMode;

  return (
    <GameViewportPanel
      className="app-shell"
      defaultBotsEnabled={false}
      displayMode={displayMode}
      showPerformanceTools
    />
  );
}
