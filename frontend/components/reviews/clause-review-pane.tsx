/**
 * Clause review pane with synchronized evidence and decision actions.
 *
 * Supports reject, edit, and confirm; requires a reason for reject/edit.
 */
"use client";

import { useState } from "react";

type Props = {
  clause: { id: string; text: string; predicate: string; evidencePage: number } | null;
  onReject: (reason: string) => Promise<void>;
  onEdit: (reason: string, patch: string) => Promise<void>;
  onConfirm: () => Promise<void>;
};

/**
 * Renders clause details and review decision controls.
 */
export function ClauseReviewPane({ clause, onReject, onEdit, onConfirm }: Props) {
  const [reason, setReason] = useState("");
  const [patch, setPatch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!clause) return <section aria-label="Clause review"><p>Select a clause to review.</p></section>;

  /**
   * Validates reason length and shows inline error.
   */
  function validateReason(value: string): boolean {
    if (value.trim().length < 8) {
      setError("Reason must be at least 8 characters.");
      return false;
    }
    setError(null);
    return true;
  }

  async function handleReject() {
    if (!validateReason(reason)) return;
    setBusy(true);
    try { await onReject(reason.trim()); setReason(""); } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }

  async function handleEdit() {
    if (!validateReason(reason)) return;
    setBusy(true);
    try { await onEdit(reason.trim(), patch); setReason(""); } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }

  async function handleConfirm() {
    setBusy(true);
    try { await onConfirm(); setError(null); } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }

  return (
    <section className="clause-pane" aria-labelledby="clause-title">
      <h2 id="clause-title">Clause review</h2>
      <p className="context-label">Clause {clause.id}</p>
      <blockquote>{clause.text}</blockquote>
      <p><strong>Predicate:</strong> <code>{clause.predicate}</code></p>
      <p className="subline">Cited page {clause.evidencePage}</p>

      <label>
        Decision reason (required for reject or edit)
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Explain evidence or correction" />
      </label>
      {error && <p role="alert" className="error-text">{error}</p>}

      <label>
        Edited clause (optional)
        <textarea value={patch} onChange={(e) => setPatch(e.target.value)} rows={2} placeholder="Proposed correction" />
      </label>

      <div className="route-actions">
        <button type="button" className="primary-action" onClick={handleConfirm} disabled={busy}>Confirm</button>
        <button type="button" onClick={handleReject} disabled={busy}>Reject</button>
        <button type="button" onClick={handleEdit} disabled={busy}>Save edit</button>
      </div>
      <p className="subline">Confirm re-runs assessments; material edits reset review state.</p>
    </section>
  );
}
