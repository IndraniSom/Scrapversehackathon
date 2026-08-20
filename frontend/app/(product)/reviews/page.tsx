/**
 * Review queue page with synchronized evidence and clause panes.
 *
 * Two-pane layout: page evidence on the left, clause review form
 * on the right. Resets review on material change.
 */
"use client";

import { useState } from "react";
import { ClauseReviewPane } from "../../../components/reviews/clause-review-pane";
import { PageEvidencePane } from "../../../components/documents/page-evidence-pane";
import { ReviewQueue } from "../../../components/reviews/review-queue";

type Task = { _id: string; targetId: string; targetType: string; priority: "low"|"medium"|"high"; state: "open"|"in_review"|"approved"|"rejected"; assigneeId?: string; dueAt?: number };

const SAMPLE_TASKS: Task[] = [
  { _id: "review-1", targetId: "ocac-pond-26001", targetType: "requirement", priority: "high", state: "open" },
  { _id: "review-2", targetId: "ocac-pond-26001-clause-2", targetType: "requirement", priority: "medium", state: "in_review", assigneeId: "user-1" },
];

const SAMPLE_EVIDENCE = [
  { page: 1, printedLabel: "5", excerpt: "The bidder shall have average turnover of Rs. 12 Crores over last three financial years.", documentId: "doc-1", sourceUrl: "https://odisha.gov.in/notice.pdf", textHash: "a".repeat(64) },
  { page: 2, printedLabel: "6", excerpt: "EMD of Rs. 5 Lakhs required; MSME exemption available with valid certificate.", documentId: "doc-1", sourceUrl: "https://odisha.gov.in/notice.pdf", textHash: "b".repeat(64) },
];

/**
 * Renders the full clause and evidence review workspace.
 */
export default function ReviewsPage() {
  const [selected, setSelected] = useState<string | null>(SAMPLE_TASKS[0]._id);
  const [activePage, setActivePage] = useState<number>(1);
  const [notice, setNotice] = useState<string | null>(null);

  const clause = selected ? { id: selected, text: SAMPLE_EVIDENCE[0].excerpt, predicate: "TURNOVER_AVERAGE", evidencePage: activePage } : null;

  return (
    <main className="page-shell" id="main-content">
      <header className="page-intro">
        <p className="source-line">Clause review</p>
        <h1>Evidence review queue</h1>
        <p>Review each extracted clause against its bounded page evidence. Rejection and material edits require a reason.</p>
      </header>

      <ReviewQueue tasks={SAMPLE_TASKS} onSelect={setSelected} selectedId={selected ?? undefined} />

      <div className="document-comparison" style={{ marginTop: "2rem" }}>
        <PageEvidencePane evidence={SAMPLE_EVIDENCE} activePage={activePage} onPageSelect={setActivePage} />
        <ClauseReviewPane
          clause={clause}
          onReject={async (reason) => { if (reason.length < 8) throw new Error("Reason required"); setNotice(`Rejected: ${reason.slice(0,40)}`); }}
          onEdit={async (reason, patch) => { if (reason.length < 8) throw new Error("Reason required"); setNotice(`Edited: ${reason.slice(0,40)} ${patch.slice(0,20)} - review reset.`); }}
          onConfirm={async () => setNotice("Confirmed. Assessments re-running.")}
        />
      </div>

      {notice && <p role="status" className="transition-reason">{notice}</p>}
      <p className="subline">Material clause or page hash changes reset the review to open.</p>
    </main>
  );
}
