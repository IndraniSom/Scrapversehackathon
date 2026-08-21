/** Persistent proposal collaboration workspace. */
"use client";

import { useOrganization } from "@clerk/nextjs";
import { useAction, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { use, useState } from "react";
import { ProposalWorkspace } from "../../../../components/proposals/proposal-workspace";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
const isE2eMode = process.env.NEXT_PUBLIC_BIDRADAR_E2E_MODE === "1";

/** Reads Clerk membership only inside production Clerk provider. */
function AuthenticatedProposalPage({ params }: { params: Promise<{ proposalId: string }> }) {
  const { membership } = useOrganization();
  return <ProposalData params={params} role={membership?.role} />;
}

/** Loads proposal and binds workspace operations to Convex mutations. */
function ProposalData({ params, role }: { params: Promise<{ proposalId: string }>; role?: string }) {
  const { proposalId } = use(params);
  const id = proposalId as Id<"proposalProjects">;
  const data = useQuery(api.proposals.getProposal, { proposalId: id });
  const assign = useMutation(api.proposals.assignSection);
  const update = useMutation(api.proposals.updateSection);
  const comment = useMutation(api.proposals.addComment);
  const outline = useMutation(api.proposals.generateOutline);
  const lock = useMutation(api.proposals.lockProposal);
  const createPackage = useAction(api.proposalExports.createSubmissionPackage);
  const [submissionId, setSubmissionId] = useState<string>();
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
        onGenerateOutline={data.outlineClauseCount > 0 ? () => void outline({ proposalId: id }) : undefined}
        onLock={() => void lock({ proposalId: id })}
        role={role}
      />
      <section className="panel"><h2>Submission export</h2><p>ZIP contains reviewed DOCX, compliance CSV, and SHA-256 manifest.</p><button type="button" className="primary-action" disabled={!data.proposal.lockedRevision} onClick={() => void createPackage({ proposalId: id }).then((result) => setSubmissionId(String(result.submissionId)))}>Generate submission ZIP</button>{submissionId ? <p role="status">Package ready. <Link href={`/submissions/${submissionId}`}>Open submission package</Link></p> : null}</section>
    </main>
  );
}

/** Chooses production Clerk role or isolated E2E manager role. */
export default function ProposalDetailPage({ params }: { params: Promise<{ proposalId: string }> }) {
  if (isE2eMode) return <ProposalData params={params} role="org:admin" />;
  return <AuthenticatedProposalPage params={params} />;
}
