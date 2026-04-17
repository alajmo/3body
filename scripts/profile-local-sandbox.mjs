import { spawn, spawnSync } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const NPM_BIN = process.platform === "win32" ? "npm.cmd" : "npm";
const DEFAULT_TARGET = "local-sandbox";
const DEFAULT_PRESET_ID = "ia1-periodic-sandbox";
const DEFAULT_BOTS_MODE = "enabled";
const DEFAULT_BOT_DIFFICULTY = "hard";
const DEFAULT_APP_HOST = "127.0.0.1";
const DEFAULT_APP_PORT = 2337;
const DEFAULT_BACKEND_HOST = "127.0.0.1";
const DEFAULT_BACKEND_PORT = 28380;
const DEFAULT_CHROME_DEBUG_PORT = 9222;
const DEFAULT_WIDTH = 1600;
const DEFAULT_HEIGHT = 900;
const DEFAULT_DURATION_SEC = 20;
const DEFAULT_SETTLE_MS = 3000;
const DEFAULT_TIMEOUT_MS = 2000;
const MAX_DIAGNOSTIC_LINES = 40;
const MAX_DIAGNOSTIC_LENGTH = 1200;
const DEFAULT_CHROME_ARGS = [
  "--headless=new",
  "--no-sandbox",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
];
const NATIVE_WEBGPU_CHROME_ARGS = [
  "--enable-unsafe-webgpu",
  "--enable-vulkan",
  "--use-angle=vulkan",
];
const STORAGE_KEYS = {
  profileToken: "3body.profileToken",
  orbitPresetId: "3body.orbitPresetId",
  profilingEnabled: "3body.profilingEnabled",
  resumeToken: "3body.resumeToken",
  roomId: "3body.roomId",
};
const KNOWN_CHROME_BINARIES = [
  "google-chrome",
  "google-chrome-stable",
  "chromium",
  "chromium-browser",
];
const PROFILE_TARGETS = ["local-sandbox", "authoritative-match"];
const BOT_DIFFICULTIES = ["easy", "normal", "hard"];

const HELP_TEXT = `Usage:
  npm run profile:local-sandbox -- [options]
  npm run profile:authoritative-match -- [options]

Runs a browser-backed profiling pass against a real frontend viewport path.

Options:
  --target=<name>              local-sandbox or authoritative-match. Default: ${DEFAULT_TARGET}
  --duration-sec=<number>       Sample window after setup. Default: ${DEFAULT_DURATION_SEC}
  --startup-wait-ms=<number>    Wait after navigation/setup before sampling. Default: ${DEFAULT_SETTLE_MS}
  --width=<number>              Browser viewport width. Default: ${DEFAULT_WIDTH}
  --height=<number>             Browser viewport height. Default: ${DEFAULT_HEIGHT}
  --port=<number>               Frontend dev-server port. Default: ${DEFAULT_APP_PORT}
  --route=<path>                App route to profile. Defaults by target.
  --chrome-native-webgpu=<bool> Launch Chrome with Vulkan/WebGPU enablement flags. Default: false
  --require-authoritative-combat=<bool> Require the authoritative harness to reach combat before capture. Default: true
  --require-profiler=<bool>     Require HUD profiler stats to mount. Default: true
  --preset-id=<id>              Orbit preset to seed before load. Default: ${DEFAULT_PRESET_ID}
  --bots=<enabled|disabled>     Bot AI mode. Default: ${DEFAULT_BOTS_MODE}
  --bot-difficulty=<level>      Authoritative private-room bot difficulty. Default: ${DEFAULT_BOT_DIFFICULTY}
  --backend-port=<number>       Authoritative backend port. Default: ${DEFAULT_BACKEND_PORT}
  --chrome-bin=<path>           Chrome/Chromium binary to launch.
  --chrome-debug-port=<number>  Chrome DevTools port. Default: ${DEFAULT_CHROME_DEBUG_PORT}
  --out=<path>                  Write the JSON result to a file as well as stdout.
  --verbose                     Stream child-process logs to stderr.
  --help                        Show this message.
`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const logInfo = (message) => {
  process.stderr.write(`${message}\n`);
};

const parseInteger = (value, flagName) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error(`Expected ${flagName} to be an integer, received "${value}".`);
  }
  return parsed;
};

const parseNumber = (value, flagName) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected ${flagName} to be a number, received "${value}".`);
  }
  return parsed;
};

const parseBoolean = (value, flagName) => {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(`Expected ${flagName} to be "true" or "false", received "${value}".`);
};

const parseArgs = (argv) => {
  const config = {
    appHost: DEFAULT_APP_HOST,
    backendHost: DEFAULT_BACKEND_HOST,
    backendPort: DEFAULT_BACKEND_PORT,
    botDifficulty: DEFAULT_BOT_DIFFICULTY,
    bots: DEFAULT_BOTS_MODE,
    chromeBin: null,
    chromeDebugPort: DEFAULT_CHROME_DEBUG_PORT,
    chromeNativeWebgpu: false,
    durationSec: DEFAULT_DURATION_SEC,
    height: DEFAULT_HEIGHT,
    outPath: null,
    port: DEFAULT_APP_PORT,
    presetId: DEFAULT_PRESET_ID,
    requireAuthoritativeCombat: true,
    requireProfiler: true,
    route: null,
    startupWaitMs: DEFAULT_SETTLE_MS,
    target: DEFAULT_TARGET,
    verbose: false,
    width: DEFAULT_WIDTH,
  };

  for (const argument of argv) {
    if (argument === "--help" || argument === "-h") {
      process.stdout.write(HELP_TEXT);
      process.exit(0);
    }
    if (argument === "--verbose") {
      config.verbose = true;
      continue;
    }
    if (!argument.startsWith("--")) {
      throw new Error(`Unknown argument "${argument}".`);
    }

    const separatorIndex = argument.indexOf("=");
    if (separatorIndex === -1) {
      throw new Error(`Expected "${argument}" to use --key=value syntax.`);
    }

    const key = argument.slice(2, separatorIndex);
    const value = argument.slice(separatorIndex + 1);

    switch (key) {
      case "backend-port":
        config.backendPort = parseInteger(value, "--backend-port");
        break;
      case "bot-difficulty":
        if (!BOT_DIFFICULTIES.includes(value)) {
          throw new Error(
            `Expected --bot-difficulty to be one of ${BOT_DIFFICULTIES.join(", ")}, received "${value}".`,
          );
        }
        config.botDifficulty = value;
        break;
      case "bots":
        if (value !== "enabled" && value !== "disabled") {
          throw new Error(`Expected --bots to be "enabled" or "disabled", received "${value}".`);
        }
        config.bots = value;
        break;
      case "chrome-bin":
        config.chromeBin = value;
        break;
      case "chrome-debug-port":
        config.chromeDebugPort = parseInteger(value, "--chrome-debug-port");
        break;
      case "chrome-native-webgpu":
        config.chromeNativeWebgpu = parseBoolean(
          value,
          "--chrome-native-webgpu",
        );
        break;
      case "duration-sec":
        config.durationSec = parseNumber(value, "--duration-sec");
        break;
      case "height":
        config.height = parseInteger(value, "--height");
        break;
      case "out":
        config.outPath = value;
        break;
      case "port":
        config.port = parseInteger(value, "--port");
        break;
      case "preset-id":
        config.presetId = value;
        break;
      case "require-authoritative-combat":
        config.requireAuthoritativeCombat = parseBoolean(
          value,
          "--require-authoritative-combat",
        );
        break;
      case "require-profiler":
        config.requireProfiler = parseBoolean(value, "--require-profiler");
        break;
      case "route":
        config.route = value.startsWith("/") ? value : `/${value}`;
        break;
      case "startup-wait-ms":
        config.startupWaitMs = parseInteger(value, "--startup-wait-ms");
        break;
      case "target":
        if (!PROFILE_TARGETS.includes(value)) {
          throw new Error(
            `Expected --target to be one of ${PROFILE_TARGETS.join(", ")}, received "${value}".`,
          );
        }
        config.target = value;
        break;
      case "width":
        config.width = parseInteger(value, "--width");
        break;
      default:
        throw new Error(`Unknown option "--${key}".`);
    }
  }

  config.route ??=
    config.target === "authoritative-match" ? "/network" : "/";

  return config;
};

const createOutputCollector = ({ label, verbose }) => {
  const lines = [];

  const push = (chunk) => {
    const text = chunk.toString();
    if (verbose) {
      process.stderr.write(`[${label}] ${text}`);
    }
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        continue;
      }
      lines.push(trimmed);
      if (lines.length > 40) {
        lines.shift();
      }
    }
  };

  return {
    push,
    tail() {
      return lines.join("\n");
    },
  };
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const waitFor = async (label, callback, { attempts = 80, delayMs = 250 } = {}) => {
  let lastError = null;

  for (let index = 0; index < attempts; index += 1) {
    try {
      return await callback();
    } catch (error) {
      lastError = error;
      await sleep(delayMs);
    }
  }

  throw new Error(`${label} did not become ready: ${lastError}`);
};

const canReachJson = async (url) => {
  try {
    const response = await fetchWithTimeout(url);
    return response.ok;
  } catch {
    return false;
  }
};

const detectChromeBinary = (preferredBinary) => {
  if (preferredBinary !== null) {
    return preferredBinary;
  }

  for (const candidate of KNOWN_CHROME_BINARIES) {
    const probe = spawnSync(candidate, ["--version"], {
      cwd: REPO_ROOT,
      stdio: "ignore",
    });
    if (probe.status === 0) {
      return candidate;
    }
  }

  throw new Error(
    `Unable to find a Chrome binary. Tried: ${KNOWN_CHROME_BINARIES.join(", ")}`,
  );
};

const spawnManagedProcess = ({
  args,
  command,
  env,
  label,
  verbose,
}) => {
  const collector = createOutputCollector({ label, verbose });
  const child = spawn(command, args, {
    cwd: REPO_ROOT,
    env: env ?? process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", collector.push);
  child.stderr?.on("data", collector.push);

  return {
    child,
    label,
    outputTail: () => collector.tail(),
  };
};

const terminateProcess = async (managedProcess) => {
  if (!managedProcess || managedProcess.child.exitCode !== null) {
    return;
  }

  managedProcess.child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => managedProcess.child.once("exit", resolve)),
    sleep(3000).then(() => {
      if (managedProcess.child.exitCode === null) {
        managedProcess.child.kill("SIGKILL");
      }
    }),
  ]);
};

const createChromePageTarget = async (chromeBaseUrl) => {
  const endpoints = [
    `${chromeBaseUrl}/json/new?about:blank`,
    `${chromeBaseUrl}/json/new?${encodeURIComponent("about:blank")}`,
  ];

  for (const endpoint of endpoints) {
    for (const method of ["PUT", "GET"]) {
      try {
        const response = await fetchWithTimeout(endpoint, { method });
        if (!response.ok) {
          continue;
        }
        return await response.json();
      } catch {
        // Try the next endpoint/method combination.
      }
    }
  }

  throw new Error("Unable to create a Chrome DevTools page target.");
};

const createCdpClient = async (webSocketUrl) => {
  const socket = new WebSocket(webSocketUrl);

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let nextId = 0;
  const pendingRequests = new Map();
  const eventWaiters = new Map();
  const eventListeners = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data.toString());

    if (typeof message.id === "number") {
      const pendingRequest = pendingRequests.get(message.id);
      if (pendingRequest) {
        pendingRequests.delete(message.id);
        if (message.error) {
          pendingRequest.reject(
            new Error(`${pendingRequest.method}: ${message.error.message}`),
          );
        } else {
          pendingRequest.resolve(message.result);
        }
      }
      return;
    }

    const waiters = eventWaiters.get(message.method);
    if (!waiters || waiters.length === 0) {
      const listeners = eventListeners.get(message.method);
      if (listeners) {
        for (const listener of listeners) {
          listener(message.params);
        }
      }
      return;
    }

    const resolve = waiters.shift();
    if (waiters.length === 0) {
      eventWaiters.delete(message.method);
    } else {
      eventWaiters.set(message.method, waiters);
    }
    resolve(message.params);
  });

  return {
    async close() {
      socket.close();
      await new Promise((resolve) => socket.addEventListener("close", resolve, { once: true }));
    },
    evaluate: async (expression) => {
      const result = await send("Runtime.evaluate", {
        awaitPromise: true,
        expression,
        returnByValue: true,
      });
      return result.result?.value;
    },
    send,
    on(method, listener) {
      const listeners = eventListeners.get(method) ?? new Set();
      listeners.add(listener);
      eventListeners.set(method, listeners);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          eventListeners.delete(method);
        }
      };
    },
    waitForEvent(method) {
      return new Promise((resolve) => {
        const waiters = eventWaiters.get(method) ?? [];
        waiters.push(resolve);
        eventWaiters.set(method, waiters);
      });
    },
  };

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pendingRequests.set(id, { method, reject, resolve });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
};

const waitForPageCondition = async (cdp, label, expression, options) =>
  waitFor(
    label,
    async () => {
      const matched = await cdp.evaluate(expression);
      if (!matched) {
        throw new Error("condition not met");
      }
      return matched;
    },
    options,
  );

const buildStorageSeedSource = (presetId) => `(() => {
  try {
    window.localStorage.setItem(${JSON.stringify(STORAGE_KEYS.profilingEnabled)}, JSON.stringify(true));
    window.localStorage.setItem(${JSON.stringify(STORAGE_KEYS.orbitPresetId)}, ${JSON.stringify(presetId)});
  } catch {}
})();`;

const buildAuthoritativeStorageSeedSource = () => `(() => {
  try {
    window.localStorage.removeItem(${JSON.stringify(STORAGE_KEYS.profileToken)});
    window.localStorage.removeItem(${JSON.stringify(STORAGE_KEYS.resumeToken)});
    window.localStorage.removeItem(${JSON.stringify(STORAGE_KEYS.roomId)});
  } catch {}
})();`;

const buildAuthoritativeSocketHarnessSource = () => `(() => {
  const OriginalWebSocket = window.WebSocket;
  let activeSocket = null;
  const state = {
    createdPrivateRoom: false,
    lastErrorCode: null,
    lastErrorMessage: null,
    lastMessageType: null,
    phase: "boot",
  };

  class ProfileWebSocket extends OriginalWebSocket {
    constructor(...args) {
      super(...args);
      activeSocket = this;
      this.addEventListener("message", (event) => {
        if (typeof event.data !== "string") {
          return;
        }
        try {
          const message = JSON.parse(event.data);
          if (!message || typeof message.type !== "string") {
            return;
          }
          state.lastMessageType = message.type;
          switch (message.type) {
            case "welcome":
            case "lobbyState":
              state.phase = "lobby";
              break;
            case "pickState":
              state.phase = "pick";
              break;
            case "countdown":
              state.phase = "countdown";
              break;
            case "fullSnapshot":
            case "deltaSnapshot":
              state.phase = "combat";
              break;
            case "matchEnd":
              state.phase = "ended";
              break;
            case "error":
              state.lastErrorCode =
                typeof message.code === "string" ? message.code : null;
              state.lastErrorMessage =
                typeof message.message === "string" ? message.message : null;
              break;
            default:
              break;
          }
        } catch {}
      });
    }

    send(data) {
      let nextData = data;
      if (typeof data === "string") {
        try {
          const message = JSON.parse(data);
          if (message?.type === "hello") {
            message.join = { kind: "createRoom" };
            delete message.resumeToken;
            state.createdPrivateRoom = true;
            nextData = JSON.stringify(message);
          }
        } catch {}
      }
      return super.send(nextData);
    }
  }

  for (const key of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) {
    Object.defineProperty(ProfileWebSocket, key, {
      configurable: true,
      enumerable: false,
      value: OriginalWebSocket[key],
      writable: false,
    });
  }

  window.WebSocket = ProfileWebSocket;
  window.__3bodyProfileHarness = {
    getState() {
      return {
        ...state,
        socketReadyState: activeSocket?.readyState ?? null,
      };
    },
    sendJson(message) {
      if (!activeSocket || activeSocket.readyState !== OriginalWebSocket.OPEN) {
        return false;
      }
      activeSocket.send(JSON.stringify(message));
      return true;
    },
    startAuthoritativeMatch(difficulty) {
      const normalizedDifficulty =
        difficulty === "easy" || difficulty === "normal" || difficulty === "hard"
          ? difficulty
          : "hard";
      return {
        setBotDifficulty: this.sendJson({
          difficulty: normalizedDifficulty,
          type: "setBotDifficulty",
        }),
        hostStart: this.sendJson({ type: "hostStart" }),
      };
    },
  };
})();`;

const buildConfigureExpression = ({ bots, presetId }) => `(() => {
  const findField = (labelText) =>
    [...document.querySelectorAll(".hud-field")].find((field) =>
      field.querySelector(".hud-field__label")?.textContent?.trim() === labelText,
    ) ?? null;
  const setSelect = (labelText, value) => {
    const field = findField(labelText);
    const select = field?.querySelector("select");
    if (!(select instanceof HTMLSelectElement)) {
      return false;
    }
    if (![...select.options].some((option) => option.value === value)) {
      return false;
    }
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };
  const findPanel = (eyebrowText) =>
    [...document.querySelectorAll(".sandbox-panel")].find((panel) =>
      [...panel.querySelectorAll(".hud-panel__eyebrow")].some(
        (eyebrow) => eyebrow.textContent?.trim() === eyebrowText,
      ),
    ) ?? null;
  const getPanelButton = (eyebrowText, buttonText) => {
    const panel = findPanel(eyebrowText);
    if (!panel) {
      return null;
    }
    return (
      [...panel.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === buttonText,
      ) ?? null
    );
  };
  const ensureProfilingEnabled = () => {
    const enableButton = getPanelButton("Performance", "Enable");
    if (enableButton instanceof HTMLButtonElement && !enableButton.disabled) {
      enableButton.click();
      return true;
    }
    return getPanelButton("Performance", "Disable") instanceof HTMLButtonElement;
  };
  const clickButton = (eyebrowText, buttonText) => {
    const button = getPanelButton(eyebrowText, buttonText);
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return false;
    }
    button.click();
    return true;
  };
  return {
    botsApplied: setSelect("Bot AI", ${JSON.stringify(bots)}),
    currentRoute: window.location.pathname,
    presetApplied: setSelect("Periodic solution", ${JSON.stringify(presetId)}),
    profilingEnabled: ensureProfilingEnabled(),
    sandboxReset: clickButton("Sandbox Tools", "Reset"),
    title: document.title,
  };
})()`;

const buildAuthoritativeConfigureExpression = () => `(() => {
  const findPanel = (eyebrowText) =>
    [...document.querySelectorAll(".sandbox-panel")].find((panel) =>
      [...panel.querySelectorAll(".hud-panel__eyebrow")].some(
        (eyebrow) => eyebrow.textContent?.trim() === eyebrowText,
      ),
    ) ?? null;
  const getPanelButton = (eyebrowText, buttonText) => {
    const panel = findPanel(eyebrowText);
    if (!panel) {
      return null;
    }
    return (
      [...panel.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === buttonText,
      ) ?? null
    );
  };
  const ensureProfilingEnabled = () => {
    const enableButton = getPanelButton("Performance", "Enable");
    if (enableButton instanceof HTMLButtonElement && !enableButton.disabled) {
      enableButton.click();
      return true;
    }
    return getPanelButton("Performance", "Disable") instanceof HTMLButtonElement;
  };
  return {
    currentRoute: window.location.pathname,
    harnessState:
      typeof window.__3bodyProfileHarness?.getState === "function"
        ? window.__3bodyProfileHarness.getState()
        : null,
    profilingEnabled: ensureProfilingEnabled(),
    title: document.title,
  };
})()`;

const buildAuthoritativeHarnessStateExpression = () => `(() => {
  if (typeof window.__3bodyProfileHarness?.getState !== "function") {
    return null;
  }
  return window.__3bodyProfileHarness.getState();
})()`;

const buildAuthoritativeHarnessPhaseExpression = (phases) => `(() => {
  const state =
    typeof window.__3bodyProfileHarness?.getState === "function"
      ? window.__3bodyProfileHarness.getState()
      : null;
  return Boolean(state && ${JSON.stringify(phases)}.includes(state.phase));
})()`;

const buildAuthoritativeStartMatchExpression = (botDifficulty) => `(() => {
  if (typeof window.__3bodyProfileHarness?.startAuthoritativeMatch !== "function") {
    return null;
  }
  return window.__3bodyProfileHarness.startAuthoritativeMatch(${JSON.stringify(botDifficulty)});
})()`;

const buildClickPanelButtonExpression = (eyebrowText, buttonText) => `(() => {
  const panel = [...document.querySelectorAll(".sandbox-panel")].find((candidate) =>
    [...candidate.querySelectorAll(".hud-panel__eyebrow")].some(
      (eyebrow) => eyebrow.textContent?.trim() === ${JSON.stringify(eyebrowText)},
    ),
  ) ?? null;
  const button = panel
    ? [...panel.querySelectorAll("button")].find(
        (candidate) => candidate.textContent?.trim() === ${JSON.stringify(buttonText)},
      ) ?? null
    : null;
  if (!(button instanceof HTMLButtonElement) || button.disabled) {
    return false;
  }
  button.click();
  return true;
})()`;

const buildCanvasInventoryExpression = `(() => {
  return [...document.querySelectorAll(".game-canvas")].map((canvas, index) => {
    const element = canvas;
    if (!(element instanceof HTMLCanvasElement)) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    return {
      displaySize: {
        height: Math.round(rect.height),
        width: Math.round(rect.width),
      },
      hidden: element.hidden,
      index,
    };
  }).filter(Boolean);
})()`;

const buildPageDebugExpression = `(() => ({
  appHtml: document.querySelector("#app")?.innerHTML?.slice(0, 2000) ?? null,
  appText: document.querySelector("#app")?.textContent?.trim().slice(0, 400) ?? null,
  currentRoute: window.location.pathname,
  overlayError:
    document.querySelector(".edit-status--error")?.textContent?.trim() ?? null,
  rendererCanvases: ${buildCanvasInventoryExpression},
  sandboxPanelCount: document.querySelectorAll(".sandbox-panel").length,
  title: document.title,
}))()`;

const buildSummaryExpression = `(() => {
  const stats = [...document.querySelectorAll(".sandbox-stat")].map((stat) => ({
    label: stat.querySelector(".sandbox-stat__label")?.textContent?.trim() ?? null,
    value: stat.querySelector(".sandbox-stat__value")?.textContent?.trim() ?? null,
  }));
  const statsByLabel = Object.fromEntries(
    stats
      .filter((stat) => stat.label !== null)
      .map((stat) => [stat.label, stat.value]),
  );
  const metrics = [...document.querySelectorAll(".connection-indicator__metric")].map(
    (metric) => metric.textContent?.trim() ?? null,
  );
  return {
    overlayError:
      document.querySelector(".edit-status--error")?.textContent?.trim() ?? null,
    metrics,
    stats,
    statsByLabel,
    rendererCanvases: ${buildCanvasInventoryExpression},
    timer: document.querySelector(".match-timer__value")?.textContent?.trim() ?? null,
    title: document.title,
    url: window.location.href,
  };
})()`;

const buildRouteReadyExpression = `(() => {
  const appRoot = document.querySelector("#app");
  return Boolean(
    (appRoot instanceof HTMLElement && appRoot.childElementCount > 0) ||
      document.querySelector(".game-canvas") ||
      document.querySelector(".viewport-soak-page") ||
      document.querySelector(".edit-shell") ||
      document.querySelector(".app-shell"),
  );
})()`;

const buildBackendAllowedOrigins = ({ appHost, port }) =>
  [
    `http://${appHost}:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`,
  ].join(",");

const getProfileTargetLabel = (target) =>
  target === "authoritative-match" ? "authoritative match" : "local sandbox";

const formatRuntimeException = (params) => {
  const details = params?.exceptionDetails;
  const text =
    details?.exception?.description ??
    details?.text ??
    params?.exceptionDetails?.text ??
    "Unknown runtime exception";
  const location =
    typeof details?.url === "string" && details.url.length > 0
      ? `${details.url}:${details.lineNumber ?? 0}:${details.columnNumber ?? 0}`
      : null;
  return location ? `${text} @ ${location}` : text;
};

const formatConsoleArgument = (argument) => {
  if (!argument || typeof argument !== "object") {
    return String(argument);
  }
  if (typeof argument.value !== "undefined") {
    return String(argument.value);
  }
  if (typeof argument.description === "string") {
    return argument.description;
  }
  if (typeof argument.type === "string") {
    return argument.type;
  }
  return JSON.stringify(argument);
};

const formatConsoleEntry = (params) => {
  const type = params?.type ?? "log";
  const args = Array.isArray(params?.args) ? params.args : [];
  const text = args.map(formatConsoleArgument).join(" ").trim();
  return text.length > 0 ? `[${type}] ${text}` : `[${type}]`;
};

const pushDiagnostic = (items, entry) => {
  if (typeof entry !== "string" || entry.trim().length === 0) {
    return;
  }
  const normalized =
    entry.trim().length > MAX_DIAGNOSTIC_LENGTH
      ? `${entry.trim().slice(0, MAX_DIAGNOSTIC_LENGTH)}…`
      : entry.trim();
  if (items.at(-1) === normalized) {
    return;
  }
  items.push(normalized);
  if (items.length > MAX_DIAGNOSTIC_LINES) {
    items.shift();
  }
};

const collectDiagnosticsSnapshot = ({
  consoleMessages,
  logEntries,
  networkFailures,
  runtimeExceptions,
}) => ({
  consoleMessages: [...consoleMessages],
  logEntries: [...logEntries],
  networkFailures: [...networkFailures],
  runtimeExceptions: [...runtimeExceptions],
});

const main = async () => {
  const config = parseArgs(process.argv.slice(2));
  const chromeBinary = detectChromeBinary(config.chromeBin);
  const profileTargetLabel = getProfileTargetLabel(config.target);
  const appUrl = new URL(
    config.route,
    `http://${config.appHost}:${config.port}/`,
  );
  const backendBaseUrl = `http://${config.backendHost}:${config.backendPort}`;
  const chromeBaseUrl = `http://127.0.0.1:${config.chromeDebugPort}`;
  const userDataDir = path.join(
    os.tmpdir(),
    `3body-profile-local-sandbox-${process.pid}`,
  );
  let backendAlreadyRunning = null;
  let backendProcess = null;
  let devServerProcess = null;
  let chromeProcess = null;
  let cdp = null;
  const runtimeExceptions = [];
  const consoleMessages = [];
  const logEntries = [];
  const networkFailures = [];
  const unregisterEventListeners = [];

  try {
    if (config.target === "authoritative-match") {
      backendAlreadyRunning = await canReachJson(`${backendBaseUrl}/healthz`);
      if (!backendAlreadyRunning) {
        logInfo(`Starting authoritative backend on ${backendBaseUrl}...`);
        backendProcess = spawnManagedProcess({
          args: ["run", "start", "-w", "@3body/backend"],
          command: NPM_BIN,
          env: {
            ...process.env,
            ALLOWED_ORIGINS: buildBackendAllowedOrigins(config),
            HOST: config.backendHost,
            PORT: String(config.backendPort),
          },
          label: "backend",
          verbose: config.verbose,
        });
      } else {
        logInfo(`Reusing existing authoritative backend at ${backendBaseUrl}.`);
      }

      await waitFor("authoritative backend", async () => {
        if (backendProcess && backendProcess.child.exitCode !== null) {
          throw new Error(`backend exited early.\n${backendProcess.outputTail()}`);
        }
        const response = await fetchWithTimeout(`${backendBaseUrl}/healthz`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      });
    }

    const serverAlreadyRunning = await canReachJson(appUrl.href);
    if (!serverAlreadyRunning) {
      logInfo(`Starting frontend dev server on ${appUrl.origin}...`);
      devServerProcess = spawnManagedProcess({
        args: [
          "run",
          "dev",
          "-w",
          "@3body/frontend",
          "--",
          "--host",
          config.appHost,
          "--port",
          String(config.port),
          "--strictPort",
        ],
        command: NPM_BIN,
        env:
          config.target === "authoritative-match"
            ? {
                ...process.env,
                VITE_BACKEND_PROXY_HOST: config.backendHost,
                VITE_BACKEND_PROXY_PORT: String(config.backendPort),
              }
            : process.env,
        label: "vite",
        verbose: config.verbose,
      });
    } else {
      logInfo(`Reusing existing frontend dev server at ${appUrl.origin}.`);
    }

    await waitFor("frontend app", async () => {
      if (devServerProcess && devServerProcess.child.exitCode !== null) {
        throw new Error(
          `dev server exited early.\n${devServerProcess.outputTail()}`,
        );
      }
      const response = await fetchWithTimeout(appUrl.href);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.text();
    });

    const chromeAlreadyRunning = await canReachJson(`${chromeBaseUrl}/json/version`);
    if (!chromeAlreadyRunning) {
      logInfo(`Starting headless Chrome with remote debugging on ${chromeBaseUrl}...`);
      chromeProcess = spawnManagedProcess({
        args: [
          ...DEFAULT_CHROME_ARGS,
          ...(config.chromeNativeWebgpu ? NATIVE_WEBGPU_CHROME_ARGS : []),
          `--user-data-dir=${userDataDir}`,
          `--remote-debugging-port=${config.chromeDebugPort}`,
          "about:blank",
        ],
        command: chromeBinary,
        label: "chrome",
        verbose: config.verbose,
      });
    } else {
      logInfo(`Reusing existing Chrome DevTools endpoint at ${chromeBaseUrl}.`);
    }

    const chromeVersion = await waitFor("Chrome DevTools", async () => {
      if (chromeProcess && chromeProcess.child.exitCode !== null) {
        throw new Error(`chrome exited early.\n${chromeProcess.outputTail()}`);
      }
      const response = await fetchWithTimeout(`${chromeBaseUrl}/json/version`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    });

    const pageTarget = await createChromePageTarget(chromeBaseUrl);
    cdp = await createCdpClient(pageTarget.webSocketDebuggerUrl);
    await cdp.send("Network.enable");
    await cdp.send("Page.enable");
    await cdp.send("Console.enable");
    await cdp.send("Log.enable");
    await cdp.send("Runtime.enable");
    unregisterEventListeners.push(
      cdp.on("Network.responseReceived", (params) => {
        const response = params?.response;
        if (!response || typeof response.status !== "number") {
          return;
        }
        if (response.status < 400) {
          return;
        }
        pushDiagnostic(
          networkFailures,
          `[${response.status}] ${response.url ?? "unknown"}`,
        );
      }),
    );
    unregisterEventListeners.push(
      cdp.on("Runtime.exceptionThrown", (params) => {
        pushDiagnostic(runtimeExceptions, formatRuntimeException(params));
      }),
    );
    unregisterEventListeners.push(
      cdp.on("Runtime.consoleAPICalled", (params) => {
        if (params?.type === "error" || params?.type === "assert") {
          pushDiagnostic(consoleMessages, formatConsoleEntry(params));
        }
      }),
    );
    unregisterEventListeners.push(
      cdp.on("Log.entryAdded", (params) => {
        const entry = params?.entry;
        if (!entry) {
          return;
        }
        if (entry.level === "error" || entry.level === "warning") {
          pushDiagnostic(
            logEntries,
            `[${entry.level}] ${entry.source ?? "log"}: ${entry.text ?? ""}`.trim(),
          );
        }
      }),
    );
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      deviceScaleFactor: 1,
      height: config.height,
      mobile: false,
      width: config.width,
    });
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source: buildStorageSeedSource(config.presetId),
    });
    if (config.target === "authoritative-match") {
      await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
        source: buildAuthoritativeStorageSeedSource(),
      });
      await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
        source: buildAuthoritativeSocketHarnessSource(),
      });
    }

    logInfo(`Navigating to ${appUrl.href}...`);
    const loadEvent = cdp.waitForEvent("Page.loadEventFired");
    await cdp.send("Page.navigate", { url: appUrl.href });
    await loadEvent;

    try {
      await waitForPageCondition(
        cdp,
        "route mount",
        buildRouteReadyExpression,
        { attempts: 60, delayMs: 250 },
      );
    } catch (error) {
      const pageDebug = await cdp.evaluate(buildPageDebugExpression).catch(
        () => null,
      );
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Sandbox controls did not mount.\n${errorMessage}\n${JSON.stringify(
          {
            diagnostics: collectDiagnosticsSnapshot({
              consoleMessages,
              logEntries,
              networkFailures,
              runtimeExceptions,
            }),
            pageDebug,
          },
          null,
          2,
        )}`,
      );
    }
    await sleep(config.startupWaitMs);

    let authoritativeStart = null;
    let profilingReset = false;
    const configure =
      config.target === "authoritative-match"
        ? await cdp.evaluate(buildAuthoritativeConfigureExpression())
        : await cdp.evaluate(
            buildConfigureExpression({
              bots: config.bots,
              presetId: config.presetId,
            }),
          );
    await sleep(config.startupWaitMs);

    if (config.target === "authoritative-match") {
      await waitForPageCondition(
        cdp,
        "authoritative lobby",
        buildAuthoritativeHarnessPhaseExpression([
          "lobby",
          "pick",
          "countdown",
          "combat",
          "ended",
        ]),
        { attempts: 120, delayMs: 250 },
      );
      if (config.requireAuthoritativeCombat) {
        profilingReset = await cdp.evaluate(
          buildClickPanelButtonExpression("Performance", "Reset"),
        );
        await sleep(500);
        authoritativeStart = await cdp.evaluate(
          buildAuthoritativeStartMatchExpression(config.botDifficulty),
        );
        await waitForPageCondition(
          cdp,
          "authoritative combat",
          buildAuthoritativeHarnessPhaseExpression(["combat", "ended"]),
          { attempts: 80, delayMs: 250 },
        );
      }
    }

    if (config.requireProfiler) {
      await waitForPageCondition(
        cdp,
        "profiler stats",
        `document.querySelectorAll(".sandbox-stat").length > 0`,
        {
          attempts: config.target === "authoritative-match" ? 160 : 80,
          delayMs: 250,
        },
      );
      if (config.target !== "authoritative-match") {
        profilingReset = await cdp.evaluate(
          buildClickPanelButtonExpression("Performance", "Reset"),
        );
        await sleep(500);
      }
    }

    logInfo(
      `Collecting ${profileTargetLabel} profile for ${config.durationSec.toFixed(1)}s...`,
    );
    await sleep(config.durationSec * 1000);

    const summary = await cdp.evaluate(buildSummaryExpression);
    if (
      config.requireProfiler &&
      (!summary || !Array.isArray(summary.stats) || summary.stats.length === 0)
    ) {
      const pageDebug = await cdp.evaluate(buildPageDebugExpression).catch(
        () => null,
      );
      throw new Error(
        `Profiling run completed, but no ${profileTargetLabel} stats were collected.\n${JSON.stringify(
          {
            diagnostics: collectDiagnosticsSnapshot({
              consoleMessages,
              logEntries,
              networkFailures,
              runtimeExceptions,
            }),
            pageDebug,
          },
          null,
          2,
        )}`,
      );
    }

    const result = {
      browser: {
        protocolVersion: chromeVersion["Protocol-Version"] ?? null,
        product: chromeVersion.Browser ?? null,
        userAgent: chromeVersion["User-Agent"] ?? null,
        webSocketDebuggerUrl: pageTarget.webSocketDebuggerUrl,
      },
      collectedAt: new Date().toISOString(),
      configure: {
        ...configure,
        authoritativeHarnessState:
          config.target === "authoritative-match"
            ? await cdp.evaluate(buildAuthoritativeHarnessStateExpression())
            : null,
        authoritativeStart,
        profilingReset,
      },
      runtime: {
        consoleMessages,
        logEntries,
        networkFailures,
        runtimeExceptions,
        reusedChrome: chromeAlreadyRunning,
        reusedAuthoritativeBackend: backendAlreadyRunning,
        reusedFrontendDevServer: serverAlreadyRunning,
      },
      scenario: {
        backendPort:
          config.target === "authoritative-match" ? config.backendPort : null,
        botDifficulty:
          config.target === "authoritative-match"
            ? config.botDifficulty
            : null,
        bots: config.bots,
        requireAuthoritativeCombat:
          config.target === "authoritative-match"
            ? config.requireAuthoritativeCombat
            : null,
        durationSec: config.durationSec,
        chromeNativeWebgpu: config.chromeNativeWebgpu,
        height: config.height,
        presetId: config.presetId,
        route: config.route,
        startupWaitMs: config.startupWaitMs,
        target: config.target,
        url: appUrl.href,
        width: config.width,
      },
      summary,
    };

    if (config.outPath !== null) {
      await writeFile(config.outPath, JSON.stringify(result, null, 2));
      logInfo(`Wrote profile report to ${config.outPath}.`);
    }

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    if (cdp) {
      for (const unregister of unregisterEventListeners) {
        try {
          unregister();
        } catch {
          // Ignore listener cleanup failures during teardown.
        }
      }
      try {
        await cdp.close();
      } catch {
        // Ignore teardown errors during cleanup.
      }
    }
    await terminateProcess(chromeProcess);
    await terminateProcess(devServerProcess);
    await terminateProcess(backendProcess);
    if (chromeProcess !== null) {
      await rm(userDataDir, { force: true, recursive: true }).catch(() => {});
    }
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
