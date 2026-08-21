/** Persistent assisted-submission handoff for approved packages. */
"use client";

import { useReverification } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";

import { ReceiptForm } from "../../../components/submissions/receipt-form";
import { SubmissionChecklist, type ChecklistState } from "../../../components/submissions/submission-checklist";
import { api } from "../../../convex/_generated/api";

const OFFICIAL_URL = "https://eprocure.gov.in/eprocure/app";
const EMPTY_CHECKLIST: ChecklistState = { serverClockAcknowledged: false, emdVerified: false, signingVerified: false, filenamesVerified: false, officialUrl: OFFICIAL_URL };
const isE2eMode = process.env.NEXT_PUBLIC_BIDRADAR_E2E_MODE === "1";
type SensitiveRequest = (input: { submissionId: string; operation: "prepare" | "receipt"; body: Record<string, unknown> }) => Promise<Response | null>;

/** Sends one action through Clerk's server-side reverification route. */
async function requestSubmission(input: { submissionId: string; operation: "prepare" | "receipt"; body: Record<string, unknown> }): Promise<Response> {
  return fetch(`/api/submissions/${input.submissionId}/${input.operation}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input.body) });
}

/** Binds production sensitive requests to Clerk's reverification modal. */
function ReverifiedIntegrationsPage() {
  const request = useReverification(requestSubmission);
  return <IntegrationsContent request={request} />;
}

/** Renders package UI using an injected sensitive request boundary. */
function IntegrationsContent({ request }: { request: SensitiveRequest }) {
  const packages = useQuery(api.submissions.list, {});
  const [selectedId, setSelectedId] = useState("");
  const [checklist, setChecklist] = useState(EMPTY_CHECKLIST);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const effectiveSelectedId = selectedId || String(packages?.[0]?._id ?? "");
  const selected = useMemo(() => packages?.find((entry) => String(entry._id) === effectiveSelectedId), [packages, effectiveSelectedId]);
  const approved = selected?.approvalState === "approved" && selected.validationState === "valid";
  const digest = selected?.manifest;

  /** Calls approval, digest, checklist, role, and reverification gates. */
  async function confirmHandoff() {
    if (!selected || !digest) return;
    setError("");
    const response = await request({ submissionId: String(selected._id), operation: "prepare", body: { portal: "CPPP", ...checklist, packageDigest: digest } });
    if (!response) return;
    if (!response.ok) { setError("Handoff could not be prepared."); return; }
    setNotice("Handoff readiness recorded. Complete Freeze Bid on official portal.");
  }

  return (
    <main className="page-shell" id="main-content">
      <header className="page-intro"><p className="source-line">Assisted submission</p><h1>Portal integrations</h1><p>Validate package, then complete DSC signing and Freeze Bid on official portal. This service never submits autonomously.</p></header>
      {packages === undefined ? <p role="status">Loading submission packages…</p> : packages.length === 0 ? <p className="empty-state">No submission packages. Lock and export an approved proposal first.</p> : <>
        <label>Submission package<select value={effectiveSelectedId} onChange={(event) => { setSelectedId(event.target.value); setChecklist(EMPTY_CHECKLIST); setNotice(""); }}>{packages.map((entry) => <option key={entry._id} value={entry._id}>{String(entry._id)} · {entry.validationState} · {entry.approvalState}</option>)}</select></label>
        {selected && digest ? <SubmissionChecklist portal="CPPP" officialUrl={OFFICIAL_URL} serverTime={new Date().toISOString()} checklist={checklist} onChange={setChecklist} onConfirm={() => void confirmHandoff()} approvalVerified={approved} /> : <p role="alert">Package manifest is unavailable. Regenerate ZIP export.</p>}
        {selected && digest && approved ? <ReceiptForm packageDigest={digest} onSubmit={async (receipt) => { const response = await request({ submissionId: String(selected._id), operation: "receipt", body: { portal: "CPPP", ...receipt } }); if (!response?.ok) throw new Error("Receipt was rejected."); setNotice("Portal receipt recorded."); }} /> : null}
      </>}
      {notice ? <p role="status">{notice}</p> : null}{error ? <p role="alert">{error}</p> : null}
      <section aria-labelledby="boundary-title"><h2 id="boundary-title">Submission boundary</h2><p>Package preparation and receipt recording are audited. No API exists for DSC use, terms acceptance, or final portal submission.</p></section>
    </main>
  );
}

/** Chooses Clerk reverification in production and inert requests in E2E fixtures. */
export default function IntegrationsPage() {
  if (isE2eMode) return <IntegrationsContent request={async () => new Response(null, { status: 204 })} />;
  return <ReverifiedIntegrationsPage />;
}
