import { startTransition, useEffect, useState } from "react";
import { EditPage } from "./EditPage";
import { GamePage } from "./GamePage";
import { NetworkGamePage } from "./NetworkGamePage";
import { NotFoundPage } from "./NotFoundPage";
import { resolveAppRoute, type ResolvedAppRoute } from "./routes";
import { ViewportSoakPage } from "./ViewportSoakPage";

const getCurrentRoute = (): ResolvedAppRoute => {
  const url = new URL(window.location.href);
  if (url.pathname === "/" && url.searchParams.get("page") === "soak") {
    return "/soak";
  }

  return resolveAppRoute(url.pathname);
};

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
      return <NetworkGamePage />;
    case "/edit":
      return <EditPage />;
    case "/network":
      return <NetworkGamePage />;
    case "/sandbox":
      return <GamePage />;
    case "/soak":
      return <ViewportSoakPage />;
    case "not-found":
      return <NotFoundPage />;
    default:
      return <NotFoundPage />;
  }
}
