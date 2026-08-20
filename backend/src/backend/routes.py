"""Thin read-only routes over the startup-validated immutable bundle."""

from typing import Literal
from urllib.parse import unquote_to_bytes

from fastapi import APIRouter, Request
from pydantic import TypeAdapter, ValidationError

from backend.contracts.api import ApiEnvelope, HealthResponse, success
from backend.contracts.artifacts import DemoBundle
from backend.contracts.source import OpportunityId, VerifiedSourceProof
from backend.contracts.views import AmendmentImpactView, AssessmentView, OpportunityList


class OpportunityNotFound(LookupError):
    """Signal that no assessed opportunity matches the route identifier."""


class DemoUnavailable(RuntimeError):
    """Signal that startup-validated immutable data is unavailable."""


class ContractViolation(ValueError):
    """Signal malformed raw route bytes or an invalid shared OpportunityId."""


router = APIRouter()
OPPORTUNITY_PREFIX = b"/api/v1/opportunities/"
AMENDMENT_SUFFIX = b"/amendment-impact"
OPPORTUNITY_ID_ADAPTER = TypeAdapter(OpportunityId)


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
    "/api/v1/opportunities/{remainder:path}",
    response_model=ApiEnvelope[AssessmentView] | ApiEnvelope[AmendmentImpactView],
    operation_id="dispatchOpportunityRead",
)
def dispatch_opportunity_read(
    request: Request, remainder: str
) -> ApiEnvelope[AssessmentView] | ApiEnvelope[AmendmentImpactView]:
    """Dispatch detail versus impact from the raw literal suffix boundary."""
    del remainder
    opportunity_id, operation = _raw_operation(request)
    bundle = _selected(request, opportunity_id)
    if operation == "impact":
        return success(bundle.impact)
    return success(bundle.assessment)


def _raw_operation(
    request: Request,
) -> tuple[str, Literal["assessment", "impact"]]:
    """Decode one raw ID while distinguishing encoded slashes from literal suffix."""
    raw_path = request.scope.get("raw_path")
    if not isinstance(raw_path, bytes) or not raw_path.startswith(OPPORTUNITY_PREFIX):
        raise ContractViolation
    raw_remainder = raw_path[len(OPPORTUNITY_PREFIX) :]
    operation: Literal["assessment", "impact"] = "assessment"
    if raw_remainder.endswith(AMENDMENT_SUFFIX):
        raw_remainder = raw_remainder[: -len(AMENDMENT_SUFFIX)]
        operation = "impact"
    try:
        decoded = unquote_to_bytes(raw_remainder).decode("utf-8")
        opportunity_id = OPPORTUNITY_ID_ADAPTER.validate_python(decoded)
    except (UnicodeDecodeError, ValidationError) as error:
        raise ContractViolation from error
    return opportunity_id, operation


@router.get(
    "/api/v1/source-proof",
    response_model=ApiEnvelope[VerifiedSourceProof],
    operation_id="getSourceProof",
)
def get_source_proof(request: Request) -> ApiEnvelope[VerifiedSourceProof]:
    """Return the offline-verified real provider proof branch."""
    return success(_bundle(request).verified_proof)
