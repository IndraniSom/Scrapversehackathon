"""Test-only builders for deterministic amendment orchestration."""

from assessment_helpers import AS_OF, company, evidence, group, turnover_leaf

from backend.contracts.evaluation import RuleGroup
from backend.contracts.source import OpportunitySummary
from backend.contracts.views import AssessmentInput, AuthorityStatement, DocumentVersion


def document(role: str, identifier: str, digest: str) -> DocumentVersion:
    """Build one supported official document version."""
    return DocumentVersion(
        id=identifier,
        role=role,
        source_url=f"https://example.gov/{identifier}.pdf",
        sha256=digest,
        physical_page_count=10,
        text_quality="SUPPORTED",
    )


def opportunity() -> OpportunitySummary:
    """Build the frozen manual opportunity selector used by the assessment."""
    return OpportunitySummary(
        id="wb-hci-063",
        source="WEST_BENGAL",
        source_tender_id="WTL-WBSETCL-HCI-063",
        reference_number="WTL/WBSETCL/HCI/25-26/063",
        authority="Webel Technology Limited",
        title="Hyperconverged infrastructure services",
        category="DATA_CENTER",
        published_at=None,
        closes_at=AS_OF,
        canonical_url="https://wbtenders.gov.in/nicgep/app?page=Web",
        data_mode="MANUAL_FIXTURE",
        snapshot_sha256="d" * 64,
    )


def authority(
    *, actor: str = "AUTHORITY", disposition: str = "ACCEPTED",
    effective: bool = True, replacement: str | None = "base-v1",
) -> AuthorityStatement:
    """Build one authority or bidder amendment statement."""
    return AuthorityStatement(
        actor=actor,
        disposition=disposition,
        effective_change=effective,
        replaces_document_id=replacement,
        evidence=evidence(),
    )


def rules(threshold: str) -> RuleGroup:
    """Build stable-ID turnover plus unchanged certification requirements."""
    from assessment_helpers import certification_leaf

    return group(turnover_leaf(threshold), certification_leaf())


def assessment_input(
    *,
    statement: AuthorityStatement | None = None,
    amendment_review: str = "HUMAN_EDITED",
    amendment_revision: int = 2,
    amended_rules: RuleGroup | None = None,
) -> AssessmentInput:
    """Build one base-fail/amended-pass orchestration input."""
    return AssessmentInput(
        opportunity=opportunity(),
        company_profile=company(),
        base_document=document("BASE_TENDER", "base-v1", "b" * 64),
        amendment_document=document("CORRIGENDUM", "amendment-v2", "c" * 64),
        base_requirements=rules("120000000"),
        amendment_requirements=amended_rules or rules("60000000"),
        authority_statement=statement or authority(),
        changed_rule_id="turnover",
        as_of=AS_OF,
        lifecycle="OPEN",
        data_mode="MANUAL_FIXTURE",
        base_revision=1,
        amendment_revision=amendment_revision,
        base_extraction_state="EVIDENCE_VERIFIED",
        amendment_extraction_state="EVIDENCE_VERIFIED",
        base_review_state="HUMAN_EDITED",
        amendment_review_state=amendment_review,
    )
