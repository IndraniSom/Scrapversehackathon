import Link from "next/link";

import type { OpportunityListEnvelope, OpportunitySummary } from "../schemas/opportunities";

const dateFormatter = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/** Formats an API timestamp for compact, locale-stable register display. */
function formatDate(value: string | null): string {
  if (value === null) return "Not supplied";
  return dateFormatter.format(new Date(value));
}

/** Renders a procurement row with source, deadline, mode, and official evidence links. */
function OpportunityRow({ opportunity }: { opportunity: OpportunitySummary }) {
  return (
    <tr>
      <td><span className="source-label">{opportunity.source}</span></td>
      <td>
        <Link className="primary-link" href={`/opportunities/${opportunity.id}`}>{opportunity.title}</Link>
        <span className="subline">{opportunity.authority} · {opportunity.reference_number ?? opportunity.source_tender_id}</span>
      </td>
      <td>{opportunity.category.replaceAll("_", " ")}</td>
      <td>{formatDate(opportunity.closes_at)}</td>
      <td><code>{opportunity.data_mode}</code></td>
      <td>
        <code className="hash" title={opportunity.snapshot_sha256}>{opportunity.snapshot_sha256.slice(0, 16)}…</code>
        <a className="text-link compact-link" href={opportunity.canonical_url} target="_blank" rel="noreferrer">Open official notice</a>
      </td>
    </tr>
  );
}

/** Teaches the register state when the backend truthfully returns no rows. */
export function EmptyOpportunities() {
  return (
    <section className="empty-state" aria-labelledby="empty-title">
      <h2 id="empty-title">No opportunities are available</h2>
      <p>The backend returned a validated empty register. Try again after the next collection run.</p>
    </section>
  );
}

/** Renders the validated opportunity register in an overflow-safe data table. */
export function OpportunityTable({ envelope }: { envelope: OpportunityListEnvelope }) {
  if (envelope.data.items.length === 0) return <EmptyOpportunities />;
  return (
    <section aria-labelledby="register-title">
      <div className="section-heading-row register-heading">
        <div><h2 id="register-title">Opportunity register</h2><p>{envelope.data.total} validated records across configured sources.</p></div>
        <p className="freshness">Generated {formatDate(envelope.data.generated_at)}</p>
      </div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable opportunity register">
        <table>
          <thead><tr><th scope="col">Source</th><th scope="col">Opportunity</th><th scope="col">Category</th><th scope="col">Closes</th><th scope="col">Data mode</th><th scope="col">Snapshot proof</th></tr></thead>
          <tbody>{envelope.data.items.map((opportunity) => <OpportunityRow key={opportunity.id} opportunity={opportunity} />)}</tbody>
        </table>
      </div>
    </section>
  );
}
