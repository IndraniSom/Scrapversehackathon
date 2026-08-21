/** Public BidRadar product entry. Authenticated work lives in tenant routes. */
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

/** Redirects active users and presents concrete procurement capabilities. */
export default async function HomePage() {
  const configured = process.env.BIDRADAR_E2E_MODE !== "1" && Boolean(process.env.CLERK_SECRET_KEY && (process.env.CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY));
  if (configured) {
    const session = await auth();
    if (session.userId) redirect("/opportunities");
  }
  return (
    <main id="main-content" className="page-shell">
      <section className="page-intro register-intro">
        <p className="source-line">Government procurement workspace</p>
        <h1>Find tenders. Prove eligibility. Ship a reviewed bid package.</h1>
        <p>BidRadar connects live tender collection, company evidence, deterministic eligibility, amendment review, proposals, and assisted portal handoff.</p>
        <div className="route-actions"><Link href="/sign-in" className="primary-action">Sign in</Link><Link href="/sign-up" className="secondary-action">Create account</Link></div>
      </section>
      <section aria-labelledby="workflow-title"><h2 id="workflow-title">One evidence trail from source to submission</h2>
        <dl className="definition-grid">
          <div><dt>Discover</dt><dd>Scheduled portal collection, filters, saved searches, and tenant-scoped semantic matching.</dd></div>
          <div><dt>Qualify</dt><dd>Reviewed tender clauses compared with versioned company evidence. Missing facts stay UNKNOWN.</dd></div>
          <div><dt>Prepare</dt><dd>Compliance rows, proposal sections, approved reusable content, comments, and review gates.</dd></div>
          <div><dt>Handoff</dt><dd>Validated ZIP package, official portal checklist, recent authentication, and immutable receipt.</dd></div>
        </dl>
      </section>
      <p className="disclaimer">Decision support only. BidRadar never submits autonomously. Final portal submission, DSC use, and legal review remain human responsibilities.</p>
    </main>
  );
}
