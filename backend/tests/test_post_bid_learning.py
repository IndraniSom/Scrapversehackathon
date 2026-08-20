"""Post-bid learning aggregates, suggestions, export/deletion."""

from datetime import UTC, datetime

from backend.post_bid_learning import (
    BidOutcomeRecord,
    aggregate_outcomes,
    delete_outcome,
    export_outcomes,
    generate_suggestions,
    validate_outcome,
)


def outcome(result: str, reasons: list[str], days_ago: int = 1) -> BidOutcomeRecord:
    """Build one dated outcome."""
    return BidOutcomeRecord(result=result, reason_categories=reasons, created_at=datetime(2026, 8, days_ago, tzinfo=UTC), value_inr=None, notes="test")


def test_validate_outcome_rejects_invalid() -> None:
    """Invalid result or reason must raise."""
    try:
        validate_outcome("invalid", ["price"])
        assert False
    except ValueError:
        pass
    try:
        validate_outcome("won", ["not_a_reason"])
        assert False
    except ValueError:
        pass
    validate_outcome("won", ["price"])


def test_aggregate_minimum_sample_disclosure() -> None:
    """Small sample shows descriptive disclosure not causation."""
    outcomes = [outcome("lost", ["missing_evidence"])]
    agg = aggregate_outcomes(outcomes)
    assert agg["total"] == 1
    assert "Sample size 1" in agg["disclosure"]
    assert "disclaimer" in agg
    assert agg["minimum_sample"] == 5
    # Large sample still not predictive
    many = [outcome("lost", ["price"]) for _ in range(6)]
    agg2 = aggregate_outcomes(many)
    assert "Sample size 6" in agg2["disclosure"]
    assert "cannot prove causation" in agg2["disclosure"] or "not predictive" in agg2["disclosure"]


def test_suggestions_never_claim_causation() -> None:
    """Suggestions must be observations, not causation, and include bottleneck hints."""
    outcomes = [outcome("lost", ["missing_evidence"]) for _ in range(2)] + [outcome("no_submit", ["capacity"]) for _ in range(2)]
    agg = aggregate_outcomes(outcomes)
    suggestions = generate_suggestions(outcomes, agg)
    assert any("missing_evidence" in s or "content library" in s.lower() for s in suggestions)
    assert any("not causation" in s.lower() or "observation" in s.lower() for s in suggestions)
    for s in suggestions:
        assert "causation" in s.lower() or "observation" in s.lower()
        # Never claim "will win" or "causes win"
        assert "will win" not in s.lower()
        assert "causes win" not in s.lower()


def test_export_labels_not_hypothetical() -> None:
    """Export must label real outcomes as not hypothetical."""
    outcomes = [outcome("won", ["commercial"])]
    exported = export_outcomes(outcomes)
    assert exported["is_hypothetical"] is False
    assert exported["record_count"] == 1
    assert "disclaimer" in exported


def test_delete_is_immutable() -> None:
    """Deletion returns new list without mutating original."""
    a = outcome("won", ["price"])
    b = outcome("lost", ["price"])
    lst = [a, b]
    after = delete_outcome(lst, 0)
    assert len(after) == 1
    assert len(lst) == 2
    assert after[0] == b
