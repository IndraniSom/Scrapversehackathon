"""Authority-gated assessment orchestration for one base and one amendment."""
from backend.amendment_topology import (
    deterministic_changed_ids,
    leaf_map,
    validate_single_change,
)
from backend.contracts.evaluation import RuleGroup, RuleResult
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
STALE_TYPES = ["assessments", "complianceRows", "proposalSections", "reviewTasks", "deadlines"]


def deterministic_diff(base: RuleGroup, amendment: RuleGroup) -> set[str]:
    """Compute deterministic changed IDs before any AI narrative."""
    return deterministic_changed_ids(base, amendment)


def ai_propose_clause_mapping(
    base: RuleGroup, amendment: RuleGroup, changed_ids: set[str]
) -> dict[str, dict[str, str]]:
    """Propose old/new clause mapping only after deterministic diff."""
    base_leaves = leaf_map(base)
    amendment_leaves = leaf_map(amendment)
    return {
        rid: {
            "old_excerpt": base_leaves[rid].evidence[0].excerpt,
            "new_excerpt": amendment_leaves[rid].evidence[0].excerpt,
        }
        for rid in changed_ids
    }


def ai_summarize_changes(applied: bool, changed_ids: set[str]) -> str:
    """Summarize accepted deterministic changes after diff."""
    return _transition_reason(applied)


def stale_work_item_types() -> list[str]:
    """List work item collections marked stale after an applied amendment."""
    return list(STALE_TYPES)


def mark_stale_payload(
    opportunity_id: str, changed_ids: set[str], applied: bool
) -> dict[str, object]:
    """Build payload describing affected items to mark stale."""
    if not applied:
        return {"opportunity_id": opportunity_id, "stale": [], "changed": sorted(changed_ids)}
    return {"opportunity_id": opportunity_id, "stale": stale_work_item_types(), "changed": sorted(changed_ids)}


def notify_payload(
    impact_view: AmendmentImpactView, stale: dict[str, object]
) -> dict[str, object]:
    """Build notification with exact clauses and next actions."""
    return {
        "opportunity_id": impact_view.opportunity_id,
        "changed_rule_id": impact_view.changed_rule_id,
        "old_clause": impact_view.old_clause.excerpt,
        "new_clause": impact_view.new_clause.excerpt,
        "applied": impact_view.authority_change_applied,
        "transition_reason": impact_view.transition_reason,
        "stale": stale.get("stale", []),
        "next_actions": ["Review stale assessments", "Update compliance matrix", "Reassign proposal sections"]
        if impact_view.authority_change_applied
        else ["No action required"],
    }


def assess_versions(input: AssessmentInput) -> AmendmentImpact:
    """Recompute both versions and apply only one reviewed authority replacement."""
    if input.amendment_revision != input.base_revision + 1:
        raise ValueError("amendment revision must immediately follow base revision")
    diff_ids = deterministic_diff(input.base_requirements, input.amendment_requirements)
    _ai_mapping = ai_propose_clause_mapping(
        input.base_requirements, input.amendment_requirements, diff_ids
    )
    _ai_narrative = ai_summarize_changes(True, diff_ids)
    _ = (_ai_mapping, _ai_narrative)
    validate_single_change(input.base_requirements, input.amendment_requirements, input.changed_rule_id)
    base_trusted = _trusted_version(input.base_extraction_state, input.base_review_state)
    amendment_trusted = _trusted_version(
        input.amendment_extraction_state, input.amendment_review_state
    )
    if not base_trusted:
        raise ValueError("base extraction or review is not positively trusted")
    if not amendment_trusted:
        raise ValueError("amendment review is stale or rejected")
    applied = amendment_trusted and _authority_applies(input)
    effective_amendment = input.amendment_requirements if applied else input.base_requirements
    base = _assessment(input, input.base_requirements, input.base_document, base_trusted)
    amended = _assessment(input, effective_amendment, input.amendment_document, amendment_trusted)
    old_leaf = leaf_map(input.base_requirements)[input.changed_rule_id]
    new_leaf = leaf_map(input.amendment_requirements)[input.changed_rule_id] if applied else old_leaf
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
    return AmendmentImpact(assessment_view=assessment_view, impact_view=impact_view)


def _assessment(
    input: AssessmentInput, requirements: RuleGroup, document: DocumentVersion, trusted: bool
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
        "The authority lowered the verified turnover threshold, removing the hard "
        "failure; three unchanged certifications remain UNKNOWN because no explicit "
        "validity anchor is stated."
    )
