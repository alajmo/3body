import { useEffect, useRef, useState } from "react";

const ZOOM_DURATION_MS = 1100;
const INTRO_MUSIC_SRC = "/sounds/intro.ogg";
const INTRO_MUSIC_VOLUME = 0.20;

const navigate = (href: string) => {
  window.history.pushState({}, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
};

export function PlayMenuPage() {
  const [zoomTarget, setZoomTarget] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof Audio === "undefined") {
      return;
    }
    const audio = new Audio(INTRO_MUSIC_SRC);
    audio.loop = true;
    audio.volume = INTRO_MUSIC_VOLUME;
    audioRef.current = audio;

    const tryPlay = () => {
      void audio.play().catch(() => {});
    };

    tryPlay();
    const startOnInteract = () => {
      tryPlay();
      window.removeEventListener("pointerdown", startOnInteract);
      window.removeEventListener("keydown", startOnInteract);
    };
    window.addEventListener("pointerdown", startOnInteract);
    window.addEventListener("keydown", startOnInteract);

    return () => {
      window.removeEventListener("pointerdown", startOnInteract);
      window.removeEventListener("keydown", startOnInteract);
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  const startZoom = (href: string) => {
    if (zoomTarget !== null) {
      return;
    }
    setZoomTarget(href);
    timeoutRef.current = window.setTimeout(() => {
      navigate(href);
    }, ZOOM_DURATION_MS);
  };

  const isZooming = zoomTarget !== null;

  return (
    <div className={`play-menu${isZooming ? " play-menu--zooming" : ""}`}>
      <div className="play-menu__bg-stack" aria-hidden="true">
        <div className="play-menu__bg-ring play-menu__bg-ring--1" />
        <div className="play-menu__bg-ring play-menu__bg-ring--2" />
        <div className="play-menu__bg-ring play-menu__bg-ring--3" />
        <div className="play-menu__bg-ring play-menu__bg-ring--4" />
        <div className="play-menu__bg-ring play-menu__bg-ring--5" />
      </div>
      <div className="play-menu__scanlines" aria-hidden="true" />
      <div className="play-menu__iris" aria-hidden="true" />
      <div className="play-menu__static" aria-hidden="true" />
      <div className="play-menu__flash" aria-hidden="true" />
      <h1 className="play-menu__title">
        <span className="play-menu__title-text" data-text="3 BODY PROBLEM">
          3 BODY PROBLEM
        </span>
      </h1>
      <div className="play-menu__actions">
        <button
          type="button"
          id="play-menu-online-btn"
          className="play-menu__button"
          onClick={() => startZoom("/online")}
          disabled={isZooming}
        >
          Online
        </button>
        <button
          type="button"
          id="play-menu-offline-btn"
          className="play-menu__button"
          onClick={() => startZoom("/offline")}
          disabled={isZooming}
        >
          Offline
        </button>
      </div>
    </div>
  );
}
