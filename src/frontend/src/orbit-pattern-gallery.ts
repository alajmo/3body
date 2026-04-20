import {
  EDITOR_FIXED_ORBIT_PATTERNS,
  getOrbitPatternTrack,
  type OrbitPatternTrack,
  sampleOrbitPatternTrack,
} from "@3body/shared";

const root = document.querySelector<HTMLDivElement>("#app");

if (root === null) {
  throw new Error("Orbit pattern gallery root not found.");
}

const SUN_COLORS = ["#f2b44c", "#e97937", "#f1dc7a"] as const;
const GRID_COLOR = "rgba(99, 67, 33, 0.08)";
const TRACK_ALPHA = 0.28;
const CENTER_DOT_COLOR = "rgba(85, 53, 19, 0.35)";
const PATH_OUTLINE_COLOR = "rgba(62, 38, 16, 0.18)";
const SUN_OUTLINE_COLOR = "rgba(62, 38, 16, 0.45)";

interface Bounds {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
}

type GalleryPatternSource = "candidate" | "validated";

interface GalleryPatternEntry {
  id: string;
  label: string;
  note: string;
  source: GalleryPatternSource;
  track: OrbitPatternTrack;
}

interface CardViewModel {
  bounds: Bounds;
  canvas: HTMLCanvasElement;
  id: string;
  label: string;
  note: string;
  offscreenPath: HTMLCanvasElement;
  phaseOffsetSec: number;
  source: GalleryPatternSource;
  track: OrbitPatternTrack;
}

const createElement = <T extends keyof HTMLElementTagNameMap>(
  tagName: T,
  className?: string,
  textContent?: string,
): HTMLElementTagNameMap[T] => {
  const element = document.createElement(tagName);
  if (className !== undefined) {
    element.className = className;
  }
  if (textContent !== undefined) {
    element.textContent = textContent;
  }
  return element;
};

const formatSeconds = (value: number): string => `${value.toFixed(2)}s`;

const formatCount = (value: number): string =>
  Intl.NumberFormat().format(value);

const formatSource = (source: GalleryPatternSource): string =>
  source === "validated" ? "Validated" : "Candidate";

const getTrackBounds = (track: OrbitPatternTrack): Bounds => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const frame of track.samples) {
    for (const sun of frame.suns) {
      minX = Math.min(minX, sun.pos.x);
      minY = Math.min(minY, sun.pos.y);
      maxX = Math.max(maxX, sun.pos.x);
      maxY = Math.max(maxY, sun.pos.y);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return {
      maxX: 1,
      maxY: 1,
      minX: -1,
      minY: -1,
    };
  }

  return { maxX, maxY, minX, minY };
};

const createGallerySection = (titleText: string, noteText: string) => {
  const section = createElement("section", "gallery-section");
  const header = createElement("div", "gallery-section-header");
  const title = createElement("h2", "gallery-section-title", titleText);
  const note = createElement("p", "gallery-section-note", noteText);
  const grid = createElement("div", "gallery");

  header.append(title, note);
  section.append(header, grid);

  return { grid, section };
};

const getCanvasSize = (canvas: HTMLCanvasElement) => {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const displayWidth = Math.max(1, Math.round(width * dpr));
  const displayHeight = Math.max(1, Math.round(height * dpr));

  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
  }

  return {
    dpr,
    height,
    width,
  };
};

const createProjector = (
  bounds: Bounds,
  width: number,
  height: number,
): ((x: number, y: number) => { x: number; y: number }) => {
  const spanX = Math.max(bounds.maxX - bounds.minX, 1);
  const spanY = Math.max(bounds.maxY - bounds.minY, 1);
  const padding = 22;
  const scale = Math.min(
    (width - padding * 2) / spanX,
    (height - padding * 2) / spanY,
  );
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  return (x, y) => ({
    x: width / 2 + (x - centerX) * scale,
    y: height / 2 - (y - centerY) * scale,
  });
};

const drawGrid = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) => {
  context.save();
  context.strokeStyle = GRID_COLOR;
  context.lineWidth = 1;

  const columns = 5;
  for (let column = 1; column < columns; column += 1) {
    const x = (width / columns) * column;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }

  const rows = 4;
  for (let row = 1; row < rows; row += 1) {
    const y = (height / rows) * row;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  context.fillStyle = CENTER_DOT_COLOR;
  context.beginPath();
  context.arc(width / 2, height / 2, 3, 0, Math.PI * 2);
  context.fill();
  context.restore();
};

const drawTrackPreview = (
  track: OrbitPatternTrack,
  bounds: Bounds,
  width: number,
  height: number,
): HTMLCanvasElement => {
  const dpr = window.devicePixelRatio || 1;
  const offscreen = document.createElement("canvas");
  offscreen.width = Math.max(1, Math.round(width * dpr));
  offscreen.height = Math.max(1, Math.round(height * dpr));

  const context = offscreen.getContext("2d");
  if (context === null) {
    return offscreen;
  }

  context.scale(dpr, dpr);
  drawGrid(context, width, height);
  const project = createProjector(bounds, width, height);

  for (let sunIndex = 0; sunIndex < 3; sunIndex += 1) {
    context.beginPath();

    track.samples.forEach((frame, frameIndex) => {
      const point = project(
        frame.suns[sunIndex]!.pos.x,
        frame.suns[sunIndex]!.pos.y,
      );
      if (frameIndex === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    });

    const firstPoint = project(
      track.samples[0]!.suns[sunIndex]!.pos.x,
      track.samples[0]!.suns[sunIndex]!.pos.y,
    );
    context.lineTo(firstPoint.x, firstPoint.y);

    context.strokeStyle = PATH_OUTLINE_COLOR;
    context.lineWidth = 4;
    context.stroke();
    context.strokeStyle = `${SUN_COLORS[sunIndex]}${Math.round(
      TRACK_ALPHA * 255,
    )
      .toString(16)
      .padStart(2, "0")}`;
    context.lineWidth = 2;
    context.stroke();
  }

  return offscreen;
};

const drawSun = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
) => {
  context.save();
  context.fillStyle = color;
  context.shadowBlur = 18;
  context.shadowColor = color;
  context.beginPath();
  context.arc(x, y, 6.25, 0, Math.PI * 2);
  context.fill();
  context.lineWidth = 1.5;
  context.strokeStyle = SUN_OUTLINE_COLOR;
  context.stroke();
  context.shadowBlur = 0;
  context.fillStyle = "rgba(255, 255, 255, 0.7)";
  context.beginPath();
  context.arc(x - 1.4, y - 1.4, 2.15, 0, Math.PI * 2);
  context.fill();
  context.restore();
};

const renderCard = (
  card: CardViewModel,
  elapsedSec: number,
  playbackSpeed: number,
) => {
  const { canvas, bounds, offscreenPath, phaseOffsetSec, track } = card;
  const { dpr, height, width } = getCanvasSize(canvas);
  const context = canvas.getContext("2d");
  if (context === null) {
    return;
  }

  if (
    offscreenPath.width !== Math.max(1, Math.round(width * dpr)) ||
    offscreenPath.height !== Math.max(1, Math.round(height * dpr))
  ) {
    card.offscreenPath = drawTrackPreview(track, bounds, width, height);
  }

  context.save();
  context.scale(dpr, dpr);
  context.clearRect(0, 0, width, height);
  context.drawImage(card.offscreenPath, 0, 0, width, height);

  const project = createProjector(bounds, width, height);
  const current = sampleOrbitPatternTrack(
    track,
    elapsedSec + phaseOffsetSec,
    playbackSpeed,
  );

  current.forEach((sun, index) => {
    const point = project(sun.pos.x, sun.pos.y);
    drawSun(context, point.x, point.y, SUN_COLORS[index]!);
  });

  context.restore();
};

const page = createElement("main", "page");
const hero = createElement("section", "hero");
const heading = createElement("h1");
heading.textContent = "Orbit Pattern Gallery";

const description = createElement(
  "p",
  undefined,
  "This page previews the baked fixed patterns currently exposed in /edit orbit, including the newer smooth 2D flower-style loops.",
);

const heroMeta = createElement("div", "hero-meta");
const countChip = createElement(
  "div",
  "meta-chip",
  `${EDITOR_FIXED_ORBIT_PATTERNS.length} validated patterns`,
);

const controls = createElement("div", "controls");
const speedLabel = createElement("label");
speedLabel.textContent = "Playback speed";
speedLabel.htmlFor = "orbit-gallery-speed";

const speedInput = document.createElement("input");
speedInput.id = "orbit-gallery-speed";
speedInput.type = "range";
speedInput.min = "0.25";
speedInput.max = "3";
speedInput.step = "0.05";
speedInput.value = "1";

const speedOutput = createElement("output");
speedOutput.htmlFor = speedInput.id;
speedOutput.textContent = "1.00x";

speedInput.addEventListener("input", () => {
  speedOutput.textContent = `${Number(speedInput.value).toFixed(2)}x`;
});

controls.append(speedLabel, speedInput, speedOutput);
heroMeta.append(countChip, controls);
hero.append(heading, description, heroMeta);

const legend = createElement("div", "legend");
["Auric path", "Ember path", "Halo path"].forEach((label, index) => {
  const item = createElement("div", "legend-item");
  const dot = createElement("span", "legend-dot");
  dot.style.background = SUN_COLORS[index]!;
  item.append(dot, document.createTextNode(label));
  legend.append(item);
});
hero.append(legend);

const validatedSection = createGallerySection(
  "Validated Fixed Patterns",
  "These are the baked runtime tracks that the editor and local/backend fixed-mode flow use.",
);

const buildCard = (
  entry: GalleryPatternEntry,
  index: number,
  target: HTMLElement,
): CardViewModel => {
  const { id: entryId, label, note, source, track } = entry;
  const bounds = getTrackBounds(track);

  const card = createElement("article", "pattern-card");
  const header = createElement("div", "pattern-header");
  const headerCopy = createElement("div", "pattern-copy");
  const title = createElement("h3", "pattern-title", label);
  const id = createElement("div", "pattern-id", entryId);
  const noteCopy = createElement("div", "pattern-note", note);
  const badge = createElement(
    "div",
    `pattern-badge pattern-badge--${source}`,
    formatSource(source),
  );
  headerCopy.append(title, id, noteCopy);
  header.append(headerCopy, badge);

  const stage = createElement("div", "pattern-stage");
  const canvas = createElement("canvas", "pattern-canvas") as HTMLCanvasElement;
  stage.append(canvas);

  const stats = createElement("div", "pattern-stats");
  const statEntries = [
    ["Period", formatSeconds(track.periodSec)],
    ["Samples", formatCount(track.samples.length)],
    ["Source", formatSource(source)],
  ] as const;

  for (const [statLabelText, value] of statEntries) {
    const stat = createElement("div", "stat");
    const statLabel = createElement("div", "stat-label", statLabelText);
    const statValue = createElement("div", "stat-value", value);
    stat.append(statLabel, statValue);
    stats.append(stat);
  }

  card.append(header, stage, stats);
  target.append(card);

  return {
    bounds,
    canvas,
    id: entryId,
    label,
    note,
    offscreenPath: drawTrackPreview(track, bounds, 320, 250),
    phaseOffsetSec: index * 0.6,
    source,
    track,
  };
};

const cards: CardViewModel[] = [];

cards.push(
  ...EDITOR_FIXED_ORBIT_PATTERNS.map((pattern, index) =>
    buildCard(
      {
        id: pattern.id,
        label: pattern.label,
        note: "Baked runtime track used by fixed mode.",
        source: "validated",
        track: getOrbitPatternTrack(pattern.id),
      },
      index,
      validatedSection.grid,
    ),
  ),
);

const footerNote = createElement(
  "p",
  "footer-note",
  "Open this page directly at /orbit-pattern-gallery.html while the Vite frontend is running.",
);

page.append(hero, validatedSection.section, footerNote);
root.replaceChildren(page);

const resizeObserver = new ResizeObserver(() => {
  for (const card of cards) {
    const { width, height } = getCanvasSize(card.canvas);
    card.offscreenPath = drawTrackPreview(
      card.track,
      card.bounds,
      width,
      height,
    );
  }
});

for (const card of cards) {
  resizeObserver.observe(card.canvas);
}

const startMs = performance.now();

const frame = () => {
  const elapsedSec = (performance.now() - startMs) / 1000;
  const playbackSpeed = Number(speedInput.value);

  for (const card of cards) {
    renderCard(card, elapsedSec, playbackSpeed);
  }

  requestAnimationFrame(frame);
};

requestAnimationFrame(frame);
