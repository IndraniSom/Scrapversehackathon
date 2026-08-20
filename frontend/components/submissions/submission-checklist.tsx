/**
 * Submission checklist for assisted handoff.
 *
 * Shows official link, server-clock warning, EMD, signing, filenames.
 * Requires all steps before enabling confirm.
 */
import React from "react";

export type ChecklistState = {
  serverClockAcknowledged: boolean;
  emdVerified: boolean;
  signingVerified: boolean;
  filenamesVerified: boolean;
  officialUrl: string;
};

type Props = {
  portal: string;
  officialUrl: string;
  serverTime: string;
  checklist: ChecklistState;
  onChange: (next: ChecklistState) => void;
  onConfirm: () => void;
  stepUpVerified: boolean;
  approvalVerified: boolean;
};

/**
 * Renders procurement handoff checklist with authoritative guidance.
 */
export function SubmissionChecklist({ portal, officialUrl, serverTime, checklist, onChange, onConfirm, stepUpVerified, approvalVerified }: Props) {
  const allChecked = checklist.serverClockAcknowledged && checklist.emdVerified && checklist.signingVerified && checklist.filenamesVerified;
  const canConfirm = allChecked && stepUpVerified && approvalVerified && officialUrl.startsWith("https://");
  return (
    <section className="submission-checklist" aria-labelledby="checklist-title">
      <h2 id="checklist-title">Submission handoff — {portal}</h2>
      <p className="portal-link">
        Official portal: <a href={officialUrl} target="_blank" rel="noreferrer" className="text-link">{officialUrl}</a>
      </p>
      <div role="alert" className="server-clock-warning">
        <strong>Server-clock warning:</strong> Portal time is {serverTime}. Your device clock may differ; trust the portal timestamp. Do not rely on local time.
      </div>
      <ul className="checklist">
        <li><label><input type="checkbox" checked={checklist.serverClockAcknowledged} onChange={(e) => onChange({ ...checklist, serverClockAcknowledged: e.target.checked })} /> I confirmed the portal server time and deadline</label></li>
        <li><label><input type="checkbox" checked={checklist.emdVerified} onChange={(e) => onChange({ ...checklist, emdVerified: e.target.checked })} /> EMD amount, instrument, and validity verified</label></li>
        <li><label><input type="checkbox" checked={checklist.signingVerified} onChange={(e) => onChange({ ...checklist, signingVerified: e.target.checked })} /> Digital signing certificate and required covers ready</label></li>
        <li><label><input type="checkbox" checked={checklist.filenamesVerified} onChange={(e) => onChange({ ...checklist, filenamesVerified: e.target.checked })} /> Filenames, formats, and size limits match portal instructions</label></li>
      </ul>
      {!stepUpVerified && <p className="form-error">Step-up authentication required before handoff.</p>}
      {!approvalVerified && <p className="form-error">Bid-manager approval required before handoff.</p>}
      <button type="button" className="primary-action" disabled={!canConfirm} onClick={onConfirm} aria-disabled={!canConfirm}>
        Confirm handoff readiness
      </button>
      <p className="disclaimer">Manual Freeze Bid on the official portal is required. This system never submits autonomously.</p>
    </section>
  );
}
