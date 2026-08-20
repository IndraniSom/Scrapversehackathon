"""Operator-discriminated applicability validation regressions."""

import pytest
from assessment_helpers import AS_OF, company, group, turnover_leaf
from pydantic import ValidationError

from backend.contracts.applicability import ApplicabilityEquals, ApplicabilityIn
from backend.contracts.evaluation import RuleLeaf
from backend.eligibility import evaluate


def leaf_values(operator: str, expected_value: object) -> dict[str, object]:
    """Build one literal rule leaf with controlled applicability values."""
    values = turnover_leaf().model_dump(mode="json")
    values["applicability"] = {
        "field": "bidder_legal_entity_id",
        "operator": operator,
        "expected_value": expected_value,
        "evidence": values["evidence"][0],
    }
    return values


@pytest.mark.parametrize(
    ("operator", "expected_value"),
    [
        ("EQUALS", "CIN-DEMO-001"),
        ("IN", ["CIN-DEMO-001", "CIN-DEMO-002"]),
        ("EXISTS", None),
    ],
)
def test_applicability_accepts_only_matching_operator_value_shape(
    operator: str, expected_value: object
) -> None:
    """Each operator accepts its one explicit expected-value representation."""
    leaf = RuleLeaf.model_validate(leaf_values(operator, expected_value))
    assert leaf.applicability is not None
    assert leaf.applicability.operator == operator


@pytest.mark.parametrize(
    ("operator", "expected_value"),
    [
        ("EQUALS", None),
        ("EQUALS", ["CIN-DEMO-001"]),
        ("EQUALS", True),
        ("EQUALS", 1),
        ("EQUALS", ""),
        ("EQUALS", "   "),
        ("IN", "CIN-DEMO-001"),
        ("IN", []),
        ("IN", ["CIN-DEMO-001", "CIN-DEMO-001"]),
        ("IN", [1]),
        ("IN", [""]),
        ("IN", ["   "]),
        ("IN", ["CIN-DEMO-001", "\t"]),
        ("EXISTS", "CIN-DEMO-001"),
        ("EXISTS", []),
        ("EXISTS", False),
    ],
)
def test_applicability_rejects_ambiguous_operator_value_shape(
    operator: str, expected_value: object
) -> None:
    """Malformed applicability cannot silently remove a hard rule."""
    with pytest.raises(ValidationError):
        RuleLeaf.model_validate(leaf_values(operator, expected_value))


def test_applicability_requires_expected_value_even_when_null() -> None:
    """EXISTS represents its value as required null, not an omitted default."""
    values = leaf_values("EXISTS", None)
    applicability = values["applicability"]
    assert isinstance(applicability, dict)
    del applicability["expected_value"]
    with pytest.raises(ValidationError):
        RuleLeaf.model_validate(values)


@pytest.mark.parametrize(
    ("operator", "expected_value"),
    [("EQUALS", " CIN-DEMO-001 "), ("IN", [" CIN-DEMO-001 "])],
)
def test_applicability_preserves_nonblank_candidate_whitespace(
    operator: str, expected_value: object
) -> None:
    """Validation rejects blanks without silently changing exact identifiers."""
    leaf = RuleLeaf.model_validate(leaf_values(operator, expected_value))
    assert leaf.applicability is not None
    assert leaf.applicability.expected_value == expected_value


@pytest.mark.parametrize("operator", ["EQUALS", "IN"])
def test_evaluator_fails_closed_for_bypassed_blank_candidate(operator: str) -> None:
    """An internally bypassed blank condition remains UNKNOWN, never inapplicable."""
    evidence = turnover_leaf().evidence[0]
    condition = (
        ApplicabilityEquals.model_construct(
            field="bidder_legal_entity_id",
            operator="EQUALS",
            expected_value=" ",
            evidence=evidence,
        )
        if operator == "EQUALS"
        else ApplicabilityIn.model_construct(
            field="bidder_legal_entity_id",
            operator="IN",
            expected_value=["OTHER-ENTITY", "\t"],
            evidence=evidence,
        )
    )
    leaf = turnover_leaf().model_copy(update={"applicability": condition})
    result = evaluate(group(leaf), company(), AS_OF)
    assert result.children[0].evaluation == "UNKNOWN"
