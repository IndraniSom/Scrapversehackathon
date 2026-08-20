"""Build the fixed synthetic company and assessment input from reviewed caches."""

from datetime import date, datetime
from pathlib import Path

from backend.artifact_mapping import assessment_input_from_caches
from backend.contracts.evaluation import (
    CertificationEvidence,
    CompanyProfile,
    TurnoverEvidence,
)
from backend.contracts.source import OpportunitySummary
from backend.contracts.views import AssessmentInput, OpportunityList
from backend.extraction_import import verify_extraction_directory

DEMO_OPPORTUNITY_ID = "ocac-pond-monitoring-26001"
OCAC_REFERENCE = "OCAC-SASCI-CPMU-0001-2025-26001"
OCAC_AUTHORITY = "Odisha Computer Application Centre"
OCAC_TITLE = (
    "RFP for Selection of System Integrator for Development, Implementation, "
    "Operation & Maintenance Support of AI-enabled IoT-based Pond Monitoring "
    "and Advisory System for Fish Farming."
)


def demo_company_profile() -> CompanyProfile:
    """Return the fixed bidder with INR 90m FY turnover and three valid certificates."""
    entity = "CIN-U72900OD2026PTC000001"
    years = ("2022-23", "2023-24", "2024-25")
    certificates = ("ISO 9001", "ISO 27001", "CMMI DEV- Level 3 or above")
    return CompanyProfile(
        id="ocac-demo-bidder-001",
        name="Example Digital Systems Private Limited",
        bidder_legal_entity_id=entity,
        turnover_evidence=[
            TurnoverEvidence(
                financial_year=year,
                amount_inr="90000000",
                audited=True,
                legal_entity_id=entity,
                evidence_reference=f"audited-financial-statement-{year}",
            )
            for year in years
        ],
        certifications=[
            CertificationEvidence(
                name=name,
                valid_from=date(2025, 1, 1),
                valid_until=date(2027, 12, 31),
                evidence_reference=f"certificate-{index}",
            )
            for index, name in enumerate(certificates, start=1)
        ],
        projects=[],
        emd_exemptions=[],
    )


def build_assessment_input(root: Path, as_of: datetime) -> AssessmentInput:
    """Load exact prerequisites and map them into the sole orchestration input."""
    opportunities = OpportunityList.model_validate_json(
        (root / "opportunities.json").read_bytes()
    )
    opportunity = next(
        (item for item in opportunities.items if item.id == DEMO_OPPORTUNITY_ID), None
    )
    if opportunity is None:
        raise ValueError("demo opportunity selector is missing")
    company = CompanyProfile.model_validate_json(
        (root / "company-profile.json").read_bytes()
    )
    base, amendment = verify_extraction_directory(root / "extractions")
    validate_demo_opportunity(opportunity, base.document.source_url)
    return assessment_input_from_caches(
        opportunity, company, base, amendment, as_of
    )


def validate_demo_opportunity(
    opportunity: OpportunitySummary, base_url: str
) -> None:
    """Bind the manual OCAC selector semantically to the selected official base PDF."""
    if (
        opportunity.id,
        opportunity.source,
        opportunity.source_tender_id,
        opportunity.reference_number,
        opportunity.authority,
        opportunity.title,
        opportunity.canonical_url,
    ) != (
        DEMO_OPPORTUNITY_ID,
        "ODISHA",
        OCAC_REFERENCE,
        OCAC_REFERENCE,
        OCAC_AUTHORITY,
        OCAC_TITLE,
        base_url,
    ):
        raise ValueError("demo opportunity semantic lineage is invalid")
