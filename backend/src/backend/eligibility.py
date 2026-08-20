"""Deterministic hard-rule evaluation without scores or generic expressions."""

from datetime import datetime
from decimal import Decimal
from typing import Literal

from backend.contracts.evaluation import (
    ApplicabilityCondition,
    CompanyProfile,
    EvidenceSpan,
    RuleGroup,
    RuleLeaf,
    RuleResult,
    UnsupportedRuleLeaf,
)
from backend.contracts.predicates import (
    DeadlinePredicate,
    EmdPredicate,
    ProjectExperiencePredicate,
)
from backend.contracts.rules import CertificationPredicate, TurnoverAveragePredicate
from backend.eligibility_groups import combine_results, group_explanation
from backend.eligibility_projects import evaluate_projects

Evaluation = Literal["PASS", "FAIL", "UNKNOWN", "NOT_APPLICABLE"]


def evaluate(group: RuleGroup, company: CompanyProfile, as_of: datetime) -> RuleResult:
    """Evaluate one closed rule tree against company evidence at an aware instant."""
    if as_of.utcoffset() is None:
        raise ValueError("assessment time must be timezone-aware")
    children = [_evaluate_node(child, company, as_of) for child in group.children]
    evaluation = combine_results(group.operator, group.minimum_matches, children)
    return RuleResult(
        rule_id=group.id,
        title="All hard eligibility rules",
        evaluation=evaluation,
        explanation=group_explanation(evaluation),
        company_value=None,
        requirement_value=None,
        evidence=[],
        children=children,
    )


def recommendation_for(
    result: RuleResult, lifecycle: Literal["OPEN", "CLOSED", "CANCELLED"]
) -> Literal["BID", "REVIEW", "NO_BID"]:
    """Map exact hard-rule state and tender lifecycle to a recommendation."""
    if lifecycle in {"CLOSED", "CANCELLED"} or result.evaluation == "FAIL":
        return "NO_BID"
    if result.evaluation == "PASS":
        return "BID"
    return "REVIEW"


def _evaluate_node(
    node: RuleGroup | RuleLeaf | UnsupportedRuleLeaf,
    company: CompanyProfile,
    as_of: datetime,
) -> RuleResult:
    """Evaluate one recursive group, supported leaf, or unsupported leaf."""
    if isinstance(node, RuleGroup):
        return evaluate(node, company, as_of)
    applicable = _applicable(node.applicability, company)
    if applicable is False:
        return _leaf_result(node, "NOT_APPLICABLE", "Verified applicability condition is false.")
    if applicable is None:
        return _leaf_result(node, "UNKNOWN", "Applicability evidence is missing or unverified.")
    if not _trusted(node.evidence):
        return _leaf_result(node, "UNKNOWN", "Requirement evidence is not independently verified.")
    if isinstance(node, UnsupportedRuleLeaf):
        return _leaf_result(node, "UNKNOWN", f"Unsupported deterministic semantics: {node.reason}.")
    predicate = node.predicate
    if isinstance(predicate, TurnoverAveragePredicate):
        values = _turnover(predicate, company)
    elif isinstance(predicate, CertificationPredicate):
        values = _certification(predicate, company)
    elif isinstance(predicate, ProjectExperiencePredicate):
        values = evaluate_projects(predicate, company)
    elif isinstance(predicate, EmdPredicate):
        values = _emd(predicate, company)
    elif isinstance(predicate, DeadlinePredicate):
        values = _deadline(predicate, as_of)
    else:
        values = ("UNKNOWN", None, None, "Unsupported deterministic predicate.")
    return _leaf_result(node, values[0], values[3], values[1], values[2])


def _turnover(
    predicate: TurnoverAveragePredicate, company: CompanyProfile
) -> tuple[Evaluation, str | None, str, str]:
    """Evaluate exact FY bidder-only audited average turnover with Decimal."""
    threshold = Decimal(predicate.minimum_average_inr)
    if company.bidder_legal_entity_id is None:
        return "UNKNOWN", None, str(threshold), "Bidder legal-entity identity is missing."
    amounts: list[Decimal] = []
    for year in predicate.required_financial_years:
        rows = [item for item in company.turnover_evidence if item.financial_year == year]
        if not rows:
            return "UNKNOWN", None, str(threshold), f"Turnover evidence for FY {year} is missing."
        if any(item.legal_entity_id is None for item in rows):
            return "UNKNOWN", None, str(threshold), f"Legal-entity evidence for FY {year} is missing."
        matches = [
            item for item in rows
            if item.legal_entity_id == company.bidder_legal_entity_id and item.audited
        ]
        if not matches:
            return "FAIL", None, str(threshold), f"FY {year} has no audited bidder-entity amount."
        amounts.append(max(Decimal(item.amount_inr) for item in matches))
    average = sum(amounts, Decimal(0)) / Decimal(len(amounts))
    state: Evaluation = "PASS" if average >= threshold else "FAIL"
    return state, str(average), str(threshold), f"Average audited bidder turnover is INR {average}."


def _certification(
    predicate: CertificationPredicate, company: CompanyProfile
) -> tuple[Evaluation, str | None, str, str]:
    """Evaluate a named certificate on the predicate's explicit local date."""
    matches = [item for item in company.certifications if item.name.casefold() == predicate.certificate_name.casefold()]
    requirement = f"valid at {predicate.valid_at.isoformat()}"
    if not matches:
        return "UNKNOWN", None, requirement, "Certification evidence is missing."
    certificate = matches[0]
    if certificate.valid_from is None or certificate.valid_until is None:
        return "UNKNOWN", None, requirement, "Certification validity wording is incomplete."
    anchor = predicate.valid_at.date()
    state: Evaluation = "PASS" if certificate.valid_from <= anchor <= certificate.valid_until else "FAIL"
    value = f"{certificate.valid_from.isoformat()} through {certificate.valid_until.isoformat()}"
    return state, value, requirement, "Certificate validity was checked at the required instant."


def _emd(
    predicate: EmdPredicate, company: CompanyProfile
) -> tuple[Evaluation, str | None, str, str]:
    """Evaluate only a named verified exemption qualification, never availability alone."""
    requirement = f"EMD INR {predicate.amount_inr}"
    if not predicate.exemption_available or not predicate.qualification_field:
        return "UNKNOWN", None, requirement, "EMD payment or qualification evidence is unavailable."
    rows = [item for item in company.emd_exemptions if item.scheme.casefold() == predicate.qualification_field.casefold()]
    if not rows or rows[0].qualified is None:
        return "UNKNOWN", None, requirement, "Exemption availability does not prove bidder qualification."
    state: Evaluation = "PASS" if rows[0].qualified else "FAIL"
    return state, str(rows[0].qualified).lower(), requirement, "Named EMD exemption qualification was verified."


def _deadline(
    predicate: DeadlinePredicate, as_of: datetime
) -> tuple[Evaluation, str, str, str]:
    """Evaluate an aware deadline and disclose any timezone fallback."""
    state: Evaluation = "PASS" if as_of <= predicate.closes_at else "FAIL"
    note = " using an explicit timezone fallback" if predicate.timezone_assumed else ""
    return state, as_of.isoformat(), predicate.closes_at.isoformat(), f"Deadline compared in {predicate.timezone}{note}."


def _applicable(condition: ApplicabilityCondition | None, company: CompanyProfile) -> bool | None:
    """Evaluate the one supported verified company applicability field."""
    if condition is None:
        return True
    if not _trusted([condition.evidence]) or condition.field != "bidder_legal_entity_id":
        return None
    actual = company.bidder_legal_entity_id
    if actual is None:
        return None
    if condition.operator == "EXISTS":
        return True
    if condition.operator == "EQUALS":
        return actual == condition.expected_value
    return isinstance(condition.expected_value, list) and actual in condition.expected_value


def _trusted(evidence: list[EvidenceSpan]) -> bool:
    """Require every clause to be evidence-verified and positively reviewed."""
    return all(
        item.extraction_state == "EVIDENCE_VERIFIED"
        and item.review_state in {"HUMAN_CONFIRMED", "HUMAN_EDITED"}
        for item in evidence
    )


def _leaf_result(
    node: RuleLeaf | UnsupportedRuleLeaf,
    evaluation: Evaluation,
    explanation: str,
    company_value: str | None = None,
    requirement_value: str | None = None,
) -> RuleResult:
    """Build one closed leaf result without scores."""
    return RuleResult(rule_id=node.id, title=node.title, evaluation=evaluation, explanation=explanation, company_value=company_value, requirement_value=requirement_value, evidence=node.evidence, children=[])
