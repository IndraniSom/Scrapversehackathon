/** Persistent proposal project register. */
"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";

/** Lists authenticated tenant proposal projects. */
export default function ProposalsPage() {
  const proposals = useQuery(api.proposals.listProposals, {});
  return (
    <main id="main-content" className="page-shell">
      <header className="page-intro"><h1>Proposals</h1><p>Versioned proposal projects with explicit section states, citations, review, and locks.</p></header>
      {proposals === undefined ? <p role="status">Loading proposals…</p> : proposals.length === 0 ? <p className="empty-state">No proposal projects. Start one from an assessed opportunity.</p> : (
        <div className="table-wrap" role="region" aria-label="Proposal projects"><table><thead><tr><th scope="col">Proposal</th><th scope="col">Stage</th><th scope="col">Owner</th><th scope="col">Lock</th></tr></thead><tbody>
          {proposals.map((proposal) => <tr key={proposal._id}><td><Link href={`/proposals/${proposal._id}`}>{String(proposal._id)}</Link></td><td>{proposal.stage}</td><td>{proposal.ownerId}</td><td>{proposal.lockedRevision ? `Revision ${proposal.lockedRevision}` : "Editable"}</td></tr>)}
        </tbody></table></div>
      )}
    </main>
  );
}
