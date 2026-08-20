"""Amendment workflow: authority, clarification, replacement, cancellation, multi-rule."""
import pytest
from amendment_helpers import assessment_input, authority, document
from assessment_helpers import certification_leaf, group, turnover_leaf

from backend.amendment_topology import deterministic_changed_ids, validate_changed_rules
from backend.amendments import (
    ai_propose_clause_mapping,
    ai_summarize_changes,
    assess_versions,
    deterministic_diff,
    mark_stale_payload,
    notify_payload,
    stale_work_item_types,
)


def test_accepted_authority_change_marks_stale_and_notifies() -> None:
    """Accepted AUTHORITY replacement marks five stale types and notifies exact clauses."""
    result = assess_versions(assessment_input())
    impact = result.impact_view
    assert impact.authority_change_applied is True
    diff = deterministic_diff(result.assessment_view.base_assessment.requirements, result.assessment_view.amended_assessment.requirements)
    assert diff == {"turnover"}
    mapping = ai_propose_clause_mapping(result.assessment_view.base_assessment.requirements, result.assessment_view.amended_assessment.requirements, diff)
    assert "turnover" in mapping
    narrative = ai_summarize_changes(True, diff)
    assert "No effective" not in narrative
    stale = mark_stale_payload(impact.opportunity_id, diff, True)
    assert stale["stale"] == stale_work_item_types()
    notified = notify_payload(impact, stale)
    assert notified["old_clause"] in impact.old_clause.excerpt
    assert notified["next_actions"][0].startswith("Review")


def test_rejected_bidder_request_does_not_apply_or_mark_stale() -> None:
    """BIDDER REJECTED request cannot apply, leaves stale empty."""
    stmt = authority(actor="BIDDER", disposition="REJECTED", effective=False, replacement=None)
    result = assess_versions(assessment_input(statement=stmt))
    assert result.impact_view.authority_change_applied is False
    diff = deterministic_diff(result.assessment_view.base_assessment.requirements, result.assessment_view.amended_assessment.requirements)
    stale = mark_stale_payload(result.impact_view.opportunity_id, diff, False)
    assert stale["stale"] == []
    notified = notify_payload(result.impact_view, stale)
    assert notified["next_actions"] == ["No action required"]


def test_clarification_without_change_has_no_effect() -> None:
    """CLARIFIED without effective change leaves rules unchanged despite diff."""
    stmt = authority(disposition="CLARIFIED", effective=False, replacement=None)
    inp = assessment_input(statement=stmt)
    result = assess_versions(inp)
    assert result.impact_view.authority_change_applied is False
    assert result.impact_view.old_predicate == result.impact_view.new_predicate
    diff = deterministic_diff(inp.base_requirements, inp.amendment_requirements)
    # deterministic diff still shows one changed predicate before gate
    assert diff == {"turnover"}


def test_replacement_document_applies_as_authority_corrigendum() -> None:
    """REPLACEMENT role with authority replacement still applies."""
    inp = assessment_input()
    inp = inp.model_copy(update={"amendment_document": document("REPLACEMENT", "amendment-v2", "c" * 64)})
    result = assess_versions(inp)
    assert result.impact_view.authority_change_applied is True
    assert result.impact_view.amendment_document.role == "REPLACEMENT"


def test_cancellation_lifecycle_keeps_no_bid() -> None:
    """CANCELLED lifecycle forces NO_BID regardless of amendment."""
    inp = assessment_input().model_copy(update={"lifecycle": "CANCELLED"})
    result = assess_versions(inp)
    assert result.assessment_view.base_assessment.recommendation == "NO_BID"
    assert result.assessment_view.amended_assessment.recommendation == "NO_BID"


def test_multiple_changed_rules_extends_topology() -> None:
    """Two changed leaves validate when both declared and reject when silent."""
    base = group(turnover_leaf("120000000"), certification_leaf())
    amended = group(turnover_leaf("60000000"), certification_leaf().model_copy(update={"predicate": certification_leaf().predicate.model_copy(update={"certificate_name": "ISO 9001"})}))
    diff = deterministic_changed_ids(base, amended)
    assert diff == {"turnover", "iso-27001"}
    validate_changed_rules(base, amended, diff)
    with pytest.raises(ValueError, match="only changed rule"):
        validate_changed_rules(base, amended, {"turnover"})


def test_ambiguous_precedence_rejected() -> None:
    """AMBIGUOUS disposition is not authority and does not apply."""
    stmt = authority(disposition="AMBIGUOUS", effective=False, replacement=None)
    inp = assessment_input(statement=stmt)
    result = assess_versions(inp)
    assert result.impact_view.authority_change_applied is False
    # deterministic diff still computed before AI on raw inputs
    diff = deterministic_diff(inp.base_requirements, inp.amendment_requirements)
    mapping = ai_propose_clause_mapping(inp.base_requirements, inp.amendment_requirements, diff)
    assert "turnover" in mapping
    assert mapping["turnover"]["old_excerpt"] is not None
    assert "stale" in mark_stale_payload(result.impact_view.opportunity_id, diff, False)
