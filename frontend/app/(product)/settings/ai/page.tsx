/** Persistent tenant AI governance and usage controls. */
"use client";

import { useMutation, useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";

const LABELS: Record<string, string> = { extraction: "Requirement extraction", citations: "Citation verification", qa: "Tender Q&A", compliance: "Compliance matrix", claims: "Claim verification", amendment_mapping: "Amendment mapping" };

/** Renders live kill switches, allowlist, limits, and recorded usage. */
export default function AiSettingsPage() {
  const governance = useQuery(api.ai.getGovernance, {});
  const runs = useQuery(api.ai.listAiRuns, {});
  const setKillSwitch = useMutation(api.ai.setKillSwitch);
  if (governance === undefined || runs === undefined) return <main className="page-shell" id="main-content"><p role="status">Loading AI governance…</p></main>;
  const tokens = runs.reduce((total, run) => total + (run.tokens?.input ?? 0) + (run.tokens?.output ?? 0), 0);
  const cost = runs.reduce((total, run) => total + (run.cost ?? 0), 0);
  return (
    <main id="main-content" className="page-shell">
      <header className="page-intro"><h1>AI settings</h1><p>Organization-scoped feature controls, approved models, limits, and measured usage.</p></header>
      <section><h2>Feature controls</h2><div className="table-wrap"><table><thead><tr><th scope="col">Feature</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead><tbody>{governance.features.map((feature) => { const disabled = governance.kills[feature] === true; return <tr key={feature}><td>{LABELS[feature] ?? feature}</td><td>{disabled ? "Disabled" : "Enabled"}</td><td><button type="button" onClick={() => void setKillSwitch({ feature, disabled: !disabled })}>{disabled ? "Enable" : "Disable"}</button></td></tr>; })}</tbody></table></div></section>
      <section><h2>Approved models</h2><ul>{governance.models.map((model) => <li key={model}><code>{model}</code></li>)}</ul></section>
      <section><h2>Rate limits</h2><dl className="definition-grid"><div><dt>Per user</dt><dd>{governance.limits.perUser}/minute</dd></div><div><dt>Per organization</dt><dd>{governance.limits.perOrg}/minute</dd></div><div><dt>Global</dt><dd>{governance.limits.perGlobal}/minute</dd></div></dl></section>
      <section><h2>Recorded usage</h2><p>{runs.length} runs · {tokens.toLocaleString()} tokens · {cost.toFixed(4)} recorded cost units.</p><p>Prompts and document bodies are not stored in usage records.</p></section>
      <p className="disclaimer">AI output remains proposed until deterministic validation or authorized human review.</p>
    </main>
  );
}
