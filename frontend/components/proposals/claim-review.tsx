/**
 * Claim review panel that blocks approval when mandatory claims lack evidence.
 */
"use client";

import { useMemo } from "react";

export type ClaimDisplay = {
  id: string;
  text: string;
  isMandatory: boolean;
  evidenceIds: string[];
};

export type ClaimResultDisplay = {
  claim_id: string;
  status: string;
  reason?: string | null;
  blocking: boolean;
};

type ClaimReviewProps = {
  claims: ClaimDisplay[];
  results: ClaimResultDisplay[];
  onAcknowledge?: (claimId: string) => void;
};

const STATUS_LABEL: Record<string, string> = {
  SUPPORTED: "Supported",
  UNSUPPORTED: "Unsupported",
  STALE: "Stale evidence",
  CONTRADICTORY: "Contradictory",
  OVER_STRONG: "Over-strong",
};

/**
 * Returns badge class for claim status.
 */
function claimClass(status: string): string {
  if (status === "SUPPORTED") return "status-pass";
  return "status-fail";
}

/**
 * Renders claim verification with approval gate.
 * Approval is blocked while any mandatory claim is not supported.
 */
export function ClaimReview({ claims, results, onAcknowledge }: ClaimReviewProps) {
  const byId = useMemo(() => new Map(results.map((r) => [r.claim_id, r])), [results]);
  const blocked = useMemo(() => results.some((r) => r.blocking), [results]);
  const mandatoryCount = useMemo(() => claims.filter((c) => c.isMandatory).length, [claims]);

  return (
    <section aria-labelledby="claim-review-title">
      <div className="section-heading-row">
        <div>
          <h2 id="claim-review-title">Claim review</h2>
          <p>Mandatory factual claims require accepted evidence. Approval is blocked until resolved.</p>
        </div>
        <span className="claim-count" aria-live="polite">
          {mandatoryCount} mandatory claims
        </span>
      </div>
      {blocked && (
        <p role="alert" className="approval-blocked">
          Approval blocked: mandatory claims lack accepted evidence.
        </p>
      )}
      {!blocked && results.length > 0 && <p className="approval-ready">All mandatory claims are supported.</p>}
      <div className="claim-list">
        {claims.length === 0 ? (
          <p>No claims to verify. Draft sections will be checked before review.</p>
        ) : (
          claims.map((claim) => {
            const result = byId.get(claim.id);
            const status = result?.status ?? "UNKNOWN";
            const blocking = result?.blocking ?? claim.isMandatory;
            return (
              <article key={claim.id} className={`claim-row ${claimClass(status)}`} aria-label={`Claim ${claim.id}`}>
                <header className="claim-header">
                  <code>{claim.id}</code>
                  {claim.isMandatory && <span aria-label="mandatory claim">* mandatory</span>}
                  <span className={`status-badge ${claimClass(status)}`}>{STATUS_LABEL[status] ?? status}</span>
                  {result?.reason && <span className="reason" title={result.reason}>{result.reason}</span>}
                  {blocking && status !== "SUPPORTED" && <span className="blocking" aria-label="blocks approval">blocks approval</span>}
                </header>
                <p className="claim-text">{claim.text}</p>
                <p className="claim-evidence">Evidence: {claim.evidenceIds.length ? claim.evidenceIds.map((e) => <code key={e}>{e}</code>) : <em>No evidence</em>}</p>
                {onAcknowledge && status !== "SUPPORTED" && (
                  <button type="button" className="primary-action" onClick={() => onAcknowledge(claim.id)} aria-label={`Review claim ${claim.id}`}>
                    Review evidence
                  </button>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
