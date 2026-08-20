import { notFound } from "next/navigation";

import { AssessmentView } from "../../../components/assessment-view";
import { FailureState } from "../../../components/failure-state";
import { ApiFailure, getAssessment } from "../../../lib/api";
import type { AssessmentEnvelope } from "../../../schemas/assessment";

export const dynamic = "force-dynamic";

/** Loads one assessment while preserving its typed API failure. */
async function loadAssessment(opportunityId: string): Promise<AssessmentEnvelope | ApiFailure> {
  try {
    return await getAssessment(opportunityId);
  } catch (error) {
    if (error instanceof ApiFailure) return error;
    throw error;
  }
}

/** Renders a runtime-validated assessment using promise-based route params. */
export default async function OpportunityPage({ params }: PageProps<"/opportunities/[opportunityId]">) {
  const { opportunityId } = await params;
  const assessment = await loadAssessment(opportunityId);
  if (assessment instanceof ApiFailure && assessment.kind === "not-found") notFound();
  if (assessment instanceof ApiFailure) return <FailureState kind={assessment.kind} />;
  return <main className="page-shell detail-page" id="main-content"><AssessmentView envelope={assessment} /></main>;
}
