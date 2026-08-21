"""Deterministic compliance matrix with gap classification and CSV export."""

import csv
import io
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

GapCategory = Literal[
    "MISSING_DATA",
    "MISSING_DOCUMENT",
    "FAILED_REQUIREMENT",
    "UNKNOWN_SEMANTICS",
    "OWNER_REQUIRED",
    "REVIEW_REQUIRED",
]


class ClosedComplianceModel(BaseModel):
    """Reject undeclared compliance fields at every boundary."""

    model_config = ConfigDict(extra="forbid")


class ComplianceRequirement(ClosedComplianceModel):
    """Represent one accepted requirement with citation and tenancy."""

    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    citation: str = Field(min_length=1)
    hardness: Literal["MUST", "SHOULD"] = "MUST"
    is_mandatory: bool = True
    revision: int = Field(ge=1)
    organization_id: str = Field(min_length=1)
    evidence_ref: str | None = None
    evaluation: Literal["PASS", "FAIL", "UNKNOWN", "NOT_APPLICABLE"] | None = None


class ComplianceRow(ClosedComplianceModel):
    """Represent one deterministic matrix row before AI grouping."""

    requirement_id: str = Field(min_length=1)
    citation: str = Field(min_length=1)
    response_location: str | None = None
    evidence: str | None = None
    owner_id: str | None = None
    status: Literal["pending", "compliant", "gap"] = "pending"
    gap_category: GapCategory | None = None
    is_mandatory: bool = True
    requirement_revision: int = Field(ge=1)
    organization_id: str = Field(min_length=1)

class AmbiguityCandidate(ClosedComplianceModel):
    """Represent AI-proposed ambiguity with paired citations."""

    requirement_a: str = Field(min_length=1)
    requirement_b: str = Field(min_length=1)
    citation_a: str = Field(min_length=1)
    citation_b: str = Field(min_length=1)
    reason: str = Field(min_length=1)
    disposition: Literal["open", "accepted", "rejected"] = "open"


def build_compliance_rows(
    requirements: list[ComplianceRequirement],
    organization_id: str,
    current_revision: int | None = None,
) -> list[ComplianceRow]:
    """Seed deterministic rows sorted by requirement id before AI grouping."""
    if not organization_id:
        raise ValueError("organization_id is required")
    seen: set[str] = set()
    for req in requirements:
        if req.organization_id != organization_id:
            raise ValueError("cross-tenant requirement is not allowed")
        if req.id in seen:
            raise ValueError(f"duplicate requirement id: {req.id}")
        seen.add(req.id)
    sorted_reqs = sorted(requirements, key=lambda r: r.id)
    rows: list[ComplianceRow] = []
    for req in sorted_reqs:
        gap = _initial_gap(req, current_revision)
        status: Literal["pending", "compliant", "gap"] = "gap" if gap else "pending"
        rows.append(
            ComplianceRow(
                requirement_id=req.id,
                citation=req.citation,
                response_location=None,
                evidence=None,
                owner_id=None,
                status=status,
                gap_category=gap,
                is_mandatory=req.is_mandatory,
                requirement_revision=req.revision,
                organization_id=organization_id,
            )
        )
    return rows


def classify_gap(row: ComplianceRow, evaluation: str | None = None) -> GapCategory | None:
    """Classify one row into a gap category using deterministic precedence."""
    if row.gap_category == "REVIEW_REQUIRED":
        return "REVIEW_REQUIRED"
    if row.requirement_revision < 0:
        return "REVIEW_REQUIRED"
    if not row.response_location:
        return "MISSING_DATA" if row.is_mandatory else "REVIEW_REQUIRED"
    if not row.evidence:
        return "MISSING_DOCUMENT"
    if not row.owner_id and row.is_mandatory:
        return "OWNER_REQUIRED"
    if evaluation == "FAIL":
        return "FAILED_REQUIREMENT"
    if evaluation == "UNKNOWN":
        return "UNKNOWN_SEMANTICS"
    if row.status == "gap" and row.gap_category:
        return row.gap_category
    return None


def is_approval_blocked(rows: list[ComplianceRow]) -> bool:
    """Block approval while mandatory rows lack response or evidence."""
    for row in rows:
        if not row.is_mandatory:
            continue
        if not row.response_location or not row.evidence:
            return True
        if row.status != "compliant":
            return True
        if classify_gap(row) is not None:
            return True
    return False


def export_compliance_csv(rows: list[ComplianceRow]) -> str:
    """Export deterministic CSV with escaped fields for submission package."""
    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL, lineterminator="\n")
    writer.writerow(
        ["requirement_id", "citation", "response_location", "evidence", "owner_id", "status", "gap_category", "is_mandatory"]
    )
    for row in sorted(rows, key=lambda r: r.requirement_id):
        writer.writerow(
            [
                row.requirement_id,
                row.citation,
                row.response_location or "",
                row.evidence or "",
                row.owner_id or "",
                row.status,
                row.gap_category or "",
                str(row.is_mandatory).lower(),
            ]
        )
    return output.getvalue()


def detect_duplicate_clauses(requirements: list[ComplianceRequirement]) -> list[str]:
    """Return citations that appear for more than one requirement."""
    counts: dict[str, int] = {}
    for req in requirements:
        counts[req.citation] = counts.get(req.citation, 0) + 1
    return sorted([c for c, n in counts.items() if n > 1])


def detect_conflicting_requirements(
    requirements: list[ComplianceRequirement],
) -> list[tuple[str, str]]:
    """Return paired ids whose titles conflict deterministically."""
    conflicts: list[tuple[str, str]] = []
    for i, a in enumerate(requirements):
        for b in requirements[i + 1 :]:
            if a.citation == b.citation and a.id != b.id:
                conflicts.append((a.id, b.id))
    return conflicts


def is_stale_requirement(requirement_revision: int, current_revision: int) -> bool:
    """Return true when a row revision is stale against the amendment revision."""
    return requirement_revision < current_revision


def propose_ai_grouping(rows: list[ComplianceRow]) -> dict[str, list[str]]:
    """Propose AI grouping after deterministic seeding without mutating row order."""
    groups: dict[str, list[str]] = {}
    for row in rows:
        key = row.citation.split(" ")[0] if row.citation else "uncategorized"
        groups.setdefault(key, []).append(row.requirement_id)
    return groups
def _initial_gap(req: ComplianceRequirement, current_revision: int | None) -> GapCategory | None:
    """Infer initial gap deterministically before any human input."""
    if current_revision is not None and req.revision < current_revision:
        return "REVIEW_REQUIRED"
    if req.evaluation == "FAIL":
        return "FAILED_REQUIREMENT"
    if req.evaluation == "UNKNOWN":
        return "UNKNOWN_SEMANTICS"
    return None
