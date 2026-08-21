/**
 * Executive brief rendering every field with its source citations.
 *
 * Missing facts display the single abstention phrase and remain
 * marked as not established for reviewer inspection.
 */

type BriefCitation = {
  chunk_id: string;
  document_id: string;
  page_number: number;
  document_hash: string;
};

type BriefField = {
  value: string;
  citations: BriefCitation[];
  is_abstained: boolean;
};

type ExecutiveBrief = {
  scope: BriefField;
  authority: BriefField;
  dates: BriefField;
  fees: BriefField;
  hard_requirements: BriefField;
  deliverables: BriefField;
  submission_instructions: BriefField;
  amendments: BriefField;
  uncertainties: BriefField;
  review_state: string;
};

const ABSTAIN = "Not established by the reviewed documents";

const FIELD_LABELS: Record<keyof Omit<ExecutiveBrief, "review_state">, string> = {
  scope: "Scope",
  authority: "Authority",
  dates: "Dates",
  fees: "Fees",
  hard_requirements: "Hard requirements",
  deliverables: "Deliverables",
  submission_instructions: "Submission instructions",
  amendments: "Amendments",
  uncertainties: "Uncertainties",
};

/** Renders citation badges for a brief field. */
function BriefCitations({ citations }: { citations: BriefCitation[] }): React.ReactNode {
  if (citations.length === 0) return <p className="help-text">No citation — {ABSTAIN}</p>;
  return (
    <ul className="citation-list" aria-label="Brief citations">
      {citations.map((citation) => (
        <li key={citation.chunk_id} className="citation-item">
          <code title={citation.document_hash}>
            {citation.document_id} p{citation.page_number} · {citation.document_hash.slice(0, 8)}
          </code>
        </li>
      ))}
    </ul>
  );
}

/** Renders one labeled brief section with citations. */
function BriefSection({ label, field }: { label: string; field: BriefField }): React.ReactNode {
  return (
    <section className="brief-section">
      <h3>{label}</h3>
      <p className={field.is_abstained ? "abstained" : ""}>{field.value}</p>
      <BriefCitations citations={field.citations} />
    </section>
  );
}

/** Renders the full executive brief. */
export function ExecutiveBriefView({ brief }: { brief: ExecutiveBrief }): React.ReactNode {
  const fields = (Object.keys(FIELD_LABELS) as Array<keyof typeof FIELD_LABELS>).map((key) => ({
    key,
    label: FIELD_LABELS[key],
    field: brief[key],
  }));
  return (
    <section className="executive-brief" aria-labelledby="brief-title">
      <h2 id="brief-title">Executive brief</h2>
      <p className="context-label">Review state: {brief.review_state}</p>
      <div className="brief-grid">
        {fields.map(({ key, label, field }) => (
          <BriefSection key={key} label={label} field={field} />
        ))}
      </div>
    </section>
  );
}
