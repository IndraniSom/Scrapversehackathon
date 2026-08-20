/**
 * Hypothetical scenario simulator for deterministic assessments.
 *
 * Lets users add temporary evidence, resolve unknown, or select
 * amendment version without mutating the accepted assessment.
 */
"use client";

import { useState } from "react";
import { StatusBadge } from "../status-badge";

type SimProps = {
  /** Accepted recommendation, e.g., NO_BID or REVIEW. */
  acceptedRecommendation: "BID" | "REVIEW" | "NO_BID";
  /** Optional accepted rule counts for display. */
  failedCounts?: { pass: number; fail: number; unknown: number };
  /** Called with hypothetical input, returns hypothetical result. */
  onSimulate?: (input: { turnoverPatch?: string; resolveUnknown?: boolean; useAmended?: boolean }) => Promise<{ recommendation: string } | null>;
};

const TURNOVER_MIN = 60000000;

/** Simulates temporary evidence changes with hypothetical labeling. */
export function ScenarioSimulator({ acceptedRecommendation, failedCounts, onSimulate }: SimProps) {
  const [turnover, setTurnover] = useState("");
  const [resolveUnknown, setResolveUnknown] = useState(false);
  const [useAmended, setUseAmended] = useState(false);
  const [hypothetical, setHypothetical] = useState<string | null>(null);
  const [labelNote] = useState("hypothetical — never mutates accepted");

  async function handleRun() {
    const patch = turnover.trim() ? turnover.trim() : undefined;
    if (patch && Number.isNaN(Number(patch))) return;
    // Local deterministic mock: turnover above threshold moves NO_BID toward REVIEW
    let simulated = acceptedRecommendation;
    if (patch && Number(patch) >= TURNOVER_MIN) simulated = acceptedRecommendation === "NO_BID" ? "REVIEW" : "BID";
    if (resolveUnknown) simulated = simulated === "NO_BID" ? "REVIEW" : simulated;
    if (useAmended) simulated = simulated === "REVIEW" ? "BID" : simulated;
    if (onSimulate) {
      const res = await onSimulate({ turnoverPatch: patch, resolveUnknown, useAmended });
      setHypothetical(res?.recommendation ?? simulated);
    } else setHypothetical(simulated);
  }

  return (
    <section className="scenario-simulator" aria-labelledby="simulator-title">
      <div className="section-heading-row">
        <div>
          <h2 id="simulator-title">Scenario simulator</h2>
          <p className="context-label">{labelNote}</p>
        </div>
        <span className="hypothetical-badge" aria-label="hypothetical">hypothetical</span>
      </div>

      <p>Accepted recommendation <StatusBadge status={acceptedRecommendation} /> stays unchanged. Simulations are labeled hypothetical in API, UI, and export.</p>
      {failedCounts ? <p className="context-label">Accepted: pass {failedCounts.pass} · fail {failedCounts.fail} · unknown {failedCounts.unknown}</p> : null}

      <div className="sim-controls">
        <label htmlFor="turnover-patch">Temporary turnover (INR)
          <input id="turnover-patch" value={turnover} onChange={(e) => setTurnover(e.target.value)} placeholder="e.g., 95000000" inputMode="numeric" />
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={resolveUnknown} onChange={(e) => setResolveUnknown(e.target.checked)} />
          Resolve unknown certification validity (temporary)
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={useAmended} onChange={(e) => setUseAmended(e.target.checked)} />
          Use amendment version rules
        </label>
      </div>

      <button type="button" className="primary-action min-h-[44px]" onClick={handleRun} aria-describedby="simulator-title">
        Recompute hypothetical
      </button>

      {hypothetical ? (
        <div className="hypothetical-result" aria-live="polite">
          <p>Hypothetical recommendation <StatusBadge status={hypothetical as never} label={`${hypothetical} (hypothetical)`} /></p>
          <p className="context-label">Accepted remains {acceptedRecommendation}. Export will label this as hypothetical.</p>
        </div>
      ) : (
        <p className="context-label">No simulation run yet. Accepted assessment is not changed.</p>
      )}
    </section>
  );
}
