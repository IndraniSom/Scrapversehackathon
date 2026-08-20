/**
 * Assessment workspace for versioned deterministic eligibility.
 *
 * Shows accepted immutable assessment, base/current comparison,
 * and a hypothetical scenario that never mutates accepted.
 */
"use client";

import { useState } from "react";
import { StatusBadge } from "../status-badge";

type RuleResult = {
  rule_id: string;
  title: string;
  evaluation: "PASS" | "FAIL" | "UNKNOWN" | "NOT_APPLICABLE";
  explanation: string;
  company_value?: string | null;
  requirement_value?: string | null;
  evidence?: { excerpt: string }[];
  children?: RuleResult[];
};

type AssessmentSnapshot = {
  recommendation: "BID" | "REVIEW" | "NO_BID";
  unknown_applicable_rule_count: number;
  failed_hard_rule_count: number;
  rule_results: RuleResult[];
  document?: { id?: string; sha256?: string };
  asOf?: number;
  requirementSetRevision?: number;
};

type Props = {
  /** Accepted immutable assessment for (companyRevision, opportunityVersion, requirementSetRevision, asOf). */
  accepted: AssessmentSnapshot;
  /** Optional base assessment for version comparison. */
  base?: AssessmentSnapshot | null;
  /** Optional current assessment distinct from base. */
  current?: AssessmentSnapshot | null;
  /** Optional hypothetical preview – labeled and never persisted. */
  hypothetical?: AssessmentSnapshot | null;
  /** Called when user requests hypothetical recompute; must not mutate accepted. */
  onHypothetical?: (overrides: { turnoverPatch?: string }) => void;
};

/** Renders one rule outcome with bounded evidence. */
function RuleRow({ result }: { result: RuleResult }) {
  return (
    <li className="rule-result">
      <div className="rule-result-heading">
        <div>
          <h3>{result.title}</h3>
          <p>{result.explanation}</p>
        </div>
        <StatusBadge status={result.evaluation} />
      </div>
      {(result.company_value || result.requirement_value) && (
        <dl className="value-comparison">
          <div><dt>Company evidence</dt><dd>{result.company_value ?? "Not supplied"}</dd></div>
          <div><dt>Requirement</dt><dd>{result.requirement_value ?? "Not supplied"}</dd></div>
        </dl>
      )}
      {result.children && result.children.length > 0 ? (
        <ul className="rule-list nested-rule-list">
          {result.children.map((c) => <RuleRow key={c.rule_id} result={c} />)}
        </ul>
      ) : null}
    </li>
  );
}

/** Shows recommendation and counts for one version. */
function Summary({ label, assessment, hypothetical }: { label: string; assessment: AssessmentSnapshot; hypothetical?: boolean }) {
  return (
    <section className={`decision-summary ${assessment.recommendation === "NO_BID" ? "decision-risk" : ""}`} aria-labelledby={`${label}-title`}>
      <div>
        <p className="context-label">{label}{hypothetical ? " · hypothetical" : ""}</p>
        <h2 id={`${label}-title`}>{label} recommendation <StatusBadge status={assessment.recommendation} /></h2>
      </div>
      <dl className="decision-counts">
        <div><dt>Failed hard rules</dt><dd>{assessment.failed_hard_rule_count}</dd></div>
        <div><dt>Unknown applicable rules</dt><dd>{assessment.unknown_applicable_rule_count}</dd></div>
      </dl>
      {hypothetical ? <p className="context-label">Never mutates accepted assessment</p> : null}
    </section>
  );
}

/** Versioned assessment workspace with scenario isolation. */
export function AssessmentWorkspace({ accepted, base, current, hypothetical, onHypothetical }: Props) {
  const [patch, setPatch] = useState("");
  const showBase = base && current && base.recommendation !== current.recommendation;
  return (
    <div className="assessment-workspace">
      <Summary label="Accepted" assessment={accepted} />
      {showBase ? (
        <div className="comparison-grid">
          <Summary label="Base tender" assessment={base!} />
          <Summary label="Current version" assessment={current!} />
          <p className="context-label">Comparison uses accepted versions; change requires authority review.</p>
        </div>
      ) : null}
      <section aria-labelledby="rules-title">
        <h2 id="rules-title">Rule evaluation</h2>
        <p className="help-text">Evidence-backed outcomes; unknown inputs remain unknown; Unsupported predicates remain UNKNOWN.</p>
        <ul className="rule-list">{accepted.rule_results.map((r) => <RuleRow key={r.rule_id} result={r} />)}</ul>
      </section>
      <section className="scenario-panel" aria-labelledby="scenario-title">
        <h2 id="scenario-title">Scenario preview <span className="context-label">hypothetical</span></h2>
        <p>Temporary turnover or resolved unknown — preview is hypothetical and export will label it as such. Accepted remains {accepted.recommendation}.</p>
        <label htmlFor="scenario-turnover">Temporary turnover patch (INR)
          <input id="scenario-turnover" value={patch} onChange={(e) => setPatch(e.target.value)} placeholder="e.g., 95000000" inputMode="numeric" />
        </label>
        <button type="button" className="secondary-action min-h-[44px]" onClick={() => onHypothetical?.({ turnoverPatch: patch || undefined })} aria-describedby="scenario-title">Recompute hypothetical</button>
        {hypothetical ? <Summary label="Hypothetical" assessment={hypothetical} hypothetical /> : <p className="context-label">No hypothetical run; accepted is immutable.</p>}
      </section>
      <p className="disclaimer">Deterministic eligibility via eligibility.py; AI never sets recommendation directly.</p>
    </div>
  );
}
