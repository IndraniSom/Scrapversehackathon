/**
 * Discovery client — filters, table, and saved searches.
 *
 * Parses URL Zod filters, runs cursor-paginated Convex search,
 * and renders filter rail with native controls and accessible labels.
 */
"use client";

import { usePaginatedQuery, useMutation, useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { FilterRail } from "./filter-rail";
import { OpportunityTable } from "./opportunity-table";
import { SavedSearchDialog } from "./saved-search-dialog";
import { parseFiltersFromSearchParams } from "../../lib/opportunityFilters";
import { api } from "../../convex/_generated/api";

/** Client discovery pane with URL-synced filters and pagination. */
export function DiscoveryClient() {
  const searchParams = useSearchParams();
  const { parsed } = useMemo(() => parseFiltersFromSearchParams(new URLSearchParams(searchParams.toString())), [searchParams]);
  const [saveOpen, setSaveOpen] = useState(false);
  const { results, status, loadMore } = usePaginatedQuery(api.opportunitySearch.search, { query: parsed.query, filters: (parsed.filters ?? {}) as never }, { initialNumItems: 20 });
  const saved = useQuery(api.savedSearches.list, {});
  const createSaved = useMutation(api.savedSearches.create);
  const bulkWatch = useMutation(api.watchlists.bulkWatch);
  const bulkUnwatch = useMutation(api.watchlists.bulkUnwatch);

  return (
    <>
      <button type="button" onClick={() => setSaveOpen(true)} className="btn-ghost" style={{ marginBottom: "1rem" }}>Save this search</button>
      <div className="discovery-layout">
        <FilterRail />
        <div>
          <OpportunityTable rows={(results as unknown as Array<{ _id: string; source: string; sourceTenderId: string; title: string; authority: string; category?: string; lifecycle: string; closesAt?: number; budgetAmount?: number; dataMode?: string; hasAmendment?: boolean; }>) ?? []} isDone={status === "Exhausted"} continueCursor={null} onLoadMore={() => loadMore(20)} onBulkWatch={(ids) => bulkWatch({ opportunityIds: ids as never[] })} onBulkUnwatch={(ids) => bulkUnwatch({ opportunityIds: ids as never[] })} />
          {status === "LoadingFirstPage" ? <p role="status">Loading procurement evidence…</p> : null}
          {status === "CanLoadMore" ? <p aria-live="polite">More results available</p> : null}
        </div>
      </div>
      <SavedSearchDialog open={saveOpen} onClose={() => setSaveOpen(false)} onSave={(d) => createSaved({ query: d.query, filters: d.filters as never, cadence: d.cadence, channels: d.channels })} initial={{ query: parsed.query ?? "", filters: (parsed.filters ?? {}) as never, cadence: "daily", channels: ["in_app"] }} />
      {saved && saved.length > 0 ? <section aria-labelledby="saved-title"><h2 id="saved-title">Saved searches</h2><ul>{saved.map((s) => <li key={s._id}><strong>{(s.name ?? s.query) || "Untitled"}</strong> · {s.cadence}</li>)}</ul></section> : null}
    </>
  );
}
