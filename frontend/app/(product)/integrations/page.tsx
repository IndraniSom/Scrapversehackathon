/**
 * Integrations page for SubmissionConnector boundary.
 *
 * Shows connector prepare/status only, checklist guidance,
 * and manual handoff instructions. No autonomous submission.
 */
import { SubmissionChecklist } from "../../../components/submissions/submission-checklist";
import { ReceiptForm } from "../../../components/submissions/receipt-form";

export const dynamic = "force-dynamic";

/**
 * Renders assisted submission integrations with checklist and receipt capture.
 */
export default function IntegrationsPage() {
  const officialUrl = "https://eprocure.gov.in/eprocure/app";
  const serverTime = new Date().toISOString();
  const demoDigest = "a".repeat(64);
  const noOp = () => {};
  const dummySubmit = async () => {};

  return (
    <main className="page-shell" id="main-content">
      <header className="page-intro">
        <p className="source-line">Assisted submission</p>
        <h1>Portal integrations</h1>
        <p>Prepare and track handoff to the official portal. Final submission uses your DSC and Freeze Bid on the portal. The system never submits autonomously.</p>
      </header>
      <section aria-labelledby="connector-title">
        <h2 id="connector-title">SubmissionConnector boundary</h2>
        <p><code>SubmissionConnector.prepare()</code> validates checklist, step-up auth, and approval, then stages the package. <code>SubmissionConnector.status()</code> reports readiness. No <code>submit()</code> exists without portal-authorized API.</p>
        <ul>
          <li>Official portal link required (https)</li>
          <li>Server-clock warning shown; portal time authoritative</li>
          <li>EMD, signing, filenames verified</li>
          <li>Step-up auth + bid-manager approval required</li>
          <li>Acknowledgement digest recorded and audited; AI cannot change state</li>
        </ul>
      </section>
      <SubmissionChecklist
        portal="CPPP"
        officialUrl={officialUrl}
        serverTime={serverTime}
        checklist={{ serverClockAcknowledged: false, emdVerified: false, signingVerified: false, filenamesVerified: false, officialUrl }}
        onChange={noOp}
        onConfirm={noOp}
        stepUpVerified={false}
        approvalVerified={false}
      />
      <ReceiptForm packageDigest={demoDigest} onSubmit={dummySubmit} />
      <p className="disclaimer">All transitions are audited. Duplicate receipts are rejected. Stale packages must be re-validated.</p>
    </main>
  );
}
