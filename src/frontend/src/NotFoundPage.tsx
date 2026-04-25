export function NotFoundPage() {
  const pathname =
    typeof window === "undefined" ? "" : window.location.pathname || "/";

  return (
    <div className="app-shell">
      <div className="page-overlay page-overlay--page">
        <div className="page-chrome">
          <section className="page-copy">
            <div className="page-copy__eyebrow">404</div>
            <h1 className="page-copy__title">Page not found</h1>
            <p className="page-copy__body">
              <code>{pathname}</code> is not a valid route. Use <code>/</code>,{" "}
              <code>/online</code>, <code>/offline</code>, or{" "}
              <code>/edit</code>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
