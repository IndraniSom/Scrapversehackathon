"""Authority precedence, revision, review, and transition tests."""

import pytest
from amendment_helpers import assessment_input, authority, rules

from backend.amendments import assess_versions


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
