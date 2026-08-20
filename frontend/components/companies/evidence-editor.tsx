/** Structured evidence editors for turnover, certification, project, and exemption. */
"use client";
import { useState } from "react";
import { isValidDateOrder, isValidFinancialYear, isValidInrAmount } from "../../convex/companies";

type EvidenceProps = {
  organizationId: string;
  companyId: string;
  onAddTurnover: (v: { financialYear: string; amountInr: string; audited: boolean }) => Promise<unknown>;
  onAddCertification: (v: { name: string; issuer: string; validFrom?: number; validUntil?: number }) => Promise<unknown>;
  onAddProject: (v: { clientName: string; valueInr?: string; startAt?: number; endAt?: number; completionState: "completed" | "ongoing" }) => Promise<unknown>;
  onAddExemption: (v: { scheme: string; qualificationState: "qualified" | "pending" | "not_qualified" }) => Promise<unknown>;
};

/** Parses date input to epoch ms or undefined. */
function parseDate(value: string): number | undefined {
  if (!value) return undefined;
  const t = Date.parse(value);
  return Number.isNaN(t) ? undefined : t;
}

/**
 * Renders four evidence editors with live FY, INR, and date-order validation.
 * Shows inline hints and blocks submit when validation fails.
 */
export function EvidenceEditor({ onAddTurnover, onAddCertification, onAddProject, onAddExemption }: EvidenceProps) {
  const [fy, setFy] = useState("2023-24");
  const [amount, setAmount] = useState("12000000.00");
  const [audited, setAudited] = useState(true);
  const [certName, setCertName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [client, setClient] = useState("");
  const [projValue, setProjValue] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [scheme, setScheme] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const fyValid = isValidFinancialYear(fy);
  const amtValid = isValidInrAmount(amount);
  const projAmtValid = !projValue || isValidInrAmount(projValue);
  const certDatesValid = isValidDateOrder(parseDate(validFrom), parseDate(validUntil));
  const projDatesValid = isValidDateOrder(parseDate(startAt), parseDate(endAt));

  return (
    <section className="evidence-editor" aria-label="Structured evidence editors">
      <h2>Structured evidence</h2>
      <div className="evidence-grid">
        <form onSubmit={async (e) => { e.preventDefault(); if (!fyValid || !amtValid) return; await onAddTurnover({ financialYear: fy, amountInr: amount, audited }); setMsg("Turnover saved."); }} className="evidence-card">
          <h3>Turnover</h3>
          <label>Financial year<input value={fy} onChange={(e) => setFy(e.target.value)} aria-describedby="fy-hint" placeholder="2023-24" /></label>
          <p id="fy-hint" className="hint">{fyValid ? "Format YYYY-YY, e.g. 2023-24." : "Invalid FY. Use 2023-24 where 24 = 23+1."}</p>
          <label>Amount INR<input value={amount} onChange={(e) => setAmount(e.target.value)} aria-describedby="amt-hint" placeholder="12000000.00" /></label>
          <p id="amt-hint" className="hint">{amtValid ? "Decimal with up to 2 places, positive." : "Invalid INR. Example: 12000000.00"}</p>
          <label><input type="checkbox" checked={audited} onChange={(e) => setAudited(e.target.checked)} /> Audited</label>
          <button type="submit" disabled={!fyValid || !amtValid} className="primary-action">Add turnover</button>
        </form>

        <form onSubmit={async (e) => { e.preventDefault(); if (!certName.trim() || !issuer.trim() || !certDatesValid) return; await onAddCertification({ name: certName.trim(), issuer: issuer.trim(), validFrom: parseDate(validFrom), validUntil: parseDate(validUntil) }); setMsg("Certification saved."); }} className="evidence-card">
          <h3>Certification</h3>
          <label>Name<input value={certName} onChange={(e) => setCertName(e.target.value)} required /></label>
          <label>Issuer<input value={issuer} onChange={(e) => setIssuer(e.target.value)} required /></label>
          <label>Valid from<input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} /></label>
          <label>Valid until<input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></label>
          {!certDatesValid ? <p role="alert" className="field-error">Valid from must be before valid until.</p> : <p className="hint">Leave dates empty if not applicable.</p>}
          <button type="submit" disabled={!certName.trim() || !issuer.trim() || !certDatesValid} className="primary-action">Add certification</button>
        </form>

        <form onSubmit={async (e) => { e.preventDefault(); if (!client.trim() || !projAmtValid || !projDatesValid) return; await onAddProject({ clientName: client.trim(), valueInr: projValue || undefined, startAt: parseDate(startAt), endAt: parseDate(endAt), completionState: "completed" }); setMsg("Project saved."); }} className="evidence-card">
          <h3>Project</h3>
          <label>Client<input value={client} onChange={(e) => setClient(e.target.value)} required /></label>
          <label>Value INR (optional)<input value={projValue} onChange={(e) => setProjValue(e.target.value)} placeholder="5000000" /></label>
          {!projAmtValid ? <p role="alert" className="field-error">Invalid INR value.</p> : null}
          <label>Start<input type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} /></label>
          <label>End<input type="date" value={endAt} onChange={(e) => setEndAt(e.target.value)} /></label>
          {!projDatesValid ? <p role="alert" className="field-error">Start must be before end.</p> : null}
          <button type="submit" disabled={!client.trim() || !projAmtValid || !projDatesValid} className="primary-action">Add project</button>
        </form>

        <form onSubmit={async (e) => { e.preventDefault(); if (!scheme.trim()) return; await onAddExemption({ scheme: scheme.trim(), qualificationState: "qualified" }); setMsg("Exemption saved."); }} className="evidence-card">
          <h3>Exemption</h3>
          <label>Scheme<input value={scheme} onChange={(e) => setScheme(e.target.value)} placeholder="MSME" required /></label>
          <button type="submit" disabled={!scheme.trim()} className="primary-action">Add exemption</button>
        </form>
      </div>
      {msg ? <p role="status" className="hint">{msg}</p> : null}
    </section>
  );
}
