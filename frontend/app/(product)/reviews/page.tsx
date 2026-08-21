/** Persistent tenant-bound evidence review queue. */
"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ClauseReviewPane } from "../../../components/reviews/clause-review-pane";
import { ReviewQueue } from "../../../components/reviews/review-queue";

/** Renders live review tasks and authenticated decisions. */
export default function ReviewsPage() {
  const tasks = useQuery(api.reviews.listReviewTasks, {});
  const confirm = useMutation(api.reviews.confirmReviewTask);
  const reject = useMutation(api.reviews.rejectReviewTask);
  const edit = useMutation(api.reviews.editReviewTask);
  const [selectedId, setSelectedId] = useState<string>();
  const [notice, setNotice] = useState<string | null>(null);
  if (tasks === undefined) return <main className="page-shell" id="main-content"><p role="status">Loading review queue…</p></main>;
  const effectiveSelectedId = selectedId ?? (tasks[0] ? String(tasks[0]._id) : undefined);
  const selected = tasks.find((task) => String(task._id) === effectiveSelectedId);
  const revision = selected?.updatedAt ?? selected?.createdAt;
  const taskId = selected?._id as Id<"reviewTasks"> | undefined;
  return (
    <main className="page-shell" id="main-content">
      <header className="page-intro"><h1>Evidence review queue</h1><p>Review extracted clauses against accepted source evidence. Material decisions remain immutable in audit history.</p></header>
      <ReviewQueue tasks={tasks.map((task) => ({ ...task, _id: String(task._id) }))} onSelect={setSelectedId} selectedId={effectiveSelectedId} />
      {selected ? (
        <ClauseReviewPane
          clause={{ id: String(selected._id), text: selected.targetId, predicate: selected.targetType, evidencePage: 1 }}
          onConfirm={async () => { if (taskId) await confirm({ taskId, expectedRevision: revision }); setNotice("Confirmed. Deterministic assessment queued."); }}
          onReject={async (reason) => { if (taskId) await reject({ taskId, reason, expectedRevision: revision }); setNotice("Review rejected."); }}
          onEdit={async (reason, patch) => { if (taskId) await edit({ taskId, reason, patch, expectedRevision: revision }); setNotice("Material edit recorded; review reset."); }}
        />
      ) : <p className="empty-state">No review tasks require action.</p>}
      {notice ? <p role="status">{notice}</p> : null}
    </main>
  );
}
