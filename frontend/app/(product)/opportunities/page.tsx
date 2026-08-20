/**
 * Opportunity discovery page with search, filters, and saved searches.
 *
 * Parses URL-encoded Zod filters, runs cursor-paginated search via Convex,
 * and renders filter rail, opportunity table, and save dialog.
 * Uses index-backed pagination without collect().
 */
"use client";

import { usePaginatedQuery, useMutation, useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { FilterRail } from "../../../components/opportunities/filter-rail";
import { OpportunityTable } from "../../../components/opportunities/opportunity-table";
import { SavedSearchDialog } from "../../../components/opportunities/saved-search-dialog";
import { parseFiltersFromSearchParams } from "../../../lib/opportunityFilters";
import { api } from "../../../convex/_generated/api";

export const dynamic = "force-dynamic";

/**
 * Discovery page combining filter rail and paginated results.
 */
export default function OpportunitiesPage() {
  const searchParams = useSearchParams();
  const { parsed } = useMemo(
    () => parseFiltersFromSearchParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const [saveOpen, setSaveOpen] = useState(false);

  const { results, status, loadMore } = usePaginatedQuery(
    api.opportunitySearch.search,
    { query: parsed.query, filters: (parsed.filters ?? {}) as Record<string, unknown> as never, },
    { initialNumItems: 20 },
  );

  const saved = useQuery(api.savedSearches.list, {});
  const createSaved = useMutation(api.savedSearches.create);
  const bulkWatch = useMutation(api.watchlists.bulkWatch);
  const bulkUnwatch = useMutation(api.watchlists.bulkUnwatch);

  return (
    <main className="page-shell" id="main-content">
      <header className="page-intro">
        <h1>Opportunities</h1>
        <p>Search tenders by keyword and filter by source, authority, category, location, budget, dates, lifecycle, data mode, assessment, and amendment.</p>
        <button type="button" onClick={() => setSaveOpen(true)}>Save this search</button>
      </header>

      <div className="discovery-layout">
        <FilterRail />
        <div>
          <OpportunityTable
            rows={(results as unknown as Array<{
              _id: string; source: string; sourceTenderId: string; title: string; authority: string; category?: string; lifecycle: string; closesAt?: number; budgetAmount?: number; dataMode?: string; hasAmendment?: boolean;
            }>) ?? []}
            isDone={status === "Exhausted"}
            continueCursor={null}
            onLoadMore={() => loadMore(20)}
            onBulkWatch={(ids) => bulkWatch({ opportunityIds: ids as unknown as never[] })}
            onBulkUnwatch={(ids) => bulkUnwatch({ opportunityIds: ids as unknown as never[] })}
          />
          {status === "LoadingFirstPage" ? <p role="status">Loading procurement evidence…</p> : null}
          {status === "CanLoadMore" ? <p aria-live="polite">More results available</p> : null}
        </div>
      </div>

      <SavedSearchDialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        onSave={(draft) => createSaved({ query: draft.query, filters: draft.filters as never, cadence: draft.cadence, channels: draft.channels })}
        initial={{ query: parsed.query ?? "", filters: (parsed.filters ?? {}) as never, cadence: "daily", channels: ["in_app"] }}
      />

      {saved && saved.length > 0 ? (
        <section aria-labelledby="saved-title">
          <h2 id="saved-title">Saved searches</h2>
          <ul>
            {saved.map((s) => (
              <li key={s._id}><strong>{(s.name ?? s.query) || "Untitled"}</strong> · {s.cadence} · {s.channels.join(", ")}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
