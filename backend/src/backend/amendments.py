"""Authority-gated assessment orchestration for one base and one amendment."""

from backend.amendment_topology import leaf_map, validate_single_change
from backend.contracts.evaluation import (
    RuleGroup,
    RuleResult,
)
from backend.contracts.views import (
    AmendmentImpact,
    AmendmentImpactView,
    Assessment,
    AssessmentInput,
    AssessmentView,
    DocumentVersion,
)
from backend.eligibility import evaluate, recommendation_for

POSITIVE_REVIEWS = {"HUMAN_CONFIRMED", "HUMAN_EDITED"}
DISCLAIMER = "Decision support only; this is not legal advice or automated bid submission."


def assess_versions(input: AssessmentInput) -> AmendmentImpact:
    """Recompute both versions and apply only one reviewed authority replacement."""
    if input.amendment_revision != input.base_revision + 1:
        raise ValueError("amendment revision must immediately follow base revision")
    validate_single_change(
        input.base_requirements, input.amendment_requirements, input.changed_rule_id
    )
    base_trusted = _trusted_version(
        input.base_extraction_state, input.base_review_state
    )
    amendment_trusted = _trusted_version(
        input.amendment_extraction_state, input.amendment_review_state
    )
    if not base_trusted:
        raise ValueError("base extraction or review is not positively trusted")
    if not amendment_trusted:
        raise ValueError("amendment review is stale or rejected")
    applied = amendment_trusted and _authority_applies(input)
    effective_amendment = (
        input.amendment_requirements if applied else input.base_requirements
    )
    base = _assessment(input, input.base_requirements, input.base_document, base_trusted)
    amended = _assessment(
        input, effective_amendment, input.amendment_document, amendment_trusted
    )
    old_leaf = leaf_map(input.base_requirements)[input.changed_rule_id]
    new_leaf = (
        leaf_map(input.amendment_requirements)[input.changed_rule_id]
        if applied
        else old_leaf
    )
    assessment_view = AssessmentView(
        opportunity=input.opportunity,
        company_profile=input.company_profile,
        base_assessment=base,
        amended_assessment=amended,
        disclaimer=DISCLAIMER,
    )
    impact_view = AmendmentImpactView(
        opportunity_id=input.opportunity.id,
        data_mode=input.data_mode,
        base_document=input.base_document,
        amendment_document=input.amendment_document,
        authority_statement=input.authority_statement,
        changed_rule_id=input.changed_rule_id,
        old_clause=old_leaf.evidence[0],
        new_clause=new_leaf.evidence[0],
        old_predicate=old_leaf.predicate,
        new_predicate=new_leaf.predicate,
        base_recommendation=base.recommendation,
        amended_recommendation=amended.recommendation,
        authority_change_applied=applied,
        transition_reason=_transition_reason(applied),
    )
    return AmendmentImpact(
        assessment_view=assessment_view, impact_view=impact_view
    )


def _assessment(
    input: AssessmentInput,
    requirements: RuleGroup,
    document: DocumentVersion,
    trusted: bool,
) -> Assessment:
    """Build one assessment, forcing untrusted version metadata to UNKNOWN."""
    result = evaluate(requirements, input.company_profile, input.as_of)
    if not trusted:
        result = _unknown_result(result)
    unknown, failed = _leaf_counts(result)
    return Assessment(
        document=document,
        requirements=requirements,
        recommendation=recommendation_for(result, input.lifecycle),
        rule_results=[result],
        unknown_applicable_rule_count=unknown,
        failed_hard_rule_count=failed,
    )


def _trusted_version(extraction_state: str, review_state: str) -> bool:
    """Require evidence verification and positive independent review."""
    return extraction_state == "EVIDENCE_VERIFIED" and review_state in POSITIVE_REVIEWS


def _authority_applies(input: AssessmentInput) -> bool:
    """Accept only explicit authority replacement of the actual base document."""
    statement = input.authority_statement
    return (
        statement.actor == "AUTHORITY"
        and statement.disposition == "ACCEPTED"
        and statement.effective_change
        and statement.replaces_document_id == input.base_document.id
    )


def _unknown_result(result: RuleResult) -> RuleResult:
    """Reset a materially untrusted result tree to UNKNOWN without losing evidence."""
    children = [_unknown_result(child) for child in result.children]
    return result.model_copy(
        update={
            "evaluation": "UNKNOWN",
            "explanation": "Document extraction or review state is not trusted.",
            "children": children,
        }
    )


def _leaf_counts(result: RuleResult) -> tuple[int, int]:
    """Count unknown applicable and failed leaf results recursively."""
    if not result.children:
        return (int(result.evaluation == "UNKNOWN"), int(result.evaluation == "FAIL"))
    counts = [_leaf_counts(child) for child in result.children]
    return sum(item[0] for item in counts), sum(item[1] for item in counts)


def _transition_reason(applied: bool) -> str:
    """Explain whether reviewed authority changed the effective requirement."""
    if not applied:
        return "No effective authority replacement was applied; base rules remain in force."
    return (
        "The authority lowered the verified turnover threshold; the same bidder "
        "evidence now passes while every unchanged certification remains satisfied."
    )
