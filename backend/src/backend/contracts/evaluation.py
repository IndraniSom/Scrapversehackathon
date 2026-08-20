"""Closed deterministic company, predicate, rule, and result contracts."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from backend.contracts.predicates import RulePredicate
from backend.contracts.rules import DecimalString, FinancialYear
from backend.contracts.source import HttpsUrl, MetadataText, NonEmpty, Sha256


class ClosedEvaluationModel(BaseModel):
    """Reject undeclared assessment fields at every persisted boundary."""

    model_config = ConfigDict(extra="forbid")


class EvidenceSpan(ClosedEvaluationModel):
    """Carry one bounded reviewed clause with complete document provenance."""

    source_url: HttpsUrl
    source_snapshot_sha256: Sha256
    document_sha256: Sha256
    document_version_id: NonEmpty
    physical_page_number: int = Field(ge=1)
    printed_page_label: str | None
    section_heading: NonEmpty
    excerpt: str = Field(min_length=1, max_length=1200)
    normalized_page_text_sha256: Sha256
    extraction_model: NonEmpty
    extraction_prompt_version: NonEmpty
    extraction_schema_version: NonEmpty
    extraction_state: Literal["PROPOSED", "EVIDENCE_VERIFIED", "INVALID"]
    review_state: Literal[
        "UNREVIEWED", "HUMAN_CONFIRMED", "HUMAN_REJECTED", "HUMAN_EDITED"
    ]


class TurnoverEvidence(ClosedEvaluationModel):
    """Record one audited or unaudited financial-year amount for a legal entity."""

    financial_year: FinancialYear
    amount_inr: DecimalString
    audited: bool
    legal_entity_id: NonEmpty | None
    evidence_reference: str | None


class CertificationEvidence(ClosedEvaluationModel):
    """Record bounded certificate validity dates without inferring missing wording."""

    name: NonEmpty
    valid_from: date | None
    valid_until: date | None
    evidence_reference: str | None


class ProjectEvidence(ClosedEvaluationModel):
    """Record one similar-work candidate with explicit completion facts."""

    id: NonEmpty
    title: NonEmpty
    client: NonEmpty
    value_inr: DecimalString
    completion_state: Literal["COMPLETED", "IN_PROGRESS", "UNKNOWN"]
    completed_at: date | None
    similar_work_confirmed: bool | None
    evidence_reference: str | None


class EmdExemptionEvidence(ClosedEvaluationModel):
    """Record qualification for one named EMD exemption scheme."""

    scheme: NonEmpty
    qualified: bool | None
    evidence_reference: str | None


class CompanyProfile(ClosedEvaluationModel):
    """Hold only company evidence used by the deterministic evaluator."""

    id: NonEmpty
    name: NonEmpty
    bidder_legal_entity_id: NonEmpty | None
    turnover_evidence: list[TurnoverEvidence]
    certifications: list[CertificationEvidence]
    projects: list[ProjectEvidence]
    emd_exemptions: list[EmdExemptionEvidence]


class ApplicabilityCondition(ClosedEvaluationModel):
    """Represent one narrow verified condition controlling rule applicability."""

    field: NonEmpty
    operator: Literal["EQUALS", "IN", "EXISTS"]
    expected_value: str | bool | list[str] | None
    evidence: EvidenceSpan


class RuleLeaf(ClosedEvaluationModel):
    """Represent one frozen supported hard rule and its reviewed evidence."""

    node_type: Literal["LEAF"]
    id: MetadataText
    kind: Literal["TURNOVER_AVERAGE", "CERTIFICATION", "PROJECT_EXPERIENCE", "EMD", "DEADLINE"]
    title: MetadataText
    hardness: Literal["HARD"]
    predicate: RulePredicate
    applicability: ApplicabilityCondition | None
    evidence: list[EvidenceSpan] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_kind(self) -> "RuleLeaf":
        """Require the leaf discriminator to match its predicate."""
        if self.kind != self.predicate.kind:
            raise ValueError("leaf kind does not match predicate")
        return self


class UnsupportedRuleLeaf(ClosedEvaluationModel):
    """Retain bounded unsupported prose that must evaluate to UNKNOWN."""

    node_type: Literal["LEAF"]
    id: MetadataText
    kind: Literal["UNSUPPORTED"]
    title: MetadataText
    hardness: Literal["HARD"]
    reason: MetadataText
    applicability: ApplicabilityCondition | None
    evidence: list[EvidenceSpan] = Field(min_length=1)


class RuleGroup(ClosedEvaluationModel):
    """Represent one non-vacuous recursive rule operator."""

    node_type: Literal["GROUP"]
    id: MetadataText
    operator: Literal["ALL", "ANY", "AT_LEAST_N"]
    minimum_matches: int | None
    children: list["RuleGroup | RuleLeaf | UnsupportedRuleLeaf"] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_minimum(self) -> "RuleGroup":
        """Enforce null ALL/ANY minima and bounded AT_LEAST_N minima."""
        if self.operator in {"ALL", "ANY"} and self.minimum_matches is not None:
            raise ValueError("ALL/ANY minimum must be null")
        if self.operator == "AT_LEAST_N" and (
            self.minimum_matches is None
            or self.minimum_matches < 1
            or self.minimum_matches > len(self.children)
        ):
            raise ValueError("AT_LEAST_N minimum is invalid")
        return self


RuleNode = RuleGroup | RuleLeaf | UnsupportedRuleLeaf


class RuleResult(ClosedEvaluationModel):
    """Expose one deterministic evaluation and recursive child explanations."""

    rule_id: MetadataText
    title: MetadataText
    evaluation: Literal["PASS", "FAIL", "UNKNOWN", "NOT_APPLICABLE"]
    explanation: NonEmpty
    company_value: str | None
    requirement_value: str | None
    evidence: list[EvidenceSpan]
    children: list["RuleResult"]
