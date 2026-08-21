/**
 * Cited evidence with disclosure and provenance.
 *
 * Uses native details/summary for keyboard access.
 */
import type { EvidenceSpan } from "../schemas/common";

/** Evidence block with extraction and review metadata. */
export function EvidenceDetails({ evidence }: { evidence: EvidenceSpan }) {
  return (
    <div className="evidence-block">
      <p className="evidence-provenance">
        <span>
          <strong>Extraction:</strong> <code>{evidence.extraction_state}</code>
        </span>
        <span>
          <strong>Review:</strong> <code>{evidence.review_state}</code>
        </span>
        <span>
          <strong>Method:</strong> <code>{evidence.extraction_model}</code>
        </span>
      </p>
      <details className="evidence-disclosure">
        <summary>Inspect cited evidence</summary>
        <blockquote>{evidence.excerpt}</blockquote>
        <dl className="definition-grid evidence-grid">
          <div>
            <dt>Document</dt>
            <dd>
              <code>{evidence.document_version_id}</code>
            </dd>
          </div>
          <div>
            <dt>Page</dt>
            <dd>
              {evidence.physical_page_number}
              {evidence.printed_page_label ? ` (printed ${evidence.printed_page_label})` : ""}
            </dd>
          </div>
          <div>
            <dt>Section</dt>
            <dd>{evidence.section_heading}</dd>
          </div>
          <div>
            <dt>Document hash</dt>
            <dd>
              <code className="hash" title={evidence.document_sha256}>
                {evidence.document_sha256.slice(0, 16)}…
              </code>
            </dd>
          </div>
        </dl>
        <a className="text-link" href={evidence.source_url} target="_blank" rel="noreferrer">
          Open official evidence source
        </a>
      </details>
    </div>
  );
}
