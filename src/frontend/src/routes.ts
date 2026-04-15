export type AppRoute = "/" | "/edit";

const KNOWN_ROUTES = new Set<AppRoute>(["/", "/edit"]);

export const resolveAppRoute = (pathname: string): AppRoute => {
  const trimmed =
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname || "/";

  return KNOWN_ROUTES.has(trimmed as AppRoute) ? (trimmed as AppRoute) : "/";
};
