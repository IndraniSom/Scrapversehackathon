"""Deterministic multi-row EMD evidence evaluation regressions."""

import pytest
from assessment_helpers import AS_OF, company, evidence, group

from backend.contracts.evaluation import EmdExemptionEvidence, RuleLeaf
from backend.contracts.predicates import EmdPredicate
from backend.eligibility import evaluate


def emd_leaf() -> RuleLeaf:
    """Build one named EMD exemption rule for controlled evidence rows."""
    return RuleLeaf(
        node_type="LEAF",
        id="emd",
        kind="EMD",
        title="EMD exemption",
        hardness="HARD",
        predicate=EmdPredicate(
            kind="EMD",
            amount_inr="100000",
            exemption_available=True,
            qualification_field="MSME",
        ),
        applicability=None,
        evidence=[evidence()],
    )


def rows(*qualified: bool | None) -> list[EmdExemptionEvidence]:
    """Build matching scheme rows in the exact order supplied by a caller."""
    return [
        EmdExemptionEvidence(
            scheme="msme", qualified=value, evidence_reference=f"emd-{index}"
        )
        for index, value in enumerate(qualified)
    ]


@pytest.mark.parametrize(
    ("values", "expected"),
    [
        ((True, True), "PASS"),
        ((False, False), "FAIL"),
        ((True, False), "UNKNOWN"),
        ((False, True), "UNKNOWN"),
        ((True, None), "UNKNOWN"),
        ((None, False), "UNKNOWN"),
    ],
)
def test_emd_resolves_only_identical_complete_matching_values(
    values: tuple[bool | None, ...], expected: str
) -> None:
    """Conflicts and incomplete rows stay UNKNOWN regardless of row order."""
    bidder = company().model_copy(update={"emd_exemptions": rows(*values)})
    result = evaluate(group(emd_leaf()), bidder, AS_OF)
    assert result.children[0].evaluation == expected
