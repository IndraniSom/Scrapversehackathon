"""Frozen assessment/amendment views plus internal orchestration input."""

from typing import Literal

from pydantic import AwareDatetime, ConfigDict, Field, model_validator

from backend.contracts.evaluation import (
    ClosedEvaluationModel,
    CompanyProfile,
    EvidenceSpan,
    RuleGroup,
    RulePredicate,
    RuleResult,
)
from backend.contracts.source import (
    DataMode,
    HttpsUrl,
    NonEmpty,
    OpportunitySummary,
    Sha256,
)


class DocumentVersion(ClosedEvaluationModel):
    """Expose one immutable official document and text-quality decision."""

    id: NonEmpty
    role: Literal[
        "BASE_TENDER", "CORRIGENDUM", "CLARIFICATION", "PRE_BID_RESPONSE", "REPLACEMENT"
    ]
    source_url: HttpsUrl
    sha256: Sha256
    physical_page_count: int = Field(ge=1)
    text_quality: Literal["SUPPORTED", "NEEDS_OCR", "INVALID"]


class Assessment(ClosedEvaluationModel):
    """Expose one document's deterministic hard-rule assessment."""

    document: DocumentVersion
    requirements: RuleGroup
    recommendation: Literal["BID", "REVIEW", "NO_BID"]
    rule_results: list[RuleResult] = Field(min_length=1)
    unknown_applicable_rule_count: int = Field(ge=0)
    failed_hard_rule_count: int = Field(ge=0)


class AuthorityStatement(ClosedEvaluationModel):
    """Represent one reviewed authority, bidder, or third-party statement."""

    actor: Literal["AUTHORITY", "BIDDER", "THIRD_PARTY"]
    disposition: Literal["ACCEPTED", "REJECTED", "CLARIFIED", "UNCHANGED", "AMBIGUOUS"]
    effective_change: bool
    replaces_document_id: str | None
    evidence: EvidenceSpan

    @model_validator(mode="after")
    def validate_effective_change(self) -> "AuthorityStatement":
        """Require effective change to be accepted authority replacement."""
        if self.effective_change and (
            self.actor != "AUTHORITY"
            or self.disposition != "ACCEPTED"
            or not self.replaces_document_id
        ):
            raise ValueError("effective change requires accepted authority replacement")
        return self


class AssessmentView(ClosedEvaluationModel):
    """Expose the selected opportunity, company, and before/after assessments."""

    opportunity: OpportunitySummary
    company_profile: CompanyProfile
    base_assessment: Assessment
    amended_assessment: Assessment
    disclaimer: NonEmpty


class OpportunityList(ClosedEvaluationModel):
    """Expose the immutable opportunity inventory and generation timestamp."""

    items: list[OpportunitySummary]
    total: int = Field(ge=0)
    generated_at: AwareDatetime

    @model_validator(mode="after")
    def validate_total(self) -> "OpportunityList":
        """Require the declared total to equal the exact item count."""
        if self.total != len(self.items):
            raise ValueError("opportunity total does not match items")
        return self


class AmendmentImpactView(ClosedEvaluationModel):
    """Expose the single authority-controlled rule and recommendation transition."""

    opportunity_id: NonEmpty
    data_mode: DataMode
    base_document: DocumentVersion
    amendment_document: DocumentVersion
    authority_statement: AuthorityStatement
    changed_rule_id: NonEmpty
    old_clause: EvidenceSpan
    new_clause: EvidenceSpan
    old_predicate: RulePredicate
    new_predicate: RulePredicate
    base_recommendation: Literal["BID", "REVIEW", "NO_BID"]
    amended_recommendation: Literal["BID", "REVIEW", "NO_BID"]
    authority_change_applied: bool
    transition_reason: NonEmpty

    @model_validator(mode="after")
    def validate_transition_authority(self) -> "AmendmentImpactView":
        """Require every changed recommendation to have applied effective authority."""
        if self.authority_change_applied and not self.authority_statement.effective_change:
            raise ValueError("applied change lacks effective authority")
        if (
            self.base_recommendation != self.amended_recommendation
            and not self.authority_change_applied
        ):
            raise ValueError("recommendation transition lacks applied authority")
        return self


class AssessmentInput(ClosedEvaluationModel):
    """Carry every trusted input needed for one before/after recomputation."""

    opportunity: OpportunitySummary
    company_profile: CompanyProfile
    base_document: DocumentVersion
    amendment_document: DocumentVersion
    base_requirements: RuleGroup
    amendment_requirements: RuleGroup
    authority_statement: AuthorityStatement
    changed_rule_id: NonEmpty
    as_of: AwareDatetime
    lifecycle: Literal["OPEN", "CLOSED", "CANCELLED"]
    data_mode: DataMode
    base_revision: int = Field(ge=1)
    amendment_revision: int = Field(ge=1)
    base_extraction_state: Literal["PROPOSED", "EVIDENCE_VERIFIED", "INVALID"]
    amendment_extraction_state: Literal["PROPOSED", "EVIDENCE_VERIFIED", "INVALID"]
    base_review_state: Literal[
        "UNREVIEWED", "HUMAN_CONFIRMED", "HUMAN_REJECTED", "HUMAN_EDITED"
    ]
    amendment_review_state: Literal[
        "UNREVIEWED", "HUMAN_CONFIRMED", "HUMAN_REJECTED", "HUMAN_EDITED"
    ]


class AmendmentImpact(ClosedEvaluationModel):
    """Return both frozen views from the single public orchestration call."""

    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=False)
    assessment_view: AssessmentView
    impact_view: AmendmentImpactView
