"""Closed proposed rule contracts for preparation-time extraction."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from backend.contracts.source import MetadataText

FinancialYear = Annotated[str, StringConstraints(pattern=r"^[0-9]{4}-[0-9]{2}$")]
DecimalString = Annotated[
    str, StringConstraints(pattern=r"^[0-9]+(?:\.[0-9]{1,2})?$")
]


class ClosedRuleModel(BaseModel):
    """Reject model fields outside the explicitly supported extraction contract."""

    model_config = ConfigDict(extra="forbid")


class EvidenceProposal(ClosedRuleModel):
    """Propose one bounded physical-page excerpt for local verification."""

    physical_page_number: int = Field(ge=1)
    printed_page_label: str | None
    section_heading: MetadataText
    excerpt: str = Field(min_length=1, max_length=1200)


class TurnoverAveragePredicate(ClosedRuleModel):
    """Represent the supported bidder-only audited average-turnover predicate."""

    kind: Literal["TURNOVER_AVERAGE"]
    required_financial_years: list[FinancialYear] = Field(min_length=1)
    minimum_average_inr: DecimalString
    audited_only: Literal[True]
    legal_entity_scope: Literal["BIDDER_ONLY"]

    @model_validator(mode="after")
    def validate_unique_years(self) -> "TurnoverAveragePredicate":
        """Reject duplicate named financial years in average-turnover requirements."""
        if len(self.required_financial_years) != len(set(self.required_financial_years)):
            raise ValueError("required financial years must be unique")
        return self


class UnsupportedPredicate(ClosedRuleModel):
    """Retain unsupported prose so downstream policy must remain UNKNOWN."""

    kind: Literal["UNSUPPORTED"]
    reason: MetadataText


class ProposedRuleLeaf(ClosedRuleModel):
    """Represent a supported or explicitly unsupported hard rule proposal."""

    node_type: Literal["LEAF"]
    id: MetadataText
    kind: Literal["TURNOVER_AVERAGE", "UNSUPPORTED"]
    title: MetadataText
    hardness: Literal["HARD"]
    predicate: TurnoverAveragePredicate | UnsupportedPredicate
    evidence: list[EvidenceProposal] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_predicate_kind(self) -> "ProposedRuleLeaf":
        """Require the leaf discriminator to match its closed predicate object."""
        if self.kind != self.predicate.kind:
            raise ValueError("leaf kind does not match predicate kind")
        return self


class ProposedRuleGroup(ClosedRuleModel):
    """Represent one recursive proposed group before evidence verification."""

    node_type: Literal["GROUP"]
    id: MetadataText
    operator: Literal["ALL", "ANY", "AT_LEAST_N"]
    minimum_matches: int | None
    children: list["ProposedRuleGroup | ProposedRuleLeaf"] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_minimum(self) -> "ProposedRuleGroup":
        """Enforce null minima for ALL/ANY and bounded minima for AT_LEAST_N."""
        if self.operator in {"ALL", "ANY"} and self.minimum_matches is not None:
            raise ValueError("ALL/ANY minimum_matches must be null")
        if self.operator == "AT_LEAST_N" and (
            self.minimum_matches is None
            or self.minimum_matches < 1
            or self.minimum_matches > len(self.children)
        ):
            raise ValueError("AT_LEAST_N minimum_matches is outside children")
        return self


class AuthorityProposal(ClosedRuleModel):
    """Propose whether an authority document explicitly replaces an earlier clause."""

    actor: Literal["AUTHORITY", "BIDDER", "THIRD_PARTY"]
    disposition: Literal["ACCEPTED", "REJECTED", "CLARIFIED", "UNCHANGED", "AMBIGUOUS"]
    effective_change: bool
    replaces_document_id: str | None
    evidence: EvidenceProposal

    @model_validator(mode="after")
    def validate_effective_change(self) -> "AuthorityProposal":
        """Require an accepted authority statement to name the replaced document."""
        if self.effective_change and (
            self.actor != "AUTHORITY"
            or self.disposition != "ACCEPTED"
            or not self.replaces_document_id
        ):
            raise ValueError("effective change requires accepted authority replacement")
        return self
