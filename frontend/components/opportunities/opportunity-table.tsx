/**
 * Accessible opportunity table with bulk watch/unwatch.
 *
 * Uses native table semantics, row checkboxes, and pagination cursors.
 * No ARIA grid; keyboard navigation follows native tab order.
 */
"use client";

import Link from "next/link";
import { useState } from "react";

export type OpportunityRow = {
  _id: string;
  source: string;
  sourceTenderId: string;
  title: string;
  authority: string;
  category?: string;
  lifecycle: string;
  closesAt?: number;
  budgetAmount?: number;
  hasAmendment?: boolean;
  assessmentRecommendation?: string;
  dataMode?: string;
};

type Props = {
  rows: OpportunityRow[];
  isDone?: boolean;
  continueCursor?: string | null;
  onLoadMore?: (cursor: string) => void;
  onBulkWatch?: (ids: string[]) => void;
  onBulkUnwatch?: (ids: string[]) => void;
};

/**
 * Renders an overflow-safe table with bulk selection.
 */
export function OpportunityTable({ rows, isDone, continueCursor, onLoadMore, onBulkWatch, onBulkUnwatch }: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggleAll(checked: boolean) {
    if (checked) setSelected(new Set(rows.map((r) => r._id)));
    else setSelected(new Set());
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (checked) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  if (rows.length === 0) {
    return (
      <section className="empty-state" aria-labelledby="opp-empty">
        <h2 id="opp-empty">No opportunities match</h2>
        <p>Adjust filters, clear keyword prefix, or save this search to be notified when matches appear. Add a company to evaluate eligibility when records arrive.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="opp-title">
      <div className="section-heading-row">
        <div>
          <h2 id="opp-title">Opportunities</h2>
          <p className="help-text">{rows.length} results · use filters to narrow · bulk actions respect tenant isolation</p>
        </div>
        <div className="bulk-actions" role="group" aria-label="Bulk actions">
          <button type="button" className="btn-primary" disabled={selected.size === 0} onClick={() => onBulkWatch?.([...selected])} aria-describedby="opp-title">
            Watch ({selected.size})
          </button>
          <button type="button" className="btn-ghost" disabled={selected.size === 0} onClick={() => onBulkUnwatch?.([...selected])}>
            Unwatch
          </button>
        </div>
      </div>
      <div className="table-wrap" tabIndex={0} role="region" aria-labelledby="opp-title">
        <table>
          <caption className="sr-only">Opportunity register with source, authority, category, deadline, and snapshot proof</caption>
          <thead>
            <tr>
              <th scope="col">
                <input aria-label="Select all opportunities" type="checkbox" checked={allSelected} onChange={(e) => toggleAll(e.target.checked)} style={{ width: 18, height: 18, minHeight: 0 }} />
              </th>
              <th scope="col">Opportunity</th>
              <th scope="col">Source</th>
              <th scope="col">Authority</th>
              <th scope="col">Category</th>
              <th scope="col">Closes</th>
              <th scope="col">Budget</th>
              <th scope="col">Mode</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id}>
                <td>
                  <input
                    aria-label={`Select ${r.title}`}
                    type="checkbox"
                    checked={selected.has(r._id)}
                    onChange={(e) => toggleOne(r._id, e.target.checked)}
                    style={{ width: 18, height: 18, minHeight: 0 }}
                  />
                </td>
                <td>
                  <Link className="primary-link opportunity-title-link" href={`/opportunities/${encodeURIComponent(r._id)}`}>{r.title}</Link>
                  <span className="subline">{r.sourceTenderId}{r.hasAmendment ? " · Amended" : ""}</span>
                </td>
                <td>{r.source}</td>
                <td>{r.authority}</td>
                <td>{r.category?.replaceAll("_", " ") ?? "—"}</td>
                <td>{r.closesAt ? new Date(r.closesAt).toLocaleDateString("en-IN") : "—"}</td>
                <td>{r.budgetAmount !== undefined ? `₹${r.budgetAmount.toLocaleString("en-IN")}` : "—"}</td>
                <td><code>{r.dataMode ?? "—"}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pagination-row">
        <button type="button" className="btn-ghost" disabled={isDone || !continueCursor} onClick={() => continueCursor && onLoadMore?.(continueCursor)}>
          Load more
        </button>
        <span aria-live="polite" className="help-text">{isDone ? "End of results" : "More results available — continue scrolls via keyboard"}</span>
      </div>
    </section>
  );
}
