/** Persistent outbound webhook and API-key administration. */
"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { api } from "../../../../convex/_generated/api";

const EVENTS = ["opportunity.created","opportunity.updated","assessment.completed","amendment.detected","review.decided","proposal.locked","submission.prepared"] as const;

/** Renders authenticated integration records and one-time credentials. */
export default function IntegrationsSettingsPage() {
  const webhooks = useQuery(api.integrations.listWebhooks, {});
  const apiKeys = useQuery(api.integrations.listApiKeys, {});
  const connectors = useQuery(api.sources.listConnectors, {});
  const registerWebhook = useMutation(api.integrations.registerWebhook);
  const rotateSecret = useMutation(api.integrations.rotateSecret);
  const disableWebhook = useMutation(api.integrations.disableWebhook);
  const createApiKey = useMutation(api.integrations.createApiKey);
  const revokeApiKey = useMutation(api.integrations.revokeApiKey);
  const upsertConnector = useMutation(api.sources.upsertConnector);
  const setConnectorEnabled = useMutation(api.sources.setConnectorEnabled);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["opportunity.created"]);
  const [keyName, setKeyName] = useState("");
  const [credential, setCredential] = useState("");
  const [error, setError] = useState("");
  const [portal, setPortal] = useState("CPPP");
  const [collector, setCollector] = useState("cppp-live-tenders");

  /** Saves reviewed collector configuration without exposing provider credentials. */
  async function saveConnector(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try { await upsertConnector({ portal, collectorName: collector, collectorVersion: "1.0.0", scheduleCron: "0 */6 * * *", policyReviewedAt: Date.now(), enabled: false }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Source connector save failed."); }
  }

  /** Registers one tenant-scoped HTTPS endpoint and reveals secret once. */
  async function addWebhook(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try { const result = await registerWebhook({ url, events }); setCredential(`Webhook signing secret: ${result.secret}`); setUrl(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Webhook registration failed."); }
  }

  /** Creates one API key and reveals raw key once. */
  async function addApiKey(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try { const result = await createApiKey({ name: keyName }); setCredential(`API key: ${result.key}`); setKeyName(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "API key creation failed."); }
  }

  return (
    <main id="main-content" className="page-shell">
      <header className="page-intro"><h1>Integrations</h1><p>Manage tenant-scoped webhook destinations and revocable API keys. Raw credentials are returned once.</p></header>
      {credential ? <div role="status" className="panel"><strong>Copy now</strong><code className="hash">{credential}</code><button type="button" onClick={() => setCredential("")}>Hide credential</button></div> : null}
      <section><h2>Source collectors</h2><form onSubmit={saveConnector} className="filter-rail"><label>Portal<select value={portal} onChange={(event) => setPortal(event.target.value)}><option>CPPP</option><option>WEST_BENGAL</option><option>NTPC</option><option>ODISHA</option></select></label><label>Bright Data collector name<input value={collector} onChange={(event) => setCollector(event.target.value)} required /></label><button type="submit" className="primary-action">Save disabled connector</button></form>
        {connectors === undefined ? <p role="status">Loading source collectors…</p> : connectors.length === 0 ? <p className="empty-state">No source collectors.</p> : <div className="table-wrap"><table><thead><tr><th>Portal</th><th>Collector</th><th>Schedule</th><th>Status</th><th>Action</th></tr></thead><tbody>{connectors.map((connector) => <tr key={connector._id}><td>{connector.portal}</td><td>{connector.collectorName}</td><td>{connector.scheduleCron ?? "Manual"}</td><td>{connector.enabled ? "Enabled" : "Disabled"}</td><td><button type="button" onClick={() => void setConnectorEnabled({ connectorId: connector._id, enabled: !connector.enabled })}>{connector.enabled ? "Disable" : "Enable"}</button></td></tr>)}</tbody></table></div>}
      </section>
      <section><h2>Webhook endpoints</h2><form onSubmit={addWebhook} className="filter-rail"><label>Destination URL<input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://hooks.example.com/bidradar" required /></label><fieldset><legend>Events</legend>{EVENTS.map((item) => <label key={item}><input type="checkbox" checked={events.includes(item)} onChange={(event) => setEvents(event.target.checked ? [...events, item] : events.filter((value) => value !== item))} />{item}</label>)}</fieldset><button type="submit" className="primary-action" disabled={events.length === 0}>Register webhook</button></form>
        {webhooks === undefined ? <p role="status">Loading webhooks…</p> : webhooks.length === 0 ? <p className="empty-state">No webhook endpoints.</p> : <div className="table-wrap"><table><thead><tr><th>URL</th><th>Events</th><th>Status</th><th>Actions</th></tr></thead><tbody>{webhooks.map((webhook) => <tr key={webhook._id}><td>{webhook.url}</td><td>{webhook.events.join(", ")}</td><td>{webhook.state}</td><td><button type="button" onClick={() => void rotateSecret({ id: webhook._id }).then((result) => setCredential(`Webhook signing secret: ${result.secret}`))}>Rotate secret</button> <button type="button" onClick={() => void disableWebhook({ id: webhook._id })}>Disable</button></td></tr>)}</tbody></table></div>}
      </section>
      <section><h2>API keys</h2><form onSubmit={addApiKey} className="filter-rail"><label>Key name<input value={keyName} onChange={(event) => setKeyName(event.target.value)} required /></label><button type="submit" className="primary-action">Create API key</button></form>
        {apiKeys === undefined ? <p role="status">Loading API keys…</p> : apiKeys.length === 0 ? <p className="empty-state">No API keys.</p> : <div className="table-wrap"><table><thead><tr><th>Name</th><th>Status</th><th>Created</th><th>Action</th></tr></thead><tbody>{apiKeys.map((key) => <tr key={key._id}><td>{key.name}</td><td>{key.state}</td><td>{new Date(key.createdAt).toLocaleDateString()}</td><td><button type="button" onClick={() => void revokeApiKey({ id: key._id })}>Revoke</button></td></tr>)}</tbody></table></div>}
      </section>
      {error ? <p role="alert">{error}</p> : null}
      <p className="disclaimer">Webhook URLs are HTTPS-only and private-network destinations are blocked. API keys are stored only as SHA-256 hashes.</p>
    </main>
  );
}
