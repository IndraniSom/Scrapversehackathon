"""Executive brief generation with cited closed schema and abstention."""

from pydantic import BaseModel, ConfigDict, Field

from backend.tender_qa import ABSTAIN_TEXT, RetrievedChunk, check_rate_limit

ABSTAIN = ABSTAIN_TEXT


class BriefCitation(BaseModel):
    """Citation for one brief field linking to source chunk."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    chunk_id: str = Field(min_length=1)
    document_id: str = Field(min_length=1)
    page_number: int = Field(ge=1)
    document_hash: str = Field(min_length=16)


class BriefField(BaseModel):
    """One brief section with text and required citations when established."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    value: str = Field(min_length=1)
    citations: list[BriefCitation]
    is_abstained: bool = False


class ExecutiveBrief(BaseModel):
    """Closed brief schema requiring citations for every factual paragraph."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    organization_id: str = Field(min_length=1)
    opportunity_id: str = Field(min_length=1)
    scope: BriefField
    authority: BriefField
    dates: BriefField
    fees: BriefField
    hard_requirements: BriefField
    deliverables: BriefField
    submission_instructions: BriefField
    amendments: BriefField
    uncertainties: BriefField
    review_state: str = Field(min_length=1)


def _validate_tenant(chunks: list[RetrievedChunk], org: str, opp: str) -> None:
    """Reject chunks that do not belong to the requesting tenant/tender."""
    for chunk in chunks:
        if chunk.organization_id != org or chunk.opportunity_id != opp:
            raise ValueError("CROSS_TENANT_RETRIEVAL")


def _field(value: str | None, citations: list[BriefCitation], allowed: set[str]) -> BriefField:
    """Return cited field or abstention when value is missing."""
    if value is None or not value.strip():
        return BriefField(value=ABSTAIN, citations=[], is_abstained=True)
    if not citations:
        raise ValueError("MISSING_CITATION")
    for citation in citations:
        if citation.chunk_id not in allowed:
            raise ValueError("CITATION_NOT_IN_CONTEXT")
    return BriefField(value=value.strip(), citations=citations, is_abstained=False)


def build_brief(
    organization_id: str,
    opportunity_id: str,
    chunks: list[RetrievedChunk],
    scope: str | None,
    scope_citations: list[BriefCitation],
    authority: str | None,
    authority_citations: list[BriefCitation],
    dates: str | None,
    dates_citations: list[BriefCitation],
    fees: str | None,
    fees_citations: list[BriefCitation],
    hard_requirements: str | None,
    hard_citations: list[BriefCitation],
    deliverables: str | None,
    deliverables_citations: list[BriefCitation],
    submission_instructions: str | None,
    submission_citations: list[BriefCitation],
    amendments: str | None,
    amendments_citations: list[BriefCitation],
    uncertainties: str | None,
    uncertainties_citations: list[BriefCitation],
    review_state: str = "NEEDS_REVIEW",
) -> ExecutiveBrief:
    """Validate tenant and per-field citations and build the closed brief."""
    check_rate_limit(organization_id)
    _validate_tenant(chunks, organization_id, opportunity_id)
    allowed = {chunk.chunk_id for chunk in chunks}
    return ExecutiveBrief(
        organization_id=organization_id,
        opportunity_id=opportunity_id,
        scope=_field(scope, scope_citations, allowed),
        authority=_field(authority, authority_citations, allowed),
        dates=_field(dates, dates_citations, allowed),
        fees=_field(fees, fees_citations, allowed),
        hard_requirements=_field(hard_requirements, hard_citations, allowed),
        deliverables=_field(deliverables, deliverables_citations, allowed),
        submission_instructions=_field(submission_instructions, submission_citations, allowed),
        amendments=_field(amendments, amendments_citations, allowed),
        uncertainties=_field(uncertainties, uncertainties_citations, allowed),
        review_state=review_state,
    )


def is_fully_reviewed(brief: ExecutiveBrief) -> bool:
    """Return whether the brief has passed human review."""
    return brief.review_state == "REVIEWED"
