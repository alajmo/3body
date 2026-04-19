import {
  ACESFilmicToneMapping,
  SRGBColorSpace,
  WebGPURenderer,
} from "three/webgpu";

interface ViewportRendererBackendPolicy {
  forceWebGL: boolean;
  label: "webgl" | "webgpu";
  reason: string;
}

export const PRODUCTION_VIEWPORT_RENDERER_BACKEND_POLICY: ViewportRendererBackendPolicy =
  {
    forceWebGL: false,
    label: "webgpu",
    reason:
      "Use native WebGPU when the current browser exposes WebGPU capability.",
  };

const WEBGL_VIEWPORT_RENDERER_BACKEND_POLICY: ViewportRendererBackendPolicy =
  {
    forceWebGL: true,
    label: "webgl",
    reason:
      "Use Three.js WebGL because WebGPU capability is unavailable in the current browser/device.",
  };

export interface ViewportRendererBootstrap {
  dispose: () => void;
  renderer: WebGPURenderer;
}

interface ViewportRendererSession {
  bootstrap: ViewportRendererBootstrap;
  renderer: WebGPURenderer;
}

interface CreateViewportRendererBootstrapOptions {
  antialias?: boolean;
  backendPolicy?: ViewportRendererBackendPolicy;
  hostElement: HTMLDivElement;
}

interface InitializeViewportRendererSessionOptions
  extends CreateViewportRendererBootstrapOptions {
  failureLogLabel: string;
  isDisposed: () => boolean;
}

interface DisposeViewportRendererSessionOptions {
  animationLoopController?: { dispose: () => void } | null;
  bootstrap?: ViewportRendererBootstrap | null;
  hostElement: HTMLDivElement;
  renderer?: WebGPURenderer | null;
}

interface ReportViewportRendererFailureOptions {
  error: unknown;
  failureLogLabel: string;
  hostElement: HTMLDivElement;
  isDisposed: () => boolean;
}

interface NavigatorGpuLike {
  requestAdapter?: unknown;
}

interface RendererBackendFlags {
  isWebGLBackend?: boolean;
  isWebGPUBackend?: boolean;
}

interface RendererValidationEntry {
  backend: "webgl" | "webgpu" | null;
  backendPolicy: ViewportRendererBackendPolicy["label"] | null;
  error: string | null;
  label: string;
  route: string;
  status: "failed" | "initialized";
  timestampIso: string;
}

interface RendererValidationApi {
  clear: () => void;
  getState: () => RendererValidationEntry[];
}

interface RendererValidationWindow extends Window {
  __3bodyRendererValidation?: RendererValidationApi;
}

const RENDERER_VALIDATION_QUERY_PARAM = "rendererValidation";
const rendererValidationEntries: RendererValidationEntry[] = [];

const isRendererBackendFlags = (
  value: unknown,
): value is RendererBackendFlags => typeof value === "object" && value !== null;

const getRendererValidationWindow = (hostElement: HTMLDivElement) =>
  hostElement.ownerDocument.defaultView as RendererValidationWindow | null;

const isRendererValidationEnabled = (hostElement: HTMLDivElement) => {
  const search = hostElement.ownerDocument.defaultView?.location.search ?? "";
  return (
    new URLSearchParams(search).get(RENDERER_VALIDATION_QUERY_PARAM) === "1"
  );
};

const ensureRendererValidationApi = (hostElement: HTMLDivElement) => {
  if (!isRendererValidationEnabled(hostElement)) {
    return null;
  }

  const validationWindow = getRendererValidationWindow(hostElement);
  if (validationWindow === null) {
    return null;
  }

  validationWindow.__3bodyRendererValidation ??= {
    clear: () => {
      rendererValidationEntries.length = 0;
    },
    getState: () => rendererValidationEntries.map((entry) => ({ ...entry })),
  };
  return validationWindow.__3bodyRendererValidation;
};

const recordRendererValidationEntry = (
  hostElement: HTMLDivElement,
  entry: Omit<RendererValidationEntry, "route" | "timestampIso">,
) => {
  if (ensureRendererValidationApi(hostElement) === null) {
    return;
  }

  const route = hostElement.ownerDocument.defaultView?.location.href ?? "";
  rendererValidationEntries.push({
    ...entry,
    route,
    timestampIso: new Date().toISOString(),
  });
};

const getRendererFailureText = (error: unknown) => {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
};

const hasViewportWebGPUCapability = (hostElement: HTMLDivElement): boolean => {
  const maybeNavigator = hostElement.ownerDocument.defaultView?.navigator as
    | (Navigator & { gpu?: NavigatorGpuLike })
    | undefined;
  const gpu = maybeNavigator?.gpu;

  return (
    typeof gpu === "object" &&
    gpu !== null &&
    typeof gpu.requestAdapter === "function"
  );
};

const resolveViewportRendererBackendPolicy = (
  hostElement: HTMLDivElement,
  requestedPolicy: ViewportRendererBackendPolicy,
): ViewportRendererBackendPolicy => {
  if (requestedPolicy.forceWebGL) {
    return WEBGL_VIEWPORT_RENDERER_BACKEND_POLICY;
  }

  return hasViewportWebGPUCapability(hostElement)
    ? PRODUCTION_VIEWPORT_RENDERER_BACKEND_POLICY
    : WEBGL_VIEWPORT_RENDERER_BACKEND_POLICY;
};

const detectViewportRendererBackend = (
  renderer: Pick<WebGPURenderer, "backend">,
  backendPolicy: ViewportRendererBackendPolicy,
) => {
  const { backend } = renderer;
  if (isRendererBackendFlags(backend)) {
    if (backend.isWebGPUBackend === true) {
      return "webgpu" as const;
    }
    if (backend.isWebGLBackend === true) {
      return "webgl" as const;
    }
  }

  return backendPolicy.forceWebGL ? ("webgl" as const) : ("webgpu" as const);
};

const createViewportRendererBootstrap = async ({
  antialias = true,
  backendPolicy = PRODUCTION_VIEWPORT_RENDERER_BACKEND_POLICY,
  hostElement,
}: CreateViewportRendererBootstrapOptions): Promise<ViewportRendererBootstrap> => {
  const resolvedBackendPolicy = resolveViewportRendererBackendPolicy(
    hostElement,
    backendPolicy,
  );
  const renderer = new WebGPURenderer({
    antialias,
    forceWebGL: resolvedBackendPolicy.forceWebGL,
    powerPreference: "high-performance",
  });
  await renderer.init();
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.className = "game-canvas";
  hostElement.replaceChildren(renderer.domElement);

  return {
    renderer,
    dispose() {},
  };
};

export const reportViewportRendererFailure = ({
  error,
  failureLogLabel,
  hostElement,
  isDisposed,
}: ReportViewportRendererFailureOptions) => {
  const failureText = getRendererFailureText(error);
  console.error(`[frontend] ${failureLogLabel} failed.`, error);
  recordRendererValidationEntry(hostElement, {
    backend: null,
    backendPolicy: null,
    error: failureText,
    label: failureLogLabel,
    status: "failed",
  });
  if (!isDisposed()) {
    const ownerDocument = hostElement.ownerDocument;
    const failureElement = ownerDocument.createElement("div");
    failureElement.className = "viewport-renderer-failure";
    failureElement.style.display = "grid";
    failureElement.style.placeItems = "center";
    failureElement.style.width = "100%";
    failureElement.style.height = "100%";
    failureElement.style.padding = "24px";
    failureElement.style.boxSizing = "border-box";
    failureElement.style.textAlign = "center";
    failureElement.style.color = "#9ec6ff";
    failureElement.style.fontSize = "12px";
    failureElement.style.letterSpacing = "0.08em";
    failureElement.style.textTransform = "uppercase";
    failureElement.style.whiteSpace = "pre-wrap";
    failureElement.textContent = `${failureLogLabel} failed\n${failureText}`;
    hostElement.replaceChildren(failureElement);
  }
};

export const initializeViewportRendererSession = async ({
  failureLogLabel,
  hostElement,
  isDisposed,
  ...bootstrapOptions
}: InitializeViewportRendererSessionOptions): Promise<ViewportRendererSession | null> => {
  try {
    const bootstrap = await createViewportRendererBootstrap({
      hostElement,
      ...bootstrapOptions,
    });
    const renderer = bootstrap.renderer;
    const resolvedBackendPolicy = resolveViewportRendererBackendPolicy(
      hostElement,
      bootstrapOptions.backendPolicy ?? PRODUCTION_VIEWPORT_RENDERER_BACKEND_POLICY,
    );

    if (isDisposed()) {
      disposeViewportRendererSession({
        bootstrap,
        hostElement,
        renderer,
      });
      return null;
    }

    recordRendererValidationEntry(hostElement, {
      backend: detectViewportRendererBackend(renderer, resolvedBackendPolicy),
      backendPolicy: resolvedBackendPolicy.label,
      error: null,
      label: failureLogLabel,
      status: "initialized",
    });

    return {
      bootstrap,
      renderer,
    };
  } catch (error) {
    reportViewportRendererFailure({
      error,
      failureLogLabel,
      hostElement,
      isDisposed,
    });
    return null;
  }
};

export const disposeViewportRendererSession = ({
  animationLoopController,
  bootstrap,
  hostElement,
  renderer,
}: DisposeViewportRendererSessionOptions) => {
  animationLoopController?.dispose();
  bootstrap?.dispose();
  renderer?.dispose();
  hostElement.replaceChildren();
};
