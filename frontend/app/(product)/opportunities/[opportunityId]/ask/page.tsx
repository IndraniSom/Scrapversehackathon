/**
 * Tender intelligence page hosting Q&A, executive brief, and translations.
 *
 * Each section enforces citations per paragraph, abstains when absent,
 * preserves anchors, and labels machine output as non-authoritative.
 */

import { TenderQa } from "../../../../../components/opportunities/tender-qa";
import { ExecutiveBriefView } from "../../../../../components/opportunities/executive-brief";
import { WorkingTranslation } from "../../../../../components/opportunities/working-translation";

export const dynamic = "force-dynamic";

/** Renders tender intelligence for one opportunity. */
export default async function AskPage({ params }: { params: Promise<{ opportunityId: string }> }): Promise<React.ReactNode> {
  const { opportunityId } = await params;
  const placeholderAnswer = null;
  const placeholderBrief = {
    scope: { value: "Not established by the reviewed documents", citations: [], is_abstained: true },
    authority: { value: "Not established by the reviewed documents", citations: [], is_abstained: true },
    dates: { value: "Not established by the reviewed documents", citations: [], is_abstained: true },
    fees: { value: "Not established by the reviewed documents", citations: [], is_abstained: true },
    hard_requirements: { value: "Not established by the reviewed documents", citations: [], is_abstained: true },
    deliverables: { value: "Not established by the reviewed documents", citations: [], is_abstained: true },
    submission_instructions: { value: "Not established by the reviewed documents", citations: [], is_abstained: true },
    amendments: { value: "Not established by the reviewed documents", citations: [], is_abstained: true },
    uncertainties: { value: "Not established by the reviewed documents", citations: [], is_abstained: true },
    review_state: "NEEDS_REVIEW",
  };
  const placeholderParagraphs: Array<{
    paragraph_id: string;
    original_text: string;
    translated_text: string;
    document_id: string;
    page_number: number;
    document_hash: string;
    anchor: string;
  }> = [];
  return (
    <main className="page-shell ask-page" id="main-content">
      <header className="page-intro">
        <h1>Tender intelligence</h1>
        <p className="context-label">Opportunity {opportunityId}</p>
        <p className="help-text">Citations per paragraph · Abstains when absent · Preserves numbers, dates, currency, and anchors · Machine translations are non-authoritative.</p>
      </header>
      <TenderQa answer={placeholderAnswer} />
      <ExecutiveBriefView brief={placeholderBrief} />
      <WorkingTranslation language="hi" paragraphs={placeholderParagraphs} />
    </main>
  );
}
