"""Compliance matrix: deterministic seeding, gaps, tenant isolation and CSV export."""

import pytest

from backend.compliance_matrix import (
    ComplianceRequirement,
    ComplianceRow,
    build_compliance_rows,
    classify_gap,
    detect_conflicting_requirements,
    detect_duplicate_clauses,
    export_compliance_csv,
    is_approval_blocked,
    is_stale_requirement,
    propose_ai_grouping,
)


def _req(
    rid: str = "req-001",
    citation: str = "Section 5.1 Turnover",
    org: str = "org-1",
    revision: int = 2,
    mandatory: bool = True,
    evaluation: str | None = None,
) -> ComplianceRequirement:
    """Build one accepted requirement for deterministic matrix tests."""
    return ComplianceRequirement(
        id=rid,
        title=f"Title {rid}",
        citation=citation,
        hardness="MUST" if mandatory else "SHOULD",
        is_mandatory=mandatory,
        revision=revision,
        organization_id=org,
        evaluation=evaluation,
    )


def test_complete_matrix_deterministic_before_ai_grouping() -> None:
    """Rows seeded deterministically sorted by id before any AI grouping."""
    reqs = [_req("req-002", "Section 5.2"), _req("req-001", "Section 5.1")]
    rows = build_compliance_rows(reqs, "org-1")
    assert [r.requirement_id for r in rows] == ["req-001", "req-002"]
    grouped = propose_ai_grouping(rows)
    assert [r.requirement_id for r in rows] == ["req-001", "req-002"]
    assert "Section" in grouped


def test_missing_response_gap_is_blocking() -> None:
    """Mandatory row without response location is MISSING_DATA and blocks approval."""
    rows = build_compliance_rows([_req()], "org-1")
    assert rows[0].status == "pending"
    pending_row = rows[0]
    assert classify_gap(pending_row) == "MISSING_DATA"
    assert is_approval_blocked(rows) is True
    blocked = ComplianceRow(**{**pending_row.model_dump(), "response_location": "Proposal §1", "evidence": None})
    assert classify_gap(blocked) == "MISSING_DOCUMENT"


def test_missing_evidence_and_owner_categories() -> None:
    """Missing document and owner categories use correct precedence."""
    base = build_compliance_rows([_req()], "org-1")[0]
    missing_doc = ComplianceRow(**{**base.model_dump(), "response_location": "§1", "evidence": None})
    assert classify_gap(missing_doc) == "MISSING_DOCUMENT"
    missing_owner = ComplianceRow(**{**base.model_dump(), "response_location": "§1", "evidence": "cert.pdf", "owner_id": None})
    assert classify_gap(missing_owner) == "OWNER_REQUIRED"


def test_failed_and_unknown_semantics_gaps() -> None:
    """Failed and unknown evaluations map to their gap categories."""
    fail = build_compliance_rows([_req(evaluation="FAIL")], "org-1")[0]
    assert fail.gap_category == "FAILED_REQUIREMENT"
    unknown = build_compliance_rows([_req(evaluation="UNKNOWN")], "org-1")[0]
    assert unknown.gap_category == "UNKNOWN_SEMANTICS"
    stale = build_compliance_rows([_req(revision=1)], "org-1", current_revision=2)[0]
    assert stale.gap_category == "REVIEW_REQUIRED"
    assert is_stale_requirement(1, 2) is True
    assert is_stale_requirement(2, 2) is False


def test_conflicting_and_duplicate_clause_detection() -> None:
    """Identical citations are flagged as duplicate and conflicting pairs."""
    reqs = [_req("req-001", "Section 5.1"), _req("req-002", "Section 5.1")]
    assert detect_duplicate_clauses(reqs) == ["Section 5.1"]
    assert detect_conflicting_requirements(reqs) == [("req-001", "req-002")]
    single = [_req("req-001", "Section 5.1"), _req("req-002", "Section 5.2")]
    assert detect_duplicate_clauses(single) == []
    assert detect_conflicting_requirements(single) == []


def test_cross_tenant_requirement_rejected() -> None:
    """Requirement from another tenant cannot seed rows for this organization."""
    with pytest.raises(ValueError, match="cross-tenant"):
        build_compliance_rows([_req(org="org-2")], "org-1")
    with pytest.raises(ValueError, match="duplicate"):
        build_compliance_rows([_req("req-001"), _req("req-001")], "org-1")


def test_approval_blocked_only_for_mandatory() -> None:
    """Non-mandatory gaps never block, mandatory compliant rows allow approval."""
    mandatory = ComplianceRow(requirement_id="req-001", citation="Section 5.1", response_location="§1", evidence="doc.pdf", owner_id="owner-1", status="compliant", is_mandatory=True, requirement_revision=2, organization_id="org-1")
    assert is_approval_blocked([mandatory]) is False
    optional = ComplianceRow(requirement_id="req-002", citation="Section 6.1", response_location=None, evidence=None, owner_id=None, status="gap", gap_category="MISSING_DATA", is_mandatory=False, requirement_revision=2, organization_id="org-1")
    assert is_approval_blocked([optional]) is False
    blocked = ComplianceRow(**{**mandatory.model_dump(), "evidence": None})
    assert is_approval_blocked([blocked]) is True


def test_export_csv_deterministic_and_escaped() -> None:
    """CSV export is deterministic, header-complete and escapes quoting."""
    rows = [
        ComplianceRow(requirement_id="req-002", citation='Section "A", clause', response_location="§2, annex", evidence="doc.pdf", ownerId="owner-2", status="compliant", is_mandatory=True, requirement_revision=2, organization_id="org-1") if False else ComplianceRow(requirement_id="req-002", citation='Section "A", clause', response_location="§2, annex", evidence="doc.pdf", owner_id="owner-2", status="compliant", is_mandatory=True, requirement_revision=2, organization_id="org-1"),
        ComplianceRow(requirement_id="req-001", citation="Section 5.1", response_location="§1", evidence="a.pdf", owner_id="owner-1", status="gap", gap_category="MISSING_DOCUMENT", is_mandatory=True, requirement_revision=2, organization_id="org-1"),
    ]
    csv_text = export_compliance_csv(rows)
    assert csv_text.startswith("requirement_id,citation,response_location")
    assert csv_text.index("req-001") < csv_text.index("req-002")
    assert '""A""' in csv_text or '"Section ""A"""' in csv_text
    assert csv_text.endswith("\n")


def test_stale_amendment_blocks_gap() -> None:
    """Stale revision marks REVIEW_REQUIRED and blocks approval until resolved."""
    rows = build_compliance_rows([_req(revision=1)], "org-1", current_revision=3)
    assert rows[0].gap_category == "REVIEW_REQUIRED"
    compliant_stale = ComplianceRow(**{**rows[0].model_dump(), "response_location": "§1", "evidence": "doc.pdf", "owner_id": "owner-1", "status": "compliant"})
    assert classify_gap(compliant_stale) == "REVIEW_REQUIRED"
