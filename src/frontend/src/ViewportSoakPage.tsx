import { GameViewportPanel } from "./GameViewportPanel";
import { ShowcaseViewportPanel } from "./ShowcaseViewportPanel";
import { SunInteractionViewportPanel } from "./SunInteractionViewportPanel";

export function ViewportSoakPage() {
  const secondaryCount = (() => {
    const rawValue = new URLSearchParams(window.location.search).get(
      "secondary",
    );
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return 3;
    }
    return Math.max(0, Math.min(3, Math.floor(parsed)));
  })();
  const secondaryPanels = [
    {
      eyebrow: "Secondary",
      title: "Full showcase",
      viewport: (
        <ShowcaseViewportPanel
          className="viewport-soak-page__surface"
          focus="all"
        />
      ),
    },
    {
      eyebrow: "Secondary",
      title: "Rocket showcase",
      viewport: (
        <ShowcaseViewportPanel
          className="viewport-soak-page__surface"
          focus="rockets"
          rocketKind="seeker"
        />
      ),
    },
    {
      eyebrow: "Secondary",
      title: "Orbit interaction",
      viewport: <SunInteractionViewportPanel className="viewport-soak-page__surface" />,
    },
  ].slice(0, secondaryCount);

  return (
    <main className="viewport-soak-page">
      <section className="viewport-soak-page__panel viewport-soak-page__panel--primary">
        <header className="viewport-soak-page__panel-header">
          <div className="viewport-soak-page__eyebrow">Viewport Soak</div>
          <h1 className="viewport-soak-page__title">Sandbox soak baseline</h1>
          <p className="viewport-soak-page__note">
            Keeps the local sandbox HUD and profiler visible while additional
            animated viewports stay onscreen.
          </p>
        </header>
        <GameViewportPanel
          className="viewport-soak-page__surface viewport-soak-page__surface--primary"
          defaultBotsEnabled={false}
          showPerformanceTools
        />
      </section>

      {secondaryPanels.map((panel) => (
        <section key={panel.title} className="viewport-soak-page__panel">
          <header className="viewport-soak-page__panel-header">
            <div className="viewport-soak-page__eyebrow">{panel.eyebrow}</div>
            <h2 className="viewport-soak-page__title">{panel.title}</h2>
          </header>
          {panel.viewport}
        </section>
      ))}
    </main>
  );
}
