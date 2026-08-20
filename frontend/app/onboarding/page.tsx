/**
 * Onboarding flow for BidRadar.
 * Collects organization, company, sources, timezone, and alert defaults.
 */
"use client";
import Link from "next/link";
import { useState } from "react";
/** Onboarding step. */
type Step = "org" | "company" | "sources" | "preferences";
/** Timezone options. */
const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Europe/London", "America/New_York", "UTC"] as const;
/** Source options. */
const SOURCES = [
  { id: "CPPP", label: "CPPP" },
  { id: "WEST_BENGAL", label: "West Bengal" },
  { id: "NTPC", label: "NTPC" },
  { id: "ODISHA", label: "Odisha" },
] as const;
/**
 * Onboarding form state.
 */
type OnboardingState = {
  orgName: string;
  companyName: string;
  cin: string;
  timezone: string;
  alertsEmail: string;
  digest: string;
  sources: string[];
};

/**
 * Validates required fields.
 */
function validate(s: OnboardingState): string | null {
  if (!s.orgName.trim()) return "Organization name is required.";
  if (!s.companyName.trim()) return "Company name is required.";
  if (!s.timezone) return "Select a timezone.";
  return null;
}
/**
 * Multi-step onboarding with native controls, 44px targets, and WCAG labels.
 */
export default function OnboardingPage() {
  const [step, setStep] = useState<Step>("org");
  const [state, setState] = useState({ orgName: "Acme Procurement", companyName: "", cin: "", timezone: "Asia/Kolkata", alertsEmail: "manager@acme.example", digest: "daily", sources: ["CPPP"] as string[] });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  /** Updates a text field. */
  function update(field: string, value: string): void {
    setState((p) => ({ ...p, [field]: value }));
  }
  /** Toggles a source. */
  function toggleSource(id: string): void {
    setState((p) => ({ ...p, sources: p.sources.includes(id) ? p.sources.filter((s) => s !== id) : [...p.sources, id] }));
  }
  /** Advances step or finishes. */
  function next(): void {
    const err = validate(state);
    if (err && step === "preferences") { setError(err); return; }
    setError(null);
    if (step === "org") setStep("company");
    else if (step === "company") setStep("sources");
    else if (step === "sources") setStep("preferences");
    else { const v = validate(state); if (v) { setError(v); return; } setDone(true); }
  }
  /** Goes back one step. */
  function back(): void {
    if (step === "preferences") setStep("sources");
    else if (step === "sources") setStep("company");
    else if (step === "company") setStep("org");
  }
  if (done) return (<main className="page-shell" id="main-content"><h1>Workspace ready</h1><p>Organization {state.orgName} is configured with timezone {state.timezone} and {state.sources.length} sources.</p><Link href="/opportunities" className="btn-primary min-h-[44px] inline-flex items-center justify-center">Go to Opportunities</Link></main>);
  return (
    <main className="page-shell" id="main-content">
      <header className="page-intro"><p className="eyebrow">Onboarding</p><h1>Set up your procurement workspace</h1><p>Confirm organization, add a company, choose sources, and set timezone and alerts.</p></header>
      <nav aria-label="Progress" className="mb-6"><ol className="flex gap-2 text-sm">{["org", "company", "sources", "preferences"].map((s) => (<li key={s} aria-current={step === s ? "step" : undefined} className={step === s ? "font-bold" : "text-[var(--muted)]"}>{s}</li>))}</ol></nav>
      {error ? <p role="alert" className="error-panel mb-4">{error}</p> : null}
      {step === "org" ? (<fieldset className="grid gap-4"><legend className="font-semibold">Organization confirmation</legend><label className="grid gap-1"><span>Organization name</span><input value={state.orgName} onChange={(e) => update("orgName", e.target.value)} className="min-h-[44px] border border-[var(--border)] rounded-[var(--radius-sm)] px-3" /></label></fieldset>) : null}
      {step === "company" ? (<fieldset className="grid gap-4"><legend className="font-semibold">First company</legend><label className="grid gap-1"><span>Legal name</span><input value={state.companyName} onChange={(e) => update("companyName", e.target.value)} required className="min-h-[44px] border border-[var(--border)] rounded-[var(--radius-sm)] px-3" /></label><label className="grid gap-1"><span>CIN (optional)</span><input value={state.cin} onChange={(e) => update("cin", e.target.value)} className="min-h-[44px] border border-[var(--border)] rounded-[var(--radius-sm)] px-3" /></label></fieldset>) : null}
      {step === "sources" ? (<fieldset className="grid gap-2"><legend className="font-semibold">Source preferences</legend>{SOURCES.map((s) => (<label key={s.id} className="flex min-h-[44px] items-center gap-2 border border-[var(--border)] rounded-[var(--radius-sm)] px-3"><input type="checkbox" checked={state.sources.includes(s.id)} onChange={() => toggleSource(s.id)} className="h-5 w-5" />{s.label}</label>))}</fieldset>) : null}
      {step === "preferences" ? (<fieldset className="grid gap-4"><legend className="font-semibold">Timezone and alerts</legend><label className="grid gap-1"><span>Timezone</span><select value={state.timezone} onChange={(e) => update("timezone", e.target.value)} className="min-h-[44px] border border-[var(--border)] rounded-[var(--radius-sm)] px-3">{TIMEZONES.map((tz) => (<option key={tz} value={tz}>{tz}</option>))}</select></label><label className="grid gap-1"><span>Alert email</span><input type="email" value={state.alertsEmail} onChange={(e) => update("alertsEmail", e.target.value)} className="min-h-[44px] border border-[var(--border)] rounded-[var(--radius-sm)] px-3" /></label><label className="grid gap-1"><span>Digest cadence</span><select value={state.digest} onChange={(e) => update("digest", e.target.value)} className="min-h-[44px] border border-[var(--border)] rounded-[var(--radius-sm)] px-3"><option value="immediate">Immediate</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label></fieldset>) : null}
      <div className="mt-6 flex gap-3">{step !== "org" ? <button type="button" onClick={back} className="btn-ghost min-h-[44px]">Back</button> : null}<button type="button" onClick={next} className="btn-primary min-h-[44px]">{step === "preferences" ? "Finish setup" : "Continue"}</button></div>
    </main>
  );
}
