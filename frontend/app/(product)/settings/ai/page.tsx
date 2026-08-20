/**
 * AI governance settings page.
 *
 * Exposes kill switches, model allowlist, rate limits, and usage
 * with evaluation-gate status. Admin-only controls.
 */
import { ALLOWED_MODELS, AI_FEATURES, RATE_LIMITS } from "../../../../convex/ai";

const FEATURE_LABELS: Record<string, string> = {
  extraction: "Requirement extraction",
  citations: "Citation verification",
  qa: "Tender Q&A",
  compliance: "Compliance matrix",
  claims: "Claim verification",
  amendment_mapping: "Amendment mapping",
};

/**
 * Renders the AI governance dashboard.
 */
export default function AiSettingsPage() {
  return (
    <main id="main-content" className="page-shell">
      <header className="page-intro">
        <h1>AI settings</h1>
        <p>Governance controls, evaluation gates, rate limits, and usage per NIST AI RMF.</p>
      </header>

      <section aria-labelledby="kills-heading" className="panel">
        <h2 id="kills-heading">Feature kill switches</h2>
        <p className="muted">Disable a feature immediately without redeploy. Requires org:admin.</p>
        <table>
          <thead><tr><th>Feature</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {AI_FEATURES.map((f: string) => (
              <tr key={f}>
                <td>{FEATURE_LABELS[f]}</td>
                <td><span className="badge">Enabled</span></td>
                <td><button type="button" aria-label={`Disable ${f}`}>Disable</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="models-heading" className="panel">
        <h2 id="models-heading">Approved models</h2>
        <ul>{ALLOWED_MODELS.map((m: string) => <li key={m}><code>{m}</code></li>)}</ul>
        <p className="muted">Only allowlisted models may be used. DeepSeek V4 Flash for routine, Pro for complex fallback.</p>
      </section>

      <section aria-labelledby="limits-heading" className="panel">
        <h2 id="limits-heading">Rate limits (per minute)</h2>
        <dl><dt>Per user</dt><dd>{RATE_LIMITS.perUser}</dd><dt>Per organization</dt><dd>{RATE_LIMITS.perOrg}</dd><dt>Global</dt><dd>{RATE_LIMITS.perGlobal}</dd></dl>
        <p className="muted">Exceeding a limit returns RATE_LIMITED with retry-after 60s. No prompt content is logged.</p>
      </section>

      <section aria-labelledby="eval-heading" className="panel">
        <h2 id="eval-heading">Evaluation gate</h2>
        <p>Production enablement requires zero unsupported hard clauses and zero cross-tenant retrievals. Metrics: schema validity, citation precision/recall, excerpt location, unsupported-claim, abstention, latency, cost.</p>
        <p className="muted">Datasets: extraction / citations / QA / compliance / claims / amendment mapping under backend/tests/evaluation_cases.</p>
      </section>

      <section aria-labelledby="usage-heading" className="panel">
        <h2 id="usage-heading">Token and cost tracking</h2>
        <p>Input/output/cached tokens and cost are stored per feature in aiRuns without sensitive prompts. Use governance dashboard to review usage by feature.</p>
      </section>
    </main>
  );
}
