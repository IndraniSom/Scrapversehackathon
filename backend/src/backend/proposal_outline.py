"""Proposal outline generation from cited tender clauses."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SectionState = Literal[
    "NOT_STARTED",
    "DRAFTING",
    "READY_FOR_REVIEW",
    "CHANGES_REQUESTED",
    "APPROVED",
    "LOCKED",
]
ALLOWED_TRANSITIONS: dict[SectionState, set[SectionState]] = {
    "NOT_STARTED": {"DRAFTING"},
    "DRAFTING": {"READY_FOR_REVIEW"},
    "READY_FOR_REVIEW": {"CHANGES_REQUESTED", "APPROVED"},
    "CHANGES_REQUESTED": {"DRAFTING"},
    "APPROVED": {"LOCKED"},
    "LOCKED": set(),
}


class OutlineError(ValueError):
    """Report a safe outline generation or state failure."""

    def __init__(self, code: str) -> None:
        """Store only the stable rejection code."""
        super().__init__(code)
        self.code = code


class OutlineClause(BaseModel):
    """Require one tender instruction or evaluation clause with citation."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    id: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=200)
    citation: str = Field(min_length=1, max_length=500)
    kind: Literal["instruction", "evaluation"] = Field(default="instruction")


class OutlineSection(BaseModel):
    """Represent one generated outline node with hierarchy and citation."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    id: str
    title: str
    instruction_citation: str
    order: int = Field(ge=0)
    parent_id: str | None = None
    level: int = Field(ge=1, le=4)
    state: SectionState = Field(default="NOT_STARTED")


class OutlineProgress(BaseModel):
    """Expose explicit-state progress without AI percentage."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    total: int
    counts: dict[str, int]
    approved: int
    locked: int
    percent_approved: float


def generate_outline(clauses: Sequence[OutlineClause]) -> list[OutlineSection]:
    """Build a cited hierarchical outline preserving explicit clause order."""
    if not clauses:
        raise OutlineError("EMPTY_CLAUSES")
    seen: set[str] = set()
    for clause in clauses:
        if not clause.citation.strip():
            raise OutlineError("MISSING_CITATION")
        if clause.id in seen:
            raise OutlineError("DUPLICATE_CLAUSE_ID")
        seen.add(clause.id)
    sections: list[OutlineSection] = []
    stack: list[OutlineSection] = []
    for order, clause in enumerate(clauses):
        level = _infer_level(clause.title)
        parent_id = _parent_for_level(stack, level)
        section = OutlineSection(
            id=f"section-{clause.id}",
            title=clause.title.strip(),
            instruction_citation=clause.citation.strip(),
            order=order,
            parent_id=parent_id,
            level=level,
        )
        sections.append(section)
        stack.append(section)
        # keep only last at each level to build next parent
        stack = _trim_stack(stack, level)
    return sections


def validate_transition(current: SectionState, next_state: SectionState) -> None:
    """Reject any state transition outside the explicit allowed graph."""
    if next_state not in ALLOWED_TRANSITIONS[current]:
        raise OutlineError(f"INVALID_TRANSITION:{current}->{next_state}")


def assert_editable(state: SectionState) -> None:
    """Reject edits when a section is locked."""
    if state == "LOCKED":
        raise OutlineError("LOCKED_SECTION")


def compute_progress(sections: Sequence[OutlineSection]) -> OutlineProgress:
    """Compute explicit-state progress counts and approved percentage."""
    total = len(sections)
    counts: dict[str, int] = {s: 0 for s in ALLOWED_TRANSITIONS}
    for section in sections:
        counts[section.state] = counts.get(section.state, 0) + 1
    approved = counts.get("APPROVED", 0) + counts.get("LOCKED", 0)
    percent = (approved / total * 100.0) if total else 0.0
    return OutlineProgress(
        total=total,
        counts=counts,
        approved=approved,
        locked=counts.get("LOCKED", 0),
        percent_approved=round(percent, 2),
    )


def _infer_level(title: str) -> int:
    """Infer hierarchy level from numeric prefix like 1, 1.1, 2.3.1."""
    prefix = title.strip().split(" ")[0]
    if "." in prefix and all(p.isdigit() for p in prefix.split(".")):
        return min(prefix.count(".") + 1, 4)
    return 1


def _parent_for_level(stack: list[OutlineSection], level: int) -> str | None:
    """Find the nearest ancestor with level-1 or None for top-level."""
    if level == 1:
        return None
    for section in reversed(stack):
        if section.level == level - 1:
            return section.id
    return None


def _trim_stack(stack: list[OutlineSection], level: int) -> list[OutlineSection]:
    """Retain only sections up to the current level for parent lookup."""
    out: list[OutlineSection] = []
    for section in stack:
        if section.level < level:
            out.append(section)
        elif section.level == level:
            # replace previous sibling at same level
            out = [s for s in out if s.level != level]
            out.append(section)
    # keep at most one per level plus branching
    seen_levels: dict[int, OutlineSection] = {}
    for section in stack:
        seen_levels[section.level] = section
    return [seen_levels[k] for k in sorted(seen_levels)]
