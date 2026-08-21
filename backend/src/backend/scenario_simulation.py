"""Hypothetical deterministic simulation never mutating accepted assessment."""

from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from backend.contracts.evaluation import CompanyProfile, RuleGroup, RuleResult
from backend.eligibility import evaluate


@dataclass(frozen=True)
class HypotheticalAssessment:
    """Labeled hypothetical result derived without mutating accepted inputs."""

    result: RuleResult
    is_hypothetical: bool
    label: str
    base_snapshot: str


def _copy_company(company: CompanyProfile) -> CompanyProfile:
    """Return a deep copy so callers cannot mutate the accepted profile."""
    return company.model_copy(deep=True)


def _copy_group(group: RuleGroup) -> RuleGroup:
    """Return a deep copy of the rule tree."""
    return group.model_copy(deep=True)


def simulate(
    *,
    accepted_group: RuleGroup,
    accepted_company: CompanyProfile,
    as_of: datetime,
    hypothetical_company: CompanyProfile | None = None,
    hypothetical_group: RuleGroup | None = None,
    label: str = "hypothetical",
) -> HypotheticalAssessment:
    """Recompute deterministically from hypothetical inputs; label never mutates accepted."""
    if as_of.tzinfo is None:
        raise ValueError("as_of must be timezone-aware")
    company = hypothetical_company.model_copy(deep=True) if hypothetical_company else _copy_company(accepted_company)
    group = hypothetical_group.model_copy(deep=True) if hypothetical_group else _copy_group(accepted_group)
    base_hash = str(hash(accepted_group.model_dump_json()))[:16]
    # Verify accepted inputs unchanged by comparing dumps before/after
    before_company = accepted_company.model_dump_json()
    before_group = accepted_group.model_dump_json()
    result = evaluate(group, company, as_of)
    assert accepted_company.model_dump_json() == before_company
    assert accepted_group.model_dump_json() == before_group
    return HypotheticalAssessment(result=result, is_hypothetical=True, label=label, base_snapshot=base_hash)


def with_temporary_turnover(company: CompanyProfile, patch: dict[str, Any]) -> CompanyProfile:
    """Return a hypothetical company with temporary turnover amounts (never mutates input)."""
    copy = _copy_company(company)
    # patch: {"2022-23": "95000000"} etc. Deep-copy ensures isolation.
    updated = deepcopy(copy.turnover_evidence)
    for item in updated:
        if item.financial_year in patch:
            object.__setattr__(item, "amount_inr", str(patch[item.financial_year]))
    return copy.model_copy(update={"turnover_evidence": updated})


def with_resolved_certification(company: CompanyProfile, valid_from: Any, valid_until: Any) -> CompanyProfile:
    """Return a hypothetical company where first cert has resolved validity dates."""
    copy = _copy_company(company)
    if not copy.certifications:
        return copy
    certs = deepcopy(copy.certifications)
    object.__setattr__(certs[0], "valid_from", valid_from)
    object.__setattr__(certs[0], "valid_until", valid_until)
    return copy.model_copy(update={"certifications": certs})


def select_amendment_version(base: RuleGroup, amended: RuleGroup, use_amended: bool) -> RuleGroup:
    """Choose base or amended rule tree for scenario comparison."""
    return _copy_group(amended if use_amended else base)
