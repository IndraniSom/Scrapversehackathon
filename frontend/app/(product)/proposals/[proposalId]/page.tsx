/** Persistent proposal collaboration workspace. */
"use client";

import { useOrganization } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { use } from "react";
import { ProposalWorkspace } from "../../../../components/proposals/proposal-workspace";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

/** Loads proposal and binds workspace operations to Convex mutations. */
export default function ProposalDetailPage({ params }: { params: Promise<{ proposalId: string }> }) {
  const { proposalId } = use(params);
  const id = proposalId as Id<"proposalProjects">;
  const data = useQuery(api.proposals.getProposal, { proposalId: id });
  const assign = useMutation(api.proposals.assignSection);
  const update = useMutation(api.proposals.updateSection);
  const comment = useMutation(api.proposals.addComment);
  const outline = useMutation(api.proposals.generateOutline);
  const lock = useMutation(api.proposals.lockProposal);
  const { membership } = useOrganization();
  if (data === undefined) return <main className="page-shell" id="main-content"><p role="status">Loading proposal…</p></main>;
  return (
    <main id="main-content" className="page-shell">
      <header className="page-intro"><h1>Proposal workspace</h1><p>Proposal {proposalId}. Every accepted heading retains its instruction citation.</p></header>
      <ProposalWorkspace
        proposal={{ _id: String(data.proposal._id), lockedRevision: data.proposal.lockedRevision }}
        sections={data.sections.map((section) => ({ ...section, _id: String(section._id), parentId: section.parentId ? String(section.parentId) : undefined }))}
        comments={data.comments.map((entry) => ({ ...entry, _id: String(entry._id), sectionId: entry.sectionId ? String(entry.sectionId) : undefined }))}
        onAssign={(sectionId, assigneeId) => void assign({ sectionId: sectionId as Id<"proposalSections">, assigneeId })}
        onSave={(sectionId, body, nextState) => void update({ sectionId: sectionId as Id<"proposalSections">, body, nextState })}
        onAddComment={(sectionId, body, anchor) => void comment({ proposalId: id, sectionId: sectionId as Id<"proposalSections"> | undefined, body, anchor })}
        onGenerateOutline={(clauses) => void outline({ proposalId: id, clauses })}
        onLock={() => void lock({ proposalId: id })}
        role={membership?.role}
      />
    </main>
  );
}
