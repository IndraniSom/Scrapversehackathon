import type { SourceProof } from "../schemas/envelopes";
import { StatusBadge } from "./status-badge";

const unavailableReason = {
  NOT_CONFIGURED: "Source-proof capture is not configured.",
  LEGAL_VERIFY_REQUIRED: "Source-proof capture requires legal verification.",
  PROVIDER_UNAVAILABLE: "The source-proof provider was unavailable.",
  PROOF_NOT_CAPTURED: "Provider proof was not captured for this manual fixture.",
} as const;

/** Renders verified provenance or a truthful manual-fixture unavailable state. */
export function SourceProofPanel({ proof }: { proof: SourceProof }) {
  const unavailable = proof.status === "UNAVAILABLE";
  return (
    <section className="proof-panel" aria-labelledby="proof-title">
      <div className="section-heading-row">
        <div>
          <h2 id="proof-title">Source proof</h2>
          <p>Collection provenance is shown separately from tender content.</p>
        </div>
        <StatusBadge status={proof.status} label={unavailable ? "Unavailable" : "Verified"} />
      </div>
      <p className="proof-mode"><strong>Data mode:</strong> <code>{proof.data_mode}</code></p>
      {unavailable && <p className="proof-reason">{unavailableReason[proof.reason_code]}</p>}
      <details aria-label="Source proof details">
        <summary>Source proof details</summary>
        <dl className="definition-grid">
          {unavailable ? (
            <div><dt>Capture note</dt><dd>Collector identifiers and timestamps are intentionally omitted because they were not captured.</dd></div>
          ) : (
            <>
              <div><dt>Collector</dt><dd>{proof.collector_name}</dd></div>
              <div><dt>Provider run</dt><dd><code>{proof.provider_run_id}</code></dd></div>
              <div><dt>Completed</dt><dd>{proof.completed_at}</dd></div>
              <div><dt>Raw snapshot</dt><dd><code>{proof.raw_snapshot_sha256}</code></dd></div>
            </>
          )}
        </dl>
      </details>
    </section>
  );
}
