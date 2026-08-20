/**
 * Assessment view with landmark, heading, and status semantics.
 *
 * Shows base and amended decisions, evidence, and provenance.
 */
import Link from "next/link";

import type { Assessment, AssessmentEnvelope } from "../schemas/assessment";
import type { RuleResult } from "../schemas/rules";
import { EvidenceDetails } from "./evidence-details";
import { StatusBadge } from "./status-badge";

/** Recommendation summary with counts and status region. */
function DecisionSummary({ assessment, label }: { assessment: Assessment; label: string }) {
  const uncertain = assessment.unknown_applicable_rule_count > 0;
  const headingId = `${label.toLowerCase().replaceAll(" ", "-")}-decision`;
  return (
    <section className={`decision-summary ${assessment.recommendation === "NO_BID" || uncertain ? "decision-risk" : ""}`} aria-labelledby={headingId}>
      <div>
        <p className="context-label">{label}</p>
        <h2 id={headingId}>
          {label} recommendation <StatusBadge status={assessment.recommendation} />
        </h2>
      </div>
      <dl className="decision-counts">
        <div>
          <dt>Failed hard rules</dt>
          <dd>{assessment.failed_hard_rule_count}</dd>
        </div>
        <div>
          <dt>Unknown applicable rules</dt>
          <dd>{assessment.unknown_applicable_rule_count}</dd>
        </div>
      </dl>
    </section>
  );
}

/** Single rule with evidence and nested children. */
function RuleResultRow({ result }: { result: RuleResult }) {
  return (
    <li className="rule-result">
      <div className="rule-result-heading">
        <div>
          <h3>{result.title}</h3>
          <p>{result.explanation}</p>
        </div>
        <StatusBadge status={result.evaluation} />
      </div>
      {(result.company_value !== null || result.requirement_value !== null) && (
        <dl className="value-comparison">
          <div>
            <dt>Company evidence</dt>
            <dd>{result.company_value ?? "Not supplied"}</dd>
          </div>
          <div>
            <dt>Requirement</dt>
            <dd>{result.requirement_value ?? "Not supplied"}</dd>
          </div>
        </dl>
      )}
      {result.evidence.map((evidence) => (
        <EvidenceDetails key={`${evidence.document_version_id}-${evidence.physical_page_number}-${evidence.normalized_page_text_sha256}`} evidence={evidence} />
      ))}
      {result.children.length > 0 && (
        <ul className="rule-list nested-rule-list" aria-label={`${result.title} sub-rules`}>
          {result.children.map((child) => (
            <RuleResultRow key={child.rule_id} result={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Company evidence summary. */
function ProfileSummary({ envelope }: { envelope: AssessmentEnvelope }) {
  const profile = envelope.data.company_profile;
  return (
    <section className="profile-summary" aria-labelledby="profile-title">
      <div>
        <p className="context-label">Evaluation profile</p>
        <h2 id="profile-title">{profile.name}</h2>
      </div>
      <dl className="definition-grid">
        <div>
          <dt>Legal entity</dt>
          <dd>{profile.bidder_legal_entity_id ?? "Unverified"}</dd>
        </div>
        <div>
          <dt>Turnover records</dt>
          <dd>{profile.turnover_evidence.length}</dd>
        </div>
        <div>
          <dt>Certifications</dt>
          <dd>{profile.certifications.map((item) => item.name).join(", ") || "None supplied"}</dd>
        </div>
        <div>
          <dt>Completed project records</dt>
          <dd>{profile.projects.filter((item) => item.completion_state === "COMPLETED").length}</dd>
        </div>
      </dl>
    </section>
  );
}

/** Rule list for one assessment version. */
function EvaluationSection({ assessment, label, id }: { assessment: Assessment; label: string; id: string }) {
  return (
    <section aria-labelledby={id}>
      <div className="section-heading-row">
        <div>
          <h2 id={id}>{label} rule evaluation</h2>
          <p>Evidence-backed outcomes; unknown inputs remain unknown.</p>
        </div>
      </div>
      <ul className="rule-list" aria-label={`${label} rules`}>
        {assessment.rule_results.map((result) => (
          <RuleResultRow key={result.rule_id} result={result} />
        ))}
      </ul>
    </section>
  );
}

/** Complete assessment with landmarks and navigation. */
export function AssessmentView({ envelope }: { envelope: AssessmentEnvelope }) {
  const { opportunity, base_assessment: base, amended_assessment: amended } = envelope.data;
  return (
    <>
      <header className="page-intro">
        <Link className="text-link back-link" href="/">
          ← Opportunity register
        </Link>
        <p className="source-line">
          {opportunity.source} · {opportunity.source_tender_id}
        </p>
        <h1>{opportunity.title}</h1>
        <p>
          {opportunity.authority} · <code>{opportunity.data_mode}</code>
        </p>
      </header>
      <DecisionSummary assessment={base} label="Base tender" />
      <DecisionSummary assessment={amended} label="After amendment" />
      <nav className="route-actions" aria-label="Opportunity actions">
        <Link className="primary-action" href={`/opportunities/${encodeURIComponent(opportunity.id)}/amendment`}>
          Review amendment impact
        </Link>
        <a className="text-link" href={opportunity.canonical_url} target="_blank" rel="noreferrer">
          Open official tender notice
        </a>
      </nav>
      <ProfileSummary envelope={envelope} />
      <EvaluationSection assessment={base} label="Base tender" id="base-evaluation-title" />
      <EvaluationSection assessment={amended} label="After amendment" id="amended-evaluation-title" />
      <p className="disclaimer">{envelope.data.disclaimer}</p>
    </>
  );
}
