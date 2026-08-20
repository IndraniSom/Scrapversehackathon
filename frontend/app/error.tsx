"use client";

/** Handles unexpected route failures without exposing server error details. */
export default function ErrorBoundary({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="page-shell state-page" id="main-content">
      <section className="state-banner error-banner" role="alert">
        <span className="state-mark" aria-hidden="true">!</span>
        <div>
          <h1>Unexpected application error</h1>
          <p>The current view could not be rendered safely. Retry the validated backend request.</p>
          {error.digest && <p className="error-reference">Reference: <code>{error.digest}</code></p>}
          <button className="primary-action" type="button" onClick={retry}>Try again</button>
        </div>
      </section>
    </main>
  );
}
