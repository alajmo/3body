import { useEffect, useRef, useState } from "react";

const ZOOM_DURATION_MS = 1100;

const navigate = (href: string) => {
  window.history.pushState({}, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
};

export function PlayMenuPage() {
  const [zoomTarget, setZoomTarget] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
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
      <div className="play-menu__bg" aria-hidden="true" />
      <div className="play-menu__scanlines" aria-hidden="true" />
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
          className="play-menu__button"
          onClick={() => startZoom("/online")}
          disabled={isZooming}
        >
          Online
        </button>
        <button
          type="button"
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
