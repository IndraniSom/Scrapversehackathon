/** Persistent tender detail with documents, assessments, and amendment state. */
"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { use } from "react";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

/** Loads one tenant-owned opportunity and its accepted workflow records. */
export default function OpportunityPage({ params }: { params: Promise<{ opportunityId: string }> }) {
  const { opportunityId } = use(params);
  const id = opportunityId as Id<"opportunities">;
  const opportunity = useQuery(api.opportunities.getOpportunity, { opportunityId: id });
  const documents = useQuery(api.documents.listDocuments, { opportunityId: id });
  const assessments = useQuery(api.assessments.listByOpportunity, { opportunityId: id });
  const amendments = useQuery(api.amendments.listAmendments, { opportunityId: id });
  if (opportunity === undefined || documents === undefined || assessments === undefined || amendments === undefined) return <main className="page-shell" id="main-content"><p role="status">Loading tender workspace…</p></main>;
  return (
    <main className="page-shell detail-page" id="main-content">
      <header className="page-intro"><p className="source-line">{opportunity.source} · {opportunity.sourceTenderId}</p><h1>{opportunity.title}</h1><p>{opportunity.authority}</p></header>
      <dl className="definition-grid"><div><dt>Lifecycle</dt><dd>{opportunity.lifecycle}</dd></div><div><dt>Category</dt><dd>{opportunity.category ?? "Not classified"}</dd></div><div><dt>Location</dt><dd>{opportunity.location ?? "Not stated"}</dd></div><div><dt>Closes</dt><dd>{opportunity.closesAt ? new Date(opportunity.closesAt).toLocaleString() : "Not stated"}</dd></div></dl>
      <div className="route-actions"><Link className="primary-action" href={`/opportunities/${opportunityId}/assessment`}>Run assessment</Link><Link className="secondary-action" href={`/opportunities/${opportunityId}/ask`}>Ask tender</Link><Link className="secondary-action" href={`/opportunities/${opportunityId}/amendments`}>Review amendments ({amendments.length})</Link>{opportunity.canonicalUrl ? <a className="secondary-action" href={opportunity.canonicalUrl} target="_blank" rel="noreferrer">Open official notice</a> : null}</div>
      <section><h2>Official documents</h2>{documents.length === 0 ? <p className="empty-state">No verified documents have been acquired.</p> : <ul>{documents.map((document) => <li key={document._id}>{document.role} · {document.authority} · <a href={document.url} target="_blank" rel="noreferrer">Official source</a></li>)}</ul>}</section>
      <section><h2>Latest assessment</h2>{assessments.length === 0 ? <p className="empty-state">No completed assessment.</p> : <p><strong>{assessments.at(-1)?.recommendation}</strong> · {assessments.at(-1)?.counts.fail} failed · {assessments.at(-1)?.counts.unknown} unknown</p>}</section>
      <p className="disclaimer">Source data, requirements, and company evidence remain versioned. Missing evidence is never converted to PASS.</p>
    </main>
  );
}
