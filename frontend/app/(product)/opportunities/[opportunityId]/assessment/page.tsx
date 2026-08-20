/**
 * Versioned assessment page for one opportunity.
 * Shows accepted immutable assessment, base/current comparison, and scenario preview.
 */
import { AssessmentWorkspace } from "../../../../../components/opportunities/assessment-workspace";

export const dynamic = "force-dynamic";

/** Props for promised Next.js dynamic segment. */
type PageProps = { params: Promise<{ opportunityId: string }> };

/** Minimal accepted bundle for illustration; real data comes from Convex assessments. */
const ACCEPTED = {
  recommendation: "REVIEW" as const,
  unknown_applicable_rule_count: 1,
  failed_hard_rule_count: 0,
  rule_results: [
    { rule_id: "turnover-average", title: "Average audited turnover", evaluation: "PASS" as const, explanation: "Average audited bidder turnover is INR 90000000.", company_value: "90000000", requirement_value: "60000000", evidence: [{ excerpt: "Turnover clause p19" }], children: [] },
    { rule_id: "iso-27001", title: "ISO 27001 certification", evaluation: "UNKNOWN" as const, explanation: "Explicit certification validity anchor is missing.", company_value: null, requirement_value: "valid at 2026-02-02", evidence: [{ excerpt: "Certificate clause" }], children: [] },
  ],
  document: { id: "base-v1" },
  asOf: Date.now(),
  requirementSetRevision: 3,
};

/** Renders versioned assessment workspace with scenario isolation. */
export default async function AssessmentPage({ params }: PageProps) {
  const { opportunityId } = await params;
  const base = { ...ACCEPTED, recommendation: "NO_BID" as const, failed_hard_rule_count: 1 };
  return (
    <main className="page-shell" id="main-content">
      <header className="page-intro">
        <h1>Assessment</h1>
        <p className="context-label">Opportunity {opportunityId} · immutable for (companyRevision, opportunityVersion, requirementSetRevision, asOf)</p>
        <p className="help-text">Deterministic evaluation via eligibility.py; batch assessment on request only; scenario never mutates accepted.</p>
      </header>
      <AssessmentWorkspace accepted={ACCEPTED} base={base} current={ACCEPTED} hypothetical={null} onHypothetical={() => {}} />
      <p className="context-label">Watchlisted opportunities with a supported requirement set are assessed automatically; other batch assessments require explicit request.</p>
    </main>
  );
}
