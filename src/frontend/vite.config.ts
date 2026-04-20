import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { APP_ROUTES } from "./src/routes";

const KNOWN_APP_ROUTES = new Set<string>(APP_ROUTES);
const BACKEND_PROXY_HOST =
  process.env.VITE_BACKEND_PROXY_HOST?.trim() || "127.0.0.1";
const BACKEND_PROXY_PORT =
  process.env.VITE_BACKEND_PROXY_PORT?.trim() || "8080";
const BACKEND_HTTP_PROXY_TARGET = `http://${BACKEND_PROXY_HOST}:${BACKEND_PROXY_PORT}`;
const BACKEND_WS_PROXY_TARGET = `ws://${BACKEND_PROXY_HOST}:${BACKEND_PROXY_PORT}`;

const normalizeRoutePath = (pathname: string): string =>
  pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname || "/";

const isHtmlNavigationRequest = (
  url: string,
  acceptHeader: string,
): boolean => {
  const pathname = url.split("?")[0] || "/";

  return (
    acceptHeader.includes("text/html") &&
    !pathname.startsWith("/@") &&
    !pathname.startsWith("/api") &&
    !pathname.startsWith("/ws") &&
    !pathname.startsWith("/node_modules/") &&
    !pathname.includes(".")
  );
};

const strictAppRoutePlugin = () => ({
  configurePreviewServer(server: {
    middlewares: {
      use: (
        handler: (
          req: { method?: string; url?: string; headers: { accept?: string } },
          res: {
            end: (body: string) => void;
            setHeader: (name: string, value: string) => void;
            statusCode: number;
          },
          next: () => void,
        ) => void,
      ) => void;
    };
  }) {
    server.middlewares.use((req, res, next) => {
      const method = req.method ?? "GET";
      const url = req.url ?? "/";
      const acceptHeader = req.headers.accept ?? "";

      if (
        (method !== "GET" && method !== "HEAD") ||
        !isHtmlNavigationRequest(url, acceptHeader)
      ) {
        next();
        return;
      }

      const pathname = normalizeRoutePath(url.split("?")[0] || "/");
      if (KNOWN_APP_ROUTES.has(pathname)) {
        next();
        return;
      }

      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(`404 Not Found: ${pathname}`);
    });
  },
  configureServer(server: {
    middlewares: {
      use: (
        handler: (
          req: { method?: string; url?: string; headers: { accept?: string } },
          res: {
            end: (body: string) => void;
            setHeader: (name: string, value: string) => void;
            statusCode: number;
          },
          next: () => void,
        ) => void,
      ) => void;
    };
  }) {
    server.middlewares.use((req, res, next) => {
      const method = req.method ?? "GET";
      const url = req.url ?? "/";
      const acceptHeader = req.headers.accept ?? "";

      if (
        (method !== "GET" && method !== "HEAD") ||
        !isHtmlNavigationRequest(url, acceptHeader)
      ) {
        next();
        return;
      }

      const pathname = normalizeRoutePath(url.split("?")[0] || "/");
      if (KNOWN_APP_ROUTES.has(pathname)) {
        next();
        return;
      }

      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(`404 Not Found: ${pathname}`);
    });
  },
  name: "strict-app-routes",
});

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        app: path.resolve(__dirname, "index.html"),
        orbitPatternGallery: path.resolve(
          __dirname,
          "orbit-pattern-gallery.html",
        ),
      },
    },
  },
  plugins: [strictAppRoutePlugin(), react()],
  server: {
    port: 1337,
    proxy: {
      "/api": BACKEND_HTTP_PROXY_TARGET,
      "/ws": {
        target: BACKEND_WS_PROXY_TARGET,
        ws: true,
      },
    },
  },
  optimizeDeps: {
    exclude: ["@3body/shared"],
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
    clearMocks: true,
    restoreMocks: true,
  },
});
