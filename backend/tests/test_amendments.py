"""Authority precedence, revision, review, and transition tests."""

import pytest
from amendment_helpers import assessment_input, authority, rules
from pydantic import ValidationError

from backend.amendments import assess_versions
from backend.contracts.views import AmendmentImpactView


def test_explicit_authority_replacement_flips_only_turnover_decision() -> None:
    """Accepted revision-two replacement changes NO_BID to BID with zero unknowns."""
    result = assess_versions(assessment_input())
    assessment = result.assessment_view
    impact = result.impact_view
    assert assessment.base_assessment.recommendation == "NO_BID"
    assert assessment.amended_assessment.recommendation == "BID"
    assert assessment.base_assessment.failed_hard_rule_count == 1
    assert assessment.amended_assessment.failed_hard_rule_count == 0
    assert assessment.base_assessment.unknown_applicable_rule_count == 0
    assert assessment.amended_assessment.unknown_applicable_rule_count == 0
    assert impact.authority_change_applied is True
    base_states = {item.rule_id: item.evaluation for item in assessment.base_assessment.rule_results[0].children}
    amended_states = {item.rule_id: item.evaluation for item in assessment.amended_assessment.rule_results[0].children}
    assert base_states == {"turnover": "FAIL", "iso-27001": "PASS"}
    assert amended_states == {"turnover": "PASS", "iso-27001": "PASS"}


@pytest.mark.parametrize(
    "statement",
    [
        authority(actor="BIDDER", disposition="REJECTED", effective=False, replacement=None),
        authority(disposition="UNCHANGED", effective=False, replacement=None),
        authority(disposition="AMBIGUOUS", effective=False, replacement=None),
        authority(replacement="other-base"),
    ],
)
def test_non_authoritative_change_does_not_alter_effective_rules(statement: object) -> None:
    """Bidder, unchanged, ambiguous, or unrelated statements cannot change a rule."""
    result = assess_versions(assessment_input(statement=statement))
    assert result.assessment_view.base_assessment.recommendation == "NO_BID"
    assert result.assessment_view.amended_assessment.recommendation == "NO_BID"
    assert result.impact_view.authority_change_applied is False
    assert result.impact_view.old_predicate == result.impact_view.new_predicate


@pytest.mark.parametrize("review", ["UNREVIEWED", "HUMAN_REJECTED"])
def test_changed_revision_without_positive_review_remains_unknown(review: str) -> None:
    """A reset or rejected revision is rejected before a public impact can be cached."""
    with pytest.raises(ValueError, match="review"):
        assess_versions(assessment_input(amendment_review=review))


@pytest.mark.parametrize("revision", [1, 3])
def test_stale_or_skipped_amendment_revision_rejects(revision: int) -> None:
    """A material replacement must be exactly the next document revision."""
    with pytest.raises(ValueError, match="revision"):
        assess_versions(assessment_input(amendment_revision=revision))


def test_authority_change_rejects_unrelated_unchanged_rule_mutation() -> None:
    """Authority cannot smuggle a second changed rule into the amended assessment."""
    changed = rules("60000000").model_copy(deep=True)
    certification = changed.children[1]
    predicate = certification.predicate.model_copy(update={"certificate_name": "ISO 9001"})
    changed.children[1] = certification.model_copy(update={"predicate": predicate})
    with pytest.raises(ValueError, match="only changed rule"):
        assess_versions(assessment_input(amended_rules=changed))


@pytest.mark.parametrize(
    ("extraction", "review"),
    [
        ("PROPOSED", "HUMAN_EDITED"),
        ("INVALID", "HUMAN_EDITED"),
        ("EVIDENCE_VERIFIED", "UNREVIEWED"),
        ("EVIDENCE_VERIFIED", "HUMAN_REJECTED"),
    ],
)
def test_untrusted_base_cannot_produce_amended_bid(extraction: str, review: str) -> None:
    """Carried unchanged rules require positively trusted base extraction and review."""
    input = assessment_input().model_copy(
        update={"base_extraction_state": extraction, "base_review_state": review}
    )
    with pytest.raises(ValueError, match="base"):
        assess_versions(input)


@pytest.mark.parametrize("identifier", [".", "..", "x" * 161])
def test_amendment_impact_rejects_unsafe_opportunity_ids(identifier: str) -> None:
    """Pydantic enforces the frozen route-safe OpportunityId constraints."""
    values = assess_versions(assessment_input()).impact_view.model_dump()
    with pytest.raises(ValidationError):
        AmendmentImpactView.model_validate(values | {"opportunity_id": identifier})


def test_amendment_impact_retains_valid_hostile_route_characters() -> None:
    """Non-dot hostile characters remain valid for one-time client encoding."""
    values = assess_versions(assessment_input()).impact_view.model_dump()
    validated = AmendmentImpactView.model_validate(
        values | {"opportunity_id": "ocac /?# % identifier"}
    )
    assert validated.opportunity_id == "ocac /?# % identifier"
