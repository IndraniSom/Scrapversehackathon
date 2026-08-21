/** Persistent first-run setup for organization, company, sources, and alerts. */
"use client";

import { useMutation } from "convex/react";
import Link from "next/link";
import { useState } from "react";

import { api } from "../../convex/_generated/api";

const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Europe/London", "America/New_York", "UTC"] as const;
const SOURCES = ["CPPP", "WEST_BENGAL", "NTPC", "ODISHA"] as const;

/** Converts portal ID to its reviewed Bright Data collector convention. */
function collectorName(portal: string): string {
  return `${portal.toLowerCase().replaceAll("_", "-")}-live-tenders`;
}

/** Creates persistent tenant setup without local-only completion state. */
export default function OnboardingPage() {
  const updateOrganization = useMutation(api.organizations.updateOrganization);
  const createCompany = useMutation(api.companies.createCompany);
  const upsertConnector = useMutation(api.sources.upsertConnector);
  const updatePreferences = useMutation(api.notifications.updatePreferences);
  const [organizationName, setOrganizationName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [registrationId, setRegistrationId] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [sources, setSources] = useState<string[]>([]);
  const [policyReviewed, setPolicyReviewed] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  /** Toggles one portal selection without duplicates. */
  function toggleSource(source: string) {
    setSources((current) => current.includes(source) ? current.filter((item) => item !== source) : [...current, source]);
  }

  /** Persists setup records and leaves connectors disabled until provider credentials exist. */
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!organizationName.trim() || !companyName.trim() || !policyReviewed) { setError("Organization, company, and source-policy confirmation are required."); return; }
    setError("");
    try {
      await updateOrganization({ displayName: organizationName.trim(), timezone });
      await createCompany({ legalName: companyName.trim(), registrationId: registrationId.trim() || undefined });
      for (const portal of sources) await upsertConnector({ portal, collectorName: collectorName(portal), collectorVersion: "1.0.0", scheduleCron: "0 */6 * * *", policyReviewedAt: Date.now(), enabled: false });
      await updatePreferences({ quietStartHour: 22, quietEndHour: 7, timezone, digestCadence: "daily", channels: ["in_app", "digest"] });
      setDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Workspace setup failed.");
    }
  }

  if (done) return <main className="page-shell" id="main-content"><h1>Workspace ready</h1><p>Company and notification preferences are saved. Source connectors remain disabled until Bright Data credentials are configured.</p><Link href="/opportunities" className="primary-action">Open opportunities</Link></main>;
  return (
    <main className="page-shell" id="main-content">
      <header className="page-intro"><p className="source-line">First-run setup</p><h1>Set up procurement workspace</h1><p>Create company profile, select reviewed portal sources, and save delivery timezone.</p></header>
      <form onSubmit={submit} className="filter-rail" aria-label="Workspace setup">
        <label>Organization name<input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} required /></label>
        <label>Company legal name<input value={companyName} onChange={(event) => setCompanyName(event.target.value)} required /></label>
        <label>Registration ID<input value={registrationId} onChange={(event) => setRegistrationId(event.target.value)} /></label>
        <label>Timezone<select value={timezone} onChange={(event) => setTimezone(event.target.value)}>{TIMEZONES.map((value) => <option key={value}>{value}</option>)}</select></label>
        <fieldset><legend>Portal sources</legend>{SOURCES.map((source) => <label key={source}><input type="checkbox" checked={sources.includes(source)} onChange={() => toggleSource(source)} />{source.replaceAll("_", " ")}</label>)}</fieldset>
        <label><input type="checkbox" checked={policyReviewed} onChange={(event) => setPolicyReviewed(event.target.checked)} />I reviewed portal collection terms and robots policy.</label>
        <button type="submit" className="primary-action">Save workspace</button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}
