import type { Vec2 } from "@3body/shared";

export interface ShowcaseLayoutBounds {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
}

export interface ShowcaseLayoutExtent {
  halfHeight: number;
  halfWidth: number;
}

const ZERO_BOUNDS: ShowcaseLayoutBounds = {
  maxX: 0,
  maxY: 0,
  minX: 0,
  minY: 0,
};

const getSpanCenters = (lengths: readonly number[], gap: number): number[] => {
  if (lengths.length === 0) {
    return [];
  }

  const totalLength =
    lengths.reduce((sum, length) => sum + length, 0) +
    Math.max(0, lengths.length - 1) * gap;
  let cursor = -totalLength / 2;

  return lengths.map((length) => {
    const center = cursor + length / 2;
    cursor += length + gap;
    return center;
  });
};

export const getShowcaseGridPositions = ({
  cols,
  gapX,
  gapY,
  items,
}: {
  cols: number;
  gapX: number;
  gapY: number;
  items: readonly ShowcaseLayoutExtent[];
}): Vec2[] => {
  if (items.length === 0) {
    return [];
  }

  const normalizedCols = Math.max(1, Math.min(cols, items.length));
  const rowCount = Math.ceil(items.length / normalizedCols);
  const rowHeights = Array.from({ length: rowCount }, (_, rowIndex) => {
    const rowStart = rowIndex * normalizedCols;
    const rowItems = items.slice(rowStart, rowStart + normalizedCols);
    return rowItems.reduce(
      (maxHeight, item) => Math.max(maxHeight, item.halfHeight * 2),
      0,
    );
  });
  const rowCenters = getSpanCenters(rowHeights, gapY);
  const positions = new Array<Vec2>(items.length);

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const rowStart = rowIndex * normalizedCols;
    const rowItems = items.slice(rowStart, rowStart + normalizedCols);
    const columnCenters = getSpanCenters(
      rowItems.map((item) => item.halfWidth * 2),
      gapX,
    );
    const y = -(rowCenters[rowIndex] ?? 0);

    for (let columnIndex = 0; columnIndex < rowItems.length; columnIndex += 1) {
      positions[rowStart + columnIndex] = {
        x: columnCenters[columnIndex] ?? 0,
        y,
      };
    }
  }

  return positions;
};

const normalizeBounds = (
  bounds: ShowcaseLayoutBounds,
): ShowcaseLayoutBounds => {
  if (
    !Number.isFinite(bounds.minX) ||
    !Number.isFinite(bounds.maxX) ||
    !Number.isFinite(bounds.minY) ||
    !Number.isFinite(bounds.maxY)
  ) {
    return ZERO_BOUNDS;
  }

  return bounds;
};

const getBoundsCenter = (bounds: ShowcaseLayoutBounds): Vec2 => ({
  x: (bounds.minX + bounds.maxX) / 2,
  y: (bounds.minY + bounds.maxY) / 2,
});

const getBoundsExtent = (
  bounds: ShowcaseLayoutBounds,
): ShowcaseLayoutExtent => ({
  halfHeight: (bounds.maxY - bounds.minY) / 2,
  halfWidth: (bounds.maxX - bounds.minX) / 2,
});

export const getShowcaseBoundsGridOffsets = <T extends string>({
  cols,
  entries,
  gapX,
  gapY,
}: {
  cols: number;
  entries: readonly {
    bounds: ShowcaseLayoutBounds;
    id: T;
  }[];
  gapX: number;
  gapY: number;
}): Map<T, Vec2> => {
  const normalizedEntries = entries.map((entry) => ({
    bounds: normalizeBounds(entry.bounds),
    id: entry.id,
  }));
  const centers = getShowcaseGridPositions({
    cols,
    gapX,
    gapY,
    items: normalizedEntries.map((entry) => getBoundsExtent(entry.bounds)),
  });

  return new Map(
    normalizedEntries.map((entry, index) => {
      const center = centers[index] ?? { x: 0, y: 0 };
      const boundsCenter = getBoundsCenter(entry.bounds);

      return [
        entry.id,
        {
          x: center.x - boundsCenter.x,
          y: center.y - boundsCenter.y,
        },
      ];
    }),
  );
};
