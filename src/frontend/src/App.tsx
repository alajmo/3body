import { startTransition, useEffect, useState } from "react";
import { EditPage } from "./EditPage";
import { GamePage } from "./GamePage";
import { resolveAppRoute, type AppRoute } from "./routes";

const getCurrentRoute = (): AppRoute =>
  resolveAppRoute(window.location.pathname);

export function App() {
  const [route, setRoute] = useState<AppRoute>(getCurrentRoute);

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
    case "/edit":
      return <EditPage />;
    default:
      return <GamePage />;
  }
}
