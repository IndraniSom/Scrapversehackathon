"""Generalized deterministic assessment for versioned company/opportunity/requirements."""

from datetime import datetime
from typing import Literal

from backend.contracts.evaluation import CompanyProfile, RuleGroup, RuleResult
from backend.contracts.views import Assessment, DocumentVersion
from backend.eligibility import evaluate, recommendation_for

MaxBatchPairs = 25


def build_assessment(
    company: CompanyProfile,
    requirements: RuleGroup,
    document: DocumentVersion,
    as_of: datetime,
    lifecycle: Literal["OPEN", "CLOSED", "CANCELLED"] = "OPEN",
) -> Assessment:
    """Build one immutable assessment from versioned inputs using eligibility."""
    if as_of.utcoffset() is None:
        raise ValueError("as_of must be timezone-aware")
    result = evaluate(requirements, company, as_of)
    recommendation = recommendation_for(result, lifecycle)
    unknown, failed = _leaf_counts(result)
    return Assessment(
        document=document,
        requirements=requirements,
        recommendation=recommendation,
        rule_results=[result],
        unknown_applicable_rule_count=unknown,
        failed_hard_rule_count=failed,
    )


def scenario_preview(
    company: CompanyProfile,
    requirements: RuleGroup,
    document: DocumentVersion,
    as_of: datetime,
    lifecycle: Literal["OPEN", "CLOSED", "CANCELLED"] = "OPEN",
) -> Assessment:
    """Return a hypothetical assessment without mutating any accepted record."""
    preview = build_assessment(company, requirements, document, as_of, lifecycle)
    # Caller must not persist preview; label stays hypothetical
    return preview


def validate_batch_size(pairs: list[tuple[str, str]], limit: int = MaxBatchPairs) -> None:
    """Enforce bounded batch assessment on explicit request only."""
    if not pairs:
        raise ValueError("batch requires at least one company/opportunity pair")
    if len(pairs) > limit:
        raise ValueError(f"batch exceeds limit {limit}")


def compare_assessments(base: Assessment, current: Assessment) -> dict[str, object]:
    """Compare base and current assessments for version transition UI."""
    return {
        "base_recommendation": base.recommendation,
        "current_recommendation": current.recommendation,
        "base_failed": base.failed_hard_rule_count,
        "current_failed": current.failed_hard_rule_count,
        "base_unknown": base.unknown_applicable_rule_count,
        "current_unknown": current.unknown_applicable_rule_count,
        "changed": base.recommendation != current.recommendation
        or base.failed_hard_rule_count != current.failed_hard_rule_count,
    }


def _leaf_counts(result: RuleResult) -> tuple[int, int]:
    """Count UNKNOWN and FAIL leaves recursively, ignoring NOT_APPLICABLE."""
    if not result.children:
        return (int(result.evaluation == "UNKNOWN"), int(result.evaluation == "FAIL"))
    unknowns = fails = 0
    for child in result.children:
        u, f = _leaf_counts(child)
        unknowns += u
        fails += f
    return unknowns, fails
