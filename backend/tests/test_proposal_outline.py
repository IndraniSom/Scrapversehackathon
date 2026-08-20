"""Proposal outline generation, lock guard, and explicit progress tests."""

import pytest

from backend.proposal_outline import (
    OutlineClause,
    OutlineError,
    OutlineSection,
    assert_editable,
    compute_progress,
    generate_outline,
    validate_transition,
)


def clause(cid: str, title: str, citation: str, kind: str = "instruction") -> OutlineClause:
    """Build one cited clause for deterministic outline tests."""
    return OutlineClause(id=cid, title=title, citation=citation, kind=kind)


def test_generate_outline_preserves_citation_and_hierarchy() -> None:
    """Every heading maps to a cited instruction or evaluation clause with parent."""
    clauses = [
        clause("c1", "1. Cover Letter", "Instruction §1 — letter", "instruction"),
        clause("c2", "1.1 Technical Approach", "Evaluation §2.1 — technical", "evaluation"),
        clause("c3", "2. Compliance", "Instruction §3 — compliance", "instruction"),
    ]
    sections = generate_outline(clauses)
    assert len(sections) == 3
    assert sections[0].title == "1. Cover Letter"
    assert sections[0].instruction_citation == "Instruction §1 — letter"
    assert sections[0].parent_id is None
    assert sections[0].level == 1
    assert sections[1].parent_id == sections[0].id
    assert sections[1].level == 2
    assert sections[2].parent_id is None


def test_generate_rejects_missing_citation() -> None:
    """Outline requires a cited clause; blank citations are rejected."""
    with pytest.raises(OutlineError) as exc:
        generate_outline([OutlineClause(id="c1", title="1. Intro", citation="   ", kind="instruction")])
    assert "MISSING_CITATION" in str(exc.value)


def test_generate_rejects_duplicate_clause_id() -> None:
    """Duplicate clause ids are rejected to preserve stable mapping."""
    with pytest.raises(OutlineError) as exc:
        generate_outline([clause("c1", "1. A", "Instruction §1"), clause("c1", "2. B", "Instruction §2")])
    assert "DUPLICATE" in str(exc.value)


def test_generate_rejects_empty_clauses() -> None:
    """Empty clause list is rejected."""
    with pytest.raises(OutlineError):
        generate_outline([])


def test_state_transitions_allow_explicit_path() -> None:
    """Only the explicit graph is valid; LOCKED has no outgoing."""
    validate_transition("NOT_STARTED", "DRAFTING")
    validate_transition("DRAFTING", "READY_FOR_REVIEW")
    validate_transition("READY_FOR_REVIEW", "APPROVED")
    validate_transition("APPROVED", "LOCKED")
    with pytest.raises(OutlineError):
        validate_transition("NOT_STARTED", "APPROVED")
    with pytest.raises(OutlineError):
        validate_transition("LOCKED", "DRAFTING")


def test_lock_prevents_edits() -> None:
    """Edits to LOCKED sections are blocked."""
    assert_editable("DRAFTING")
    assert_editable("APPROVED")
    with pytest.raises(OutlineError) as exc:
        assert_editable("LOCKED")
    assert exc.value.code == "LOCKED_SECTION"


def test_progress_via_explicit_states_not_ai() -> None:
    """Progress is derived from APPROVED and LOCKED counts only."""
    sections = [
        OutlineSection(id="s1", title="A", instruction_citation="c1", order=0, level=1, state="NOT_STARTED"),
        OutlineSection(id="s2", title="B", instruction_citation="c2", order=1, level=1, state="APPROVED"),
        OutlineSection(id="s3", title="C", instruction_citation="c3", order=2, level=1, state="LOCKED"),
        OutlineSection(id="s4", title="D", instruction_citation="c4", order=3, level=1, state="DRAFTING"),
    ]
    progress = compute_progress(sections)
    assert progress.total == 4
    assert progress.approved == 2
    assert progress.locked == 1
    assert progress.percent_approved == 50.0
    assert progress.counts["NOT_STARTED"] == 1


def test_evaluation_and_instruction_kinds_both_map() -> None:
    """Instruction and evaluation kinds both produce cited sections."""
    sections = generate_outline([
        clause("i1", "1. Instructions", "Instruction §1", "instruction"),
        clause("e1", "2. Evaluation", "Evaluation §4 — scoring", "evaluation"),
    ])
    assert sections[0].instruction_citation.startswith("Instruction")
    assert sections[1].instruction_citation.startswith("Evaluation")
