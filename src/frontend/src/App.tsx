import { startTransition, useEffect, useState } from "react";
import { EditPage } from "./EditPage";
import { GamePage } from "./GamePage";
import { NetworkGamePage } from "./NetworkGamePage";
import { NotFoundPage } from "./NotFoundPage";
import { PlayMenuPage } from "./PlayMenuPage";
import { resolveAppRoute, type ResolvedAppRoute } from "./routes";

const getCurrentRoute = (): ResolvedAppRoute =>
  resolveAppRoute(new URL(window.location.href).pathname);

export function App() {
  const [route, setRoute] = useState<ResolvedAppRoute>(getCurrentRoute);

  useEffect(() => {
    const syncRoute = () => {
      startTransition(() => {
        setRoute(getCurrentRoute());
      });
    };

    window.addEventListener("popstate", syncRoute);
    return () => {
      window.removeEventListener("popstate", syncRoute);
    };
  }, []);

  switch (route) {
    case "/":
      return <PlayMenuPage />;
    case "/edit":
      return <EditPage />;
    case "/online":
      return <NetworkGamePage />;
    case "/offline":
      return <GamePage />;
    case "not-found":
      return <NotFoundPage />;
    default:
      return <NotFoundPage />;
  }
}
