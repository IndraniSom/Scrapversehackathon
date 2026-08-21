/**
 * Skeleton fallback for procurement routes.
 *
 * Uses destination-shaped blocks and respects reduced motion.
 */
export default function Loading() {
  return (
    <main className="page-shell" id="main-content" aria-busy="true">
      <div className="skeleton" role="status" aria-live="polite">
        <span className="sr-only">Loading procurement evidence. Validating backend response.</span>
        <div className="skeleton-line full" aria-hidden="true" />
        <div className="skeleton-line medium" aria-hidden="true" />
        <div className="skeleton-line short" aria-hidden="true" />
        <div className="skeleton-block" aria-hidden="true" />
        <div className="skeleton-table" aria-hidden="true">
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      </div>
    </main>
  );
}
