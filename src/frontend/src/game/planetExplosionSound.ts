const PLANET_EXPLOSION_SOUND_SRC = "/sounds/planet-explosion.mp3";
const PLANET_EXPLOSION_SOUND_VOLUME = 0.25;
const PLANET_EXPLOSION_SOUND_POOL_SIZE = 4;

let pool: HTMLAudioElement[] | null = null;
let nextIndex = 0;

const ensurePool = (): HTMLAudioElement[] | null => {
  if (typeof Audio === "undefined") {
    return null;
  }
  if (pool === null) {
    pool = Array.from({ length: PLANET_EXPLOSION_SOUND_POOL_SIZE }, () => {
      const audio = new Audio(PLANET_EXPLOSION_SOUND_SRC);
      audio.volume = PLANET_EXPLOSION_SOUND_VOLUME;
      audio.preload = "auto";
      return audio;
    });
  }
  return pool;
};

export const playPlanetExplosionSound = () => {
  const audios = ensurePool();
  if (audios === null) {
    return;
  }
  const audio = audios[nextIndex]!;
  nextIndex = (nextIndex + 1) % audios.length;
  try {
    audio.currentTime = 0;
  } catch {
    // ignore
  }
  void audio.play().catch(() => {});
};
