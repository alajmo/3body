export const APP_ROUTES = [
  "/",
  "/edit",
  "/network",
  "/sandbox",
  "/soak",
] as const;

export type AppRoute = (typeof APP_ROUTES)[number];
export type ResolvedAppRoute = AppRoute | "not-found";

const KNOWN_ROUTES = new Set<AppRoute>(APP_ROUTES);

export const resolveAppRoute = (pathname: string): ResolvedAppRoute => {
  const trimmed =
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname || "/";

  return KNOWN_ROUTES.has(trimmed as AppRoute)
    ? (trimmed as AppRoute)
    : "not-found";
};
