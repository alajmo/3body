import type { PlayerId, RoomRosterEntry } from "@3body/shared";
import { getPlanetNameForSeat } from "./planetNames";

const BOT_ID_RE = /^bot:(?:.+:)?(\d+)$/;

export const resolveAuthoritativePlayerLabel = (
  playerId: PlayerId,
  roomRoster: readonly RoomRosterEntry[],
): string => {
  const exactMatch = roomRoster.find((entry) => entry.playerId === playerId);
  if (exactMatch) {
    return getPlanetNameForSeat(exactMatch.seat);
  }

  const botSuffixMatch = BOT_ID_RE.exec(playerId);
  if (!botSuffixMatch) {
    return playerId;
  }

  const seat = Number.parseInt(botSuffixMatch[1]!, 10);
  const rosterBotMatch = roomRoster.find(
    (entry) => entry.isBot && entry.playerId.endsWith(`:${seat}`),
  );
  if (rosterBotMatch) {
    return getPlanetNameForSeat(rosterBotMatch.seat);
  }

  return Number.isFinite(seat) ? getPlanetNameForSeat(seat) : playerId;
};

export const formatAuthoritativeWinnerLabel = (
  winnerId: PlayerId | undefined,
  roomRoster: readonly RoomRosterEntry[],
): string =>
  winnerId === undefined
    ? "Mutual kill"
    : resolveAuthoritativePlayerLabel(winnerId, roomRoster);
