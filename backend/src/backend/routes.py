"""Thin read-only routes over the startup-validated immutable bundle."""

from fastapi import APIRouter, Request

from backend.contracts.api import ApiEnvelope, HealthResponse, success
from backend.contracts.artifacts import DemoBundle
from backend.contracts.source import OpportunityId, VerifiedSourceProof
from backend.contracts.views import AmendmentImpactView, AssessmentView, OpportunityList


class OpportunityNotFound(LookupError):
    """Signal that no assessed opportunity matches the route identifier."""


class DemoUnavailable(RuntimeError):
    """Signal that startup-validated immutable data is unavailable."""


router = APIRouter()


def _bundle(request: Request) -> DemoBundle:
    """Return the lifespan-loaded bundle or raise the safe unavailable signal."""
    bundle = getattr(request.app.state, "bundle", None)
    if not isinstance(bundle, DemoBundle):
        raise DemoUnavailable
    return bundle


@router.get("/health/live", response_model=HealthResponse, operation_id="getLiveness")
def get_liveness() -> HealthResponse:
    """Report that the process can accept a liveness request."""
    return HealthResponse(status="ok")


@router.get("/health/ready", response_model=HealthResponse, operation_id="getReadiness")
def get_readiness(request: Request) -> HealthResponse:
    """Report readiness only while the validated bundle remains installed."""
    _bundle(request)
    return HealthResponse(status="ok")


@router.get(
    "/api/v1/opportunities",
    response_model=ApiEnvelope[OpportunityList],
    operation_id="listOpportunities",
)
def list_opportunities(request: Request) -> ApiEnvelope[OpportunityList]:
    """Return the exact immutable seven-row opportunity inventory."""
    return success(_bundle(request).opportunities)


def _selected(request: Request, opportunity_id: str) -> DemoBundle:
    """Return the bundle only for its single assessed route identifier."""
    bundle = _bundle(request)
    if opportunity_id != bundle.manifest.opportunity_id:
        raise OpportunityNotFound
    return bundle


@router.get(
    "/api/v1/opportunities/{opportunity_id:path}/amendment-impact",
    response_model=ApiEnvelope[AmendmentImpactView],
    operation_id="getAmendmentImpact",
)
def get_amendment_impact(
    request: Request, opportunity_id: OpportunityId
) -> ApiEnvelope[AmendmentImpactView]:
    """Return the authority-gated single-rule amendment impact view."""
    return success(_selected(request, opportunity_id).impact)


@router.get(
    "/api/v1/opportunities/{opportunity_id:path}",
    response_model=ApiEnvelope[AssessmentView],
    operation_id="getAssessment",
)
def get_assessment(
    request: Request, opportunity_id: OpportunityId
) -> ApiEnvelope[AssessmentView]:
    """Return the recomputation-verified before/after assessment view."""
    return success(_selected(request, opportunity_id).assessment)


@router.get(
    "/api/v1/source-proof",
    response_model=ApiEnvelope[VerifiedSourceProof],
    operation_id="getSourceProof",
)
def get_source_proof(request: Request) -> ApiEnvelope[VerifiedSourceProof]:
    """Return the offline-verified real provider proof branch."""
    return success(_bundle(request).verified_proof)
