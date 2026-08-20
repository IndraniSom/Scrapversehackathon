/**
 * Proposal projects index — lists tenant projects with explicit progress.
 * Outline generation requires bid-manager approval; edits to locked blocked.
 */
import Link from "next/link";

export const dynamic = "force-dynamic";

/** Static placeholder proposals for shell verification; convex replaces at runtime. */
const SAMPLE = [
  { id: "proposal-ocac-26001", title: "OCAC Pond Monitoring — Technical Proposal", progress: "2/5 approved (40%)", state: "DRAFTING" },
  { id: "proposal-wb-063", title: "WB Health — Compliance Response", progress: "1/3 approved (33%)", state: "NOT_STARTED" },
];

/** Renders the proposal project register with cited outline governance. */
export default function ProposalsPage() {
  return (
    <main id="main-content" className="page-shell">
      <header className="page-intro">
        <p className="source-line">Proposal collaboration</p>
        <h1>Proposals</h1>
        <p>Every outline heading cites an instruction or evaluation clause. Progress derives from explicit section states, not AI percentages. Locked revisions cannot be edited.</p>
      </header>
      <section aria-labelledby="proposals-title">
        <div className="section-heading-row">
          <h2 id="proposals-title">Proposal projects</h2>
          <Link href="/proposals" className="primary-action">New proposal</Link>
        </div>
        <div className="table-wrap" role="region" aria-label="Proposal projects">
          <table>
            <thead><tr><th scope="col">Proposal</th><th scope="col">Progress</th><th scope="col">State</th><th scope="col">Action</th></tr></thead>
            <tbody>
              {SAMPLE.map((p)=>(
                <tr key={p.id}>
                  <td>{p.title}</td>
                  <td><code>{p.progress}</code></td>
                  <td>{p.state}</td>
                  <td><Link className="primary-link" href={`/proposals/${encodeURIComponent(p.id)}`}>Open workspace</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>Bid-manager approval is required to generate or lock the outline. Ask your bid manager to approve the cited outline before drafting.</p>
      </section>
    </main>
  );
}
