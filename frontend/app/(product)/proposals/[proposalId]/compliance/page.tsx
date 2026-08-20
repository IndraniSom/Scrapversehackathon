/**
 * Compliance review page for a proposal with matrix, gaps and CSV export.
 */
import { ComplianceMatrix } from "../../../../../components/proposals/compliance-matrix";
import type { ComplianceRow } from "../../../../../convex/compliance";

/** Demo seed showing deterministic rows before AI grouping for offline preview. */
const DEMO_ROWS: ComplianceRow[] = [
  { requirementId: "req-001", citation: "Section 5.1 Turnover", responseLocation: "Proposal §2.1", evidence: "Audited FY 2023-24", ownerId: "owner-1", status: "compliant", isMandatory: true, requirementRevision: 2, organizationId: "org-demo" },
  { requirementId: "req-002", citation: "Section 5.2 Certification", responseLocation: undefined, evidence: undefined, ownerId: undefined, status: "gap", gapCategory: "MISSING_DATA", isMandatory: true, requirementRevision: 2, organizationId: "org-demo" },
  { requirementId: "req-003", citation: "Section 6.1 EMD", responseLocation: "Proposal §3.1", evidence: undefined, ownerId: "owner-2", status: "gap", gapCategory: "MISSING_DOCUMENT", isMandatory: true, requirementRevision: 2, organizationId: "org-demo" },
];

/**
 * Renders the proposal compliance workspace with deterministic matrix and export.
 */
export default async function CompliancePage({ params }: { params: Promise<{ proposalId: string }> }) {
  const { proposalId } = await params;
  return (
    <main className="page-shell" id="main-content">
      <header className="page-intro">
        <p className="source-line">Proposal {proposalId} · Compliance review</p>
        <h1>Compliance matrix</h1>
        <p>Review each requirement citation, response location, evidence link and owner before approval. Export CSV for the submission package.</p>
      </header>
      <ComplianceMatrix rows={DEMO_ROWS} />
      <p className="disclaimer">Deterministic rows are seeded from accepted requirements. AI grouping and ambiguity candidates require reviewer disposition and never auto-approve.</p>
    </main>
  );
}
