"""Closed project, EMD, deadline, and combined predicate contracts."""

from datetime import date
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from backend.contracts.rules import (
    CertificationPredicate,
    DecimalString,
    TurnoverAveragePredicate,
)
from backend.contracts.source import NonEmpty


class ClosedPredicateModel(BaseModel):
    """Reject fields outside a frozen deterministic predicate."""

    model_config = ConfigDict(extra="forbid")


class ProjectExperiencePredicate(ClosedPredicateModel):
    """Represent bounded completed-project count, value, and inclusive dates."""

    kind: Literal["PROJECT_EXPERIENCE"]
    value_basis: Literal["SINGLE_PROJECT", "EACH_OF_N_PROJECTS", "AGGREGATE_PROJECTS"]
    required_count: int = Field(ge=1)
    minimum_value_inr: DecimalString
    completion_requirement: Literal["COMPLETED"]
    completed_from: date | None
    completed_through: date | None
    date_window_inclusive: Literal[True]

    @model_validator(mode="after")
    def validate_date_window(self) -> "ProjectExperiencePredicate":
        """Reject a project window whose end precedes its start."""
        if (
            self.completed_from
            and self.completed_through
            and self.completed_through < self.completed_from
        ):
            raise ValueError("project completion window is reversed")
        return self


class EmdPredicate(ClosedPredicateModel):
    """Keep EMD availability separate from verified company qualification."""

    kind: Literal["EMD"]
    amount_inr: DecimalString
    exemption_available: bool
    qualification_field: str | None


class DeadlinePredicate(ClosedPredicateModel):
    """Represent one aware deadline and whether its timezone was assumed."""

    kind: Literal["DEADLINE"]
    closes_at: AwareDatetime
    timezone: NonEmpty
    timezone_assumed: bool


RulePredicate = Annotated[
    TurnoverAveragePredicate
    | CertificationPredicate
    | ProjectExperiencePredicate
    | EmdPredicate
    | DeadlinePredicate,
    Field(discriminator="kind"),
]
