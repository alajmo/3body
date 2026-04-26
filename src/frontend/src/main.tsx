import { ARENA_RADIUS } from "@3body/shared";
import { createRoot } from "react-dom/client";
import { loadEditorEnabled } from "./editorAccess";
import { loadRuntimeTuningDocument } from "./game/runtimeTuning";
import "./styles.css";

const appElement = document.getElementById("app");

if (appElement === null) {
  throw new Error("Missing #app mount element.");
}

console.log("[frontend] @3body/shared loaded", { arenaRadius: ARENA_RADIUS });

if (import.meta.env.PROD) {
  const widget = document.createElement("script");
  widget.async = true;
  widget.src = "https://vibej.am/2026/widget.js";
  document.body.appendChild(widget);
}

const initialPathname = window.location.pathname || "/";
const initialTuningMode = initialPathname.startsWith("/offline")
  ? "offline"
  : "online";

await Promise.all([
  loadRuntimeTuningDocument(initialTuningMode),
  loadEditorEnabled(),
]);
const { App } = await import("./App");

createRoot(appElement).render(<App />);
