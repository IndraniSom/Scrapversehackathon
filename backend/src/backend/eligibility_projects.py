"""Deterministic project-experience predicate evaluation."""

from decimal import Decimal

from backend.contracts.evaluation import CompanyProfile, ProjectEvidence
from backend.contracts.predicates import ProjectExperiencePredicate


def evaluate_projects(
    predicate: ProjectExperiencePredicate, company: CompanyProfile
) -> tuple[str, str | None, str, str]:
    """Evaluate completed similar projects without aggregating the wrong basis."""
    known: list[ProjectEvidence] = []
    unknown = False
    for project in company.projects:
        if project.similar_work_confirmed is None:
            unknown = True
            continue
        if not project.similar_work_confirmed:
            continue
        if project.completion_state == "UNKNOWN":
            unknown = True
            continue
        if project.completion_state != "COMPLETED":
            continue
        if project.completed_at is None:
            unknown = True
            continue
        if predicate.completed_from and project.completed_at < predicate.completed_from:
            continue
        if predicate.completed_through and project.completed_at > predicate.completed_through:
            continue
        known.append(project)
    threshold = Decimal(predicate.minimum_value_inr)
    amounts = [Decimal(item.value_inr) for item in known]
    if predicate.value_basis == "AGGREGATE_PROJECTS":
        passed = len(known) >= predicate.required_count and sum(amounts, Decimal(0)) >= threshold
    else:
        passed = sum(amount >= threshold for amount in amounts) >= predicate.required_count
    company_value = f"{len(known)} completed similar projects; aggregate INR {sum(amounts, Decimal(0))}"
    requirement = (
        f"{predicate.value_basis}: {predicate.required_count} project(s), "
        f"minimum INR {predicate.minimum_value_inr}"
    )
    if passed:
        return "PASS", company_value, requirement, "Verified completed projects satisfy the requirement."
    if unknown:
        return "UNKNOWN", company_value, requirement, "Missing project similarity or completion evidence may affect the result."
    return "FAIL", company_value, requirement, "Known completed projects do not satisfy the requirement."
