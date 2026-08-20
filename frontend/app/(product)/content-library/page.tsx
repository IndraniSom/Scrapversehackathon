/**
 * Content library route rendering approved reusable answers.
 *
 * Shows permission-scoped entries with status filters, captions, and
 * entry points to proposal reuse. Server wrapper for client library.
 */
import { ContentLibrary } from "../../../components/proposals/content-library";

export const metadata = { title: "Content library · BidRadar" };

/**
 * Renders the content library page shell.
 */
export default function ContentLibraryPage() {
  return (
    <main id="main-content" className="page-shell">
      <header className="page-intro">
        <p className="source-line">Reusable proposal knowledge</p>
        <h1>Content library</h1>
        <p>Approved answers with evidence, review cadence, and freshness signals. Drafts stay private until approved.</p>
      </header>
      <ContentLibrary />
    </main>
  );
}
