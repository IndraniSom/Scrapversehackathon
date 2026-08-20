/**
 * Reports page with pipeline/outcome aggregates and post-bid learning.
 *
 * Shows counts/timelines with minimum-sample disclosure,
 * never claims win causation, and supports export/deletion.
 */
"use client";

import { useMemo, useState } from "react";
import { ScenarioSimulator } from "../../../components/opportunities/scenario-simulator";

type OutcomeRow = { id: string; result: "won" | "lost" | "no_submit"; reasonCategories: string[]; createdAt: number };

const MIN_SAMPLE = 5;
const DISCLAIMER = "Descriptive summary only; sparse data cannot prove causation or predict wins.";

/** Renders organization-owned outcome reports with disclosure. */
export default function ReportsPage() {
  // Fixed demo timestamps avoid impure Date.now() during render.
  const initialOutcomes: OutcomeRow[] = [
    { id: "1", result: "lost", reasonCategories: ["missing_evidence"], createdAt: 1718323200000 },
    { id: "2", result: "lost", reasonCategories: ["price"], createdAt: 1718755200000 },
    { id: "3", result: "no_submit", reasonCategories: ["capacity"], createdAt: 1719014400000 },
  ];
  const [outcomes, setOutcomes] = useState<OutcomeRow[]>(initialOutcomes);
  const [selectedReason, setSelectedReason] = useState("");
  const [exportPayload, setExportPayload] = useState<string | null>(null);

  const stats = useMemo(() => {
    const byResult: Record<string, number> = {};
    const byReason: Record<string, number> = {};
    const byMonth: Record<string, number> = {};
    for (const o of outcomes) {
      byResult[o.result] = (byResult[o.result] ?? 0) + 1;
      for (const r of o.reasonCategories) byReason[r] = (byReason[r] ?? 0) + 1;
      const m = new Date(o.createdAt).toISOString().slice(0, 7);
      byMonth[m] = (byMonth[m] ?? 0) + 1;
    }
    const total = outcomes.length;
    const disclosure = total < MIN_SAMPLE ? `Sample size ${total} — trends are descriptive, not predictive.` : `Sample size ${total} — ${DISCLAIMER}`;
    return { total, byResult, byReason, byMonth, disclosure };
  }, [outcomes]);

  const suggestions = useMemo(() => {
    const s: string[] = [];
    if ((stats.byReason["missing_evidence"] ?? 0) >= 1) s.push("Review content library: missing_evidence observed — verify turnover/cert evidence. (observation, not causation)");
    if ((stats.byResult["no_submit"] ?? 0) >= 1) s.push("Process bottleneck: no_submit recorded — audit deadlines. (observation, not causation)");
    if (stats.total >= MIN_SAMPLE && (stats.byResult["lost"] ?? 0) > (stats.byResult["won"] ?? 0)) s.push("Consider tuning saved searches: losses outnumber wins — review filters without assuming causation. (observation, not causation)");
    if (s.length === 0) s.push("No pattern meets threshold; continue recording outcomes. (observation, not causation)");
    return s;
  }, [stats]);

  function handleRecord() {
    if (!["won", "lost", "no_submit"].includes(selectedReason) && selectedReason) return;
    // Simplified demo: recordOutcome mutation would be used in production
    const result = (selectedReason as "won" | "lost" | "no_submit") || "lost";
    setOutcomes((prev) => [...prev, { id: String(Date.now()), result, reasonCategories: [result === "won" ? "commercial" : "price"], createdAt: Date.now() }]);
  }

  function handleExport() {
    const payload = { exportType: "bid_outcomes", isHypothetical: false as const, recordCount: outcomes.length, records: outcomes, disclaimer: DISCLAIMER };
    setExportPayload(JSON.stringify(payload, null, 2));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "bid-outcomes.json"; a.click();
    URL.revokeObjectURL(url);
  }

  function handleDelete(id: string) {
    setOutcomes((prev) => prev.filter((o) => o.id !== id));
  }

  return (
    <main className="page-shell" id="main-content">
      <header className="page-intro">
        <p className="source-line">Outcome analytics</p>
        <h1>Reports and post-bid learning</h1>
        <p>{DISCLAIMER}</p>
        <p className="context-label" role="status">{stats.disclosure}</p>
      </header>

      <section aria-labelledby="counts-title">
        <h2 id="counts-title">Pipeline and outcome counts</h2>
        <ul className="definition-grid">
          <li>Total outcomes: {stats.total} (minimum sample {MIN_SAMPLE})</li>
          <li>Won: {stats.byResult["won"] ?? 0} · Lost: {stats.byResult["lost"] ?? 0} · No submit: {stats.byResult["no_submit"] ?? 0}</li>
          {Object.entries(stats.byReason).map(([k, v]) => <li key={k}>{k}: {v}</li>)}
        </ul>
        <div aria-labelledby="timeline-title">
          <h3 id="timeline-title">Timeline by month</h3>
          {Object.keys(stats.byMonth).length === 0 ? <p>No timeline data yet.</p> : <ul>{Object.entries(stats.byMonth).map(([m, c]) => <li key={m}>{m}: {c}</li>)}</ul>}
        </div>
      </section>

      <section aria-labelledby="suggestions-title">
        <h2 id="suggestions-title">Post-bid suggestions</h2>
        <ul>{suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul>
      </section>

      <section aria-labelledby="outcome-recording">
        <h2 id="outcome-recording">Record outcome</h2>
        <p className="context-label">Won / lost / no_submit with structured reason categories.</p>
        <div className="inline-controls">
          <label>Result category
            <select value={selectedReason} onChange={(e) => setSelectedReason(e.target.value)} aria-label="Outcome result">
              <option value="">Select result</option>
              <option value="won">won</option>
              <option value="lost">lost</option>
              <option value="no_submit">no_submit</option>
            </select>
          </label>
          <button type="button" className="primary-action min-h-[44px]" onClick={handleRecord}>Record outcome</button>
          <button type="button" className="min-h-[44px]" onClick={handleExport} aria-label="Export outcomes">Export outcomes</button>
        </div>
        {exportPayload ? <pre aria-label="Export payload" className="export-preview">{exportPayload}</pre> : null}
      </section>

      <section aria-labelledby="outcome-list-title">
        <h2 id="outcome-list-title">Recorded outcomes</h2>
        {outcomes.length === 0 ? <p>No outcomes yet. Record the first to build learning.</p> : (
          <ul className="outcome-list">{outcomes.map((o) => (
            <li key={o.id} className="outcome-row">
              <span>{o.result}</span> <span>{o.reasonCategories.join(", ")}</span> <span>{new Date(o.createdAt).toISOString().slice(0, 10)}</span>
              <button type="button" onClick={() => handleDelete(o.id)} aria-label={`Delete outcome ${o.id}`} className="min-h-[44px]">Delete</button>
            </li>
          ))}</ul>
        )}
      </section>

      <ScenarioSimulator acceptedRecommendation="NO_BID" failedCounts={{ pass: 1, fail: 1, unknown: 2 }} />
      <p className="disclaimer">Hypothetical assessments are labeled in API, UI, and export and never overwrite accepted assessments.</p>
    </main>
  );
}
