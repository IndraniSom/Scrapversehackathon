"""Operator-discriminated applicability validation regressions."""

import pytest
from assessment_helpers import turnover_leaf
from pydantic import ValidationError

from backend.contracts.evaluation import RuleLeaf


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
        ("IN", "CIN-DEMO-001"),
        ("IN", []),
        ("IN", ["CIN-DEMO-001", "CIN-DEMO-001"]),
        ("IN", [1]),
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
