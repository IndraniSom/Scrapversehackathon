import Link from "next/link";

import type { AmendmentImpact } from "../schemas/assessment";
import type { EvidenceSpan } from "../schemas/common";
import { EvidenceDetails } from "./evidence-details";
import { StatusBadge } from "./status-badge";

/** Renders one versioned document with its immutable content hash. */
function DocumentVersion({ label, id, sha256, sourceUrl }: { label: string; id: string; sha256: string; sourceUrl: string }) {
  return (
    <div className="document-version">
      <p className="context-label">{label}</p><h3>{id}</h3><code className="full-hash">{sha256}</code>
      <a className="text-link" href={sourceUrl} target="_blank" rel="noreferrer">Open official document source</a>
    </div>
  );
}

/** Renders old or new clause evidence without implying unverified interpretation. */
function Clause({ label, evidence }: { label: string; evidence: EvidenceSpan }) {
  return (
    <section className="clause-block" aria-labelledby={`${label}-clause`}>
      <p className="context-label">{label}</p><h3 id={`${label}-clause`}>{evidence.section_heading}</h3><p>{evidence.excerpt}</p>
      <EvidenceDetails evidence={evidence} />
    </section>
  );
}

/** Renders authority evidence, document lineage, and recommendation impact. */
export function AmendmentImpactView({ impact }: { impact: AmendmentImpact }) {
  const statement = impact.authority_statement;
  const effectiveLabel = impact.authority_change_applied ? "Effective change" : "No effective change";
  return (
    <>
      <header className="page-intro">
        <Link className="text-link back-link" href={`/opportunities/${impact.opportunity_id}`}>← Opportunity assessment</Link>
        <p className="source-line">Amendment evidence · <code>{impact.data_mode}</code></p>
        <h1>Amendment impact</h1><p>Rule <code>{impact.changed_rule_id}</code> is traced to an identified authority statement.</p>
      </header>
      <section className={`decision-summary ${impact.authority_change_applied ? "decision-change" : ""}`} aria-label="Recommendation transition">
        <div><p className="context-label">Base recommendation</p><StatusBadge status={impact.base_recommendation} /></div>
        <span className="transition-arrow" aria-hidden="true">→</span>
        <div><p className="context-label">Amended recommendation</p><StatusBadge status={impact.amended_recommendation} /></div>
        <StatusBadge status={impact.authority_change_applied ? "EFFECTIVE" : "UNCHANGED"} label={effectiveLabel} />
      </section>
      <p className="transition-reason">{impact.transition_reason}</p>
      <section className="authority-block" aria-labelledby="authority-title">
        <div className="section-heading-row"><div><h2 id="authority-title">Authority statement</h2><p>Actor and disposition determine whether the change can affect the recommendation.</p></div></div>
        <dl className="definition-grid">
          <div><dt>Actor</dt><dd><StatusBadge status={statement.actor === "AUTHORITY" ? "ACCEPTED" : statement.disposition === "REJECTED" ? "REJECTED" : "UNCHANGED"} label={statement.actor} /></dd></div>
          <div><dt>Disposition</dt><dd>{statement.disposition}</dd></div>
          <div><dt>Replaces</dt><dd>{statement.replaces_document_id ?? "No document replacement"}</dd></div>
          <div><dt>Effect</dt><dd>{effectiveLabel}</dd></div>
        </dl>
        <EvidenceDetails evidence={statement.evidence} />
      </section>
      <section aria-labelledby="documents-title">
        <div className="section-heading-row"><div><h2 id="documents-title">Document lineage</h2><p>Hashes identify the exact base and amendment content assessed.</p></div></div>
        <div className="document-comparison">
          <DocumentVersion label="Old document" id={impact.base_document.id} sha256={impact.base_document.sha256} sourceUrl={impact.base_document.source_url} />
          <DocumentVersion label="New document" id={impact.amendment_document.id} sha256={impact.amendment_document.sha256} sourceUrl={impact.amendment_document.source_url} />
        </div>
      </section>
      <section aria-labelledby="clause-title">
        <div className="section-heading-row"><div><h2 id="clause-title">Clause comparison</h2><p>Quoted source text remains attached to extraction and review state.</p></div></div>
        <div className="clause-comparison"><Clause label="Old" evidence={impact.old_clause} /><Clause label="New" evidence={impact.new_clause} /></div>
      </section>
    </>
  );
}
