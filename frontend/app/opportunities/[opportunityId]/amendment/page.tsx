import { notFound } from "next/navigation";

import { AmendmentImpactView } from "../../../../components/amendment-impact-view";
import { FailureState } from "../../../../components/failure-state";
import { ApiFailure, getAmendmentImpact } from "../../../../lib/api";
import type { AmendmentImpactEnvelope } from "../../../../schemas/assessment";

export const dynamic = "force-dynamic";

/** Loads amendment impact while preserving its typed API failure. */
async function loadImpact(opportunityId: string): Promise<AmendmentImpactEnvelope | ApiFailure> {
  try {
    return await getAmendmentImpact(opportunityId);
  } catch (error) {
    if (error instanceof ApiFailure) return error;
    throw error;
  }
}

/** Renders the runtime-validated amendment impact for a promised route param. */
export default async function AmendmentPage({ params }: PageProps<"/opportunities/[opportunityId]/amendment">) {
  const { opportunityId } = await params;
  const impact = await loadImpact(opportunityId);
  if (impact instanceof ApiFailure && impact.kind === "not-found") notFound();
  if (impact instanceof ApiFailure) return <FailureState kind={impact.kind} />;
  return <main className="page-shell detail-page" id="main-content"><AmendmentImpactView impact={impact.data} /></main>;
}
