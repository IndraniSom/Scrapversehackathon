/** Persistent custom assessment workspace for one opportunity. */
"use client";

import { useMutation, useQuery } from "convex/react";
import { use } from "react";
import { useState } from "react";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

/** Renders stored deterministic results and queues selected company assessment. */
export default function AssessmentPage({ params }: { params: Promise<{ opportunityId: string }> }) {
  const { opportunityId } = use(params);
  const id = opportunityId as Id<"opportunities">;
  const assessments = useQuery(api.assessments.listByOpportunity, { opportunityId: id });
  const companies = useQuery(api.companies.listCompanies, {});
  const request = useMutation(api.assessments.requestAssessment);
  const [companyId, setCompanyId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  /** Queues assessment for selected tenant-owned company and current tender version. */
  async function runAssessment() {
    if (!companyId) return;
    setError("");
    try {
      const result = await request({ companyId: companyId as Id<"companies">, opportunityId: id });
      setNotice(`Assessment queued as job ${String(result.jobId)}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Assessment could not be queued.");
    }
  }

  return (
    <main className="page-shell" id="main-content">
      <header className="page-intro"><h1>Assessment</h1><p>Deterministic PASS, FAIL, UNKNOWN, and NOT_APPLICABLE results for accepted company evidence and reviewed tender requirements.</p></header>
      <section aria-labelledby="request-title"><h2 id="request-title">Run company assessment</h2>
        {companies === undefined ? <p role="status">Loading companies…</p> : companies.length === 0 ? <p>No active companies. Add company evidence first.</p> : <><label>Company<select value={companyId} onChange={(event) => setCompanyId(event.target.value)}><option value="">Select company</option>{companies.map((company) => <option key={company._id} value={company._id}>{company.legalName}</option>)}</select></label><button type="button" className="primary-action" disabled={!companyId} onClick={() => void runAssessment()}>Run assessment</button></>}
        {notice ? <p role="status">{notice}</p> : null}{error ? <p role="alert">{error}</p> : null}
      </section>
      <section aria-labelledby="results-title"><h2 id="results-title">Assessment history</h2>
        {assessments === undefined ? <p role="status">Loading assessments…</p> : assessments.length === 0 ? <p className="empty-state">No completed assessments for this opportunity.</p> : assessments.map((assessment) => <article key={assessment._id} className="panel"><h3>{assessment.recommendation}</h3><p>Pass {assessment.counts.pass} · Fail {assessment.counts.fail} · Unknown {assessment.counts.unknown}</p><time>{new Date(assessment.asOf).toLocaleString()}</time><ul>{assessment.ruleResults.map((rule) => <li key={rule._id}><strong>{rule.ruleId}</strong> · {rule.evaluation}{rule.explanation ? ` · ${rule.explanation}` : ""}</li>)}</ul></article>)}
      </section>
      <p className="disclaimer">Recommendations are deterministic decision support. AI extraction cannot set BID, REVIEW, or NO_BID.</p>
    </main>
  );
}
