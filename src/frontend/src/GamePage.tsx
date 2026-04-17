import { GameViewportPanel } from "./GameViewportPanel";

export function GamePage() {
  return (
    <GameViewportPanel
      className="app-shell"
      defaultBotsEnabled={false}
      showPerformanceTools
    />
  );
}
