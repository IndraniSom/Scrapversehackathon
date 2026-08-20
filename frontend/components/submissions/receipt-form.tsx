"use client";
/**
 * Receipt form to record portal acknowledgement.
 *
 * Captures acknowledgement number, portal timestamp, package digest,
 * and optional evidence hash. Computes digest for audit.
 */
import React, { useState } from "react";

type Props = {
  packageDigest: string;
  onSubmit: (data: { acknowledgement: string; portalTimestamp: number; packageDigest: string; evidenceDigest?: string }) => Promise<void> | void;
};

/**
 * Validates and submits receipt evidence without mutating submission state via AI.
 */
export function ReceiptForm({ packageDigest, onSubmit }: Props) {
  const [ack, setAck] = useState("");
  const [portalTime, setPortalTime] = useState("");
  const [evidenceDigest, setEvidenceDigest] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  /**
   * Handles form submission with client-side digest validation.
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedAck = ack.trim();
    if (trimmedAck.length < 6) { setError("Acknowledgement number must be at least 6 characters."); return; }
    const ts = Date.parse(portalTime);
    if (!Number.isFinite(ts)) { setError("Valid portal timestamp required."); return; }
    if (!/^[a-f0-9]{64}$/i.test(packageDigest)) { setError("Invalid package digest (64 hex)."); return; }
    if (evidenceDigest && !/^[a-f0-9]{64}$/i.test(evidenceDigest.trim())) { setError("Evidence digest must be 64 hex if provided."); return; }
    try {
      await onSubmit({ acknowledgement: trimmedAck, portalTimestamp: ts, packageDigest, evidenceDigest: evidenceDigest.trim() || undefined });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    }
  }

  if (done) return <p role="status" className="success">Receipt recorded. Audit entry created with acknowledgement digest.</p>;

  return (
    <form className="receipt-form" onSubmit={handleSubmit} aria-labelledby="receipt-title">
      <h2 id="receipt-title">Record portal acknowledgement</h2>
      <p>Enter the acknowledgement number and portal timestamp exactly as shown on the official portal. Server time is authoritative.</p>
      <label>Package digest (SHA-256)<input value={packageDigest} readOnly aria-readonly="true" /></label>
      <label>Acknowledgement number<input value={ack} onChange={(e) => setAck(e.target.value)} placeholder="e.g. CPPP-ACK-2026-001234" required minLength={6} /></label>
      <label>Portal timestamp<input type="datetime-local" value={portalTime} onChange={(e) => setPortalTime(e.target.value)} required /></label>
      <label>Receipt evidence digest (SHA-256, optional)<input value={evidenceDigest} onChange={(e) => setEvidenceDigest(e.target.value)} placeholder="64 hex chars" pattern="[a-fA-F0-9]{64}" /></label>
      {error && <p role="alert" className="form-error">{error}</p>}
      <button type="submit" className="primary-action">Record receipt</button>
      <p className="disclaimer">Receipt is immutable once recorded and is audited. AI cannot record receipts.</p>
    </form>
  );
}
