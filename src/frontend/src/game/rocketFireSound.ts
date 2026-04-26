const ROCKET_FIRE_SOUND_SRC = "/sounds/launching-missile.mp3";
const ROCKET_FIRE_SOUND_VOLUME = 0.2;
const ROCKET_FIRE_SOUND_POOL_SIZE = 4;

let pool: HTMLAudioElement[] | null = null;
let nextIndex = 0;

const ensurePool = (): HTMLAudioElement[] | null => {
  if (typeof Audio === "undefined") {
    return null;
  }
  if (pool === null) {
    pool = Array.from({ length: ROCKET_FIRE_SOUND_POOL_SIZE }, () => {
      const audio = new Audio(ROCKET_FIRE_SOUND_SRC);
      audio.volume = ROCKET_FIRE_SOUND_VOLUME;
      audio.preload = "auto";
      return audio;
    });
  }
  return pool;
};

export const playRocketFireSound = () => {
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
