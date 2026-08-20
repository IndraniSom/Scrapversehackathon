"""Deterministic turnover, certification, group, and trust-state tests."""

from datetime import date

import pytest
from assessment_helpers import AS_OF, certification_leaf, company, group, turnover_leaf
from pydantic import ValidationError

from backend.contracts.evaluation import ApplicabilityCondition, UnsupportedRuleLeaf
from backend.eligibility import evaluate, recommendation_for


@pytest.mark.parametrize(
    ("threshold", "amounts", "expected"),
    [
        ("90000000", ("90000000",) * 3, "PASS"),
        ("90000001", ("90000000",) * 3, "FAIL"),
        ("90000000", ("89999999", "90000000", "90000000"), "FAIL"),
    ],
)
def test_turnover_uses_exact_decimal_average(
    threshold: str, amounts: tuple[str, str, str], expected: str
) -> None:
    """Exact threshold passes while a one-rupee average shortfall fails."""
    result = evaluate(group(turnover_leaf(threshold)), company(amounts=amounts), AS_OF)
    assert result.children[0].evaluation == expected


@pytest.mark.parametrize(
    ("mutation", "expected"),
    [("missing-year", "UNKNOWN"), ("unaudited", "FAIL"), ("mismatch", "FAIL"), ("missing-entity", "UNKNOWN")],
)
def test_turnover_rejects_non_bidder_or_incomplete_evidence(
    mutation: str, expected: str
) -> None:
    """Missing identity/year stays unknown; known nonqualifying evidence fails."""
    bidder = company(
        audited=mutation != "unaudited",
        legal_entity_id=None if mutation == "missing-entity" else (
            "PARENT-ENTITY" if mutation == "mismatch" else "CIN-DEMO-001"
        ),
    )
    if mutation == "missing-year":
        bidder = bidder.model_copy(update={"turnover_evidence": bidder.turnover_evidence[:2]})
    result = evaluate(group(turnover_leaf()), bidder, AS_OF)
    assert result.children[0].evaluation == expected


@pytest.mark.parametrize(
    ("valid_from", "valid_until", "expected"),
    [
        (date(2026, 2, 2), date(2026, 2, 2), "PASS"),
        (date(2025, 1, 1), date(2026, 2, 1), "FAIL"),
        (None, None, "UNKNOWN"),
    ],
)
def test_certification_uses_inclusive_validity_anchor(
    valid_from: date | None, valid_until: date | None, expected: str
) -> None:
    """Known anchor inclusion passes, known expiry fails, missing wording is unknown."""
    bidder = company()
    certificate = bidder.certifications[0].model_copy(
        update={"valid_from": valid_from, "valid_until": valid_until}
    )
    bidder = bidder.model_copy(update={"certifications": [certificate]})
    result = evaluate(group(certification_leaf()), bidder, AS_OF)
    assert result.children[0].evaluation == expected


@pytest.mark.parametrize(
    ("operator", "minimum", "expected"),
    [("ALL", None, "FAIL"), ("ANY", None, "PASS"), ("AT_LEAST_N", 1, "PASS")],
)
def test_group_operators_propagate_without_scores(
    operator: str, minimum: int | None, expected: str
) -> None:
    """Groups combine exact child states with no weighting or scores."""
    rules = group(turnover_leaf("90000001"), certification_leaf(), operator=operator, minimum=minimum)
    result = evaluate(rules, company(), AS_OF)
    assert result.evaluation == expected


def test_explicit_verified_false_applicability_is_not_applicable() -> None:
    """A verified condition known false is the only path to NOT_APPLICABLE."""
    leaf = turnover_leaf().model_copy(
        update={
            "applicability": ApplicabilityCondition(
                field="bidder_legal_entity_id",
                operator="EQUALS",
                expected_value="OTHER-ENTITY",
                evidence=turnover_leaf().evidence[0],
            )
        }
    )
    result = evaluate(group(leaf), company(), AS_OF)
    assert result.children[0].evaluation == "NOT_APPLICABLE"


def test_unsupported_or_unreviewed_rule_never_bids() -> None:
    """Unsupported prose and unreviewed evidence remain UNKNOWN and REVIEW."""
    unsupported = UnsupportedRuleLeaf(
        node_type="LEAF",
        id="unsupported",
        kind="UNSUPPORTED",
        title="Ambiguous experience",
        hardness="HARD",
        reason="Similarity is subjective",
        applicability=None,
        evidence=[turnover_leaf().evidence[0]],
    )
    result = evaluate(group(unsupported), company(), AS_OF)
    assert result.evaluation == "UNKNOWN"
    assert recommendation_for(result, "OPEN") == "REVIEW"
    assert recommendation_for(result, "CLOSED") == "NO_BID"


@pytest.mark.parametrize(
    "values",
    [
        {"operator": "ALL", "minimum_matches": None, "children": []},
        {"operator": "ALL", "minimum_matches": 1},
        {"operator": "ANY", "minimum_matches": 1},
        {"operator": "AT_LEAST_N", "minimum_matches": None},
        {"operator": "AT_LEAST_N", "minimum_matches": 0},
        {"operator": "AT_LEAST_N", "minimum_matches": 2},
    ],
)
def test_malformed_groups_reject_before_evaluation(values: dict[str, object]) -> None:
    """Empty or illegal minima cannot produce a vacuous PASS or BID."""
    valid = group(turnover_leaf()).model_dump()
    with pytest.raises(ValidationError):
        type(group(turnover_leaf())).model_validate(valid | values)
