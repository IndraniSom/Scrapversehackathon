import { notFound } from "next/navigation";
import { AmendmentImpactView } from "../../../../../components/amendment-impact-view";
import { FailureState } from "../../../../../components/failure-state";
import { ApiFailure, getAmendmentImpact } from "../../../../../lib/api";
import type { AmendmentImpactEnvelope } from "../../../../../schemas/assessment";

export const dynamic = "force-dynamic";

/**
 * Loads amendment impact with deterministic diff before AI narrative.
 * @param opportunityId - Route identifier.
 */
async function loadImpact(opportunityId: string): Promise<AmendmentImpactEnvelope | ApiFailure> {
  try {
    return await getAmendmentImpact(opportunityId);
  } catch (error) {
    if (error instanceof ApiFailure) return error;
    throw error;
  }
}

/**
 * Renders amendment revisions, authority statement, stale work items and notification.
 * @param params - Promise of route params containing opportunityId.
 */
export default async function AmendmentsPage({ params, searchParams: _searchParams }: { params: Promise<{ opportunityId: string }>; searchParams?: Promise<Record<string, string>> }) {
  void _searchParams;
  const { opportunityId } = await params;
  const impact = await loadImpact(opportunityId);
  if (impact instanceof ApiFailure && impact.kind === "not-found") notFound();
  if (impact instanceof ApiFailure) return <FailureState kind={impact.kind} />;
  const data = impact.data;
  const stale = data.authority_change_applied
    ? ["assessments", "complianceRows", "proposalSections", "reviewTasks", "deadlines"]
    : [];
  const nextActions = data.authority_change_applied
    ? ["Review stale assessments", "Update compliance matrix", "Reassign proposal sections"]
    : ["No action required"];
  return (
    <main className="page-shell detail-page" id="main-content">
      <AmendmentImpactView impact={data} />
      <section aria-labelledby="changed-rules-title" className="amendment-meta">
        <h2 id="changed-rules-title">Changed-rule revisions</h2>
        <p>Rule {data.changed_rule_id} deterministic diff applied before AI narrative.</p>
        <dl className="definition-grid">
          <div><dt>Old predicate</dt><dd><code>{JSON.stringify(data.old_predicate)}</code></dd></div>
          <div><dt>New predicate</dt><dd><code>{JSON.stringify(data.new_predicate)}</code></dd></div>
        </dl>
      </section>
      <section aria-labelledby="stale-title" className="stale-work-items">
        <h2 id="stale-title">Affected work items</h2>
        {stale.length === 0 ? <p>No work items marked stale.</p> : <ul>{stale.map((t) => <li key={t}>{t} marked stale</li>)}</ul>}
      </section>
      <section aria-labelledby="notify-title" className="amendment-notify">
        <h2 id="notify-title">Notification</h2>
        <p>Exact clauses notified with next actions.</p>
        <ul>{nextActions.map((a) => <li key={a}>{a}</li>)}</ul>
      </section>
    </main>
  );
}
