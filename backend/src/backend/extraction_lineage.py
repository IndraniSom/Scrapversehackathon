"""Base/corrigendum review, authority replacement, and revision lineage checks."""

from datetime import date, datetime
from zoneinfo import ZoneInfo

from backend.contracts.cache import CachedExtraction, HumanExtractionReview
from backend.contracts.extraction import ProposedExtraction
from backend.contracts.selection import PrivateSelection, SelectedDocument


class ExtractionLineageError(ValueError):
    """Report invalid review, document role, authority, or revision lineage."""


INDIA_CALENDAR = ZoneInfo("Asia/Kolkata")


def validate_review_chronology(
    reviewed_at: date, response_generated_at: datetime
) -> None:
    """Require date-only review on/after the response's India date and not in future."""
    if (
        response_generated_at.utcoffset() is None
        or reviewed_at < response_generated_at.astimezone(INDIA_CALENDAR).date()
        or reviewed_at > datetime.now(INDIA_CALENDAR).date()
    ):
        raise ExtractionLineageError("independent review chronology is invalid")


def validate_import_lineage(
    output: ProposedExtraction,
    selection: PrivateSelection,
    selected: SelectedDocument,
    review: HumanExtractionReview,
) -> None:
    """Require reviewed base revision one or accepted corrigendum revision two."""
    if review.review_state not in {"HUMAN_CONFIRMED", "HUMAN_EDITED"}:
        raise ExtractionLineageError("human review state did not pass")
    if not review.evidence_confirmed:
        raise ExtractionLineageError("evidence review did not pass")
    if selected.role == "BASE_TENDER":
        if output.revision != 1 or output.authority_statement is not None:
            raise ExtractionLineageError("base extraction lineage is invalid")
        return
    authority = output.authority_statement
    base_id = selection.change_review.base_document_version_id
    if (
        output.revision != 2
        or not review.authority_confirmed
        or authority is None
        or not authority.effective_change
        or authority.actor != "AUTHORITY"
        or authority.disposition != "ACCEPTED"
        or authority.replaces_document_id != base_id
    ):
        raise ExtractionLineageError("corrigendum authority lineage is invalid")


def validate_cache_lineage(base: CachedExtraction, amendment: CachedExtraction) -> None:
    """Require fixed roles, material revision, and accepted replacement of actual base."""
    authority = amendment.verified.proposal.authority_statement
    if base.document.role != "BASE_TENDER" or amendment.document.role != "CORRIGENDUM":
        raise ExtractionLineageError("cached extraction filename roles are invalid")
    if (
        base.verified.proposal.revision != 1
        or amendment.verified.proposal.revision != 2
        or base.document_sha256 == amendment.document_sha256
        or authority is None
        or not authority.effective_change
        or authority.actor != "AUTHORITY"
        or authority.disposition != "ACCEPTED"
        or authority.replaces_document_id != base.document.document_version_id
    ):
        raise ExtractionLineageError("cached amendment lineage is invalid")
