"""Post-bid learning from organization-owned outcomes only."""

from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

ALLOWED_REASONS = {
    "price",
    "technical_score",
    "eligibility_gap",
    "missing_evidence",
    "deadline_missed",
    "capacity",
    "commercial",
    "compliance",
    "incumbent",
    "relationship",
    "other",
}
ALLOWED_RESULTS = {"won", "lost", "no_submit"}
MIN_SAMPLE = 5
DISCLAIMER = "Descriptive summary only; sparse data cannot prove causation or predict wins."


@dataclass(frozen=True)
class BidOutcomeRecord:
    """Organization-owned outcome with structured reason categories."""

    result: Literal["won", "lost", "no_submit"]
    reason_categories: list[str]
    created_at: datetime
    value_inr: float | None = None
    notes: str | None = None
    evidence: str | None = None


def validate_outcome(result: str, reasons: list[str]) -> None:
    """Validate result and reason categories against closed sets."""
    if result not in ALLOWED_RESULTS:
        raise ValueError(f"invalid result {result}")
    for r in reasons:
        if r not in ALLOWED_REASONS:
            raise ValueError(f"invalid reason {r}")


def aggregate_outcomes(outcomes: list[BidOutcomeRecord]) -> dict:
    """Aggregate counts and timelines with minimum-sample disclosure."""
    total = len(outcomes)
    by_result = Counter(o.result for o in outcomes)
    by_reason = Counter(r for o in outcomes for r in o.reason_categories)
    # Timeline by month YYYY-MM
    by_month = Counter(o.created_at.strftime("%Y-%m") for o in outcomes)
    disclosure = (
        f"Sample size {total} — trends are descriptive, not predictive."
        if total < MIN_SAMPLE
        else f"Sample size {total} — {DISCLAIMER}"
    )
    return {
        "total": total,
        "by_result": dict(by_result),
        "by_reason": dict(by_reason),
        "by_month": dict(sorted(by_month.items())),
        "disclosure": disclosure,
        "disclaimer": DISCLAIMER,
        "minimum_sample": MIN_SAMPLE,
    }


def generate_suggestions(outcomes: list[BidOutcomeRecord], aggregate: dict | None = None) -> list[str]:
    """Generate reviewable suggestions without claiming win causation."""
    agg = aggregate or aggregate_outcomes(outcomes)
    suggestions: list[str] = []
    reasons = agg.get("by_reason", {})
    by_result = agg.get("by_result", {})
    if reasons.get("missing_evidence", 0) >= 2:
        suggestions.append("Review content library: 2+ losses cite missing_evidence — verify turnover/certification evidence.")
    if reasons.get("eligibility_gap", 0) >= 1:
        suggestions.append("Schedule evidence gap review for eligibility_gap cases.")
    if by_result.get("no_submit", 0) >= 2:
        suggestions.append("Process bottleneck: multiple no_submit — audit deadline and capacity planning.")
    if reasons.get("compliance", 0) >= 1:
        suggestions.append("Compliance matrix review suggested for compliance-related outcomes.")
    # Saved-search tuning hint when many losses
    if agg["total"] >= MIN_SAMPLE and by_result.get("lost", 0) > by_result.get("won", 0):
        suggestions.append("Consider tuning saved searches: losses outnumber wins — review filters without assuming causation.")
    if not suggestions:
        suggestions.append("No pattern meets threshold; continue recording outcomes for learning.")
    # Never claim causation
    return [s + " (observation, not causation)" for s in suggestions]


def export_outcomes(outcomes: list[BidOutcomeRecord]) -> dict:
    """Export outcomes with hypothetical label and disclaimer."""
    return {
        "export_type": "bid_outcomes",
        "is_hypothetical": False,
        "record_count": len(outcomes),
        "records": [
            {
                "result": o.result,
                "reason_categories": o.reason_categories,
                "created_at": o.created_at.isoformat(),
                "value_inr": o.value_inr,
                "notes": o.notes,
            }
            for o in outcomes
        ],
        "disclaimer": DISCLAIMER,
    }


def delete_outcome(outcomes: list[BidOutcomeRecord], index: int) -> list[BidOutcomeRecord]:
    """Return a new list with the indexed outcome removed (immutable)."""
    if index < 0 or index >= len(outcomes):
        raise IndexError("outcome index out of range")
    return [o for i, o in enumerate(outcomes) if i != index]
