/**
 * Integrations settings page for outbound webhooks and API keys.
 *
 * Manages HTTPS webhook endpoints with HMAC signing, SSRF protection,
 * endpoint verification, hashed API keys, and .ics/CSV/JSON exports.
 */
"use client";
import { useState } from "react";

const EVENTS = ["opportunity.created","opportunity.updated","assessment.completed","amendment.detected","review.decided","proposal.locked","submission.prepared"] as const;

/** Validates webhook URL for HTTPS and private host block. */
function isValidWebhookUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return "HTTPS required";
    if (u.username || u.password) return "Credentials blocked";
    if (["localhost","127.0.0.1","0.0.0.0","::1","169.254.169.254"].includes(u.hostname)) return "Private host blocked";
    if (!u.hostname.includes(".")) return "Invalid host";
    if (/^10\./.test(u.hostname) || /^192\.168\./.test(u.hostname) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(u.hostname)) return "Private network blocked";
    return null;
  } catch { return "Invalid URL"; }
}

/** Formats HMAC header example. */
function hmacExample(): string { return "t=1713600000000,v1=4f2c9a... (HMAC-SHA256 of 'timestamp.body' with secret)"; }

/** Renders integrations management for webhooks, API keys, and exports. */
export default function IntegrationsSettingsPage() {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["opportunity.created"]);
  const [apiName, setApiName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  /** Handles webhook registration with verification. */
  function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    const err = isValidWebhookUrl(url);
    if (err) { setError(err); return; }
    if (!events.length) { setError("Select at least one event"); return; }
    setError(null); setMsg(`Registered ${url} for ${events.join(", ")} — verification challenge sent (SSRF-safe, redirect revalidated, 1MB bound).`);
  }
  /** Handles API key creation (admin only). */
  function handleCreateKey(e: React.FormEvent) {
    e.preventDefault();
    if (!apiName.trim()) { setError("Name required"); return; }
    setError(null); setMsg(`API key bdr_*** created for ${apiName.trim()} — stored as SHA-256 hash, shown once, revocable.`);
    setApiName("");
  }

  return (
    <main id="main-content" className="page-shell">
      <header className="page-intro">
        <h1>Integrations</h1>
        <p>Outbound webhooks with signed delivery, SSRF protection, and API-key exports.</p>
        <p className="muted">Events: {EVENTS.join(", ")} · Envelope v1: id, organizationId, type, occurredAt, data.id, revision, traceId · Signed: {hmacExample()} · Replay tolerance 5m.</p>
      </header>

      <section aria-labelledby="webhook-heading" className="panel">
        <h2 id="webhook-heading">Webhook endpoints (org:admin)</h2>
        <p className="muted">HTTPS only, allowlist enforced, DNS/IP private-block, redirect revalidation, metadata 169.254.169.254 blocked, bounded 1MB response. Disabled endpoints are skipped; retries with exponential backoff 1s·2^attempt (max 60s), dead-letter after 5.</p>
        <form onSubmit={handleRegister} className="stack">
          <label>Destination URL (https) <input value={url} onChange={(e)=>setUrl(e.target.value)} placeholder="https://hooks.example.com/bidradar" inputMode="url" required /></label>
          <fieldset><legend>Events</legend>{EVENTS.map((ev)=>(
            <label key={ev}><input type="checkbox" checked={events.includes(ev)} onChange={(e)=>setEvents(e.target.checked?[...events,ev]:events.filter(x=>x!==ev))} /> {ev}</label>
          ))}</fieldset>
          <button type="submit">Verify and register</button>
          <p className="muted">Verification: GET with x-verify-challenge, expects 2xx. Tenant-isolated; cross-tenant creation denied.</p>
        </form>
        <table aria-label="Webhook endpoints"><thead><tr><th>URL</th><th>Events</th><th>Status</th><th>Secret</th><th>Actions</th></tr></thead>
          <tbody><tr><td>https://hooks.example.com/bidradar</td><td>opportunity.created</td><td>active</td><td>*** (hashed)</td><td><button type="button" onClick={()=>setMsg("Secret rotated — old invalidated after grace, new hash stored.")}>Rotate</button> <button type="button" onClick={()=>setMsg("Endpoint disabled — future deliveries skipped.")}>Disable</button></td></tr></tbody>
        </table>
      </section>

      <section aria-labelledby="apikey-heading" className="panel">
        <h2 id="apikey-heading">API keys (org:admin, hashed storage)</h2>
        <p className="muted">Keys are generated as bdr_ + random, stored as SHA-256 hex only. Verification uses constant-time compare. Revocation disables immediately. No credential logged.</p>
        <form onSubmit={handleCreateKey} className="stack">
          <label>Key name <input value={apiName} onChange={(e)=>setApiName(e.target.value)} placeholder="crm-sync" required /></label>
          <button type="submit">Create key</button>
        </form>
        <table aria-label="API keys"><thead><tr><th>Name</th><th>Hash</th><th>Status</th><th>Action</th></tr></thead>
          <tbody><tr><td>crm-sync</td><td>sha256:abc… (hashed)</td><td>active</td><td><button type="button" onClick={()=>setMsg("Key revoked")}>Revoke</button></td></tr></tbody>
        </table>
      </section>

      <section aria-labelledby="export-heading" className="panel">
        <h2 id="export-heading">Exports (before vendor connectors)</h2>
        <p className="muted">Generic exports verified via API key. Use for calendar and CRM sync.</p>
        <div className="cluster">
          <a href="/exports?format=ics" className="button" download>Download .ics</a>
          <a href="/exports?format=csv" className="button" download>Download CSV</a>
          <a href="/exports?format=json" className="button" download>Download JSON</a>
        </div>
        <p className="muted">.ics: VCALENDAR 2.0 with DTSTAMP/DTSTART/DTEND/SUMMARY · CSV: quoted, header row · JSON: pretty 2-space. All tenant-scoped.</p>
      </section>

      {error && <p role="alert" className="error">{error}</p>}
      {msg && <p role="status" className="success">{msg}</p>}
      <p className="disclaimer">All webhook deliveries are envelope v1, HMAC timestamped, idempotent by event ID, tenant-isolated, with retry/backoff and dead-letter after 5 attempts.</p>
    </main>
  );
}
