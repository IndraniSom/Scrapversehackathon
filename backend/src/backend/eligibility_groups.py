"""Exact recursive rule-group state propagation."""

from typing import Literal

from backend.contracts.evaluation import RuleResult

Evaluation = Literal["PASS", "FAIL", "UNKNOWN", "NOT_APPLICABLE"]


def combine_results(
    operator: str, minimum: int | None, children: list[RuleResult]
) -> Evaluation:
    """Combine applicable child states under ALL, ANY, or AT_LEAST_N."""
    states = [item.evaluation for item in children if item.evaluation != "NOT_APPLICABLE"]
    if not states:
        return "NOT_APPLICABLE"
    if operator == "ALL":
        return "FAIL" if "FAIL" in states else (
            "UNKNOWN" if "UNKNOWN" in states else "PASS"
        )
    if operator == "ANY":
        return "PASS" if "PASS" in states else (
            "UNKNOWN" if "UNKNOWN" in states else "FAIL"
        )
    assert minimum is not None
    passed = states.count("PASS")
    if passed >= minimum:
        return "PASS"
    return "UNKNOWN" if passed + states.count("UNKNOWN") >= minimum else "FAIL"


def group_explanation(evaluation: Evaluation) -> str:
    """Return deterministic group copy for the exact evaluation state."""
    return {
        "PASS": "Every required group condition is satisfied.",
        "FAIL": "At least one required hard condition fails.",
        "UNKNOWN": "Missing or unsupported evidence may affect the result.",
        "NOT_APPLICABLE": "Every child is explicitly not applicable.",
    }[evaluation]
