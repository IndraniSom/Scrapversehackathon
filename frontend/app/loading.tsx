/** Shows an immediate, reduced-motion-safe skeleton while route data resolves. */
export default function Loading() {
  return (
    <main className="page-shell state-page" id="main-content">
      <section className="loading-state" role="status" aria-live="polite">
        <span className="loading-mark" aria-hidden="true" />
        <div><h1>Loading procurement evidence</h1><p>Validating the backend response and source provenance.</p></div>
      </section>
    </main>
  );
}
