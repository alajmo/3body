import type { RoomRosterEntry } from "@3body/shared";
import { describe, expect, it } from "vitest";
import {
  formatAuthoritativeWinnerLabel,
  resolveAuthoritativePlayerLabel,
} from "./authoritativeMatchLabels";

const ROOM_ROSTER: RoomRosterEntry[] = [
  {
    isBot: false,
    name: "Pilot",
    playerId: "player:1",
    seat: 0,
  },
  {
    isBot: true,
    name: "Bot 1",
    playerId: "bot:room-1:1",
    seat: 1,
  },
];

describe("authoritativeMatchLabels", () => {
  it("resolves authoritative player labels to the assigned planet name", () => {
    expect(resolveAuthoritativePlayerLabel("bot:room-1:1", ROOM_ROSTER)).toBe(
      "Nadir",
    );
    expect(resolveAuthoritativePlayerLabel("player:1", ROOM_ROSTER)).toBe(
      "Atlas",
    );
  });

  it("falls back to the raw player id when the roster entry is missing", () => {
    expect(resolveAuthoritativePlayerLabel("player:missing", ROOM_ROSTER)).toBe(
      "player:missing",
    );
  });

  it("resolves abbreviated bot ids against the roster seat suffix", () => {
    expect(resolveAuthoritativePlayerLabel("bot:1", ROOM_ROSTER)).toBe("Nadir");
  });

  it("falls back to a planet name when no roster entry exists", () => {
    expect(resolveAuthoritativePlayerLabel("bot:4", [])).toBe("Lyra");
  });

  it("formats the winner label for named winners and mutual kills", () => {
    expect(formatAuthoritativeWinnerLabel("bot:room-1:1", ROOM_ROSTER)).toBe(
      "Nadir",
    );
    expect(formatAuthoritativeWinnerLabel("bot:1", ROOM_ROSTER)).toBe("Nadir");
    expect(formatAuthoritativeWinnerLabel(undefined, ROOM_ROSTER)).toBe(
      "Mutual kill",
    );
  });
});
