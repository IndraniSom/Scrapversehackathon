/**
 * Opportunity register table with accessible semantics.
 *
 * Provides caption, scope, keyboard scroll, and 44px link targets.
 */
import Link from "next/link";

import type { OpportunityListEnvelope, OpportunitySummary } from "../schemas/opportunities";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

/** Formats timestamp for stable display. */
function formatDate(value: string | null): string {
  if (value === null) return "Not supplied";
  return dateFormatter.format(new Date(value));
}

/** Renders a single row with evidence links. */
function OpportunityRow({ opportunity }: { opportunity: OpportunitySummary }) {
  return (
    <tr>
      <td>
        <span className="source-label">{opportunity.source}</span>
      </td>
      <td>
        <Link className="primary-link opportunity-title-link" href={`/opportunities/${encodeURIComponent(opportunity.id)}`}>
          {opportunity.title}
        </Link>
        <span className="subline">
          {opportunity.authority} · {opportunity.reference_number ?? opportunity.source_tender_id}
        </span>
      </td>
      <td>{opportunity.category.replaceAll("_", " ")}</td>
      <td>{formatDate(opportunity.closes_at)}</td>
      <td>
        <code>{opportunity.data_mode}</code>
      </td>
      <td>
        <code className="hash" title={opportunity.snapshot_sha256}>
          {opportunity.snapshot_sha256.slice(0, 16)}…
        </code>
        <a className="text-link compact-link" href={opportunity.canonical_url} target="_blank" rel="noreferrer">
          Open official notice
        </a>
      </td>
    </tr>
  );
}

/** Empty state that teaches next action without vague copy. */
export function EmptyOpportunities() {
  return (
    <section className="empty-state" aria-labelledby="empty-title">
      <h2 id="empty-title">No opportunities are available</h2>
      <p>The backend returned a validated empty register. Run a collection or adjust filters. Add a company to evaluate eligibility when records appear.</p>
    </section>
  );
}

/** Renders validated register with overflow-safe, keyboard-accessible table. */
export function OpportunityTable({ envelope }: { envelope: OpportunityListEnvelope }) {
  if (envelope.data.items.length === 0) return <EmptyOpportunities />;
  return (
    <section aria-labelledby="register-title">
      <div className="section-heading-row register-heading">
        <div>
          <h2 id="register-title">Opportunity register</h2>
          <p>{envelope.data.total} validated records across configured sources.</p>
        </div>
        <p className="freshness">Generated {formatDate(envelope.data.generated_at)}</p>
      </div>
      <div className="table-wrap" tabIndex={0} role="region" aria-labelledby="register-title">
        <table>
          <caption className="sr-only">Opportunity register with source, category, deadline, and snapshot proof</caption>
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Opportunity</th>
              <th scope="col">Category</th>
              <th scope="col">Closes</th>
              <th scope="col">Data mode</th>
              <th scope="col">Snapshot proof</th>
            </tr>
          </thead>
          <tbody>{envelope.data.items.map((opportunity) => <OpportunityRow key={opportunity.id} opportunity={opportunity} />)}</tbody>
        </table>
      </div>
    </section>
  );
}
