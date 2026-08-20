"""Deterministic multiple-certificate matching tests."""

from datetime import date

import pytest
from assessment_helpers import AS_OF, certification_leaf, company, group

from backend.contracts.evaluation import CertificationEvidence
from backend.contracts.rules import CertificationPredicate
from backend.eligibility import evaluate


def certificate(
    valid_from: date | None, valid_until: date | None
) -> CertificationEvidence:
    """Build one matching ISO record with controlled interval completeness."""
    return CertificationEvidence(
        name="iso 27001",
        valid_from=valid_from,
        valid_until=valid_until,
        evidence_reference="certificate",
    )


@pytest.mark.parametrize(
    ("records", "expected"),
    [
        (
            [certificate(date(2024, 1, 1), date(2026, 2, 1)), certificate(date(2026, 2, 2), date(2027, 1, 1))],
            "PASS",
        ),
        (
            [certificate(date(2026, 2, 2), date(2027, 1, 1)), certificate(date(2024, 1, 1), date(2026, 2, 1))],
            "PASS",
        ),
        (
            [certificate(None, None), certificate(date(2024, 1, 1), date(2026, 2, 1))],
            "UNKNOWN",
        ),
        (
            [certificate(None, None), certificate(date(2026, 2, 2), date(2027, 1, 1))],
            "PASS",
        ),
        (
            [certificate(date(2024, 1, 1), date(2025, 1, 1)), certificate(date(2025, 2, 1), date(2026, 2, 1))],
            "FAIL",
        ),
    ],
)
def test_certification_evaluates_all_case_insensitive_matches(
    records: list[CertificationEvidence], expected: str
) -> None:
    """Renewal order cannot change PASS, UNKNOWN, or all-expired FAIL."""
    bidder = company().model_copy(update={"certifications": records})
    result = evaluate(group(certification_leaf()), bidder, AS_OF)
    assert result.children[0].evaluation == expected


def test_certification_without_authority_anchor_stays_unknown() -> None:
    """Complete bidder validity cannot replace a missing authority anchor."""
    leaf = certification_leaf()
    predicate = CertificationPredicate(
        kind="CERTIFICATION", certificate_name="ISO 27001", valid_at=None
    )
    result = evaluate(
        group(leaf.model_copy(update={"predicate": predicate})), company(), AS_OF
    )
    assert result.children[0].evaluation == "UNKNOWN"
    assert result.children[0].requirement_value is None
    assert "anchor" in result.children[0].explanation.lower()
