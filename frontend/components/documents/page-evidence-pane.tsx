/**
 * Page evidence pane that shows bounded excerpts with source links.
 *
 * Synchronizes with clause selection and keeps excerpts bounded to
 * prevent leaking full document contents.
 */
"use client";

type Evidence = {
  page: number;
  printedLabel: string | null;
  excerpt: string;
  documentId: string;
  sourceUrl: string;
  textHash: string;
};

type Props = {
  evidence: Evidence[];
  activePage: number | null;
  onPageSelect: (page: number) => void;
};

/** Maximum excerpt length shown in the pane. */
const BOUND = 1200;

/**
 * Renders synchronized page evidence with bounded excerpts.
 */
export function PageEvidencePane({ evidence, activePage, onPageSelect }: Props) {
  if (evidence.length === 0) return <section aria-label="Page evidence"><p>No evidence captured for this clause.</p></section>;

  return (
    <section className="evidence-pane" aria-labelledby="evidence-title">
      <h2 id="evidence-title">Page evidence</h2>
      <p className="subline">Each excerpt is bounded to {BOUND} characters and cites page and document hash.</p>
      <div className="evidence-list" role="list">
        {evidence.map((item) => {
          const bounded = item.excerpt.slice(0, BOUND);
          const isActive = activePage === item.page;
          return (
            <div key={`${item.documentId}-${item.page}`} role="listitem" className={isActive ? "evidence-active" : ""}>
              <button type="button" className="text-link" onClick={() => onPageSelect(item.page)}>
                Page {item.page} {item.printedLabel ? `(printed ${item.printedLabel})` : ""}
              </button>
              <blockquote>{bounded}</blockquote>
              <dl className="definition-grid">
                <div><dt>Document</dt><dd><code>{item.documentId}</code></dd></div>
                <div><dt>Page hash</dt><dd><code className="hash">{item.textHash.slice(0, 16)}…</code></dd></div>
              </dl>
              <a className="text-link compact-link" href={item.sourceUrl} target="_blank" rel="noreferrer">Open official source</a>
            </div>
          );
        })}
      </div>
    </section>
  );
}
