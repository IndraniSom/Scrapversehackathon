/**
 * Opportunity discovery page — server shell with client discovery.
 *
 * Renders heading server-side for immediate a11y, delegates
 * filters and table to client island with URL Zod validation.
 */
import { DiscoveryClient } from "../../../components/opportunities/discovery-client";
import { SemanticSearch } from "../../../components/opportunities/semantic-search";

export const dynamic = "force-dynamic";

/** Server shell that guarantees heading and description before hydration. */
export default function OpportunitiesPage() {
  return (
    <main className="page-shell" id="main-content">
      <header className="page-intro">
        <h1>Opportunities</h1>
        <p>Search tenders by keyword and filter by source, authority, category, location, budget, dates, lifecycle, data mode, assessment, and amendment.</p>
      </header>
      <DiscoveryClient />
      <SemanticSearch />
    </main>
  );
}
