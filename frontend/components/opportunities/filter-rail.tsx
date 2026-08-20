/**
 * Filter rail for opportunity discovery.
 *
 * Uses native controls, URL-encoded Zod schema, and accessible live
 * announcements. Collapses to a sheet on narrow viewports.
 */
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useId, useState } from "react";

import { parseFiltersFromSearchParams } from "../../lib/opportunityFilters";

const sources = ["CPPP", "WEST_BENGAL", "NTPC", "ODISHA"];
const categories = ["CLOUD", "CYBERSECURITY", "SOFTWARE", "DATA_CENTER", "MANAGED_IT", "NETWORKING", "ERP", "DEVOPS", "OTHER"];
const lifecycles = ["open", "closed", "cancelled", "archived"];
const dataModes = ["LIVE", "RECORDED_BRIGHT_DATA_SNAPSHOT", "MANUAL_FIXTURE"];
const assessments = ["BID", "REVIEW", "NO_BID"];

/**
 * Renders a rail of native filter controls bound to the URL.
 */
export function FilterRail() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { parsed } = parseFiltersFromSearchParams(new URLSearchParams(searchParams.toString()));
  const [announce, setAnnounce] = useState("");
  const formId = useId();

  const update = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.push(qs ? `?${qs}` : "?", { scroll: false });
      setAnnounce("Filters updated");
    },
    [router, searchParams],
  );

  const clearAll = useCallback(() => {
    router.push("?", { scroll: false });
    setAnnounce("Filters cleared");
  }, [router]);

  return (
    <aside aria-labelledby={`${formId}-heading`} className="filter-rail">
      <h2 id={`${formId}-heading`}>Filters</h2>
      <p className="help-text" style={{ marginTop: 0 }}>Prefix search + closed filters — URL-encoded, shareable.</p>
      <p aria-live="polite" className="sr-only">{announce}</p>
      <form onSubmit={(e) => e.preventDefault()} aria-label="Opportunity filters">
        <label htmlFor={`${formId}-q`}>Keyword</label>
        <input
          id={`${formId}-q`}
          name="q"
          type="search"
          defaultValue={parsed.query ?? ""}
          placeholder="Title prefix, e.g., Cloud"
          onChange={(e) => update({ q: e.target.value || undefined })}
        />

        <label htmlFor={`${formId}-source`}>Source</label>
        <select
          id={`${formId}-source`}
          value={parsed.filters?.source ?? ""}
          onChange={(e) => update({ source: e.target.value || undefined })}
        >
          <option value="">All sources</option>
          {sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <label htmlFor={`${formId}-authority`}>Authority</label>
        <input
          id={`${formId}-authority`}
          defaultValue={parsed.filters?.authority ?? ""}
          placeholder="e.g., NTPC Limited"
          onChange={(e) => update({ authority: e.target.value || undefined })}
        />

        <label htmlFor={`${formId}-category`}>Category</label>
        <select id={`${formId}-category`} value={parsed.filters?.category ?? ""} onChange={(e) => update({ category: e.target.value || undefined })}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c.replaceAll("_", " ")}</option>)}
        </select>

        <label htmlFor={`${formId}-location`}>Location</label>
        <input id={`${formId}-location`} defaultValue={parsed.filters?.location ?? ""} placeholder="State or city" onChange={(e) => update({ location: e.target.value || undefined })} />

        <fieldset>
          <legend>Budget (INR)</legend>
          <label htmlFor={`${formId}-bmin`}>Min</label>
          <input id={`${formId}-bmin`} type="number" defaultValue={parsed.filters?.budgetMin ?? ""} onChange={(e) => update({ budgetMin: e.target.value || undefined })} />
          <label htmlFor={`${formId}-bmax`}>Max</label>
          <input id={`${formId}-bmax`} type="number" defaultValue={parsed.filters?.budgetMax ?? ""} onChange={(e) => update({ budgetMax: e.target.value || undefined })} />
        </fieldset>

        <fieldset>
          <legend>Closing date</legend>
          <label htmlFor={`${formId}-cafter`}>After</label>
          <input id={`${formId}-cafter`} type="date" onChange={(e) => update({ closesAfter: e.target.value ? String(new Date(e.target.value).getTime()) : undefined })} />
          <label htmlFor={`${formId}-cbefore`}>Before</label>
          <input id={`${formId}-cbefore`} type="date" onChange={(e) => update({ closesBefore: e.target.value ? String(new Date(e.target.value).getTime()) : undefined })} />
        </fieldset>

        <label htmlFor={`${formId}-lifecycle`}>Lifecycle</label>
        <select id={`${formId}-lifecycle`} value={parsed.filters?.lifecycle ?? ""} onChange={(e) => update({ lifecycle: e.target.value || undefined })}>
          <option value="">Any</option>
          {lifecycles.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>

        <label htmlFor={`${formId}-datamode`}>Data mode</label>
        <select id={`${formId}-datamode`} value={parsed.filters?.dataMode ?? ""} onChange={(e) => update({ dataMode: e.target.value || undefined })}>
          <option value="">Any</option>
          {dataModes.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>

        <label htmlFor={`${formId}-assessment`}>Assessment</label>
        <select id={`${formId}-assessment`} value={parsed.filters?.assessment ?? ""} onChange={(e) => update({ assessment: e.target.value || undefined })}>
          <option value="">Any</option>
          {assessments.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>

        <label htmlFor={`${formId}-amend`}>Amendment</label>
        <select id={`${formId}-amend`} value={parsed.filters?.hasAmendment === undefined ? "" : String(parsed.filters.hasAmendment)} onChange={(e) => update({ hasAmendment: e.target.value || undefined })}>
          <option value="">Any</option>
          <option value="true">Has amendment</option>
          <option value="false">No amendment</option>
        </select>

        <button type="button" className="btn-ghost" onClick={clearAll} aria-label="Clear all filters" style={{ minHeight: 44 }}>Clear filters</button>
      </form>
    </aside>
  );
}
