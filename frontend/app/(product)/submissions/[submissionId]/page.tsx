/** Persistent assisted-submission package detail. */
"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { use } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

/** Renders authorized package state, export IDs, and immutable receipts. */
export default function SubmissionPage({ params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = use(params);
  const id = submissionId as Id<"submissionPackages">;
  const submission = useQuery(api.submissions.get, { submissionId: id });
  const status = useQuery(api.submissions.getStatus, { packageId: id });
  if (submission === undefined || status === undefined) return <main className="page-shell" id="main-content"><p role="status">Loading submission package…</p></main>;
  if (submission === null) return <main className="page-shell" id="main-content"><h1>Submission package not found</h1></main>;
  const canDownload = submission.validationState === "valid" && submission.approvalState === "approved";
  return (
    <main className="page-shell" id="main-content">
      <header className="page-intro"><Link href="/proposals">Back to proposals</Link><h1>Submission package</h1><p>Package {submissionId}. Final submission remains on official portal.</p></header>
      <dl className="definition-grid"><div><dt>Validation</dt><dd>{submission.validationState}</dd></div><div><dt>Approval</dt><dd>{submission.approvalState}</dd></div><div><dt>Exports</dt><dd>{submission.exportIds.length}</dd></div><div><dt>Receipts</dt><dd>{status.receipts.length}</dd></div></dl>
      <section><h2>Export manifest</h2>{submission.exportIds.length === 0 ? <p className="empty-state">No exports attached.</p> : <ul>{submission.exportIds.map((exportId) => <li key={exportId}><code>{String(exportId)}</code></li>)}</ul>}</section>
      <section><h2>Submission receipts</h2>{status.receipts.length === 0 ? <p className="empty-state">No portal receipt recorded.</p> : <ul>{status.receipts.map((receipt) => <li key={receipt.acknowledgement}>{receipt.portal} · {receipt.acknowledgement} · {new Date(receipt.submittedAt).toLocaleString()}</li>)}</ul>}</section>
      <a href={`/api/submissions/${submissionId}`} aria-disabled={!canDownload} onClick={(event) => { if (!canDownload) event.preventDefault(); }}>Download approved ZIP package</a>
      {!canDownload ? <p>Download requires valid package and bid-manager approval.</p> : null}
    </main>
  );
}
