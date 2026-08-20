"""Project, EMD, deadline, and trust-state assessment boundary tests."""

from datetime import date, datetime, timedelta

import pytest
from assessment_helpers import AS_OF, company, evidence, group, turnover_leaf

from backend.contracts.evaluation import (
    EmdExemptionEvidence,
    ProjectEvidence,
    RuleLeaf,
)
from backend.contracts.predicates import (
    DeadlinePredicate,
    EmdPredicate,
    ProjectExperiencePredicate,
)
from backend.eligibility import evaluate, recommendation_for


def project_leaf(
    basis: str, *, count: int = 1, minimum: str = "100", start: date | None = None,
    end: date | None = None,
) -> RuleLeaf:
    """Build one closed project predicate for synthetic matrix cases."""
    return RuleLeaf(
        node_type="LEAF",
        id="projects",
        kind="PROJECT_EXPERIENCE",
        title="Completed similar projects",
        hardness="HARD",
        predicate=ProjectExperiencePredicate(
            kind="PROJECT_EXPERIENCE",
            value_basis=basis,
            required_count=count,
            minimum_value_inr=minimum,
            completion_requirement="COMPLETED",
            completed_from=start,
            completed_through=end,
            date_window_inclusive=True,
        ),
        applicability=None,
        evidence=[evidence()],
    )


def projects(
    values: list[str], *, states: list[str] | None = None,
    dates: list[date | None] | None = None,
    similar: list[bool | None] | None = None,
) -> list[ProjectEvidence]:
    """Build complete project rows with optional completion and similarity mutations."""
    states = states or ["COMPLETED"] * len(values)
    dates = dates or [date(2025, 6, 1)] * len(values)
    similar = similar or [True] * len(values)
    return [
        ProjectEvidence(
            id=f"p-{index}",
            title=f"Project {index}",
            client="Public Client",
            value_inr=value,
            completion_state=states[index - 1],
            completed_at=dates[index - 1],
            similar_work_confirmed=similar[index - 1],
            evidence_reference=f"project-{index}",
        )
        for index, value in enumerate(values, start=1)
    ]


@pytest.mark.parametrize(
    ("basis", "count", "minimum", "values", "expected"),
    [
        ("SINGLE_PROJECT", 1, "100", ["60", "60"], "FAIL"),
        ("EACH_OF_N_PROJECTS", 2, "100", ["100", "99"], "FAIL"),
        ("EACH_OF_N_PROJECTS", 2, "100", ["100", "100"], "PASS"),
        ("AGGREGATE_PROJECTS", 2, "200", ["100", "100"], "PASS"),
        ("AGGREGATE_PROJECTS", 2, "201", ["100", "100"], "FAIL"),
    ],
)
def test_project_value_basis_never_uses_wrong_aggregation(
    basis: str, count: int, minimum: str, values: list[str], expected: str
) -> None:
    """Single, each-of-N, and aggregate predicates retain distinct semantics."""
    bidder = company().model_copy(update={"projects": projects(values)})
    result = evaluate(group(project_leaf(basis, count=count, minimum=minimum)), bidder, AS_OF)
    assert result.children[0].evaluation == expected


@pytest.mark.parametrize(
    ("state", "completed_at", "similar", "expected"),
    [
        ("IN_PROGRESS", date(2025, 6, 1), True, "FAIL"),
        ("IN_PROGRESS", None, True, "FAIL"),
        ("UNKNOWN", date(2025, 6, 1), True, "UNKNOWN"),
        ("COMPLETED", None, True, "UNKNOWN"),
        ("COMPLETED", date(2025, 6, 1), None, "UNKNOWN"),
    ],
)
def test_project_missing_or_incomplete_facts_never_pass(
    state: str, completed_at: date | None, similar: bool | None, expected: str
) -> None:
    """Unknown facts remain UNKNOWN while known in-progress work cannot satisfy."""
    rows = projects(["200"], states=[state], dates=[completed_at], similar=[similar])
    bidder = company().model_copy(update={"projects": rows})
    result = evaluate(group(project_leaf("SINGLE_PROJECT")), bidder, AS_OF)
    assert result.children[0].evaluation == expected


@pytest.mark.parametrize(
    ("completed_at", "expected"),
    [
        (date(2025, 1, 1), "PASS"),
        (date(2025, 12, 31), "PASS"),
        (date(2024, 12, 31), "FAIL"),
        (date(2026, 1, 1), "FAIL"),
    ],
)
def test_project_completion_window_is_inclusive_only_at_boundaries(
    completed_at: date, expected: str
) -> None:
    """Exact start/end dates count and adjacent outside dates do not."""
    bidder = company().model_copy(update={"projects": projects(["100"], dates=[completed_at])})
    leaf = project_leaf("SINGLE_PROJECT", start=date(2025, 1, 1), end=date(2025, 12, 31))
    assert evaluate(group(leaf), bidder, AS_OF).children[0].evaluation == expected


@pytest.mark.parametrize(("qualified", "expected"), [(None, "UNKNOWN"), (True, "PASS"), (False, "FAIL")])
def test_emd_availability_does_not_imply_qualification(
    qualified: bool | None, expected: str
) -> None:
    """A named exemption needs explicit bidder qualification evidence."""
    leaf = RuleLeaf(
        node_type="LEAF", id="emd", kind="EMD", title="EMD exemption", hardness="HARD",
        predicate=EmdPredicate(kind="EMD", amount_inr="100000", exemption_available=True, qualification_field="MSME"),
        applicability=None, evidence=[evidence()],
    )
    rows = [] if qualified is None else [EmdExemptionEvidence(scheme="MSME", qualified=qualified, evidence_reference="emd")]
    bidder = company().model_copy(update={"emd_exemptions": rows})
    assert evaluate(group(leaf), bidder, AS_OF).children[0].evaluation == expected


def test_deadline_uses_aware_time_and_discloses_timezone_fallback() -> None:
    """Deadline comparison is exact and explanation records an assumed timezone."""
    leaf = RuleLeaf(
        node_type="LEAF", id="deadline", kind="DEADLINE", title="Bid deadline", hardness="HARD",
        predicate=DeadlinePredicate(kind="DEADLINE", closes_at=AS_OF, timezone="Asia/Kolkata", timezone_assumed=True),
        applicability=None, evidence=[evidence()],
    )
    passed = evaluate(group(leaf), company(), AS_OF)
    failed = evaluate(group(leaf), company(), AS_OF + timedelta(seconds=1))
    assert passed.children[0].evaluation == "PASS"
    assert "fallback" in passed.children[0].explanation
    assert failed.children[0].evaluation == "FAIL"
    with pytest.raises(ValueError, match="timezone-aware"):
        evaluate(group(leaf), company(), datetime(2026, 2, 2, 12))  # noqa: DTZ001


@pytest.mark.parametrize(
    ("extraction_state", "review_state"),
    [("PROPOSED", "HUMAN_CONFIRMED"), ("INVALID", "HUMAN_CONFIRMED"), ("EVIDENCE_VERIFIED", "UNREVIEWED"), ("EVIDENCE_VERIFIED", "HUMAN_REJECTED")],
)
def test_unverified_or_rejected_requirement_stays_unknown(
    extraction_state: str, review_state: str
) -> None:
    """Extraction and review trust axes gate PASS/FAIL independently."""
    span = evidence().model_copy(update={"extraction_state": extraction_state, "review_state": review_state})
    leaf = turnover_leaf().model_copy(update={"evidence": [span]})
    result = evaluate(group(leaf), company(), AS_OF)
    assert result.children[0].evaluation == "UNKNOWN"
    assert recommendation_for(result, "CANCELLED") == "NO_BID"
