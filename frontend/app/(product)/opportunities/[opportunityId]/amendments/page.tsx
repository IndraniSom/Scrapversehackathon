/** Persistent authority-gated amendment review for one tender. */
"use client";

import { useMutation, useQuery } from "convex/react";
import { use } from "react";
import { useState } from "react";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

/** Returns a bounded display object for stored authority JSON. */
function authorityStatement(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch (error) {
    void error;
    return {};
  }
}

/** Narrows parsed JSON to a non-array record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Lists deterministic changes and permits authorized human application. */
export default function AmendmentsPage({ params }: { params: Promise<{ opportunityId: string }> }) {
  const { opportunityId } = use(params);
  const opportunity = useQuery(api.opportunities.getOpportunity, { opportunityId: opportunityId as Id<"opportunities"> });
  const amendments = useQuery(api.amendments.listAmendments, { opportunityId: opportunityId as Id<"opportunities"> });
  const apply = useMutation(api.amendments.applyAmendment);
  const [notice, setNotice] = useState("");
  if (opportunity === undefined || amendments === undefined) return <main className="page-shell" id="main-content"><p role="status">Loading amendments…</p></main>;
  return (
    <main className="page-shell detail-page" id="main-content">
      <header className="page-intro"><p className="source-line">{opportunity.sourceTenderId}</p><h1>Amendment impact</h1><p>Only accepted authority changes can alter requirements or invalidate downstream work.</p></header>
      {amendments.length === 0 ? <p className="empty-state">No amendment impact recorded.</p> : amendments.map((amendment) => { const statement = authorityStatement(amendment.authorityStatement); return <article key={amendment._id} className="panel"><h2>{String(statement.disposition ?? "Unreviewed")} · {String(statement.actor ?? "Unknown actor")}</h2><p>{amendment.transition}</p><dl className="definition-grid"><div><dt>Old rule</dt><dd>{amendment.oldRule ?? "Not stored"}</dd></div><div><dt>New rule</dt><dd>{amendment.newRule ?? "Not stored"}</dd></div><div><dt>Applied</dt><dd>{amendment.applied ? "Yes" : "No"}</dd></div></dl>{!amendment.applied ? <button type="button" className="primary-action" onClick={() => void apply({ amendmentId: amendment._id }).then(() => setNotice("Authority change applied; dependent work marked stale."))}>Apply reviewed change</button> : null}</article>; })}
      {notice ? <p role="status">{notice}</p> : null}
    </main>
  );
}
