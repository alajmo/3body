import {
  getOrbitIndexForPlayerOrder,
  getPreferredLocalPlayerOrbitIndex,
} from "@3body/shared";
import { describe, expect, it } from "vitest";

describe("orbit slot assignment", () => {
  it("keeps the local player on the calmer outer orbit slot when available", () => {
    expect(getPreferredLocalPlayerOrbitIndex(8)).toBe(4);
    expect(getPreferredLocalPlayerOrbitIndex(5)).toBe(4);
    expect(getPreferredLocalPlayerOrbitIndex(3)).toBe(2);
    expect(getPreferredLocalPlayerOrbitIndex(1)).toBe(0);
  });

  it("rotates seat order onto orbit slots around the preferred local slot", () => {
    expect(
      Array.from({ length: 8 }, (_, index) =>
        getOrbitIndexForPlayerOrder(index, 8),
      ),
    ).toEqual([4, 5, 6, 7, 0, 1, 2, 3]);
    expect(
      Array.from({ length: 3 }, (_, index) =>
        getOrbitIndexForPlayerOrder(index, 3),
      ),
    ).toEqual([2, 0, 1]);
  });
});
