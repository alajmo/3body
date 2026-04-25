import { startTransition, useEffect, useState } from "react";
import { isEditorEnabled } from "./editorAccess";
import { EditPage } from "./EditPage";
import { GamePage } from "./GamePage";
import { NetworkGamePage } from "./NetworkGamePage";
import { PlayMenuPage } from "./PlayMenuPage";
import { resolveAppRoute, type ResolvedAppRoute } from "./routes";

const getCurrentRoute = (): ResolvedAppRoute =>
  resolveAppRoute(new URL(window.location.href).pathname);

const redirectToRoot = () => {
  if (typeof window === "undefined") {
    return;
  }
  if (window.location.pathname !== "/") {
    window.history.replaceState({}, "", "/");
  }
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

  const editorEnabled = isEditorEnabled();
  const resolvedRoute: ResolvedAppRoute =
    (route === "/online/edit" || route === "/offline/edit") && !editorEnabled
      ? "not-found"
      : route;

  useEffect(() => {
    if (resolvedRoute === "not-found") {
      redirectToRoot();
    }
  }, [resolvedRoute]);

  switch (resolvedRoute) {
    case "/online/edit":
      return <EditPage mode="online" />;
    case "/offline/edit":
      return <EditPage mode="offline" />;
    case "/online":
      return <NetworkGamePage />;
    case "/offline":
      return <GamePage />;
    default:
      return <PlayMenuPage />;
  }
}
