"""Closed certification and extraction-unit schema semantics tests."""

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from backend.contracts.extraction import ProposedExtraction
from backend.contracts.rules import ProposedRuleLeaf


def certification_leaf(valid_at: datetime) -> dict[str, object]:
    """Build one literal certification leaf at the proposed-rule boundary."""
    return {
        "node_type": "LEAF",
        "id": "iso-27001",
        "kind": "CERTIFICATION",
        "title": "ISO 27001 certification",
        "hardness": "HARD",
        "predicate": {
            "kind": "CERTIFICATION",
            "certificate_name": "ISO 27001",
            "valid_at": valid_at,
        },
        "evidence": [
            {
                "physical_page_number": 7,
                "printed_page_label": "6",
                "section_heading": "Technical eligibility",
                "excerpt": "The bidder shall hold a valid ISO 27001 certificate.",
            }
        ],
    }


def turnover_predicate() -> dict[str, object]:
    """Build the selected story's literal absolute-INR turnover predicate."""
    return {
        "kind": "TURNOVER_AVERAGE",
        "required_financial_years": ["2022-23", "2023-24", "2024-25"],
        "minimum_average_inr": "120000000.00",
        "audited_only": True,
        "legal_entity_scope": "BIDDER_ONLY",
    }


def test_certification_leaf_accepts_aware_and_rejects_naive_valid_at() -> None:
    """Certification validity is an aware instant, never a timezone-free date-time."""
    aware = ProposedRuleLeaf.model_validate(
        certification_leaf(datetime(2026, 8, 30, 12, tzinfo=UTC))
    )
    assert aware.kind == "CERTIFICATION"
    with pytest.raises(ValidationError):
        ProposedRuleLeaf.model_validate(
            certification_leaf(datetime(2026, 8, 30, 12))  # noqa: DTZ001
        )


def test_certification_leaf_rejects_blank_certificate_name() -> None:
    """A certification predicate cannot erase its certificate identity."""
    values = certification_leaf(datetime(2026, 8, 30, 12, tzinfo=UTC))
    predicate = values["predicate"]
    assert isinstance(predicate, dict)
    predicate["certificate_name"] = "   "
    with pytest.raises(ValidationError):
        ProposedRuleLeaf.model_validate(values)


@pytest.mark.parametrize(
    ("leaf_kind", "predicate"),
    [
        ("CERTIFICATION", turnover_predicate()),
        (
            "TURNOVER_AVERAGE",
            certification_leaf(datetime(2026, 8, 30, 12, tzinfo=UTC))["predicate"],
        ),
    ],
)
def test_leaf_rejects_kind_predicate_mismatch(
    leaf_kind: str, predicate: dict[str, object]
) -> None:
    """A valid predicate object cannot be relabeled as a different rule kind."""
    values = certification_leaf(datetime(2026, 8, 30, 12, tzinfo=UTC))
    values["kind"] = leaf_kind
    values["predicate"] = predicate
    with pytest.raises(ValidationError):
        ProposedRuleLeaf.model_validate(values)


def test_provider_schema_freezes_certification_inr_and_fy_semantics() -> None:
    """The model schema exposes the discriminator and literal unit/year instructions."""
    definitions = ProposedExtraction.model_json_schema()["$defs"]
    predicate = definitions["ProposedRuleLeaf"]["properties"]["predicate"]
    assert predicate["discriminator"]["propertyName"] == "kind"
    assert "CERTIFICATION" in predicate["discriminator"]["mapping"]
    turnover = definitions["TurnoverAveragePredicate"]["properties"]
    amount_description = turnover["minimum_average_inr"]["description"]
    years_description = turnover["required_financial_years"]["description"]
    assert "1 crore = 10000000" in amount_description
    assert "12 crore = 120000000" in amount_description
    assert "6 crore = 60000000" in amount_description
    assert "2022-23, 2023-24, 2024-25" in years_description
    assert "never derive" in years_description.lower()
