"""Executive brief invariants: citations, abstention, cross-tenant, preservation."""

import pytest

from backend.tender_brief import ABSTAIN, BriefCitation, build_brief
from backend.tender_qa import RetrievedChunk, reset_state


def _chunk(**overrides: object) -> RetrievedChunk:
    """Build a chunk with tenant defaults."""
    base: dict[str, object] = {
        "chunk_id": "c1",
        "organization_id": "org-1",
        "opportunity_id": "opp-1",
        "document_id": "doc-1",
        "document_hash": "b" * 64,
        "page_number": 1,
        "text": "Authority NTPC closes 2026-09-15 fee Rs. 2,00,000",
    }
    base.update(overrides)
    return RetrievedChunk(**base)  # type: ignore[arg-type]


def _cite(**overrides: object) -> BriefCitation:
    """Build a citation matching the default chunk."""
    base: dict[str, object] = {
        "chunk_id": "c1", "document_id": "doc-1", "page_number": 1, "document_hash": "b" * 64
    }
    base.update(overrides)
    return BriefCitation(**base)  # type: ignore[arg-type]


def setup_function() -> None:
    """Reset state before each test."""
    reset_state()


def _brief_args(chunks: list[RetrievedChunk]) -> dict[str, object]:
    """Return valid brief arguments with citation per field."""
    citation = _cite()
    return {
        "organization_id": "org-1",
        "opportunity_id": "opp-1",
        "chunks": chunks,
        "scope": "Cloud migration scope p1",
        "scope_citations": [citation],
        "authority": "NTPC authority",
        "authority_citations": [citation],
        "dates": "Closes 2026-09-15",
        "dates_citations": [citation],
        "fees": "Fee Rs. 2,00,000",
        "fees_citations": [citation],
        "hard_requirements": "Turnover 120000000",
        "hard_citations": [citation],
        "deliverables": "Deliver Phase 1",
        "deliverables_citations": [citation],
        "submission_instructions": "Submit on portal",
        "submission_citations": [citation],
        "amendments": "No amendments",
        "amendments_citations": [citation],
        "uncertainties": "No uncertainty",
        "uncertainties_citations": [citation],
        "review_state": "NEEDS_REVIEW",
    }


def test_valid_brief_requires_citations_per_field() -> None:
    """Every established field requires at least one authorized citation."""
    brief = build_brief(**_brief_args([_chunk()]))  # type: ignore[arg-type]
    assert brief.scope.value == "Cloud migration scope p1"
    assert brief.scope.citations[0].chunk_id == "c1"
    assert not brief.scope.is_abstained


def test_missing_fields_abstain_with_exact_phrase() -> None:
    """Missing facts use the single abstention phrase."""
    args = _brief_args([_chunk()])
    args["fees"] = None
    args["fees_citations"] = []
    brief = build_brief(**args)  # type: ignore[arg-type]
    assert brief.fees.value == ABSTAIN
    assert brief.fees.is_abstained


def test_cross_tenant_rejected() -> None:
    """Brief rejects chunks from another tenant."""
    args = _brief_args([_chunk(organization_id="org-2")])
    with pytest.raises(ValueError, match="CROSS_TENANT"):
        build_brief(**args)  # type: ignore[arg-type]


def test_missing_citation_rejected() -> None:
    """Established field without citations is rejected."""
    args = _brief_args([_chunk()])
    args["dates_citations"] = []
    with pytest.raises(ValueError, match="MISSING_CITATION"):
        build_brief(**args)  # type: ignore[arg-type]


def test_unknown_chunk_citation_rejected() -> None:
    """Citation referencing unsupplied chunk is rejected."""
    args = _brief_args([_chunk()])
    args["scope_citations"] = [_cite(chunk_id="unknown")]
    with pytest.raises(ValueError, match="CITATION_NOT_IN_CONTEXT"):
        build_brief(**args)  # type: ignore[arg-type]
