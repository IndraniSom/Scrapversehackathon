"""Test-only builders for deterministic assessment boundary cases."""

from datetime import UTC, date, datetime

from backend.contracts.evaluation import (
    CertificationEvidence,
    CompanyProfile,
    EvidenceSpan,
    RuleGroup,
    RuleLeaf,
    TurnoverEvidence,
)
from backend.contracts.rules import CertificationPredicate, TurnoverAveragePredicate

AS_OF = datetime(2026, 2, 2, 12, tzinfo=UTC)
ENTITY = "CIN-DEMO-001"


def evidence() -> EvidenceSpan:
    """Build one fully verified synthetic evidence span."""
    return EvidenceSpan(
        source_url="https://example.gov/tender.pdf",
        source_snapshot_sha256="a" * 64,
        document_sha256="b" * 64,
        document_version_id="base-v1",
        physical_page_number=1,
        printed_page_label="1",
        section_heading="Eligibility",
        excerpt="Verified hard requirement.",
        normalized_page_text_sha256="c" * 64,
        extraction_model="test-model",
        extraction_prompt_version="test-v1",
        extraction_schema_version="rules-v1",
        extraction_state="EVIDENCE_VERIFIED",
        review_state="HUMAN_CONFIRMED",
    )


def company(
    *,
    amounts: tuple[str, str, str] = ("90000000", "90000000", "90000000"),
    audited: bool = True,
    legal_entity_id: str | None = ENTITY,
) -> CompanyProfile:
    """Build a bidder with three FY values and one valid certification."""
    years = ("2022-23", "2023-24", "2024-25")
    return CompanyProfile(
        id="company-1",
        name="Demo Systems Private Limited",
        bidder_legal_entity_id=ENTITY,
        turnover_evidence=[
            TurnoverEvidence(
                financial_year=year,
                amount_inr=amount,
                audited=audited,
                legal_entity_id=legal_entity_id,
                evidence_reference=f"audited-{year}",
            )
            for year, amount in zip(years, amounts, strict=True)
        ],
        certifications=[
            CertificationEvidence(
                name="ISO 27001",
                valid_from=date(2025, 1, 1),
                valid_until=date(2027, 1, 1),
                evidence_reference="iso-27001",
            )
        ],
        projects=[],
        emd_exemptions=[],
    )


def turnover_leaf(threshold: str = "90000000") -> RuleLeaf:
    """Build the selected three-year audited turnover leaf."""
    return RuleLeaf(
        node_type="LEAF",
        id="turnover",
        kind="TURNOVER_AVERAGE",
        title="Average audited turnover",
        hardness="HARD",
        predicate=TurnoverAveragePredicate(
            kind="TURNOVER_AVERAGE",
            required_financial_years=["2022-23", "2023-24", "2024-25"],
            minimum_average_inr=threshold,
            audited_only=True,
            legal_entity_scope="BIDDER_ONLY",
        ),
        applicability=None,
        evidence=[evidence()],
    )


def certification_leaf() -> RuleLeaf:
    """Build the ISO certification leaf anchored at an aware instant."""
    return RuleLeaf(
        node_type="LEAF",
        id="iso-27001",
        kind="CERTIFICATION",
        title="ISO 27001 certification",
        hardness="HARD",
        predicate=CertificationPredicate(
            kind="CERTIFICATION",
            certificate_name="ISO 27001",
            valid_at=datetime(2026, 2, 2, 12, tzinfo=UTC),
        ),
        applicability=None,
        evidence=[evidence()],
    )


def group(*children: RuleLeaf, operator: str = "ALL", minimum: int | None = None) -> RuleGroup:
    """Build one closed group for operator propagation tests."""
    return RuleGroup(
        node_type="GROUP",
        id="root",
        operator=operator,
        minimum_matches=minimum,
        children=list(children),
    )
