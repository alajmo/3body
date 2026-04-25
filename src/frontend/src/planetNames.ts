export const PLANET_NAMES = [
  "Atlas",
  "Nadir",
  "Helios",
  "Orbit",
  "Lyra",
  "Vega",
  "Rook",
] as const;

export const getPlanetNameForSeat = (seat: number): string =>
  PLANET_NAMES[seat] ?? `Planet ${seat + 1}`;
