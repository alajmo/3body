import {
  ACESFilmicToneMapping,
  SRGBColorSpace,
  WebGPURenderer,
} from "three/webgpu";

export type ViewportRendererTarget =
  | "authoritativeMatch"
  | "combatSandbox"
  | "modelShowcase"
  | "sunInteraction";

export interface ViewportRendererBackendPolicy {
  forceWebGL: boolean;
  label: "webgl-fallback";
  reason: string;
}

// The repo is still shipping the WebGL fallback backend on three@0.169.x.
// This is an explicit engine decision now rather than an inline per-viewport
// workaround scattered across entrypoints.
export const PRODUCTION_VIEWPORT_RENDERER_BACKEND_POLICY: ViewportRendererBackendPolicy =
  {
    forceWebGL: true,
    label: "webgl-fallback",
    reason:
      "Native WebGPU is not the shipping backend on three@0.169.x because the current post-processing and sprite paths are still validated on the WebGL fallback.",
  };

interface RendererStatusController {
  clear: () => void;
  dispose: () => void;
  show: (message: string) => void;
}

export interface ViewportRendererBootstrap {
  backendPolicy: ViewportRendererBackendPolicy;
  dispose: () => void;
  renderer: WebGPURenderer;
  status: Pick<RendererStatusController, "clear" | "show">;
}

interface CreateViewportRendererBootstrapOptions {
  antialias?: boolean;
  hostElement: HTMLDivElement;
  onContextRecovered?: () => void;
  target: ViewportRendererTarget;
}

const createRendererStatusController = (
  hostElement: HTMLDivElement,
): RendererStatusController => {
  const statusElement = hostElement.ownerDocument.createElement("div");
  statusElement.className = "game-canvas-status";
  statusElement.hidden = true;

  return {
    show(message) {
      statusElement.textContent = message;
      statusElement.hidden = false;
      if (statusElement.parentElement !== hostElement) {
        hostElement.append(statusElement);
      }
    },
    clear() {
      statusElement.textContent = "";
      statusElement.hidden = true;
    },
    dispose() {
      statusElement.remove();
    },
  };
};

export const createViewportRendererBootstrap = async ({
  antialias = true,
  hostElement,
  onContextRecovered,
  target,
}: CreateViewportRendererBootstrapOptions): Promise<ViewportRendererBootstrap> => {
  const status = createRendererStatusController(hostElement);
  const renderer = new WebGPURenderer({
    antialias,
    forceWebGL: PRODUCTION_VIEWPORT_RENDERER_BACKEND_POLICY.forceWebGL,
    powerPreference: "high-performance",
  });

  await renderer.init();

  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.className = "game-canvas";
  renderer.domElement.dataset.viewportTarget = target;
  renderer.domElement.dataset.rendererBackend =
    PRODUCTION_VIEWPORT_RENDERER_BACKEND_POLICY.label;
  const handleContextLost = (event: Event) => {
    event.preventDefault();
    status.show("Renderer context lost. Waiting for recovery...");
  };
  const handleContextRestored = () => {
    status.clear();
    onContextRecovered?.();
  };
  renderer.domElement.addEventListener("webglcontextlost", handleContextLost);
  renderer.domElement.addEventListener(
    "webglcontextrestored",
    handleContextRestored,
  );

  hostElement.replaceChildren(renderer.domElement);

  return {
    backendPolicy: PRODUCTION_VIEWPORT_RENDERER_BACKEND_POLICY,
    renderer,
    status: {
      clear: status.clear,
      show: status.show,
    },
    dispose() {
      renderer.domElement.removeEventListener(
        "webglcontextlost",
        handleContextLost,
      );
      renderer.domElement.removeEventListener(
        "webglcontextrestored",
        handleContextRestored,
      );
      status.dispose();
    },
  };
};

export const showViewportRendererFailure = (
  hostElement: HTMLDivElement,
  message: string,
) => {
  hostElement.replaceChildren();
  const status = createRendererStatusController(hostElement);
  status.show(message);
};
