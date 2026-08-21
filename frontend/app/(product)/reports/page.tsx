/** Persistent tenant-owned bid outcome reports. */
"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";

/** Renders descriptive outcome counts and audited mutations. */
export default function ReportsPage() {
  const outcomes = useQuery(api.analytics.listOutcomes, {});
  const stats = useQuery(api.analytics.getOutcomeStats, {});
  const exported = useQuery(api.analytics.exportOutcomes, {});
  const record = useMutation(api.analytics.recordOutcome);
  const remove = useMutation(api.analytics.deleteOutcome);
  const [result, setResult] = useState<"won" | "lost" | "no_submit">("lost");
  if (outcomes === undefined || stats === undefined || exported === undefined) return <main className="page-shell" id="main-content"><p role="status">Loading reports…</p></main>;

  /** Downloads currently authorized outcome export. */
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "bid-outcomes.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="page-shell" id="main-content">
      <header className="page-intro"><h1>Reports and post-bid learning</h1><p>{stats.disclaimer}</p><p role="status">{stats.disclosure}</p></header>
      <section><h2>Outcome counts</h2><p>Total: {stats.total}</p><ul>{Object.entries(stats.byResult).map(([key, value]) => <li key={key}>{key}: {value}</li>)}</ul></section>
      <section><h2>Post-bid suggestions</h2><ul>{stats.suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul></section>
      <section><h2>Record outcome</h2><label>Result <select value={result} onChange={(event) => setResult(event.target.value as typeof result)}><option value="won">Won</option><option value="lost">Lost</option><option value="no_submit">No submit</option></select></label><button type="button" onClick={() => void record({ result, reasonCategories: [result === "won" ? "commercial" : "other"] })}>Record outcome</button><button type="button" onClick={download}>Export outcomes</button></section>
      <section><h2>Recorded outcomes</h2>{outcomes.length === 0 ? <p className="empty-state">No outcomes recorded.</p> : <ul>{outcomes.map((outcome) => <li key={outcome._id}>{outcome.result} · {(outcome.reasonCategories ?? []).join(", ")} <button type="button" onClick={() => void remove({ outcomeId: outcome._id })}>Delete</button></li>)}</ul>}</section>
    </main>
  );
}
