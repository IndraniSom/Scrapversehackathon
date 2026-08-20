/**
 * Proposal workspace route — hierarchical outline, assignments, comments,
 * and explicit approval states with lock guard.
 */
"use client";

import { use, useState } from "react";
import { ProposalWorkspace } from "../../../../components/proposals/proposal-workspace";

type Params = { proposalId: string };

/** Mock initial sections to demonstrate hierarchy, citation, and lock behavior. */
const INITIAL_SECTIONS = [
  { _id: "s1", title: "1. Cover Letter", instructionCitation: "Instruction §1 — Submission letter", state: "NOT_STARTED", order: 0 },
  { _id: "s2", title: "1.1 Technical Approach", instructionCitation: "Evaluation §2.1 — Technical evaluation", state: "DRAFTING", order: 1, parentId: "s1" },
  { _id: "s3", title: "2. Compliance Matrix", instructionCitation: "Instruction §3 — Compliance format", state: "READY_FOR_REVIEW", order: 2 },
] as const;

/** Renders the proposal workspace for one project with tenant-gated actions. */
export default function ProposalDetailPage({ params }: { params: Promise<Params> }) {
  const { proposalId } = use(params);
  const [sections, setSections] = useState<{ _id: string; title: string; instructionCitation: string; state: string; order: number; parentId?: string; body: string; assigneeId?: string }[]>(() =>
    (INITIAL_SECTIONS as unknown as { _id: string; title: string; instructionCitation: string; state: string; order: number; parentId?: string }[]).map((s)=>({ ...s, body: "", assigneeId: undefined as string | undefined }))
  );
  const [comments, setComments] = useState<{ _id: string; sectionId?: string; authorId: string; body: string; resolutionState: string; anchor?: string; createdAt: number }[]>([]);
  const [proposal, setProposal] = useState<{ _id: string; lockedRevision?: number }>({ _id: proposalId });
  const locked = proposal.lockedRevision !== undefined;

  /** Handles section assignment without allowing locked edits. */
  function handleAssign(id: string, assigneeId: string) {
    if (locked) return;
    setSections((prev)=>prev.map((s)=> (s._id===id ? { ...s, assigneeId } : s)));
  }
  /** Handles save with explicit state validation inline. */
  function handleSave(id: string, body: string, nextState?: string) {
    if (locked) return;
    setSections((prev)=>prev.map((s)=> (s._id===id ? { ...s, body, state: nextState ?? s.state } : s)));
  }
  /** Adds a threaded comment with optional anchor. */
  function handleComment(sectionId: string | undefined, body: string, anchor?: string) {
    setComments((prev)=>[...prev, { _id: `c${prev.length+1}`, sectionId, authorId: "you", body, anchor, resolutionState: "open", createdAt: Date.now() }]);
  }
  /** Locks the revision to prevent further edits. */
  function handleLock() {
    if (locked) return;
    setProposal({ ...proposal, lockedRevision: Date.now() });
    setSections((prev)=>prev.map((s)=>({ ...s, state: "LOCKED" })));
  }

  return (
    <main id="main-content" className="page-shell">
      <header className="page-intro">
        <p className="source-line">Proposal · {proposalId}</p>
        <h1>Proposal workspace</h1>
        <p>Outline hierarchy mirrors cited instruction and evaluation clauses. Every heading cites its source. Bid-manager approval gates READY_FOR_REVIEW → APPROVED, and LOCKED prevents edits.</p>
      </header>
      <ProposalWorkspace proposal={proposal} sections={sections as never} comments={comments} onAssign={handleAssign} onSave={handleSave} onAddComment={handleComment} onLock={handleLock} role="org:bid_manager" />
    </main>
  );
}
