import { describe, expect, it } from "vitest";
import {
  getShowcaseBoundsGridOffsets,
  getShowcaseGridPositions,
  type ShowcaseLayoutBounds,
  type ShowcaseLayoutExtent,
} from "./showcaseLayout";

const getLayoutBounds = (
  positions: readonly { x: number; y: number }[],
  items: readonly ShowcaseLayoutExtent[],
) => ({
  maxX: Math.max(
    ...positions.map((position, index) => position.x + items[index]!.halfWidth),
  ),
  maxY: Math.max(
    ...positions.map(
      (position, index) => position.y + items[index]!.halfHeight,
    ),
  ),
  minX: Math.min(
    ...positions.map((position, index) => position.x - items[index]!.halfWidth),
  ),
  minY: Math.min(
    ...positions.map(
      (position, index) => position.y - items[index]!.halfHeight,
    ),
  ),
});

const translateBounds = (
  bounds: ShowcaseLayoutBounds,
  offset: { x: number; y: number },
): ShowcaseLayoutBounds => ({
  maxX: bounds.maxX + offset.x,
  maxY: bounds.maxY + offset.y,
  minX: bounds.minX + offset.x,
  minY: bounds.minY + offset.y,
});

describe("getShowcaseGridPositions", () => {
  it("packs uneven items into a centered grid without overlapping rows", () => {
    const items = [
      { halfHeight: 70, halfWidth: 100 },
      { halfHeight: 2240, halfWidth: 1980 },
      { halfHeight: 270, halfWidth: 270 },
      { halfHeight: 95, halfWidth: 200 },
      { halfHeight: 120, halfWidth: 120 },
      { halfHeight: 410, halfWidth: 254 },
    ] satisfies ShowcaseLayoutExtent[];

    const positions = getShowcaseGridPositions({
      cols: 3,
      gapX: 420,
      gapY: 360,
      items,
    });
    const bounds = getLayoutBounds(positions, items);

    expect(positions).toHaveLength(6);
    expect((bounds.minX + bounds.maxX) / 2).toBe(0);
    expect((bounds.minY + bounds.maxY) / 2).toBe(0);
    expect(positions[0]!.x).toBeLessThan(positions[1]!.x);
    expect(positions[1]!.x).toBeLessThan(positions[2]!.x);
    expect(positions[3]!.x).toBeLessThan(positions[4]!.x);
    expect(positions[4]!.x).toBeLessThan(positions[5]!.x);
    expect(positions[0]!.y).toBeGreaterThan(positions[3]!.y);
  });
});

describe("getShowcaseBoundsGridOffsets", () => {
  it("recenters section bounds into the same centered grid", () => {
    const entries = [
      {
        bounds: { maxX: 110, maxY: 70, minX: -90, minY: -70 },
        id: "planets",
      },
      {
        bounds: { maxX: 2620, maxY: 2240, minX: -1340, minY: -2240 },
        id: "suns",
      },
      {
        bounds: { maxX: 270, maxY: 270, minX: -270, minY: -270 },
        id: "blackHole",
      },
      {
        bounds: { maxX: 220, maxY: 85, minX: -180, minY: -95 },
        id: "rockets",
      },
      {
        bounds: { maxX: 120, maxY: 120, minX: -120, minY: -120 },
        id: "caches",
      },
      {
        bounds: { maxX: 254, maxY: 410, minX: -254, minY: -410 },
        id: "neutronStar",
      },
    ] as const;

    const offsets = getShowcaseBoundsGridOffsets({
      cols: 3,
      entries,
      gapX: 420,
      gapY: 360,
    });
    const placedBounds = entries.map((entry) =>
      translateBounds(entry.bounds, offsets.get(entry.id) ?? { x: 0, y: 0 }),
    );
    const minX = Math.min(...placedBounds.map((bounds) => bounds.minX));
    const maxX = Math.max(...placedBounds.map((bounds) => bounds.maxX));
    const minY = Math.min(...placedBounds.map((bounds) => bounds.minY));
    const maxY = Math.max(...placedBounds.map((bounds) => bounds.maxY));

    expect((minX + maxX) / 2).toBe(0);
    expect((minY + maxY) / 2).toBe(0);
    expect(offsets.get("suns")).toBeDefined();
    expect(offsets.get("blackHole")).toBeDefined();
    expect(offsets.get("neutronStar")).toBeDefined();
  });

  it("normalizes empty section bounds from the viewport prepass", () => {
    const offsets = getShowcaseBoundsGridOffsets({
      cols: 3,
      entries: [
        {
          bounds: {
            maxX: -Infinity,
            maxY: -Infinity,
            minX: Infinity,
            minY: Infinity,
          },
          id: "planets",
        },
        {
          bounds: { maxX: 2620, maxY: 2240, minX: -1340, minY: -2240 },
          id: "suns",
        },
      ],
      gapX: 420,
      gapY: 360,
    });

    expect(Number.isFinite(offsets.get("planets")?.x ?? NaN)).toBe(true);
    expect(Number.isFinite(offsets.get("planets")?.y ?? NaN)).toBe(true);
    expect(Number.isFinite(offsets.get("suns")?.x ?? NaN)).toBe(true);
    expect(Number.isFinite(offsets.get("suns")?.y ?? NaN)).toBe(true);
  });
});
