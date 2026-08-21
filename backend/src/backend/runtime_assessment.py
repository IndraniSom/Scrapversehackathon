"""Deterministic evaluation for reviewed Convex requirement predicates."""

from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ClosedModel(BaseModel):
    """Reject fields outside the signed runtime assessment contract."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class Predicate(ClosedModel):
    """Describe one allowlisted deterministic comparison."""

    field: str = Field(min_length=1)
    operator: str = Field(min_length=1)
    expected: str | None = None


class Requirement(ClosedModel):
    """Carry one reviewed requirement and bounded evidence citations."""

    id: str = Field(min_length=1)
    hardness: Literal["hard", "soft"]
    predicate: Predicate
    evidence: list[str] = Field(max_length=20)


class CompanyEvidence(ClosedModel):
    """Carry normalized tenant-owned facts required by deterministic rules."""

    turnover: list[dict[str, object]] = Field(max_length=20)
    certifications: list[dict[str, object]] = Field(max_length=100)
    projects: list[dict[str, object]] = Field(max_length=100)
    exemptions: list[dict[str, object]] = Field(max_length=50)


class AssessmentRequest(ClosedModel):
    """Bind one company, tender lifecycle, reviewed rules, and assessment time."""

    company_id: str = Field(min_length=1)
    opportunity_id: str = Field(min_length=1)
    lifecycle: Literal["open", "closed", "cancelled", "archived"]
    closes_at: int | None = None
    as_of: int
    company: CompanyEvidence
    requirements: list[Requirement] = Field(min_length=1, max_length=500)


class RuleOutcome(ClosedModel):
    """Return one explainable four-state deterministic rule result."""

    rule_id: str
    evaluation: Literal["PASS", "FAIL", "UNKNOWN", "NOT_APPLICABLE"]
    actual: str | None
    expected: str | None
    explanation: str
    evidence: list[str]


class AssessmentResult(ClosedModel):
    """Return recommendation, counts, and all deterministic rule outcomes."""

    recommendation: Literal["BID", "REVIEW", "NO_BID"]
    counts: dict[str, int]
    rules: list[RuleOutcome]


def evaluate_request(request: AssessmentRequest) -> AssessmentResult:
    """Evaluate reviewed predicates without model inference or persistence."""
    outcomes = [_evaluate_rule(rule, request) for rule in request.requirements]
    counts = {state.lower(): sum(item.evaluation == state for item in outcomes) for state in ("PASS", "FAIL", "UNKNOWN")}
    hard = [(rule, outcome) for rule, outcome in zip(request.requirements, outcomes, strict=True) if rule.hardness == "hard"]
    if request.lifecycle in {"closed", "cancelled", "archived"} or any(outcome.evaluation == "FAIL" for _, outcome in hard):
        recommendation = "NO_BID"
    elif any(outcome.evaluation == "UNKNOWN" for _, outcome in hard):
        recommendation = "REVIEW"
    else:
        recommendation = "BID"
    return AssessmentResult(recommendation=recommendation, counts=counts, rules=outcomes)


def _evaluate_rule(rule: Requirement, request: AssessmentRequest) -> RuleOutcome:
    """Resolve one allowlisted field and compare it with explicit semantics."""
    actual, note = _actual_value(rule.predicate.field, rule.predicate.expected, request)
    if actual is None:
        return RuleOutcome(rule_id=rule.id, evaluation="UNKNOWN", actual=None, expected=rule.predicate.expected, explanation=note, evidence=rule.evidence)
    matched = _compare(actual, rule.predicate.operator, rule.predicate.expected)
    if matched is None:
        return RuleOutcome(rule_id=rule.id, evaluation="UNKNOWN", actual=str(actual), expected=rule.predicate.expected, explanation="Predicate or expected value is unsupported.", evidence=rule.evidence)
    return RuleOutcome(rule_id=rule.id, evaluation="PASS" if matched else "FAIL", actual=str(actual), expected=rule.predicate.expected, explanation=note, evidence=rule.evidence)


def _actual_value(field: str, expected: str | None, request: AssessmentRequest) -> tuple[object | None, str]:
    """Resolve a closed company or deadline field without guessing missing evidence."""
    if field == "turnover_average":
        values = [Decimal(str(row["amountInr"])) for row in request.company.turnover if row.get("audited") is True and row.get("amountInr") is not None]
        return (sum(values) / len(values), "Average computed from audited turnover records.") if values else (None, "Audited turnover evidence is missing.")
    if field == "certification":
        matches = [row for row in request.company.certifications if str(row.get("name", "")).casefold() == str(expected or "").casefold()]
        if not matches or any(row.get("validFrom") is None or row.get("validUntil") is None for row in matches):
            return None, "Complete certification validity evidence is missing."
        return any(int(row["validFrom"]) <= request.as_of <= int(row["validUntil"]) for row in matches), "Certification validity checked at assessment time."
    if field == "completed_projects":
        return sum(row.get("completionState") == "completed" for row in request.company.projects), "Completed projects counted from company evidence."
    if field == "emd_exemption":
        matches = [row for row in request.company.exemptions if str(row.get("scheme", "")).casefold() == str(expected or "").casefold()]
        return (matches[0].get("qualificationState") == "qualified", "Named exemption qualification checked.") if matches else (None, "Named exemption evidence is missing.")
    if field == "deadline_open":
        return (request.as_of <= request.closes_at, "Deadline compared in UTC.") if request.closes_at else (None, "Verified closing time is missing.")
    return None, "Requirement field is unsupported by deterministic evaluator."


def _compare(actual: object, operator: str, expected: str | None) -> bool | None:
    """Apply one closed comparison and return None for invalid semantics."""
    if operator in {"exists", "is_true"}: return bool(actual)
    if operator in {"eq", "equals"}: return str(actual).casefold() == str(expected).casefold()
    try:
        left, right = Decimal(str(actual)), Decimal(str(expected))
    except (InvalidOperation, ValueError):
        return None
    return {"gte": left >= right, "gt": left > right, "lte": left <= right, "lt": left < right}.get(operator)


def utc_now_ms() -> int:
    """Return current UTC epoch milliseconds for callers and tests."""
    return int(datetime.now(UTC).timestamp() * 1000)
