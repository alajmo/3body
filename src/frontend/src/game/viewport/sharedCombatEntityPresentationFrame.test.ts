import { beforeEach, describe, expect, it, vi } from "vitest";

const entitySyncMocks = vi.hoisted(() => ({
  syncSharedCombatCachePresentation: vi.fn(),
  syncSharedCombatLaunchBurstPresentation: vi.fn(),
  syncSharedCombatRocketPresentation: vi.fn(),
}));

vi.mock("./sharedCombatEntityVisualSync", () => entitySyncMocks);

import { syncSharedCombatEntityPresentationFrame } from "./sharedCombatEntityPresentationFrame";

describe("syncSharedCombatEntityPresentationFrame", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs the shared entity presentation slices in sequence", () => {
    const frame = {
      caches: { nowSec: 1 } as never,
      launchBursts: { nowSec: 2 } as never,
      rockets: { nowSec: 3 } as never,
    };

    syncSharedCombatEntityPresentationFrame({ frame });

    expect(
      entitySyncMocks.syncSharedCombatCachePresentation,
    ).toHaveBeenCalledWith(frame.caches);
    expect(
      entitySyncMocks.syncSharedCombatRocketPresentation,
    ).toHaveBeenCalledWith(frame.rockets);
    expect(
      entitySyncMocks.syncSharedCombatLaunchBurstPresentation,
    ).toHaveBeenCalledWith(frame.launchBursts);
  });

  it("skips missing presentation slices", () => {
    const frame = {
      caches: null,
      launchBursts: null,
      rockets: { nowSec: 4 } as never,
    };

    syncSharedCombatEntityPresentationFrame({ frame });

    expect(
      entitySyncMocks.syncSharedCombatCachePresentation,
    ).not.toHaveBeenCalled();
    expect(
      entitySyncMocks.syncSharedCombatLaunchBurstPresentation,
    ).not.toHaveBeenCalled();
    expect(
      entitySyncMocks.syncSharedCombatRocketPresentation,
    ).toHaveBeenCalledWith(frame.rockets);
  });
});
