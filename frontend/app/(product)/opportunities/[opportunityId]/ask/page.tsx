/**
 * Tender intelligence page hosting Q&A, executive brief, and translations.
 *
 * Each section enforces citations per paragraph, abstains when absent,
 * preserves anchors, and labels machine output as non-authoritative.
 */

import { TenderIntelligenceClient } from "../../../../../components/opportunities/tender-intelligence-client";
import type { Id } from "../../../../../convex/_generated/dataModel";

export const dynamic = "force-dynamic";

/** Renders tender intelligence for one opportunity. */
export default async function AskPage({ params }: { params: Promise<{ opportunityId: string }> }): Promise<React.ReactNode> {
  const { opportunityId } = await params;
  return (
    <main className="page-shell ask-page" id="main-content">
      <header className="page-intro">
        <h1>Tender intelligence</h1>
        <p className="context-label">Opportunity {opportunityId}</p>
        <p className="help-text">Citations per paragraph · Abstains when absent · Preserves numbers, dates, currency, and anchors · Machine translations are non-authoritative.</p>
      </header>
      <TenderIntelligenceClient opportunityId={opportunityId as Id<"opportunities">} />
    </main>
  );
}
