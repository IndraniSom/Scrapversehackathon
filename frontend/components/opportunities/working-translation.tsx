/**
 * Working translation panel showing original beside machine output.
 *
 * Every translation is labeled non-authoritative and preserves
 * numbers, dates, currency, reference identifiers, and paragraph
 * anchors verbatim from the source text.
 */

type TranslationParagraph = {
  paragraph_id: string;
  original_text: string;
  translated_text: string;
  document_id: string;
  page_number: number;
  document_hash: string;
  anchor: string;
};

type TranslationProps = {
  language: string;
  paragraphs: TranslationParagraph[];
  disclaimer?: string;
};

const DEFAULT_DISCLAIMER = "Machine translation — non-authoritative, original text prevails";

/** Renders one paragraph with side-by-side original and translation. */
function TranslationRow({ paragraph }: { paragraph: TranslationParagraph }): React.ReactNode {
  return (
    <article className="translation-row" aria-label={`Paragraph ${paragraph.paragraph_id}`}>
      <header className="translation-meta">
        <code title={paragraph.document_hash}>
          {paragraph.document_id} p{paragraph.page_number} · anchor {paragraph.anchor} · {paragraph.document_hash.slice(0, 8)}
        </code>
      </header>
      <div className="translation-columns">
        <div className="original-column">
          <h4>Original</h4>
          <p>{paragraph.original_text}</p>
        </div>
        <div className="translated-column">
          <h4>Translation</h4>
          <p>{paragraph.translated_text}</p>
        </div>
      </div>
    </article>
  );
}

/** Renders the working translation bundle. */
export function WorkingTranslation({ language, paragraphs, disclaimer = DEFAULT_DISCLAIMER }: TranslationProps): React.ReactNode {
  return (
    <section className="working-translation" aria-labelledby="translation-title">
      <h2 id="translation-title">Working translation</h2>
      <p className="translation-disclaimer" role="note">
        <strong>{disclaimer}</strong> · Language: {language}
      </p>
      <p className="help-text">Numbers, dates, currency, reference identifiers, and paragraph anchors are preserved verbatim. Rejected output is routed to review.</p>
      <div className="translation-list">
        {paragraphs.map((paragraph) => (
          <TranslationRow key={paragraph.paragraph_id} paragraph={paragraph} />
        ))}
      </div>
    </section>
  );
}
