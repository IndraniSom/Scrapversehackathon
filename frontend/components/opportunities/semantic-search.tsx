"use client";

/**
 * Semantic search with natural-language filter chips and explainable results.
 *
 * Parses closed filters before execution and shows matching
 * capabilities, clauses, and source excerpts.
 */
import { useMemo, useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { OpportunityFilters } from "../../convex/semanticSearch";

type SearchResult = {
  id: string;
  title: string;
  authority: string;
  excerpt: string;
  capability: string;
  reasons: string[];
};

const MAX_QUERY_CHARS = 2000;

/**
 * Parse natural language into closed filters without open query generation.
 */
function parseFilters(input: string): OpportunityFilters {
  const lower = input.toLowerCase();
  const filters: OpportunityFilters = {};
  if (lower.includes("cybersecurity")) filters.category = "CYBERSECURITY";
  else if (lower.includes("cloud")) filters.category = "CLOUD";
  else if (lower.includes("software")) filters.category = "SOFTWARE";
  if (lower.includes("odisha")) filters.region = "ODISHA";
  else if (lower.includes("west bengal") || lower.includes("bengal")) filters.region = "WEST_BENGAL";
  if (lower.includes("ntpc")) filters.source = "NTPC";
  else if (lower.includes("cppp")) filters.source = "CPPP";
  if (lower.includes("closed")) filters.lifecycle = "closed";
  else if (lower.includes("open")) filters.lifecycle = "open";
  return filters;
}

/**
 * Semantic search panel with filter chips preview and hydrated results.
 */
export function SemanticSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const runSearch = useAction(api.semanticSearch.semanticSearch);

  const parsed = useMemo(() => parseFilters(query), [query]);
  const hasFilters = Object.keys(parsed).length > 0;
  const overlong = query.length > MAX_QUERY_CHARS;
  const empty = query.trim().length === 0;

  async function handleSearch() {
    if (empty) {
      setError("Enter a search query.");
      return;
    }
    const truncated = overlong ? query.slice(0, MAX_QUERY_CHARS) : query;
    const filters = parseFilters(truncated);
    setError(null);
    setLoading(true);
    try {
      const response = await runSearch({ query: truncated, filters, limit: 10 });
      setResults(response.items);
    } catch {
      setError("Search failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="semantic-search" aria-labelledby="semantic-title">
      <h2 id="semantic-title">Semantic opportunity matching</h2>
      <p className="context-label">Uses query: and passage: prefixes with tenant-filtered vectors.</p>

      <label htmlFor="semantic-query">Search opportunities</label>
      <div className="search-row">
        <input
          id="semantic-query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="cybersecurity bids in Odisha closing next month"
          aria-describedby="filter-chips"
          maxLength={MAX_QUERY_CHARS + 100}
        />
        <button type="button" onClick={handleSearch} disabled={loading || empty} aria-busy={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {overlong ? <p role="status" className="field-error">Query truncated to {MAX_QUERY_CHARS} characters.</p> : null}
      {error ? <p role="alert" className="field-error">{error}</p> : null}

      <div id="filter-chips" aria-live="polite" className="filter-chips">
        {hasFilters ? (
          <>
            <p className="context-label">Parsed filters (review before search):</p>
            <ul>
              {Object.entries(parsed).map(([key, value]) => (
                <li key={key} className="filter-chip">
                  <span className="chip-key">{key}</span>: {value}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="context-label">No filters detected. Results will use semantic similarity alone.</p>
        )}
      </div>

      {results.length === 0 ? (
        <p className="empty-state">No semantic matches. Try a different capability description.</p>
      ) : (
        <ul className="result-list" aria-label="Semantic results">
          {results.map((item) => (
            <li key={item.id} className="result-item">
              <h3>{item.title}</h3>
              <p className="subline">{item.authority}</p>
              <p className="excerpt">{item.excerpt}</p>
              <p className="capability">Matched capability: {item.capability}</p>
              <ul className="reasons">
                {item.reasons.map((reason, index) => (
                  <li key={index}>{reason}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
