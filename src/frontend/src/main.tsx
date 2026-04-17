import { ARENA_RADIUS } from "@3body/shared";
import { createRoot } from "react-dom/client";
import { loadRuntimeTuningDocument } from "./game/runtimeTuning";
import "./styles.css";

const appElement = document.getElementById("app");

if (appElement === null) {
  throw new Error("Missing #app mount element.");
}

console.log("[frontend] @3body/shared loaded", { arenaRadius: ARENA_RADIUS });

await loadRuntimeTuningDocument();
const { App } = await import("./App");

createRoot(appElement).render(<App />);
