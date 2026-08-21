/**
 * Cited tender Q&A showing paragraph-level citations and abstention.
 *
 * Every factual paragraph cites an authorized chunk; unanswerable
 * queries show the single allowed abstention message.
 */

type Citation = {
  chunk_id: string;
  document_id: string;
  page_number: number;
  document_hash: string;
};

type AnswerParagraph = {
  text: string;
  citations: Citation[];
};

type TenderAnswer = {
  question: string;
  paragraphs: AnswerParagraph[];
  abstained: boolean;
};

const ABSTAIN = "Not established by the reviewed documents";

type TenderQaProps = {
  answer: TenderAnswer | null;
  onAsk?: (question: string) => void;
  isLoading?: boolean;
  error?: string | null;
};

/** Renders citation badges for one paragraph. */
function CitationList({ citations }: { citations: Citation[] }): React.ReactNode {
  return (
    <ul className="citation-list" aria-label="Citations">
      {citations.map((citation) => (
        <li key={`${citation.chunk_id}-${citation.document_id}`} className="citation-item">
          <code title={citation.document_hash}>
            {citation.document_id} p{citation.page_number} · {citation.document_hash.slice(0, 8)}
          </code>
        </li>
      ))}
    </ul>
  );
}

/** Renders the cited Q&A answer with per-paragraph provenance. */
export function TenderQa({ answer, onAsk, isLoading, error }: TenderQaProps): React.ReactNode {
  return (
    <section className="tender-qa" aria-labelledby="tender-qa-title">
      <h2 id="tender-qa-title">Ask this tender</h2>
      <p className="context-label">Answers cite the selected tender documents only</p>
      <form
        className="qa-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget as HTMLFormElement;
          const input = form.elements.namedItem("question") as HTMLInputElement | null;
          if (input?.value.trim()) onAsk?.(input.value.trim());
        }}
      >
        <label htmlFor="qa-question">Question</label>
        <input id="qa-question" name="question" type="text" placeholder="What is the EMD amount?" aria-describedby="qa-help" />
        <p id="qa-help" className="help-text">Cross-tenant retrieval is rejected. Unanswerable questions abstain.</p>
        <button type="submit" disabled={isLoading} className="primary-action">
          {isLoading ? "Asking…" : "Ask"}
        </button>
      </form>
      {error ? <p role="alert" className="error-text">{error}</p> : null}
      {answer === null ? <p className="empty-state">Ask a question to see a cited answer.</p> : null}
      {answer !== null && answer.abstained ? (
        <div className="abstain-notice" role="status">
          <p>{ABSTAIN}</p>
          <p className="help-text">No supporting passage was found in the reviewed documents.</p>
        </div>
      ) : null}
      {answer !== null && !answer.abstained ? (
        <div className="answer-paragraphs">
          <p className="context-label">Question: {answer.question}</p>
          {answer.paragraphs.map((paragraph, index) => (
            <article key={index} className="answer-paragraph">
              <p>{paragraph.text}</p>
              <CitationList citations={paragraph.citations} />
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
