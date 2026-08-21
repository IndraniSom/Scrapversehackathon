/** Persistent compliance review page for one proposal. */
"use client";

import { useQuery } from "convex/react";
import { use } from "react";

import { ComplianceMatrix } from "../../../../../components/proposals/compliance-matrix";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

/** Loads authenticated compliance rows and renders approval gates. */
export default function CompliancePage({ params }: { params: Promise<{ proposalId: string }> }) {
  const { proposalId } = use(params);
  const rows = useQuery(api.compliance.listComplianceRows, { proposalId: proposalId as Id<"proposalProjects"> });
  return (
    <main className="page-shell" id="main-content">
      <header className="page-intro">
        <p className="source-line">Proposal {proposalId} · Compliance review</p>
        <h1>Compliance matrix</h1>
        <p>Review each requirement citation, response location, evidence link and owner before approval. Export CSV for the submission package.</p>
      </header>
      {rows === undefined ? <p role="status">Loading compliance rows…</p> : <ComplianceMatrix rows={rows} />}
      <p className="disclaimer">Rows come from accepted requirements. Automated grouping never approves a row or bypasses mandatory evidence.</p>
    </main>
  );
}
