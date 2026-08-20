"""Fail-closed evaluation for operator-discriminated applicability."""

from backend.contracts.applicability import (
    ApplicabilityCondition,
    ApplicabilityEquals,
    ApplicabilityExists,
    ApplicabilityIn,
)
from backend.contracts.evaluation import CompanyProfile


def evaluate_applicability(
    condition: ApplicabilityCondition | None, company: CompanyProfile
) -> bool | None:
    """Evaluate the sole supported verified company applicability field."""
    if condition is None:
        return True
    evidence = condition.evidence
    trusted = (
        evidence.extraction_state == "EVIDENCE_VERIFIED"
        and evidence.review_state in {"HUMAN_CONFIRMED", "HUMAN_EDITED"}
    )
    if not trusted or condition.field != "bidder_legal_entity_id":
        return None
    actual = company.bidder_legal_entity_id
    if actual is None:
        return None
    if isinstance(condition, ApplicabilityExists):
        return True
    if isinstance(condition, ApplicabilityEquals):
        candidate = condition.expected_value
        if not isinstance(candidate, str) or not candidate.strip():
            return None
        return actual == candidate
    if isinstance(condition, ApplicabilityIn):
        candidates = condition.expected_value
        if not candidates or any(
            not isinstance(candidate, str) or not candidate.strip()
            for candidate in candidates
        ):
            return None
        return actual in candidates
    return None
