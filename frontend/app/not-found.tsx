import Link from "next/link";

/** Renders the shared opportunity 404 state with a clear recovery route. */
export default function NotFound() {
  return (
    <main className="page-shell state-page" id="main-content">
      <section className="state-banner unknown-banner">
        <span className="state-mark" aria-hidden="true">?</span>
        <div><h1>Opportunity not found</h1><p>This identifier does not exist in the validated opportunity register.</p><Link className="text-link" href="/">Return to opportunity register</Link></div>
      </section>
    </main>
  );
}
