"""Recursive unchanged-rule topology preservation tests."""

import pytest
from amendment_helpers import assessment_input
from assessment_helpers import certification_leaf, group, turnover_leaf

from backend.amendments import assess_versions
from backend.contracts.evaluation import RuleGroup


def nested_group(
    operator: str = "ALL", minimum: int | None = None, *, two_children: bool = False
) -> RuleGroup:
    """Build one nested certification group with stable identity."""
    first = certification_leaf()
    second = first.model_copy(update={"id": "iso-27001-renewal"})
    return RuleGroup(
        node_type="GROUP",
        id="certifications",
        operator=operator,
        minimum_matches=minimum,
        children=[first, second] if two_children else [first],
    )


@pytest.mark.parametrize("mutation", ["operator", "minimum", "reparent", "order"])
def test_authority_change_preserves_recursive_group_topology(mutation: str) -> None:
    """Nested semantics, parentage, and sibling order are unchanged inputs."""
    base = group(turnover_leaf("120000000"), nested_group())
    amended_turnover = turnover_leaf("60000000")
    if mutation == "operator":
        amended = group(amended_turnover, nested_group("ANY"))
    elif mutation == "minimum":
        base = group(
            turnover_leaf("120000000"),
            nested_group("AT_LEAST_N", 1, two_children=True),
        )
        amended = group(
            amended_turnover,
            nested_group("AT_LEAST_N", 2, two_children=True),
        )
    elif mutation == "reparent":
        amended = group(amended_turnover, certification_leaf())
    else:
        amended = group(nested_group(), amended_turnover)
    with pytest.raises(ValueError, match="topology"):
        assess_versions(
            assessment_input(
                amended_rules=amended,
            ).model_copy(update={"base_requirements": base})
        )
